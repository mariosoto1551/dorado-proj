import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';

import { InternalSecretGuard } from '@dorado/shared-auth';
import {
  AjusteHistorialInternoDto,
  ConfiguracionScoringInternaDto,
  PuntajeResumidoDto,
  ResumenPuntajesGrupoDto,
  UmbralZonaDto,
} from '@dorado/shared-types';

import {
  resultadoAResponse,
  umbralADto,
  type ResultadoSeccionResponse,
} from '../comun/mapeadores';
import { zonaParaPuntaje } from '../comun/zonas';
import { TipoOrigenPuntos } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AjustesSesionInternaQuery } from './dto/ajustes-sesion.query';

/** Default de página; el llamador manda el suyo (`limite + 1` del timeline). */
const LIMITE_AJUSTES = 51;

/**
 * Endpoints internos servicio-a-servicio (ADR-00 §4): protegidos por
 * `x-internal-secret`, NUNCA expuestos vía Gateway público. Trabajan con IDs
 * explícitos (el llamador interno es confiable) — sin contexto de tenant.
 *
 * Consumidor previsto (spec fase-07): rewards-service en Fase 8 — `umbrales/:id`
 * para validar que una Recompensa referencia una zona real, `.../resultado`
 * para saber a qué zona quedó habilitado un usuario y si está descalificado.
 */
@Controller('internal/scoring')
@UseGuards(InternalSecretGuard)
export class InternalController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('umbrales/:id')
  async umbral(@Param('id') id: string): Promise<UmbralZonaDto> {
    const umbral = await this.prisma.client.umbralZona.findFirst({ where: { id } });

    if (!umbral) {
      throw new NotFoundException('Umbral no encontrado');
    }

    return umbralADto(umbral);
  }

  /**
   * Zonas de un Grupo, ordenadas de la más baja a la más alta.
   *
   * Agregado en fase-14-22 (no estaba previsto en la spec de Fase 7): la
   * pantalla de rendimiento por zona de rewards tiene que listar TODAS las
   * zonas del grupo, incluidas las que todavía no tienen monedas configuradas.
   * Sin esto, rewards solo conoce las zonas que alguien ya referenció.
   */
  @Get('grupos/:grupoId/umbrales')
  async umbralesDelGrupo(@Param('grupoId') grupoId: string): Promise<UmbralZonaDto[]> {
    const umbrales = await this.prisma.client.umbralZona.findMany({
      where: { grupoId },
      orderBy: { orden: 'asc' },
    });

    return umbrales.map(umbralADto);
  }

  @Get('usuarios/:usuarioId/secciones/:seccionId/resultado')
  async resultado(
    @Param('usuarioId') usuarioId: string,
    @Param('seccionId') seccionId: string
  ): Promise<ResultadoSeccionResponse> {
    const resultado = await this.prisma.client.resultadoSeccion.findFirst({
      where: { usuarioId, seccionId },
    });

    if (!resultado) {
      // 404 = esa Sección todavía no se evaluó para ese usuario (spec).
      throw new NotFoundException('Resultado no encontrado — la sección aún no fue evaluada');
    }

    return resultadoAResponse(resultado);
  }

  /**
   * fase-14-29 (herramienta `resumen_puntajes`): cómo viene el Grupo en la
   * Sección más reciente que tenga movimiento.
   *
   * **La Sección se resuelve acá, desde el propio ledger**, en vez de pedírsela
   * a session-service: encadenar un tercer servicio para contestar algo que
   * `EventoPuntos` ya sabe agrega una dependencia y un modo de falla nuevos a
   * un camino de solo lectura.
   *
   * Devuelve el snapshot `ResultadoSeccion` si la Sección ya se evaluó, y el
   * cálculo en vivo desde el ledger si todavía no — la misma dualidad que
   * `PuntajesService`, y por el mismo motivo (el histórico no cambia aunque
   * lleguen correcciones después). Cuál de los dos fue viaja en `origen`: quien
   * lo consuma tiene que poder decir "provisorio" cuando lo es.
   *
   * Sin nombres: scoring no los conoce y no sale a identity por esto. Quien
   * arma el resumen ya tiene la lista de participantes y compone por ID
   * (regla 2 de CLAUDE.md).
   */
  /**
   * fase-14-30 (parte de la herramienta `configuracion_del_grupo`): la base con
   * la que arranca cada participante en CADA Sección.
   *
   * Importa para calibrar: con 100 puntos iniciales, una actividad de 5 no pesa
   * lo mismo que con 0. Un grupo sin fila devuelve 0, que es el comportamiento
   * histórico — «sin configurar» es una configuración, no un dato que falta.
   */
  @Get('grupos/:grupoId/configuracion')
  async configuracionDelGrupo(
    @Param('grupoId') grupoId: string
  ): Promise<ConfiguracionScoringInternaDto> {
    const config = await this.prisma.client.configuracionScoringGrupo.findUnique({
      where: { grupoId },
    });

    return { puntosIniciales: config?.puntosIniciales ?? 0 };
  }

  /**
   * fase-14-34: los ajustes manuales de una Sesión, para el historial que arma
   * activity-service.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * POR QUÉ EXISTE: hasta este ítem, un ajuste a mano NO aparecía en ninguna
   * pantalla. Se escribía en el ledger, cambiaba el puntaje y la zona, y el
   * Tutor no tenía dónde verlo — lo mismo pasaba con los que aplica el
   * asistente, que usan este mismo endpoint público. «Aplicar todo» sí
   * escribía; lo que faltaba era el lugar donde comprobarlo.
   * ───────────────────────────────────────────────────────────────────────────
   *
   * Devuelve `limite` filas **más nuevas que nada** o más viejas que el cursor,
   * en el mismo orden `(createdAt desc, id desc)` que usan las tres tablas de
   * activity: el llamador hace un merge y no reordena nada.
   */
  @Get('grupos/:grupoId/sesiones/:sesionId/ajustes')
  async ajustesDeLaSesion(
    @Param('grupoId') grupoId: string,
    @Param('sesionId') sesionId: string,
    @Query() query: AjustesSesionInternaQuery
  ): Promise<AjusteHistorialInternoDto[]> {
    const cursor = query.cursorCreatedAt
      ? new Date(query.cursorCreatedAt)
      : null;
    const eventos = await this.prisma.client.eventoPuntos.findMany({
      where: {
        organizacionId: query.organizacionId,
        grupoId,
        sesionId,
        // Solo los de origen manual: ver la nota de `AjusteHistorialInternoDto`
        // sobre por qué las CORRECCION quedan afuera.
        tipoOrigen: TipoOrigenPuntos.AJUSTE_MANUAL,
        ...(query.usuarioId && { usuarioId: query.usuarioId }),
        ...(cursor && {
          OR: [
            { createdAt: { lt: cursor } },
            { createdAt: cursor, id: { lt: query.cursorId ?? '' } },
          ],
        }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limite ?? LIMITE_AJUSTES,
    });

    return eventos.map((evento) => ({
      id: evento.id,
      usuarioId: evento.usuarioId,
      puntos: evento.puntosSnapshot,
      // El ajuste siempre trae motivo (lo exige el request), pero la columna es
      // nullable porque la comparte con las correcciones: el fallback es para
      // que el timeline nunca muestre un hueco.
      motivo: evento.motivoCorreccion ?? 'Ajuste a mano',
      registradoPorId: evento.registradoPorId,
      registradoPorTipo: evento.registradoPorTipo,
      cargadoRetroactivamenteEn: evento.cargadoRetroactivamenteEn?.toISOString() ?? null,
      createdAt: evento.createdAt.toISOString(),
    }));
  }

  @Get('grupos/:grupoId/resumen-puntajes')
  async resumenPuntajes(@Param('grupoId') grupoId: string): Promise<ResumenPuntajesGrupoDto> {
    const ultimo = await this.prisma.client.eventoPuntos.findFirst({
      where: { grupoId },
      orderBy: { createdAt: 'desc' },
      select: { seccionId: true },
    });

    // Un Grupo que todavía no registró un solo punto no es un error: es un
    // Grupo nuevo, que es justo el caso donde más se va a preguntar.
    if (!ultimo) {
      return { grupoId, seccionId: null, origen: 'EN_VIVO', puntajes: [] };
    }

    const seccionId = ultimo.seccionId;
    const resultados = await this.prisma.client.resultadoSeccion.findMany({
      where: { seccionId },
      orderBy: { puntajeTotal: 'desc' },
    });

    if (resultados.length > 0) {
      return {
        grupoId,
        seccionId,
        origen: 'SNAPSHOT',
        puntajes: resultados.map((resultado) => ({
          usuarioId: resultado.usuarioId,
          puntajeTotal: resultado.puntajeTotal,
          nombreZona: resultado.nombreZona,
          descalificado: resultado.descalificado,
        })),
      };
    }

    return {
      grupoId,
      seccionId,
      origen: 'EN_VIVO',
      puntajes: await this.puntajesEnVivo(grupoId, seccionId),
    };
  }

  /** Suma del ledger + base del grupo, con la zona resuelta contra los umbrales vigentes. */
  private async puntajesEnVivo(
    grupoId: string,
    seccionId: string
  ): Promise<PuntajeResumidoDto[]> {
    const [porUsuario, descalificaciones, umbrales, config] = await Promise.all([
      this.prisma.client.eventoPuntos.groupBy({
        by: ['usuarioId'],
        where: { seccionId },
        _sum: { puntosSnapshot: true },
      }),
      this.prisma.client.descalificacionSeccion.findMany({
        where: { seccionId },
        select: { usuarioId: true },
      }),
      this.prisma.client.umbralZona.findMany({
        where: { grupoId },
        orderBy: { orden: 'asc' },
      }),
      this.prisma.client.configuracionScoringGrupo.findUnique({ where: { grupoId } }),
    ]);

    const descalificados = new Set(descalificaciones.map((fila) => fila.usuarioId));
    // Base configurable por grupo (fase-14): se suma al ledger, igual que en
    // PuntajesService. Default 0.
    const base = config?.puntosIniciales ?? 0;

    return porUsuario
      .map((fila) => {
        const puntajeTotal = (fila._sum.puntosSnapshot ?? 0) + base;
        const descalificado = descalificados.has(fila.usuarioId);
        const zona = descalificado ? null : zonaParaPuntaje(umbrales, puntajeTotal);

        return {
          usuarioId: fila.usuarioId,
          puntajeTotal,
          nombreZona: zona?.nombreZona ?? null,
          descalificado,
        };
      })
      .sort((a, b) => b.puntajeTotal - a.puntajeTotal);
  }
}
