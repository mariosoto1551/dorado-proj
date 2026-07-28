import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';

import { correlationStorage } from '@dorado/shared-logging';

import { IdentityClientService } from '../clientes/identity-client.service';
import { ocurrenciasEntre } from '../comun/cron';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { ConfiguracionSesion, Seccion } from '../generated/prisma/client';
import { EstadoSeccion, EstadoSesion, ModoSesion } from '../generated/prisma/enums';
import { PrismaService, type ClientePrisma } from '../prisma/prisma.service';
import {
  MaquinaSeccionesService,
  type EventoSesiones,
} from '../secciones/maquina-secciones.service';

type TxScheduler = Pick<
  ClientePrisma,
  'seccion' | 'sesion' | 'ultimoTickProcesado' | '$executeRaw'
>;

/** Qué cron produjo una ocurrencia. Ante empate de instante, SESION va primero. */
type TipoOcurrencia = 'SESION' | 'SECCION';

interface Ocurrencia {
  instante: Date;
  tipo: TipoOcurrencia;
}

/** Techo de trabajo por tick (decisión 6 de la sub-spec): acota, no descarta. */
const MAX_OCURRENCIAS_POR_TICK = 500;

const HORAS_RECUPERACION_POR_DEFECTO = 168;

/**
 * Scheduler del modo AUTOMATICO. Es un RECONCILIADOR, no un temporizador: cada
 * tick no pregunta "¿este minuto es el del cron?" sino "¿qué ocurrencias
 * vencieron desde la última vez que miré?", y aplica todas las de la ventana
 * `(evaluadoHasta, ahora]` en orden cronológico.
 *
 * Por qué (fase-14-16): con el disparo por igualdad de minuto de la Fase 6, un
 * proceso caído durante el minuto exacto del cron perdía esa transición para
 * siempre — un deploy de 90 segundos bastaba. Ahora un corte de horas se
 * recupera solo en el primer tick posterior.
 *
 * Invariantes que sostienen la corrección:
 * - Los crons se evalúan en `Grupo.timezone` (identity, caché 5 min).
 * - Cada transición se sella con el instante en que ESTABA PROGRAMADA, no con
 *   el de la recuperación: el ledger tiene que decir cuándo correspondía el
 *   corte, no cuándo volvió el servicio.
 * - `evaluadoHasta` se escribe en la MISMA transacción que las transiciones, y
 *   las ventanas consecutivas no se solapan ni dejan huecos → ni duplicados ni
 *   pérdidas, tampoco entre dos ticks del mismo minuto.
 * - Un lock de asesoría por grupo serializa réplicas concurrentes (`@Cron` de
 *   NestJS es in-process: con 2 instancias ticknean las 2).
 * - Una extensión (`autocierrePospuestoHasta`) vigente AL INSTANTE de la
 *   ocurrencia suprime ese autocierre; al vencerse, el cierre-y-avance corre
 *   en el próximo tick.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  private readonly maxRecuperacionMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityClientService,
    private readonly maquina: MaquinaSeccionesService,
    private readonly eventos: EventosPublisherService,
    config?: ConfigService
  ) {
    const horas =
      config?.get<number>('SCHEDULER_MAX_RECUPERACION_HORAS') ?? HORAS_RECUPERACION_POR_DEFECTO;

    this.maxRecuperacionMs = horas * 60 * 60 * 1000;
  }

  @Cron('* * * * *')
  async tick(): Promise<void> {
    // Job sin request asociado: correlationId propio por tick (ADR-00 §5),
    // compartido por los logs y todos los eventos que publique.
    await correlationStorage.run({ correlationId: randomUUID() }, () =>
      this.procesarTick(new Date())
    );
  }

  async procesarTick(ahora: Date): Promise<void> {
    const configs = await this.prisma.client.configuracionSesion.findMany({
      where: { modo: ModoSesion.AUTOMATICO },
    });

    for (const config of configs) {
      try {
        await this.procesarGrupo(config, ahora);
      } catch (error) {
        // Un grupo con problemas no debe frenar el tick de los demás. Como no
        // se escribe `evaluadoHasta`, el próximo tick reintenta la ventana
        // completa: lo que se perdió acá se recupera después.
        this.logger.error(
          `Tick falló para grupo ${config.grupoId}: ${
            error instanceof Error ? (error.stack ?? error.message) : String(error)
          }`
        );
      }
    }
  }

  async procesarGrupo(config: ConfiguracionSesion, ahora: Date): Promise<void> {
    // Lectura barata fuera de la transacción para no abrir una tx (ni pegarle
    // a identity) cuando no hay nada que hacer. El valor autoritativo se
    // vuelve a leer adentro, ya bajo lock.
    const previo = await this.prisma.client.ultimoTickProcesado.findUnique({
      where: { grupoId: config.grupoId },
    });

    if (previo?.evaluadoHasta && previo.evaluadoHasta.getTime() >= ahora.getTime()) {
      return;
    }

    // Timezone del Grupo (spec fase-06: REST interno a identity, caché 5 min).
    // Va FUERA de la transacción: es I/O de red, no se deja una transacción
    // abierta esperando un HTTP. Si identity no responde, obtenerGrupo lanza y
    // el catch del tick lo loguea — sin escribir `evaluadoHasta`, así que el
    // próximo tick recupera la ventana entera (antes el reintento llegaba
    // tarde y la transición se perdía).
    const grupo = await this.identity.obtenerGrupo(config.grupoId);

    if (!grupo) {
      this.logger.warn(
        `Grupo ${config.grupoId} con modo AUTOMATICO no existe en identity — se saltea`
      );

      return;
    }

    const eventos = await this.prisma.client.$transaction(async (tx) =>
      this.reconciliar(tx as TxScheduler, config, grupo.timezone, ahora)
    );

    await this.eventos.publicarTodos(eventos);
  }

  /**
   * Núcleo transaccional: aplica todo lo vencido en `(evaluadoHasta, ahora]` y
   * mueve la marca de agua. Todo lo de acá adentro commitea junto o no
   * commitea nada.
   */
  private async reconciliar(
    tx: TxScheduler,
    config: ConfiguracionSesion,
    timezone: string,
    ahora: Date
  ): Promise<EventoSesiones[]> {
    await this.bloquearGrupo(tx, config.grupoId);

    const tick = await tx.ultimoTickProcesado.findUnique({
      where: { grupoId: config.grupoId },
    });

    // Otra réplica ganó el lock y ya evaluó esta ventana.
    if (tick?.evaluadoHasta && tick.evaluadoHasta.getTime() >= ahora.getTime()) {
      return [];
    }

    const desde = this.calcularDesde(tick?.evaluadoHasta ?? null, ahora, config.grupoId);
    const ocurrencias = this.recolectarOcurrencias(config, desde, ahora, timezone);
    const eventos: EventoSesiones[] = [];

    for (const ocurrencia of ocurrencias) {
      eventos.push(...(await this.aplicarOcurrencia(tx, config, ocurrencia)));
    }

    eventos.push(...(await this.aplicarExtensionVencida(tx, config, ahora)));

    // Si se alcanzó el techo por tick, la marca de agua queda en la última
    // ocurrencia aplicada (no en `ahora`): el tick siguiente continúa justo
    // desde ahí. Se acota el trabajo por tick sin descartar ninguno.
    const topeAlcanzado = ocurrencias.length >= MAX_OCURRENCIAS_POR_TICK;
    const evaluadoHasta = topeAlcanzado ? (ocurrencias.at(-1)?.instante ?? ahora) : ahora;

    if (topeAlcanzado) {
      this.logger.warn(
        `Grupo ${config.grupoId}: se alcanzó el tope de ${MAX_OCURRENCIAS_POR_TICK} ocurrencias ` +
          `por tick — la recuperación continúa desde ${evaluadoHasta.toISOString()} en el próximo tick`
      );
    }

    if (ocurrencias.length > 0) {
      this.logger.log(
        `Grupo ${config.grupoId}: ${ocurrencias.length} ocurrencia(s) aplicada(s) en la ventana ` +
          `(${desde.toISOString()}, ${ahora.toISOString()}]`
      );
    }

    await tx.ultimoTickProcesado.upsert({
      where: { grupoId: config.grupoId },
      create: { grupoId: config.grupoId, evaluadoHasta },
      update: { evaluadoHasta },
    });

    return eventos;
  }

  /**
   * Lock de asesoría por grupo, liberado solo al terminar la transacción.
   * `@Cron` de NestJS corre in-process: con 2 réplicas de session-service las
   * dos ticknean, y como la marca de agua se lee ANTES de aplicar las
   * transiciones, con Read Committed las dos podrían crear la misma Sección.
   * Se usa advisory lock y no `SELECT … FOR UPDATE` porque tiene que funcionar
   * también cuando la fila de UltimoTickProcesado todavía no existe.
   *
   * `$executeRaw` y no `$queryRaw`: `pg_advisory_xact_lock` devuelve `void` y
   * el deserializador de $queryRaw no sabe mapear ese tipo — falla en runtime
   * ("Failed to deserialize column of type 'void'"), no en compilación.
   */
  private async bloquearGrupo(tx: TxScheduler, grupoId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${grupoId}))`;
  }

  /**
   * Inicio de la ventana. Sin marca previa arranca en `ahora`: un grupo recién
   * puesto en AUTOMATICO — o los que ya existían al desplegar este ítem — no
   * deben fabricar retroactivamente la historia entera.
   */
  private calcularDesde(evaluadoHasta: Date | null, ahora: Date, grupoId: string): Date {
    if (!evaluadoHasta) {
      return ahora;
    }

    const limite = new Date(ahora.getTime() - this.maxRecuperacionMs);

    if (evaluadoHasta.getTime() < limite.getTime()) {
      this.logger.warn(
        `Grupo ${grupoId}: la última evaluación (${evaluadoHasta.toISOString()}) excede la ventana ` +
          `máxima de recuperación — se recorta a ${limite.toISOString()} y se descartan las ` +
          `ocurrencias anteriores`
      );

      return limite;
    }

    return evaluadoHasta;
  }

  /** Ocurrencias de ambos crons en la ventana, ordenadas; SESION antes que SECCION ante empate. */
  private recolectarOcurrencias(
    config: ConfiguracionSesion,
    desde: Date,
    hasta: Date,
    timezone: string
  ): Ocurrencia[] {
    const de = (expresion: string | null, tipo: TipoOcurrencia): Ocurrencia[] =>
      expresion
        ? ocurrenciasEntre(expresion, desde, hasta, timezone, MAX_OCURRENCIAS_POR_TICK).map(
            (instante) => ({ instante, tipo })
          )
        : [];

    const todas = [
      ...de(config.cronAperturaSesion, 'SESION'),
      ...de(config.cronAperturaSeccion, 'SECCION'),
    ];

    // Orden de la spec fase-06 dentro de un mismo instante (caso Destino:Dorado,
    // lunes 00:00): primero el avance de sesión (casos 1–2), después el cierre
    // y apertura de sección (caso 3).
    todas.sort((a, b) => {
      const porInstante = a.instante.getTime() - b.instante.getTime();

      if (porInstante !== 0) {
        return porInstante;
      }

      return a.tipo === b.tipo ? 0 : a.tipo === 'SESION' ? -1 : 1;
    });

    return todas.slice(0, MAX_OCURRENCIAS_POR_TICK);
  }

  /**
   * Aplica una ocurrencia a SU instante programado. La Sección vigente se
   * re-lee en cada iteración a propósito: `cerrarSeccion` crea la siguiente,
   * así que una referencia en memoria quedaría vieja apenas se recuperan dos
   * ocurrencias en el mismo tick.
   */
  private async aplicarOcurrencia(
    tx: TxScheduler,
    config: ConfiguracionSesion,
    ocurrencia: Ocurrencia
  ): Promise<EventoSesiones[]> {
    const seccion = await this.seccionVigente(tx, config.grupoId);

    if (ocurrencia.tipo === 'SESION') {
      return this.aplicarAperturaSesion(tx, config, seccion, ocurrencia.instante);
    }

    return this.aplicarAperturaSeccion(tx, config, seccion, ocurrencia.instante);
  }

  /** Casos 1–2 de la spec fase-06: autocierre de la sesión abierta y avance. */
  private async aplicarAperturaSesion(
    tx: TxScheduler,
    config: ConfiguracionSesion,
    seccion: Seccion | null,
    instante: Date
  ): Promise<EventoSesiones[]> {
    if (!seccion || seccion.estado !== EstadoSeccion.ABIERTA) {
      return [];
    }

    const abierta = await tx.sesion.findFirst({
      where: { seccionId: seccion.id, estado: EstadoSesion.ABIERTA },
    });

    const pospuesta = abierta?.autocierrePospuestoHasta ?? null;

    // La extensión se evalúa contra el instante de la OCURRENCIA, no contra
    // `ahora`: una extensión vigente a las 00:00 suprime el autocierre de las
    // 00:00 aunque la recuperación corra a las 03:17.
    if (pospuesta !== null && instante.getTime() < pospuesta.getTime()) {
      return [];
    }

    const avance = await this.maquina.avanzarSesion(tx, seccion, config, instante);

    return avance.eventos;
  }

  /** Caso 3 de la spec fase-06: cierre de la sección vigente y apertura de la siguiente. */
  private async aplicarAperturaSeccion(
    tx: TxScheduler,
    config: ConfiguracionSesion,
    seccion: Seccion | null,
    instante: Date
  ): Promise<EventoSesiones[]> {
    // `cerrarSeccion` ya crea la siguiente + su primera sesión porque
    // modo=AUTOMATICO. Sin sección vigente (grupo recién pasado a AUTOMATICO),
    // se crea la primera.
    if (seccion) {
      const cierre = await this.maquina.cerrarSeccion(tx, seccion, config, instante);

      return cierre.eventos;
    }

    const apertura = await this.maquina.abrirSeccion(tx, {
      organizacionId: config.organizacionId,
      grupoId: config.grupoId,
    });

    return apertura.eventos;
  }

  /**
   * Cierre diferido por una extensión que ya venció, sin cron que matchee ese
   * minuto. Se evalúa una vez por tick contra `ahora` — no tiene una ocurrencia
   * de cron propia porque el instante lo fijó el tutor al extender.
   */
  private async aplicarExtensionVencida(
    tx: TxScheduler,
    config: ConfiguracionSesion,
    ahora: Date
  ): Promise<EventoSesiones[]> {
    const seccion = await this.seccionVigente(tx, config.grupoId);

    if (!seccion || seccion.estado !== EstadoSeccion.ABIERTA) {
      return [];
    }

    const abierta = await tx.sesion.findFirst({
      where: { seccionId: seccion.id, estado: EstadoSesion.ABIERTA },
    });

    const pospuesta = abierta?.autocierrePospuestoHasta ?? null;

    if (pospuesta === null || ahora.getTime() < pospuesta.getTime()) {
      return [];
    }

    const avance = await this.maquina.avanzarSesion(tx, seccion, config, ahora);

    return avance.eventos;
  }

  /** Sección no-CERRADA del grupo (invariante: como mucho una). */
  private async seccionVigente(tx: TxScheduler, grupoId: string): Promise<Seccion | null> {
    return tx.seccion.findFirst({
      where: { grupoId, estado: { not: EstadoSeccion.CERRADA } },
      orderBy: { numero: 'desc' },
    });
  }
}
