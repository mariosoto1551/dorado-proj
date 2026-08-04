import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { CompraRealizadaPayload } from '@dorado/shared-events';
import { ROUTING_KEYS } from '@dorado/shared-events';
import {
  CompraDto,
  FuenteProducto,
  MecanicaProducto,
  ModoRecompensas,
  PendienteEntregaDto,
  Rol,
  TenantContext,
  TipoMovimientoMoneda,
} from '@dorado/shared-types';

import { elegirAlAzar } from '../comun/azar';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { EstadoCanje, EstadoCatalogo } from '../generated/prisma/enums';
import { PrismaService, type ClienteTransaccion } from '../prisma/prisma.service';
import type { AnularCastigoRequest, ComprarRequest, RevertirCompraRequest } from './dto/tienda.dto';

/**
 * La compra (spec fase-14-22 Parte C).
 *
 * ACÁ VIVE EL BUG CARO DEL ÍTEM: dos compras concurrentes del mismo
 * participante pueden leer el mismo saldo y pasar las dos, dejando un saldo
 * negativo que ninguna otra regla del sistema puede producir. Por eso toda la
 * operación —leer el saldo, verificar que alcanza y escribir— va dentro de una
 * transacción que arranca tomando un `pg_advisory_xact_lock` por participante.
 */
@Injectable()
export class ComprasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoGrupoService,
    private readonly configuracion: ConfiguracionService,
    private readonly eventos: EventosPublisherService
  ) {}

  async comprar(
    tenant: TenantContext,
    grupoId: string,
    datos: ComprarRequest
  ): Promise<CompraDto> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    const usuarioId = this.resolverComprador(tenant, datos);
    const modo = await this.configuracion.obtenerModo(grupoId);

    if (modo !== ModoRecompensas.TIENDA) {
      throw new ConflictException({
        message: 'Este grupo no usa tienda',
        code: 'MODO_DIRECTO',
      });
    }

    const compra = await this.prisma.client.$transaction(async (tx) => {
      // EL LOCK. Serializa las compras de ESTE participante en ESTE grupo:
      // todo lo que sigue (leer saldo → verificar → escribir) tiene que ser
      // atómico o el saldo puede quedar negativo.
      //
      // `$executeRaw` y NO `$queryRaw`: pg_advisory_xact_lock devuelve void y
      // el deserializador de $queryRaw no sabe mapear ese tipo — falla en
      // RUNTIME, no en compilación (lección del ítem #16).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${grupoId}:${usuarioId}`}))`;

      const producto = await tx.productoTienda.findFirst({
        where: { id: datos.productoId, grupoId },
      });

      if (!producto) {
        throw new NotFoundException('Producto no encontrado');
      }

      if (producto.estado !== EstadoCatalogo.ACTIVA) {
        throw new ConflictException({
          message: 'Ese producto ya no está disponible',
          code: 'PRODUCTO_ARCHIVADO',
        });
      }

      const elegido = await this.resolverItem(tx, producto, datos);
      const saldo = await saldoEnTransaccion(tx, grupoId, usuarioId);

      if (saldo < producto.precio) {
        throw new ConflictException({
          message: 'No te alcanzan las monedas',
          code: 'SALDO_INSUFICIENTE',
          saldoActual: saldo,
          faltan: producto.precio - saldo,
        });
      }

      const creada = await tx.compra.create({
        data: {
          organizacionId: tenant.organizacionId,
          grupoId,
          usuarioId,
          productoId: producto.id,
          nombreProductoSnapshot: producto.nombre,
          precioSnapshot: producto.precio,
          obtenidoPorAzar: elegido.porAzar,
          recompensaId: elegido.id,
          nombreRecompensaSnapshot: elegido.nombre,
        },
      });

      await tx.eventoMoneda.create({
        data: {
          organizacionId: tenant.organizacionId,
          grupoId,
          usuarioId,
          tipo: TipoMovimientoMoneda.COMPRA,
          monto: -producto.precio,
          origenId: creada.id,
          motivo: producto.nombre,
          registradoPorId: tenant.principalId,
          registradoPorTipo: tenant.principalType,
        },
      });

      // fase-14-25: si era su objetivo de ahorro, se cumplió. Dejarlo puesto
      // convertiría el logro en un cartel viejo (decisión 5). Va en la MISMA
      // transacción que la compra: el objetivo no puede sobrevivir a la compra
      // que lo cumplió. `deleteMany` para no fallar si no había objetivo.
      await tx.objetivoParticipante.deleteMany({
        where: { usuarioId, grupoId, productoId: producto.id },
      });

      return creada;
    });

    await this.eventos.publicar<CompraRealizadaPayload>({
      eventType: 'CompraRealizada',
      routingKey: ROUTING_KEYS.COMPRA_REALIZADA,
      organizacionId: tenant.organizacionId,
      grupoId,
      payload: {
        compraId: compra.id,
        usuarioId: compra.usuarioId,
        organizacionId: tenant.organizacionId,
        grupoId,
        productoId: compra.productoId,
        nombreProducto: compra.nombreProductoSnapshot,
        precio: compra.precioSnapshot,
        obtenidoPorAzar: compra.obtenidoPorAzar,
        recompensaId: compra.recompensaId,
        nombreRecompensa: compra.nombreRecompensaSnapshot,
      },
    });

    return compraADto(compra);
  }

  /**
   * Devuelve el precio como movimiento nuevo (`REVERSION`), sin editar el
   * movimiento de compra original: compensación, como en todo el proyecto.
   */
  async revertir(
    tenant: TenantContext,
    id: string,
    datos: RevertirCompraRequest
  ): Promise<CompraDto> {
    const compra = await this.prisma.client.compra.findFirst({ where: { id } });

    if (!compra) {
      throw new NotFoundException('Compra no encontrada');
    }

    await this.acceso.asegurarAccesoEscritura(tenant, compra.grupoId);

    if (compra.revertidaEn) {
      throw new ConflictException({ message: 'Ya revertida', code: 'YA_REVERTIDA' });
    }

    if (compra.estado === EstadoCanje.ENTREGADA) {
      throw new ConflictException({
        message: 'No se puede revertir una compra ya entregada',
        code: 'YA_ENTREGADA',
      });
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.compra.updateMany({
        where: { id },
        data: {
          revertidaEn: new Date(),
          revertidaPorTutorId: tenant.principalId,
          motivoReversion: datos.motivo ?? null,
        },
      });

      await tx.eventoMoneda.create({
        data: {
          organizacionId: compra.organizacionId,
          grupoId: compra.grupoId,
          usuarioId: compra.usuarioId,
          tipo: TipoMovimientoMoneda.REVERSION,
          monto: compra.precioSnapshot,
          origenId: compra.id,
          motivo: datos.motivo ?? `Compra revertida: ${compra.nombreProductoSnapshot}`,
          registradoPorId: tenant.principalId,
          registradoPorTipo: tenant.principalType,
        },
      });
    });

    await this.auditar(tenant, compra.grupoId, 'COMPRA_REVERTIDA', 'Compra', id, {
      antes: compraADto(compra),
      motivo: datos.motivo ?? null,
    });

    return await this.obtenerCompra(id);
  }

  /**
   * Anula un castigo de la bancarrota (decisión 21). NO toca el ledger: la
   * deuda ya se saldó y el saldo sigue en 0 — lo único que cambia es que el
   * castigo no se aplica.
   */
  async anularCastigo(
    tenant: TenantContext,
    id: string,
    datos: AnularCastigoRequest
  ): Promise<void> {
    const castigo = await this.prisma.client.castigoAsignado.findFirst({ where: { id } });

    if (!castigo) {
      throw new NotFoundException('Castigo no encontrado');
    }

    await this.acceso.asegurarAccesoEscritura(tenant, castigo.grupoId);

    if (castigo.anuladoEn) {
      throw new ConflictException({ message: 'Ya anulado', code: 'YA_ANULADO' });
    }

    if (castigo.estado === EstadoCanje.ENTREGADA) {
      throw new ConflictException({
        message: 'No se puede anular un castigo ya entregado',
        code: 'YA_ENTREGADO',
      });
    }

    await this.prisma.client.castigoAsignado.updateMany({
      where: { id },
      data: {
        anuladoEn: new Date(),
        anuladoPorTutorId: tenant.principalId,
        motivoAnulacion: datos.motivo,
      },
    });

    await this.auditar(tenant, castigo.grupoId, 'CASTIGO_ANULADO', 'CastigoAsignado', id, {
      usuarioId: castigo.usuarioId,
      castigo: castigo.nombreRecompensaSnapshot,
      motivo: datos.motivo,
    });
  }

  /**
   * Compras y castigos pendientes en UNA lista, unidos en la capa de lectura
   * sin materializar nada (mismo criterio que el timeline del #18). Excluye lo
   * revertido y lo anulado.
   */
  async pendientesDeEntrega(
    tenant: TenantContext,
    grupoId: string
  ): Promise<PendienteEntregaDto[]> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    const [compras, castigos] = await Promise.all([
      this.prisma.client.compra.findMany({
        where: { grupoId, estado: EstadoCanje.PENDIENTE_ENTREGA, revertidaEn: null },
      }),
      this.prisma.client.castigoAsignado.findMany({
        where: { grupoId, estado: EstadoCanje.PENDIENTE_ENTREGA, anuladoEn: null },
      }),
    ]);

    const filas: PendienteEntregaDto[] = [
      ...compras.map((compra) => ({
        id: compra.id,
        origen: 'COMPRA' as const,
        usuarioId: compra.usuarioId,
        nombreRecompensaSnapshot: compra.nombreRecompensaSnapshot,
        monto: compra.precioSnapshot,
        createdAt: compra.createdAt.toISOString(),
      })),
      ...castigos.map((castigo) => ({
        id: castigo.id,
        origen: 'CASTIGO' as const,
        usuarioId: castigo.usuarioId,
        nombreRecompensaSnapshot: castigo.nombreRecompensaSnapshot,
        monto: castigo.deudaSaldada,
        createdAt: castigo.createdAt.toISOString(),
      })),
    ];

    return filas.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async entregarCompra(tenant: TenantContext, id: string): Promise<CompraDto> {
    const compra = await this.prisma.client.compra.findFirst({ where: { id } });

    if (!compra) {
      throw new NotFoundException('Compra no encontrada');
    }

    await this.acceso.asegurarAccesoEscritura(tenant, compra.grupoId);

    if (compra.revertidaEn) {
      throw new ConflictException({
        message: 'No se puede entregar una compra revertida',
        code: 'YA_REVERTIDA',
      });
    }

    await this.prisma.client.compra.updateMany({
      where: { id },
      data: {
        estado: EstadoCanje.ENTREGADA,
        entregadaPorTutorId: tenant.principalId,
        entregadaEn: new Date(),
      },
    });

    return await this.obtenerCompra(id);
  }

  async entregarCastigo(tenant: TenantContext, id: string): Promise<void> {
    const castigo = await this.prisma.client.castigoAsignado.findFirst({ where: { id } });

    if (!castigo) {
      throw new NotFoundException('Castigo no encontrado');
    }

    await this.acceso.asegurarAccesoEscritura(tenant, castigo.grupoId);

    if (castigo.anuladoEn) {
      throw new ConflictException({
        message: 'No se puede entregar un castigo anulado',
        code: 'YA_ANULADO',
      });
    }

    await this.prisma.client.castigoAsignado.updateMany({
      where: { id },
      data: {
        estado: EstadoCanje.ENTREGADA,
        entregadaPorTutorId: tenant.principalId,
        entregadaEn: new Date(),
      },
    });
  }

  /**
   * Resuelve el ítem según los DOS EJES (decisión 18): un ítem puntual, uno al
   * azar de la bolsa, o el que el participante eligió — que debe pertenecer a
   * la bolsa.
   */
  private async resolverItem(
    tx: ClienteTransaccion,
    producto: { fuente: string; mecanica: string; recompensaId: string | null; bolsaId: string | null },
    datos: ComprarRequest
  ): Promise<{ id: string; nombre: string; porAzar: boolean }> {
    if (producto.fuente === FuenteProducto.ITEM) {
      const item = await tx.recompensa.findFirst({
        where: { id: producto.recompensaId ?? '' },
      });

      if (!item) {
        throw new ConflictException({
          message: 'El premio de este producto ya no existe',
          code: 'PRODUCTO_INCONSISTENTE',
        });
      }

      return { id: item.id, nombre: item.nombre, porAzar: false };
    }

    const items = await tx.itemBolsa.findMany({
      where: { bolsaId: producto.bolsaId ?? '' },
    });

    const ids = items.map((item) => item.recompensaId);

    if (producto.mecanica === MecanicaProducto.ELECCION) {
      if (!datos.recompensaId) {
        throw new BadRequestException({
          message: 'Tenés que elegir un premio de la bolsa',
          code: 'ELECCION_REQUERIDA',
        });
      }

      if (!ids.includes(datos.recompensaId)) {
        throw new BadRequestException({
          message: 'Ese premio no está en la bolsa',
          code: 'ITEM_FUERA_DE_LA_BOLSA',
        });
      }

      const item = await tx.recompensa.findFirst({ where: { id: datos.recompensaId } });

      if (!item) {
        throw new ConflictException({
          message: 'El premio elegido ya no existe',
          code: 'PRODUCTO_INCONSISTENTE',
        });
      }

      return { id: item.id, nombre: item.nombre, porAzar: false };
    }

    const disponibles = await tx.recompensa.findMany({
      where: { id: { in: ids }, estado: EstadoCatalogo.ACTIVA },
    });

    const elegido = elegirAlAzar(disponibles);

    if (!elegido) {
      throw new ConflictException({
        message: 'La bolsa de este producto quedó sin premios disponibles',
        code: 'BOLSA_VACIA',
      });
    }

    return { id: elegido.id, nombre: elegido.nombre, porAzar: true };
  }

  /** El propio participante, o el Tutor comprando en su nombre (spec Parte C). */
  private resolverComprador(tenant: TenantContext, datos: ComprarRequest): string {
    if (tenant.rol === Rol.USUARIO) {
      return tenant.principalId;
    }

    if (!datos.usuarioId) {
      throw new BadRequestException({
        message: 'Un tutor tiene que indicar para qué participante compra',
        code: 'USUARIO_REQUERIDO',
      });
    }

    return datos.usuarioId;
  }

  private async obtenerCompra(id: string): Promise<CompraDto> {
    const compra = await this.prisma.client.compra.findFirst({ where: { id } });

    if (!compra) {
      throw new NotFoundException('Compra no encontrada');
    }

    return compraADto(compra);
  }

  private async auditar(
    tenant: TenantContext,
    grupoId: string,
    accion: string,
    entidadTipo: string,
    entidadId: string,
    detalle: Record<string, unknown>
  ): Promise<void> {
    await this.eventos.publicarAccionAdministrativa({
      organizacionId: tenant.organizacionId,
      grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion,
      entidadTipo,
      entidadId,
      detalle,
    });
  }
}

async function saldoEnTransaccion(
  tx: ClienteTransaccion,
  grupoId: string,
  usuarioId: string
): Promise<number> {
  const total = await tx.eventoMoneda.aggregate({
    where: { grupoId, usuarioId },
    _sum: { monto: true },
  });

  return total._sum.monto ?? 0;
}

export function compraADto(compra: {
  id: string;
  organizacionId: string;
  grupoId: string;
  usuarioId: string;
  productoId: string;
  nombreProductoSnapshot: string;
  precioSnapshot: number;
  obtenidoPorAzar: boolean;
  recompensaId: string;
  nombreRecompensaSnapshot: string;
  estado: string;
  entregadaPorTutorId: string | null;
  entregadaEn: Date | null;
  revertidaEn: Date | null;
  motivoReversion: string | null;
}): CompraDto {
  return {
    id: compra.id,
    organizacionId: compra.organizacionId,
    grupoId: compra.grupoId,
    usuarioId: compra.usuarioId,
    productoId: compra.productoId,
    nombreProductoSnapshot: compra.nombreProductoSnapshot,
    precioSnapshot: compra.precioSnapshot,
    obtenidoPorAzar: compra.obtenidoPorAzar,
    recompensaId: compra.recompensaId,
    nombreRecompensaSnapshot: compra.nombreRecompensaSnapshot,
    estado: compra.estado as CompraDto['estado'],
    entregadaPorTutorId: compra.entregadaPorTutorId,
    entregadaEn: compra.entregadaEn ? compra.entregadaEn.toISOString() : null,
    revertidaEn: compra.revertidaEn ? compra.revertidaEn.toISOString() : null,
    motivoReversion: compra.motivoReversion,
  };
}
