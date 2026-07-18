import { Injectable, Logger } from '@nestjs/common';

import type {
  EventEnvelope,
  SeccionEventoPayload,
  SesionEventoPayload,
  ZonaAlcanzadaPayload,
} from '@dorado/shared-events';
import { ROUTING_KEYS } from '@dorado/shared-events';
import { EvaluarUmbralesEn, UsuarioDto } from '@dorado/shared-types';

import { IdentityClientService } from '../clientes/identity-client.service';
import { SessionClientService } from '../clientes/session-client.service';
import { zonaParaPuntaje } from '../comun/zonas';
import {
  EventosPublisherService,
  type EventoAPublicar,
} from '../eventos/eventos-publisher.service';
import type { UmbralZona } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CONSUMIDOR } from './proyeccion.service';

/** Resultado calculado de un usuario para una Sección (previo a persistir). */
export interface EvaluacionUsuario {
  usuario: UsuarioDto;
  puntajeTotal: number;
  zona: UmbralZona | null;
  descalificado: boolean;
}

/**
 * Evaluación de puntaje+zona (spec fase-07): SIEMPRE derivada del ledger en
 * el momento — el único lugar donde un total se persiste es el snapshot
 * inmutable `ResultadoSeccion`, escrito una única vez al consumir
 * `SeccionEntroEvaluacion` (evaluación final).
 *
 * `SesionCerrada` con `evaluarUmbralesEn=CADA_SESION` publica ZonaAlcanzada
 * informativa (esEvaluacionFinal=false) sin escribir nada.
 *
 * Los consumidores corren SIN contexto de tenant, por eso cada query filtra
 * explícitamente por organizacionId/grupoId del envelope (mismo criterio que
 * el scheduler de session).
 */
@Injectable()
export class EvaluacionService {
  private readonly logger = new Logger(EvaluacionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityClientService,
    private readonly session: SessionClientService,
    private readonly eventos: EventosPublisherService
  ) {}

  async procesarSesionCerrada(envelope: EventEnvelope<SesionEventoPayload>): Promise<void> {
    if (await this.yaProcesado(envelope.eventId)) {
      return;
    }

    const { organizacionId, grupoId, seccionId } = envelope.payload;
    const config = await this.session.configuracionDelGrupo(grupoId);

    let zonas: EventoAPublicar<ZonaAlcanzadaPayload>[] = [];

    if (config.evaluarUmbralesEn === EvaluarUmbralesEn.CADA_SESION) {
      const evaluaciones = await this.evaluarGrupo(organizacionId, grupoId, seccionId);
      zonas = this.eventosDeZona(evaluaciones, organizacionId, grupoId, seccionId, false);
    }

    const marcado = await this.marcarProcesado(envelope.eventId);

    if (marcado) {
      // Después de la marca (mismo criterio "publicar tras commit" fase-02/06);
      // si otra entrega concurrente ganó la marca, esa publica — no duplicar.
      await this.eventos.publicarTodos(zonas);
    }
  }

  /**
   * Evaluación FINAL (spec): escribe un `ResultadoSeccion` por usuario ACTIVO
   * del grupo — con `descalificado=true` y zona null si hay
   * `DescalificacionSeccion` — y publica `ZonaAlcanzada esEvaluacionFinal=true`
   * por cada usuario no descalificado. Snapshots + marca de procesado en UNA
   * transacción; si otra entrega ya escribió los resultados de la Sección, no
   * se reescriben ni se republican (snapshot inmutable, escrito una vez).
   */
  async procesarSeccionEntroEvaluacion(
    envelope: EventEnvelope<SeccionEventoPayload>
  ): Promise<void> {
    if (await this.yaProcesado(envelope.eventId)) {
      return;
    }

    const { organizacionId, grupoId, seccionId } = envelope.payload;
    const evaluaciones = await this.evaluarGrupo(organizacionId, grupoId, seccionId);

    let escribio = false;

    try {
      escribio = await this.prisma.client.$transaction(async (tx) => {
        const existentes = await tx.resultadoSeccion.count({
          where: { seccionId, grupoId, organizacionId },
        });

        if (existentes === 0) {
          await tx.resultadoSeccion.createMany({
            data: evaluaciones.map((evaluacion) => ({
              organizacionId,
              grupoId,
              usuarioId: evaluacion.usuario.id,
              seccionId,
              puntajeTotal: evaluacion.puntajeTotal,
              umbralZonaId: evaluacion.zona?.id ?? null,
              nombreZona: evaluacion.zona?.nombreZona ?? null,
              descalificado: evaluacion.descalificado,
            })),
          });
        } else {
          this.logger.warn(
            `La sección ${seccionId} ya tiene ResultadoSeccion — no se reescribe (evento ${envelope.eventId})`
          );
        }

        await tx.eventoProcesado.create({
          data: { eventId: envelope.eventId, consumidor: CONSUMIDOR },
        });

        return existentes === 0;
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        this.logger.debug(`Evento ${envelope.eventId} procesado en paralelo — descartado`);
        return;
      }

      throw error;
    }

    if (escribio) {
      await this.eventos.publicarTodos(
        this.eventosDeZona(evaluaciones, organizacionId, grupoId, seccionId, true)
      );
    }
  }

  /**
   * Puntaje y zona de cada usuario ACTIVO del grupo para una Sección,
   * derivados del ledger (regla central 4.7): SUM(puntosSnapshot) + el umbral
   * cuyo rango contiene el total. Un usuario sin asientos suma 0.
   */
  async evaluarGrupo(
    organizacionId: string,
    grupoId: string,
    seccionId: string
  ): Promise<EvaluacionUsuario[]> {
    const usuarios = await this.identity.usuariosDelGrupo(grupoId);

    const [umbrales, sumas, descalificaciones] = await Promise.all([
      this.prisma.client.umbralZona.findMany({
        where: { grupoId, organizacionId },
        orderBy: { orden: 'asc' },
      }),
      this.prisma.client.eventoPuntos.groupBy({
        by: ['usuarioId'],
        where: { seccionId, grupoId, organizacionId },
        _sum: { puntosSnapshot: true },
      }),
      this.prisma.client.descalificacionSeccion.findMany({
        where: { seccionId, grupoId, organizacionId },
      }),
    ]);

    const sumaPorUsuario = new Map(
      sumas.map((suma) => [suma.usuarioId, suma._sum.puntosSnapshot ?? 0])
    );
    const descalificados = new Set(
      descalificaciones.map((descalificacion) => descalificacion.usuarioId)
    );

    return usuarios.map((usuario) => {
      const puntajeTotal = sumaPorUsuario.get(usuario.id) ?? 0;
      const descalificado = descalificados.has(usuario.id);

      return {
        usuario,
        puntajeTotal,
        // Zona solo si participa; y puede ser null igual si el puntaje quedó
        // por debajo de la zona más baja del grupo (o no hay umbrales).
        zona: descalificado ? null : zonaParaPuntaje(umbrales, puntajeTotal),
        descalificado,
      };
    });
  }

  /** Un ZonaAlcanzada por usuario evaluado no descalificado y con zona. */
  private eventosDeZona(
    evaluaciones: EvaluacionUsuario[],
    organizacionId: string,
    grupoId: string,
    seccionId: string,
    esEvaluacionFinal: boolean
  ): EventoAPublicar<ZonaAlcanzadaPayload>[] {
    return evaluaciones
      .filter((evaluacion) => !evaluacion.descalificado && evaluacion.zona !== null)
      .map((evaluacion) => ({
        eventType: 'ZonaAlcanzada',
        routingKey: ROUTING_KEYS.ZONA_ALCANZADA,
        organizacionId,
        grupoId,
        payload: {
          usuarioId: evaluacion.usuario.id,
          seccionId,
          organizacionId,
          grupoId,
          puntajeTotal: evaluacion.puntajeTotal,
          umbralZonaId: (evaluacion.zona as UmbralZona).id,
          nombreZona: (evaluacion.zona as UmbralZona).nombreZona,
          esEvaluacionFinal,
        },
      }));
  }

  private async yaProcesado(eventId: string): Promise<boolean> {
    const fila = await this.prisma.client.eventoProcesado.findUnique({
      where: { eventId },
    });

    if (fila) {
      this.logger.debug(`Evento ${eventId} ya procesado — descartado`);
    }

    return fila !== null;
  }

  /** `true` si esta entrega ganó la marca; `false` si otra la insertó antes. */
  private async marcarProcesado(eventId: string): Promise<boolean> {
    try {
      await this.prisma.client.eventoProcesado.create({
        data: { eventId, consumidor: CONSUMIDOR },
      });

      return true;
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        this.logger.debug(`Evento ${eventId} procesado en paralelo — descartado`);

        return false;
      }

      throw error;
    }
  }
}
