import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import {
  PuntajeUsuarioDto,
  Rol,
  TenantContext,
  UmbralZonaDto,
} from '@dorado/shared-types';

import { IdentityClientService } from '../clientes/identity-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { umbralADto } from '../comun/mapeadores';
import { zonaParaPuntaje } from '../comun/zonas';
import { EvaluacionService } from '../consumo/evaluacion.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Lectura de puntajes (spec fase-07): si la Sección ya tiene su snapshot
 * `ResultadoSeccion`, se devuelve tal cual (el histórico no cambia aunque el
 * ledger reciba correcciones después); si no, se calcula EN VIVO desde el
 * ledger — vista "preview" que puede cambiar. El puntaje jamás se lee de un
 * campo acumulado: no existe tal campo (regla 1 de CLAUDE.md).
 */
@Injectable()
export class PuntajesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityClientService,
    private readonly acceso: AccesoGrupoService,
    private readonly evaluacion: EvaluacionService
  ) {}

  /** GET /scoring/usuarios/:usuarioId/secciones/:seccionId/puntaje */
  async puntajeDeUsuario(
    tenant: TenantContext,
    usuarioId: string,
    seccionId: string
  ): Promise<PuntajeUsuarioDto> {
    // Un USUARIO solo consulta su propio puntaje (spec: "el propio Usuario").
    if (tenant.rol === Rol.USUARIO && tenant.principalId !== usuarioId) {
      throw new ForbiddenException('Solo podés consultar tu propio puntaje');
    }

    const usuario = await this.identity.obtenerUsuario(usuarioId);

    if (!usuario || usuario.organizacionId !== tenant.organizacionId) {
      // 404 también para usuarios de otra organización: no revelar existencia.
      throw new NotFoundException('Usuario no encontrado');
    }

    if (tenant.rol === Rol.TUTOR && !tenant.grupoIds.includes(usuario.grupoId)) {
      throw new ForbiddenException('Sin acceso a ese grupo');
    }

    const resultado = await this.prisma.client.resultadoSeccion.findFirst({
      where: { usuarioId, seccionId },
    });

    if (resultado) {
      return {
        usuarioId,
        seccionId,
        puntajeTotal: resultado.puntajeTotal,
        zona: await this.zonaPorId(resultado.umbralZonaId),
        descalificado: resultado.descalificado,
      };
    }

    return await this.puntajeEnVivo(usuario.grupoId, usuarioId, seccionId);
  }

  /** GET /scoring/grupos/:grupoId/secciones/:seccionId/puntajes — desc. */
  async puntajesDeGrupo(
    tenant: TenantContext,
    grupoId: string,
    seccionId: string
  ): Promise<PuntajeUsuarioDto[]> {
    // Chequeo fuerte también en lectura: este endpoint sale a identity con el
    // grupoId (lista de usuarios con nombre) — un grupoId ajeno no debe
    // llegar nunca a ese REST interno.
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    const resultados = await this.prisma.client.resultadoSeccion.findMany({
      where: { seccionId, grupoId },
    });

    let puntajes: PuntajeUsuarioDto[];

    if (resultados.length > 0) {
      const umbrales = await this.prisma.client.umbralZona.findMany({
        where: { grupoId },
      });
      const umbralPorId = new Map(umbrales.map((umbral) => [umbral.id, umbralADto(umbral)]));

      puntajes = resultados.map((resultado) => ({
        usuarioId: resultado.usuarioId,
        seccionId,
        puntajeTotal: resultado.puntajeTotal,
        zona: resultado.umbralZonaId
          ? (umbralPorId.get(resultado.umbralZonaId) ?? null)
          : null,
        descalificado: resultado.descalificado,
      }));
    } else {
      const evaluaciones = await this.evaluacion.evaluarGrupo(
        tenant.organizacionId,
        grupoId,
        seccionId
      );

      puntajes = evaluaciones.map((evaluacion) => ({
        usuarioId: evaluacion.usuario.id,
        seccionId,
        puntajeTotal: evaluacion.puntajeTotal,
        zona: evaluacion.zona ? umbralADto(evaluacion.zona) : null,
        descalificado: evaluacion.descalificado,
      }));
    }

    // De mayor a menor puntaje (spec): base del panel de evaluación (Fase 10).
    return puntajes.sort((a, b) => b.puntajeTotal - a.puntajeTotal);
  }

  /** Vista preview desde el ledger (Sección sin ResultadoSeccion todavía). */
  private async puntajeEnVivo(
    grupoId: string,
    usuarioId: string,
    seccionId: string
  ): Promise<PuntajeUsuarioDto> {
    const [suma, descalificacion, umbrales] = await Promise.all([
      this.prisma.client.eventoPuntos.aggregate({
        where: { usuarioId, seccionId },
        _sum: { puntosSnapshot: true },
      }),
      this.prisma.client.descalificacionSeccion.findFirst({
        where: { usuarioId, seccionId },
      }),
      this.prisma.client.umbralZona.findMany({
        where: { grupoId },
        orderBy: { orden: 'asc' },
      }),
    ]);

    const puntajeTotal = suma._sum.puntosSnapshot ?? 0;
    const descalificado = descalificacion !== null;
    const zona = descalificado ? null : zonaParaPuntaje(umbrales, puntajeTotal);

    return {
      usuarioId,
      seccionId,
      puntajeTotal,
      zona: zona ? umbralADto(zona) : null,
      descalificado,
    };
  }

  /** Zona vigente por id (para snapshots); null si el umbral ya no existe. */
  private async zonaPorId(umbralZonaId: string | null): Promise<UmbralZonaDto | null> {
    if (!umbralZonaId) {
      return null;
    }

    const umbral = await this.prisma.client.umbralZona.findFirst({
      where: { id: umbralZonaId },
    });

    return umbral ? umbralADto(umbral) : null;
  }
}
