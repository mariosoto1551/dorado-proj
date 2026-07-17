import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';

import { correlationStorage } from '@dorado/shared-logging';

import { IdentityClientService } from '../clientes/identity-client.service';
import { cronMatcheaMinuto } from '../comun/cron';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { ConfiguracionSesion } from '../generated/prisma/client';
import { EstadoSeccion, EstadoSesion, ModoSesion } from '../generated/prisma/enums';
import { PrismaService, type ClientePrisma } from '../prisma/prisma.service';
import {
  MaquinaSeccionesService,
  type EventoSesiones,
} from '../secciones/maquina-secciones.service';

type TxScheduler = Pick<ClientePrisma, 'seccion' | 'sesion' | 'ultimoTickProcesado'>;

/**
 * Scheduler del modo AUTOMATICO (spec fase-06): job cada 1 minuto que recorre
 * los Grupos con `ConfiguracionSesion.modo = AUTOMATICO` y evalúa, en este
 * orden: (1–2) apertura de sesión — cierra la abierta y abre la siguiente, o
 * pasa la Sección a EVALUACION si ya corrieron todas —, (3) apertura de
 * sección — cierra la vigente y crea la siguiente.
 *
 * - Los crons se evalúan en `Grupo.timezone` (identity, caché 5 min) por
 *   igualdad de minuto, nunca por rango.
 * - `UltimoTickProcesado` se escribe en la MISMA transacción que las
 *   transiciones: un reinicio del proceso dentro del mismo minuto no duplica
 *   disparos (idempotencia pedida por la spec).
 * - Una extensión (`autocierrePospuestoHasta`) vigente suprime el autocierre
 *   de ese cron; al vencerse, el cierre-y-avance corre en el próximo tick.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityClientService,
    private readonly maquina: MaquinaSeccionesService,
    private readonly eventos: EventosPublisherService
  ) {}

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
        // Un grupo con problemas no debe frenar el tick de los demás.
        this.logger.error(
          `Tick falló para grupo ${config.grupoId}: ${
            error instanceof Error ? (error.stack ?? error.message) : String(error)
          }`
        );
      }
    }
  }

  async procesarGrupo(config: ConfiguracionSesion, ahora: Date): Promise<void> {
    const minuto = Math.floor(ahora.getTime() / 60000);

    const tick = await this.prisma.client.ultimoTickProcesado.findUnique({
      where: { grupoId: config.grupoId },
    });

    if (tick && tick.minutoEpoch >= minuto) {
      return;
    }

    // Timezone del Grupo (spec: REST interno a identity, caché 5 min). Si
    // identity no responde, obtenerGrupo lanza y el catch del tick lo loguea:
    // el grupo se reintenta en el próximo minuto.
    const grupo = await this.identity.obtenerGrupo(config.grupoId);

    if (!grupo) {
      this.logger.warn(
        `Grupo ${config.grupoId} con modo AUTOMATICO no existe en identity — se saltea`
      );

      return;
    }

    const eventos = await this.prisma.client.$transaction(async (tx) =>
      this.aplicarTransiciones(tx, config, grupo.timezone, ahora, minuto)
    );

    await this.eventos.publicarTodos(eventos);
  }

  private async aplicarTransiciones(
    tx: TxScheduler,
    config: ConfiguracionSesion,
    timezone: string,
    ahora: Date,
    minuto: number
  ): Promise<EventoSesiones[]> {
    const eventos: EventoSesiones[] = [];

    const matchSesion = config.cronAperturaSesion
      ? cronMatcheaMinuto(config.cronAperturaSesion, ahora, timezone)
      : false;
    const matchSeccion = config.cronAperturaSeccion
      ? cronMatcheaMinuto(config.cronAperturaSeccion, ahora, timezone)
      : false;

    let seccion = await tx.seccion.findFirst({
      where: { grupoId: config.grupoId, estado: { not: EstadoSeccion.CERRADA } },
      orderBy: { numero: 'desc' },
    });

    // Casos 1–2 de la spec: autocierre/apertura de sesión, respetando una
    // extensión vigente y ejecutando el cierre diferido cuando venció.
    if (seccion && seccion.estado === EstadoSeccion.ABIERTA) {
      const abierta = await tx.sesion.findFirst({
        where: { seccionId: seccion.id, estado: EstadoSesion.ABIERTA },
      });

      const pospuesta = abierta?.autocierrePospuestoHasta ?? null;
      const extensionVigente = pospuesta !== null && ahora.getTime() < pospuesta.getTime();
      const extensionVencida = pospuesta !== null && ahora.getTime() >= pospuesta.getTime();

      if ((matchSesion && !extensionVigente) || extensionVencida) {
        const avance = await this.maquina.avanzarSesion(tx, seccion, config, ahora);
        eventos.push(...avance.eventos);

        if (avance.entroEvaluacion) {
          seccion = { ...seccion, estado: EstadoSeccion.EVALUACION };
        }
      }
    }

    // Caso 3 de la spec: cierre de la sección vigente (EVALUACION, o ABIERTA
    // como caso de seguridad) y apertura de la siguiente — cerrarSeccion ya
    // crea la siguiente + su primera sesión porque modo=AUTOMATICO. Sin
    // sección vigente (grupo recién pasado a AUTOMATICO), se crea la primera.
    if (matchSeccion) {
      if (seccion) {
        const cierre = await this.maquina.cerrarSeccion(tx, seccion, config, ahora);
        eventos.push(...cierre.eventos);
      } else {
        const apertura = await this.maquina.abrirSeccion(tx, {
          organizacionId: config.organizacionId,
          grupoId: config.grupoId,
        });
        eventos.push(...apertura.eventos);
      }
    }

    // En la MISMA transacción que las transiciones (ver doc de la clase).
    await tx.ultimoTickProcesado.upsert({
      where: { grupoId: config.grupoId },
      create: { grupoId: config.grupoId, minutoEpoch: minuto },
      update: { minutoEpoch: minuto },
    });

    return eventos;
  }
}
