import { Injectable, Logger } from '@nestjs/common';

import { TipoAccionRendimiento, TipoMovimientoMoneda } from '@dorado/shared-types';

import { PrismaService, type ClienteTransaccion } from '../prisma/prisma.service';

/**
 * El movimiento del que la compensación copia tenant, billetera y Sección: el
 * asiento acreditado (al revertir) o el descuento (al restituir).
 */
type MovimientoDeReferencia = {
  organizacionId: string;
  grupoId: string;
  usuarioId: string;
  seccionId: string | null;
  origenId: string | null;
};

/** Una acreditación concreta, para poder publicar `MonedasPorAccion` después. */
export interface AcreditacionAccion {
  usuarioId: string;
  monedas: number;
  saldoResultante: number;
  nombreAccion: string;
}

/** Quién cobra y cuánto, en el reparto de una tarea de equipo (decisión 8). */
export interface MiembroDelReparto {
  usuarioId: string;
  esJefe: boolean;
}

export interface DatosAcreditacion {
  organizacionId: string;
  grupoId: string;
  seccionId: string;
  tipoAccion: TipoAccionRendimiento;
  /** actividadId o conductaId: la clave del `RendimientoAccion`. */
  origenId: string;
  /** El registro de activity_db que lo originó: va al ledger. */
  registroId: string;
  /** Uno solo en el camino individual; N en el reparto de equipo. */
  miembros: MiembroDelReparto[];
}

/**
 * LA SEGUNDA FUENTE DE LA ECONOMÍA (spec fase-14-28, Parte B).
 *
 * Acredita al instante lo que el participante hace durante la semana, contra el
 * MISMO ledger `EventoMoneda` que el cierre por zona de fase-14-22 — este ítem
 * no monta una economía paralela, agrega asientos por un camino nuevo.
 *
 * LAS DOS REGLAS QUE GOBIERNAN TODO:
 *
 * 1. **Acreditar es siempre positivo** (decisión 4): lo que se hace nunca
 *    debita. El único camino al saldo negativo sigue siendo la bancarrota del
 *    cierre, donde el castigo tiene sentido narrativo y ya está probado. Por eso
 *    la acreditación no necesita lock ni chequeo de saldo.
 * 2. **Revertir tiene PISO EN 0** (decisión 6): si el participante ya gastó lo
 *    que se le había pagado, se recupera lo que haya y el saldo queda en 0,
 *    nunca negativo. Eso obliga a LEER el saldo y ESCRIBIR contra él, que es
 *    exactamente la carrera que produce estados imposibles — de ahí el
 *    `pg_advisory_xact_lock` por participante, el mismo de la compra.
 */
@Injectable()
export class MonedasPorAccionService {
  private readonly logger = new Logger(MonedasPorAccionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * B.1 — acreditación. Devuelve una entrada por participante que cobró, o `[]`
   * si no hubo nada que pagar (sin rendimiento cargado, o cargado en 0: una
   * actividad sin precio en monedas no genera ruido en el ledger).
   *
   * Marca `EventoProcesado` SIEMPRE, incluso cuando no escribe nada — si no,
   * cada reentrega volvería a evaluarlo para siempre.
   */
  async acreditar(
    eventId: string,
    consumidor: string,
    datos: DatosAcreditacion
  ): Promise<AcreditacionAccion[]> {
    return await this.prisma.client.$transaction(async (tx) => {
      if (!(await marcarEnTransaccion(tx, eventId, consumidor))) {
        this.logger.debug(`Evento ${eventId} ya procesado — no se acredita de nuevo`);

        return [];
      }

      const rendimiento = await tx.rendimientoAccion.findFirst({
        where: { tipoAccion: datos.tipoAccion, origenId: datos.origenId },
      });

      if (!rendimiento || rendimiento.monedas <= 0) {
        return [];
      }

      const acreditadas: AcreditacionAccion[] = [];

      for (const miembro of datos.miembros) {
        // Decisión 8: cada miembro cobra las monedas COMPLETAS (no se divide,
        // igual que el puntaje), y el jefe cobra su bono encima.
        const monedas =
          rendimiento.monedas + (miembro.esJefe ? rendimiento.monedasBonoJefe : 0);

        if (monedas <= 0) {
          continue;
        }

        await tx.eventoMoneda.create({
          data: {
            organizacionId: datos.organizacionId,
            grupoId: datos.grupoId,
            usuarioId: miembro.usuarioId,
            tipo: TipoMovimientoMoneda.RENDIMIENTO_ACCION,
            monto: monedas,
            seccionId: datos.seccionId,
            // El REGISTRO, no la actividad: es lo que permite ubicar el asiento
            // exacto a revertir cuando el Tutor quita esa marca puntual.
            origenId: datos.registroId,
            motivo: rendimiento.nombreSnapshot,
            registradoPorId: 'SYSTEM',
            registradoPorTipo: 'SYSTEM',
          },
        });

        acreditadas.push({
          usuarioId: miembro.usuarioId,
          monedas,
          saldoResultante: await sumarSaldo(tx, datos.grupoId, miembro.usuarioId),
          nombreAccion: rendimiento.nombreSnapshot,
        });
      }

      return acreditadas;
    });
  }

  /**
   * B.2 — reversión con piso en 0 (decisión 6). Busca **todos** los asientos de
   * ese `registroId`: el reparto de una tarea de equipo son N movimientos con el
   * mismo `origenId`, uno por miembro, y compensar solo el primero dejaría el
   * resto de las billeteras mal EN SILENCIO (el error exacto que fase-14-13
   * documentó para scoring). El caso individual es simplemente N = 1.
   *
   * La fila se escribe SIEMPRE, incluso con monto 0, con el faltante en el
   * motivo: un saldo que no bajó lo que debía bajar es justo lo que un Tutor va
   * a preguntar, y un ledger que no lo explica no sirve.
   */
  async revertir(eventId: string, consumidor: string, registroId: string): Promise<void> {
    await this.compensar(eventId, consumidor, registroId, 'revertir');
  }

  /**
   * Decisión 7 — restituye lo que la reversión EFECTIVAMENTE descontó, no lo
   * que se había acreditado. Si solo pudo recuperar 2 de 5, devuelve 2:
   * devolver 5 regalaría 3 monedas por el camino de una corrección, que es el
   * agujero exacto que abre el piso en 0 si no se cierra acá.
   *
   * Sin piso: restituir nunca puede dejar el saldo negativo.
   */
  async restituir(eventId: string, consumidor: string, registroId: string): Promise<void> {
    await this.compensar(eventId, consumidor, registroId, 'restituir');
  }

  private async compensar(
    eventId: string,
    consumidor: string,
    registroId: string,
    sentido: 'revertir' | 'restituir'
  ): Promise<void> {
    // Fuera de la transacción a propósito: si no hay nada de qué colgarse, no
    // hace falta tomar ningún lock. Es también el caso normal de un grupo que
    // nunca configuró rendimientos por acción.
    const afectados = await this.usuariosAfectados(registroId, sentido);

    if (afectados.length === 0) {
      await this.marcarProcesado(eventId, consumidor);

      return;
    }

    await this.prisma.client.$transaction(async (tx) => {
      if (!(await marcarEnTransaccion(tx, eventId, consumidor))) {
        this.logger.debug(`Evento ${eventId} ya procesado — no se compensa de nuevo`);

        return;
      }

      for (const usuarioId of afectados) {
        // EL LOCK. Leer el saldo y escribir contra él sin serializar es la
        // carrera que deja saldos negativos — el mismo motivo y el mismo lock
        // que la compra de fase-14-22. `$executeRaw` y NO `$queryRaw`:
        // pg_advisory_xact_lock devuelve void y $queryRaw falla en RUNTIME al
        // deserializarlo (lección del ítem #16, repetida acá porque pasa
        // tests, lint, typecheck y build igual).
        const claveLock = `${registroId}:${usuarioId}`;

        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${claveLock}))`;

        if (sentido === 'revertir') {
          await this.escribirReversion(tx, registroId, usuarioId);
        } else {
          await this.escribirRestitucion(tx, registroId, usuarioId);
        }
      }
    });
  }

  /** Quiénes cobraron (o a quiénes se les descontó), sin repetidos. */
  private async usuariosAfectados(
    registroId: string,
    sentido: 'revertir' | 'restituir'
  ): Promise<string[]> {
    const filas = await this.prisma.client.eventoMoneda.findMany({
      where: {
        origenId: registroId,
        tipo:
          sentido === 'revertir'
            ? TipoMovimientoMoneda.RENDIMIENTO_ACCION
            : TipoMovimientoMoneda.REVERSION_ACCION,
      },
    });

    return [...new Set(filas.map((fila) => fila.usuarioId))];
  }

  private async escribirReversion(
    tx: ClienteTransaccion,
    registroId: string,
    usuarioId: string
  ): Promise<void> {
    const asientos = await tx.eventoMoneda.findMany({
      where: {
        origenId: registroId,
        usuarioId,
        tipo: TipoMovimientoMoneda.RENDIMIENTO_ACCION,
      },
    });

    const acreditado = asientos.reduce((total, fila) => total + fila.monto, 0);

    if (acreditado <= 0) {
      return;
    }

    // EL PISO EN 0 (decisión 6). Se lee DESPUÉS del lock, no antes.
    const saldo = await sumarSaldo(tx, asientos[0].grupoId, usuarioId);
    const recuperado = Math.min(acreditado, Math.max(saldo, 0));
    const faltante = acreditado - recuperado;

    await this.escribirMovimiento(tx, asientos[0], {
      // `recuperado === 0 ? 0` y no `-recuperado`: en JavaScript `-0` es un
      // valor distinto de `0` para `Object.is`, y una fila de ledger con `-0`
      // es la clase de rareza que aparece años después en una comparación.
      monto: recuperado === 0 ? 0 : -recuperado,
      motivo:
        faltante > 0
          ? `Marca quitada por el tutor. No se pudieron recuperar ${faltante} de ${acreditado}: el saldo no alcanzaba.`
          : 'Marca quitada por el tutor',
    });
  }

  private async escribirRestitucion(
    tx: ClienteTransaccion,
    registroId: string,
    usuarioId: string
  ): Promise<void> {
    // El ÚLTIMO descuento de esa cadena, no el primero: con
    // `quitar → deshacer → quitar` hay varias filas y la que corresponde
    // deshacer es la vigente.
    const descuentos = await tx.eventoMoneda.findMany({
      where: {
        origenId: registroId,
        usuarioId,
        tipo: TipoMovimientoMoneda.REVERSION_ACCION,
      },
    });
    const ultimoDescuento = [...descuentos].reverse().find((fila) => fila.monto < 0);

    if (!ultimoDescuento) {
      return;
    }

    await this.escribirMovimiento(tx, ultimoDescuento, {
      // Lo que se descontó, no lo que se había acreditado (decisión 7).
      monto: -ultimoDescuento.monto,
      motivo: 'El tutor deshizo su marca',
    });
  }

  /**
   * Un solo tipo de movimiento con SIGNO para los dos sentidos (decisión 13):
   * negativo cuando el Tutor quita, positivo cuando deshace su quita. Es el
   * mismo hecho con signo opuesto — mismo criterio que `TareaEquipoMarcaPayload`
   * de fase-14-13, que usa un solo payload para anular y revertir.
   */
  private async escribirMovimiento(
    tx: ClienteTransaccion,
    referencia: MovimientoDeReferencia,
    datos: { monto: number; motivo: string }
  ): Promise<void> {
    await tx.eventoMoneda.create({
      data: {
        // Copiados del movimiento que compensa: la reversión pertenece al mismo
        // tenant, la misma billetera y la misma Sección que lo que revierte.
        organizacionId: referencia.organizacionId,
        grupoId: referencia.grupoId,
        usuarioId: referencia.usuarioId,
        tipo: TipoMovimientoMoneda.REVERSION_ACCION,
        monto: datos.monto,
        seccionId: referencia.seccionId,
        origenId: referencia.origenId,
        motivo: datos.motivo,
        registradoPorId: 'SYSTEM',
        registradoPorTipo: 'SYSTEM',
      },
    });
  }

  private async marcarProcesado(eventId: string, consumidor: string): Promise<void> {
    await marcarEnTransaccion(this.prisma.client, eventId, consumidor);
  }
}

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

/** El saldo SIEMPRE es la suma del ledger, nunca una columna (regla 1). */
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
