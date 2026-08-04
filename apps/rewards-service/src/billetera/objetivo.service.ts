import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  FijarObjetivoRequest,
  ModoRecompensas,
  ObjetivoDto,
  Rol,
  TenantContext,
} from '@dorado/shared-types';

import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { EstadoCatalogo } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

/** Lo mínimo que hace falta de un producto para dibujar el objetivo. */
interface ProductoDelObjetivo {
  id: string;
  nombre: string;
  precio: number;
}

/**
 * El objetivo de ahorro del participante (spec fase-14-25).
 *
 * Es lo único de la economía que **no** es un ledger: se pisa con `update` y no
 * deja historia (decisión 3). Un objetivo no es un movimiento de monedas — no
 * reserva saldo, no bloquea comprar otra cosa y no da ninguna ventaja
 * (decisión 8). Es un señalador, y por eso su único efecto es visual.
 */
@Injectable()
export class ObjetivoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoGrupoService,
    private readonly configuracion: ConfiguracionService
  ) {}

  /** `PUT mi-objetivo`. Upsert: cambiar de objetivo pisa el anterior. */
  async fijar(
    tenant: TenantContext,
    grupoId: string,
    datos: FijarObjetivoRequest
  ): Promise<ObjetivoDto> {
    const usuarioId = this.asegurarParticipante(tenant, grupoId);

    // Decisión 7: el objetivo solo existe en modo TIENDA. En DIRECTO el premio
    // es de usar o perder por Sección, así que no hay ahorro que objetivar.
    const modo = await this.configuracion.obtenerModo(grupoId);

    if (modo !== ModoRecompensas.TIENDA) {
      throw new ConflictException({
        message: 'Este grupo no usa tienda',
        code: 'MODO_DIRECTO',
      });
    }

    const producto = await this.prisma.client.productoTienda.findFirst({
      where: { id: datos.productoId, grupoId },
      select: { id: true, nombre: true, precio: true, estado: true },
    });

    if (!producto) {
      throw new NotFoundException('Producto no encontrado');
    }

    if (producto.estado !== EstadoCatalogo.ACTIVA) {
      throw new BadRequestException({
        message: 'Ese producto ya no está disponible',
        code: 'PRODUCTO_ARCHIVADO',
      });
    }

    await this.prisma.client.objetivoParticipante.upsert({
      where: { usuarioId_grupoId: { usuarioId, grupoId } },
      // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
      create: {
        organizacionId: tenant.organizacionId,
        grupoId,
        usuarioId,
        productoId: producto.id,
      },
      update: { productoId: producto.id },
    });

    const saldo = await this.saldoDe(grupoId, usuarioId);

    return objetivoADto(producto, saldo);
  }

  /** `DELETE mi-objetivo`. Idempotente: quitar lo que no hay no es un error. */
  async quitar(tenant: TenantContext, grupoId: string): Promise<void> {
    const usuarioId = this.asegurarParticipante(tenant, grupoId);

    await this.prisma.client.objetivoParticipante.deleteMany({
      where: { usuarioId, grupoId },
    });
  }

  /**
   * El objetivo vigente, ya resuelto contra el saldo. `null` si no eligió
   * ninguno o si el producto quedó archivado — sin borrar la fila (decisión 6):
   * si el Tutor lo desarchiva, el objetivo vuelve solo.
   */
  async resolver(
    grupoId: string,
    usuarioId: string,
    saldo: number
  ): Promise<ObjetivoDto | null> {
    const objetivo = await this.prisma.client.objetivoParticipante.findUnique({
      where: { usuarioId_grupoId: { usuarioId, grupoId } },
      select: { productoId: true },
    });

    if (!objetivo) {
      return null;
    }

    const producto = await this.prisma.client.productoTienda.findFirst({
      where: { id: objetivo.productoId, grupoId, estado: EstadoCatalogo.ACTIVA },
      select: { id: true, nombre: true, precio: true },
    });

    return producto ? objetivoADto(producto, saldo) : null;
  }

  /**
   * Los objetivos de todo el Grupo para la pantalla del Tutor (decisión 4). Dos
   * consultas para el grupo entero, no dos por participante — mismo criterio
   * que `billeterasDelGrupo`.
   */
  async resolverParaGrupo(grupoId: string): Promise<Map<string, ProductoDelObjetivo>> {
    const objetivos = await this.prisma.client.objetivoParticipante.findMany({
      where: { grupoId },
      select: { usuarioId: true, productoId: true },
    });

    if (objetivos.length === 0) {
      return new Map();
    }

    const productos = await this.prisma.client.productoTienda.findMany({
      where: {
        id: { in: objetivos.map((objetivo) => objetivo.productoId) },
        grupoId,
        estado: EstadoCatalogo.ACTIVA,
      },
      select: { id: true, nombre: true, precio: true },
    });

    const porId = new Map(productos.map((producto) => [producto.id, producto]));
    const porUsuario = new Map<string, ProductoDelObjetivo>();

    for (const objetivo of objetivos) {
      const producto = porId.get(objetivo.productoId);

      if (producto) {
        porUsuario.set(objetivo.usuarioId, producto);
      }
    }

    return porUsuario;
  }

  /** El objetivo es del participante y de nadie más: sale del JWT (regla 3). */
  private asegurarParticipante(tenant: TenantContext, grupoId: string): string {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    if (tenant.rol !== Rol.USUARIO) {
      // Mismo trato que `miBilletera` con un Tutor: no es un conflicto de
      // estado, es que ese principal no tiene esta cosa.
      throw new ForbiddenException('Solo un participante tiene objetivo de ahorro');
    }

    return tenant.principalId;
  }

  /**
   * Mismo cálculo que `BilleteraService.saldoDe`, repetido a propósito: es
   * `BilleteraService` el que depende de este servicio (arma el objetivo dentro
   * de `mi-billetera`), así que inyectarlo al revés sería un ciclo. Seis líneas
   * de `aggregate` cuestan menos que un `forwardRef`.
   */
  private async saldoDe(grupoId: string, usuarioId: string): Promise<number> {
    const total = await this.prisma.client.eventoMoneda.aggregate({
      where: { grupoId, usuarioId },
      _sum: { monto: true },
    });

    return total._sum.monto ?? 0;
  }
}

function objetivoADto(producto: ProductoDelObjetivo, saldo: number): ObjetivoDto {
  return {
    productoId: producto.id,
    nombre: producto.nombre,
    precio: producto.precio,
    faltan: Math.max(0, producto.precio - saldo),
  };
}
