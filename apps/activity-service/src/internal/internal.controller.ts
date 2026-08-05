import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';

import { InternalSecretGuard } from '@dorado/shared-auth';
import {
  ActividadDto,
  AlcanceActividad,
  CatalogoRendibleDto,
  ComportamientoAlCierre,
  ConductaDto,
  ConfiguracionActividadInternaDto,
  CumplimientoActividadDto,
  ResumenCumplimientoDto,
  TipoPuntaje,
  TurnoActividadInternoDto,
} from '@dorado/shared-types';

import { actividadADto, conductaADto } from '../comun/mapeadores';
import { ConfiguracionContenidoService } from '../contenido-usuario/configuracion-contenido.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Ventana por defecto del resumen de cumplimiento, en días. Un mes cubre varias
 * Secciones semanales sin que una racha vieja tape lo que pasa ahora.
 */
const DIAS_CUMPLIMIENTO_DEFAULT = 30;

const DIAS_CUMPLIMIENTO_MAX = 365;

/**
 * Endpoints internos servicio-a-servicio (ADR-00 §4): protegidos por
 * `x-internal-secret`, NUNCA expuestos vía Gateway público. Trabajan con IDs
 * explícitos (el llamador interno es confiable) — sin contexto de tenant.
 *
 * Consumidor previsto (fase-09): notification-service resuelve
 * `nombreActividad`/`nombreConducta` para sus plantillas — los payloads de
 * eventos solo traen IDs a propósito (spec: no acoplar los payloads a nombres).
 * Se devuelve la fila aunque esté ARCHIVADA: una notificación sobre un
 * registro viejo sigue necesitando el nombre.
 */
@Controller('internal/activity')
@UseGuards(InternalSecretGuard)
export class InternalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionContenidoService
  ) {}

  @Get('actividades/:id')
  async actividad(@Param('id') id: string): Promise<ActividadDto> {
    const actividad = await this.prisma.client.actividad.findFirst({ where: { id } });

    if (!actividad) {
      throw new NotFoundException('Actividad no encontrada');
    }

    return actividadADto(actividad);
  }

  @Get('conductas/:id')
  async conducta(@Param('id') id: string): Promise<ConductaDto> {
    const conducta = await this.prisma.client.conducta.findFirst({ where: { id } });

    if (!conducta) {
      throw new NotFoundException('Conducta no encontrada');
    }

    return conductaADto(conducta);
  }

  /**
   * fase-14-28 (D.3): el catálogo del Grupo que PUEDE pagar monedas, para la
   * pantalla de rendimientos por acción de rewards y para validar cada
   * `origenId` del `PUT` (regla 2: se cruza por ID vía REST, nunca por join).
   *
   * Solo lo ACTIVO, y de conductas solo las BUENA: una MALA no tiene nada que
   * configurar (decisión 4 — lo que se hace nunca debita) y mostrarla con un
   * campo bloqueado invita a preguntar por qué existe (decisión 17).
   *
   * A diferencia de los dos GET de arriba, acá SÍ se filtra por estado: esto
   * alimenta una pantalla de configuración, no la resolución del nombre de algo
   * que ya pasó.
   */
  @Get('grupos/:grupoId/catalogo-rendible')
  async catalogoRendible(@Param('grupoId') grupoId: string): Promise<CatalogoRendibleDto> {
    const [actividades, conductas] = await Promise.all([
      this.prisma.client.actividad.findMany({
        where: { grupoId, estado: 'ACTIVA' },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.client.conducta.findMany({
        where: { grupoId, estado: 'ACTIVA', tipo: 'BUENA' },
        orderBy: { nombre: 'asc' },
      }),
    ]);

    return {
      actividades: actividades.map((actividad) => ({
        id: actividad.id,
        nombre: actividad.nombre,
        valorPuntos: actividad.valorPuntos,
        tipoPuntaje: actividad.tipoPuntaje as TipoPuntaje,
        alcance: actividad.alcance as AlcanceActividad,
        comportamientoAlCierre: actividad.comportamientoAlCierre as ComportamientoAlCierre,
        bonoJefePuntos: actividad.bonoJefePuntos,
        repeticionesMaximasSesion: actividad.repeticionesMaximasSesion,
      })),
      conductas: conductas.map((conducta) => ({
        id: conducta.id,
        nombre: conducta.nombre,
        valorPuntos: conducta.valorPuntos,
        // Una conducta no tiene ninguna de estas tres cosas: son de la Actividad.
        tipoPuntaje: null,
        alcance: null,
        comportamientoAlCierre: null,
        bonoJefePuntos: null,
        repeticionesMaximasSesion: null,
      })),
    };
  }

  /**
   * fase-14-29 (herramienta `listar_actividades`): el catálogo COMPLETO del
   * Grupo, con el DTO entero y no un recorte.
   *
   * A diferencia de `catalogo-rendible`, que existe para llenar una pantalla de
   * configuración, esto alimenta a quien tiene que proponer ediciones: para
   * decidir si a una actividad le falta el deadline o le sobran repeticiones
   * hacen falta los veintipico de campos, no siete.
   *
   * Devuelve también las ARCHIVADAS salvo que se filtre: "¿qué archivamos y por
   * qué?" es una pregunta legítima sobre el catálogo.
   */
  @Get('grupos/:grupoId/actividades')
  async actividadesDelGrupo(
    @Param('grupoId') grupoId: string,
    @Query('estado') estado?: string
  ): Promise<ActividadDto[]> {
    const actividades = await this.prisma.client.actividad.findMany({
      where: {
        grupoId,
        ...(estado === 'ACTIVA' || estado === 'ARCHIVADA' ? { estado } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    return actividades.map(actividadADto);
  }

  /** fase-14-29 (herramienta `listar_conductas`). Mismo criterio que el de arriba. */
  @Get('grupos/:grupoId/conductas')
  async conductasDelGrupo(
    @Param('grupoId') grupoId: string,
    @Query('estado') estado?: string
  ): Promise<ConductaDto[]> {
    const conductas = await this.prisma.client.conducta.findMany({
      where: {
        grupoId,
        ...(estado === 'ACTIVA' || estado === 'ARCHIVADA' ? { estado } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    return conductas.map(conductaADto);
  }

  /**
   * fase-14-30 (herramienta `configuracion_del_grupo`): la configuración que
   * cambia qué significan otros campos.
   *
   * Sin esto, `siempreVisible` es un campo que el asistente no puede proponer
   * con criterio —solo hace algo con el plan del día prendido— y las reglas de
   * contenido de los integrantes son invisibles. Delega en el service que ya
   * resuelve los defaults en memoria: duplicarlos acá es cómo se separan.
   */
  @Get('grupos/:grupoId/configuracion')
  async configuracionDelGrupo(
    @Param('grupoId') grupoId: string
  ): Promise<ConfiguracionActividadInternaDto> {
    const config = await this.configuracion.resolver(grupoId);

    return {
      planDelDiaActivo: config.planDelDiaActivo,
      modoCreacionUsuario: config.modoCreacionUsuario,
      maxPuntosActividadUsuario: config.maxPuntosActividadUsuario,
      maxActividadesActivasPorUsuario: config.maxActividadesActivasPorUsuario,
    };
  }

  /**
   * fase-14-30 (herramienta `listar_turnos`): las rotaciones configuradas del
   * Grupo, con su secuencia en orden.
   *
   * Solo las actividades que TIENEN turno: la ausencia de fila es la respuesta
   * de que esa actividad no rota. Sin los nombres de los participantes —eso es
   * una llamada a identity que quien consume ya hace por su cuenta— y sin la
   * vuelta en curso, que es estado operativo y no configuración.
   */
  @Get('grupos/:grupoId/turnos')
  async turnosDelGrupo(
    @Param('grupoId') grupoId: string
  ): Promise<TurnoActividadInternoDto[]> {
    const turnos = await this.prisma.client.turnoActividad.findMany({
      where: { grupoId },
      include: { posiciones: { orderBy: { orden: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });

    return turnos.map((turno) => ({
      actividadId: turno.actividadId,
      modo: turno.modo as TurnoActividadInternoDto['modo'],
      frecuencia: turno.frecuencia as TurnoActividadInternoDto['frecuencia'],
      activo: turno.activo,
      posiciones: turno.posiciones.map((posicion) => ({
        orden: posicion.orden,
        usuarioId: posicion.usuarioId,
      })),
    }));
  }

  /**
   * fase-14-29 (herramienta `resumen_cumplimiento`): cuánto se usa cada
   * actividad del catálogo en los últimos N días.
   *
   * Existe porque es la pregunta que el catálogo no contesta — ahí las veinte
   * actividades se ven igual de vivas, y la que nadie hizo nunca no se
   * distingue de la que se hace todos los días.
   *
   * Se cuentan solo las marcas VIGENTES: `eliminado` sin `revertidoPorTutorId`
   * queda afuera, igual que queda afuera del puntaje. Contar una marca que el
   * Tutor quitó diría que la actividad se cumple cuando el Tutor decidió lo
   * contrario.
   *
   * Las actividades sin ninguna marca se devuelven igual, con todo en cero: son
   * justamente el caso que la herramienta existe para encontrar.
   */
  @Get('grupos/:grupoId/resumen-cumplimiento')
  async resumenCumplimiento(
    @Param('grupoId') grupoId: string,
    @Query('dias') diasQuery?: string
  ): Promise<ResumenCumplimientoDto> {
    const dias = this.diasValidos(diasQuery);
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

    const [actividades, registros] = await Promise.all([
      this.prisma.client.actividad.findMany({
        where: { grupoId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.client.registroActividad.findMany({
        where: {
          grupoId,
          createdAt: { gte: desde },
          // Una marca eliminada no cuenta; una eliminada y después revertida
          // (fase-14-12) sí, porque volvió a valer.
          OR: [{ eliminado: false }, { revertidoPorTutorId: { not: null } }],
        },
        select: {
          actividadId: true,
          usuarioId: true,
          tipo: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      grupoId,
      dias,
      actividades: actividades.map((actividad) =>
        this.cumplimientoDe(actividad, registros)
      ),
    };
  }

  private diasValidos(diasQuery?: string): number {
    const parseado = Number.parseInt(diasQuery ?? '', 10);

    if (!Number.isFinite(parseado) || parseado < 1) {
      return DIAS_CUMPLIMIENTO_DEFAULT;
    }

    return Math.min(parseado, DIAS_CUMPLIMIENTO_MAX);
  }

  private cumplimientoDe(
    actividad: {
      id: string;
      nombre: string;
      estado: string;
      tipoPuntaje: string;
      valorPuntos: number;
    },
    registros: Array<{
      actividadId: string;
      usuarioId: string;
      tipo: string;
      createdAt: Date;
    }>
  ): CumplimientoActividadDto {
    const suyos = registros.filter((registro) => registro.actividadId === actividad.id);
    const completadas = suyos.filter((registro) => registro.tipo === 'COMPLETADA');
    const ultima = completadas.reduce<Date | null>(
      (masReciente, registro) =>
        masReciente === null || registro.createdAt > masReciente ? registro.createdAt : masReciente,
      null
    );

    return {
      actividadId: actividad.id,
      nombre: actividad.nombre,
      estado: actividad.estado as CumplimientoActividadDto['estado'],
      tipoPuntaje: actividad.tipoPuntaje as TipoPuntaje,
      valorPuntos: actividad.valorPuntos,
      vecesCompletada: completadas.length,
      vecesNoHizo: suyos.length - completadas.length,
      participantesDistintos: new Set(completadas.map((registro) => registro.usuarioId)).size,
      ultimaVezCompletada: ultima?.toISOString() ?? null,
    };
  }
}
