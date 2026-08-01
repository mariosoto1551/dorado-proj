import { Injectable, Logger } from '@nestjs/common';

import type { ZonaAlcanzadaPayload } from '@dorado/shared-events';
import { TipoMovimientoMoneda } from '@dorado/shared-types';

import { ScoringClientService } from '../clientes/scoring-client.service';
import { elegirAlAzar } from '../comun/azar';
import { PrismaService, type ClientePrisma } from '../prisma/prisma.service';

/** Lo que hay que contar en `MonedasAcreditadas` cuando el cierre hizo algo. */
export interface ResultadoCierre {
  monedas: number;
  saldoResultante: number;
  castigo: { recompensaId: string; nombre: string } | null;
}

/**
 * El cierre económico de la Sección (spec fase-14-22 Parte B.2) — el corazón
 * del ítem.
 *
 * LA REGLA DE LA BANCARROTA (decisión 5): si el rendimiento de la zona deja el
 * saldo en negativo, se sortea un castigo al instante y el saldo vuelve a 0.
 * Se escriben DOS movimientos, no uno neteado: el ledger tiene que poder contar
 * la historia ("te tocó −5, quedaste en −2, se saldó con un castigo"), y una
 * sola fila de 0 no la cuenta.
 *
 * Todo el bloque va en UNA transacción junto con la marca de `EventoProcesado`
 * (ADR-00 §5): si el proceso muere en el medio, la reentrega tiene que poder
 * rehacerlo entero, no encontrarse media acreditación escrita.
 */
@Injectable()
export class CierreEconomicoService {
  private readonly logger = new Logger(CierreEconomicoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringClientService
  ) {}

  /**
   * Aplica el cierre y marca el evento como procesado, atómicamente.
   * Devuelve `null` cuando no hubo nada que hacer (ya procesado, descalificado,
   * o zona sin rendimiento configurado) — en esos casos no se publica nada.
   */
  async aplicar(
    eventId: string,
    consumidor: string,
    payload: ZonaAlcanzadaPayload
  ): Promise<ResultadoCierre | null> {
    // El descalificado no cobra: ni rendimiento, ni multa, ni castigo
    // (decisión 16). La descalificación ya es la consecuencia.
    const resultado = await this.scoring.obtenerResultado(
      payload.usuarioId,
      payload.seccionId
    );

    if (!resultado || resultado.descalificado) {
      this.logger.debug(
        `Cierre económico salteado para ${payload.usuarioId} en ${payload.seccionId}: ${
          resultado ? 'descalificado' : 'sin ResultadoSeccion'
        }`
      );

      await this.marcarProcesado(eventId, consumidor);

      return null;
    }

    return await this.prisma.client.$transaction(async (tx) => {
      const marcado = await marcarEnTransaccion(tx, eventId, consumidor);

      if (!marcado) {
        this.logger.debug(`Evento ${eventId} ya procesado — cierre no reaplicado`);

        return null;
      }

      const rendimiento = await tx.rendimientoZona.findFirst({
        where: { umbralZonaId: payload.umbralZonaId },
      });

      if (!rendimiento) {
        // Grupo con tienda activa pero sin rendimientos cargados: rinde 0 y no
        // se ensucia el ledger con un movimiento vacío.
        this.logger.debug(
          `Zona ${payload.umbralZonaId} sin rendimiento configurado — sin movimiento`
        );

        return null;
      }

      await this.acreditarRendimiento(tx, payload, rendimiento.monedas);

      const saldo = await sumarSaldo(tx, payload.grupoId, payload.usuarioId);

      if (saldo >= 0) {
        return { monedas: rendimiento.monedas, saldoResultante: saldo, castigo: null };
      }

      const castigo = await this.aplicarBancarrota(tx, payload, saldo);

      return {
        monedas: rendimiento.monedas,
        // Siempre 0: la deuda se salda en el mismo instante en que nace.
        saldoResultante: 0,
        castigo,
      };
    });
  }

  private async acreditarRendimiento(
    tx: ClienteTransaccion,
    payload: ZonaAlcanzadaPayload,
    monedas: number
  ): Promise<void> {
    await tx.eventoMoneda.create({
      data: {
        organizacionId: payload.organizacionId,
        grupoId: payload.grupoId,
        usuarioId: payload.usuarioId,
        tipo:
          monedas >= 0
            ? TipoMovimientoMoneda.RENDIMIENTO_ZONA
            : TipoMovimientoMoneda.MULTA_ZONA,
        monto: monedas,
        seccionId: payload.seccionId,
        motivo: `Zona ${payload.nombreZona}`,
        registradoPorId: 'SYSTEM',
        registradoPorTipo: 'SYSTEM',
      },
    });
  }

  /**
   * La regla de José: castigo al instante y el saldo vuelve a 0. El pozo es
   * **todos los ítems CASTIGO activos del Grupo** (decisión 20) — no hay bolsa
   * que configurar. Sin ningún castigo cargado, el saldo igual se clava en 0 y
   * no pasa nada más (decisión 6): el modo duro es opt-in dentro del opt-in.
   */
  private async aplicarBancarrota(
    tx: ClienteTransaccion,
    payload: ZonaAlcanzadaPayload,
    saldoNegativo: number
  ): Promise<{ recompensaId: string; nombre: string } | null> {
    const deuda = -saldoNegativo;

    const pozo = await tx.recompensa.findMany({
      where: { grupoId: payload.grupoId, tipo: 'CASTIGO', estado: 'ACTIVA' },
    });

    const elegido = elegirAlAzar(pozo);

    if (elegido) {
      await tx.castigoAsignado.create({
        data: {
          organizacionId: payload.organizacionId,
          grupoId: payload.grupoId,
          usuarioId: payload.usuarioId,
          seccionId: payload.seccionId,
          recompensaId: elegido.id,
          nombreRecompensaSnapshot: elegido.nombre,
          deudaSaldada: deuda,
        },
      });
    } else {
      this.logger.log(
        `Bancarrota de ${payload.usuarioId} sin castigo: el grupo ${payload.grupoId} no tiene ítems CASTIGO activos`
      );
    }

    await tx.eventoMoneda.create({
      data: {
        organizacionId: payload.organizacionId,
        grupoId: payload.grupoId,
        usuarioId: payload.usuarioId,
        tipo: TipoMovimientoMoneda.SALDO_SALDADO,
        monto: deuda,
        seccionId: payload.seccionId,
        motivo: elegido
          ? `Deuda saldada con castigo: ${elegido.nombre}`
          : 'Deuda saldada (el grupo no tiene castigos cargados)',
        registradoPorId: 'SYSTEM',
        registradoPorTipo: 'SYSTEM',
      },
    });

    return elegido ? { recompensaId: elegido.id, nombre: elegido.nombre } : null;
  }

  private async marcarProcesado(eventId: string, consumidor: string): Promise<void> {
    await marcarEnTransaccion(this.prisma.client, eventId, consumidor);
  }
}

/**
 * Cliente dentro de una transacción: el cliente extendido sin los métodos de
 * nivel raíz (`$transaction`, `$connect`, …), que es exactamente lo que Prisma
 * pasa al callback. Se deriva del tipo real en vez de escribirlo a mano —
 * un subconjunto hecho a mano no es asignable a los delegados generados, que
 * usan genéricos `Exact<A, …>`.
 */
type ClienteTransaccion = Omit<ClientePrisma, `$${string}`>;

/** `true` si lo marcó ahora; `false` si ya estaba (P2002 = reentrega). */
async function marcarEnTransaccion(
  tx: ClienteTransaccion,
  eventId: string,
  consumidor: string
): Promise<boolean> {
  try {
    await tx.eventoProcesado.create({ data: { eventId, consumidor } });

    return true;
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') {
      return false;
    }

    throw error;
  }
}

async function sumarSaldo(
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
