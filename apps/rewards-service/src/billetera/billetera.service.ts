import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';

import {
  BilleteraDto,
  MiBilleteraResponse,
  MovimientoMonedaDto,
  Rol,
  TenantContext,
  TipoMovimientoMoneda,
} from '@dorado/shared-types';

import { IdentityClientService } from '../clientes/identity-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AjustarMonedasRequest, ListarMovimientosQuery } from './dto/billetera.dto';

/** Página por defecto del historial de la billetera. */
const MOVIMIENTOS_POR_PAGINA = 25;

/**
 * Datos de un movimiento a escribir. Objeto de parámetros en vez de argumentos
 * sueltos (regla 2 de estilo: máximo 7 parámetros).
 */
export interface MovimientoAEscribir {
  organizacionId: string;
  grupoId: string;
  usuarioId: string;
  tipo: TipoMovimientoMoneda;
  monto: number;
  seccionId?: string | null;
  origenId?: string | null;
  motivo?: string | null;
  registradoPorId: string;
  registradoPorTipo: 'TUTOR' | 'USUARIO' | 'SYSTEM';
}

/**
 * Billetera de monedas (spec fase-14-22, Parte D).
 *
 * REGLA 1 aplicada a la economía: no existe ninguna columna `saldo`. El saldo
 * es SIEMPRE `SUM(monto)` sobre `EventoMoneda` al momento de leer, y el ledger
 * solo crece — no hay un solo `update` ni `delete` en este archivo.
 *
 * Los `where` mandan `grupoId` y `usuarioId` explícitos a propósito: la
 * extensión de tenant filtra en requests, pero los consumidores corren sin
 * contexto y necesitan que el filtro esté igual.
 */
@Injectable()
export class BilleteraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoGrupoService,
    private readonly identity: IdentityClientService,
    private readonly configuracion: ConfiguracionService,
    private readonly eventos: EventosPublisherService
  ) {}

  /** Saldo derivado. Sin contexto de tenant: lo usan también los consumidores. */
  async saldoDe(grupoId: string, usuarioId: string): Promise<number> {
    const total = await this.prisma.client.eventoMoneda.aggregate({
      where: { grupoId, usuarioId },
      _sum: { monto: true },
    });

    return total._sum.monto ?? 0;
  }

  /** Escribe un movimiento. Único punto de escritura del ledger. */
  async registrarMovimiento(datos: MovimientoAEscribir): Promise<{ id: string }> {
    return await this.prisma.client.eventoMoneda.create({
      data: {
        organizacionId: datos.organizacionId,
        grupoId: datos.grupoId,
        usuarioId: datos.usuarioId,
        tipo: datos.tipo,
        monto: datos.monto,
        seccionId: datos.seccionId ?? null,
        origenId: datos.origenId ?? null,
        motivo: datos.motivo ?? null,
        registradoPorId: datos.registradoPorId,
        registradoPorTipo: datos.registradoPorTipo,
      },
      select: { id: true },
    });
  }

  async miBilletera(
    tenant: TenantContext,
    grupoId: string,
    query: ListarMovimientosQuery
  ): Promise<MiBilleteraResponse> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    // El endpoint es "MI" billetera: un participante nunca lee la de otro.
    if (tenant.rol !== Rol.USUARIO) {
      throw new ForbiddenException('Solo un participante tiene billetera propia');
    }

    const usuarioId = tenant.principalId;
    const config = await this.configuracion.obtener(tenant, grupoId);

    const [saldo, movimientos, total] = await Promise.all([
      this.saldoDe(grupoId, usuarioId),
      this.prisma.client.eventoMoneda.findMany({
        where: { grupoId, usuarioId },
        orderBy: { createdAt: 'desc' },
        skip: query.offset ?? 0,
        take: query.limite ?? MOVIMIENTOS_POR_PAGINA,
      }),
      this.prisma.client.eventoMoneda.count({ where: { grupoId, usuarioId } }),
    ]);

    return {
      usuarioId,
      grupoId,
      saldo,
      nombreMoneda: config.nombreMoneda,
      iconoMoneda: config.iconoMoneda,
      movimientos: movimientos.map(movimientoADto),
      total,
    };
  }

  /**
   * Saldo de cada participante del Grupo, para el Tutor. Un `groupBy` y una
   * llamada a identity: el ledger solo conoce a quien ya tuvo movimientos, y la
   * pantalla tiene que mostrar también a los que están en cero.
   */
  async billeterasDelGrupo(
    tenant: TenantContext,
    grupoId: string
  ): Promise<BilleteraDto[]> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    const config = await this.configuracion.obtener(tenant, grupoId);

    const [saldos, usuarios] = await Promise.all([
      this.prisma.client.eventoMoneda.groupBy({
        by: ['usuarioId'],
        where: { grupoId },
        _sum: { monto: true },
      }),
      this.identity.usuariosDelGrupo(grupoId),
    ]);

    const porUsuario = new Map(
      saldos.map((fila) => [fila.usuarioId, fila._sum.monto ?? 0])
    );

    return usuarios.map((usuario) => ({
      usuarioId: usuario.id,
      grupoId,
      saldo: porUsuario.get(usuario.id) ?? 0,
      nombreMoneda: config.nombreMoneda,
      iconoMoneda: config.iconoMoneda,
    }));
  }

  /**
   * Ajuste manual del Tutor. El motivo es obligatorio y **no puede dejar el
   * saldo negativo** (spec Parte D): la única deuda posible en el sistema es la
   * del cierre, y esa se salda sola en el mismo instante en que nace.
   */
  async ajustar(
    tenant: TenantContext,
    grupoId: string,
    usuarioId: string,
    datos: AjustarMonedasRequest
  ): Promise<BilleteraDto> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    if (datos.monto === 0) {
      throw new BadRequestException('El ajuste no puede ser 0');
    }

    const saldoActual = await this.saldoDe(grupoId, usuarioId);
    const saldoResultante = saldoActual + datos.monto;

    if (saldoResultante < 0) {
      throw new BadRequestException({
        message: 'El ajuste dejaría el saldo en negativo',
        code: 'SALDO_INSUFICIENTE',
        saldoActual,
        maximoADescontar: saldoActual,
      });
    }

    const movimiento = await this.registrarMovimiento({
      // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
      organizacionId: tenant.organizacionId,
      grupoId,
      usuarioId,
      tipo: TipoMovimientoMoneda.AJUSTE_TUTOR,
      monto: datos.monto,
      motivo: datos.motivo,
      registradoPorId: tenant.principalId,
      registradoPorTipo: tenant.principalType as 'TUTOR' | 'USUARIO' | 'SYSTEM',
    });

    // Retrofit fase-09: rastro de auditoría de toda escritura administrativa.
    await this.eventos.publicarAccionAdministrativa({
      organizacionId: tenant.organizacionId,
      grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion: 'AJUSTE_MONEDAS',
      entidadTipo: 'EventoMoneda',
      entidadId: movimiento.id,
      detalle: {
        usuarioId,
        monto: datos.monto,
        motivo: datos.motivo,
        saldoAntes: saldoActual,
        saldoDespues: saldoResultante,
      },
    });

    const config = await this.configuracion.obtener(tenant, grupoId);

    return {
      usuarioId,
      grupoId,
      saldo: saldoResultante,
      nombreMoneda: config.nombreMoneda,
      iconoMoneda: config.iconoMoneda,
    };
  }
}

function movimientoADto(movimiento: {
  id: string;
  tipo: string;
  monto: number;
  seccionId: string | null;
  motivo: string | null;
  registradoPorId: string;
  registradoPorTipo: string;
  createdAt: Date;
}): MovimientoMonedaDto {
  return {
    id: movimiento.id,
    tipo: movimiento.tipo as TipoMovimientoMoneda,
    monto: movimiento.monto,
    seccionId: movimiento.seccionId,
    motivo: movimiento.motivo,
    registradoPorId: movimiento.registradoPorId,
    registradoPorTipo: movimiento.registradoPorTipo,
    createdAt: movimiento.createdAt.toISOString(),
  };
}
