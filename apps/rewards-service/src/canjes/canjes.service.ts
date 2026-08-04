import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ROUTING_KEYS } from '@dorado/shared-events';
import {
  CanjeRecompensaDto,
  Rol,
  TenantContext,
  UsuarioDto,
} from '@dorado/shared-types';

import { IdentityClientService } from '../clientes/identity-client.service';
import {
  ScoringClientService,
  type ResultadoSeccionInterno,
} from '../clientes/scoring-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { canjeADto, recompensaADto } from '../comun/mapeadores';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { CanjeRecompensa, Recompensa } from '../generated/prisma/client';
import {
  EstadoCanje,
  EstadoCatalogo,
  MecanicaRecompensa,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { ElegiblesResponse, MotivoSinElegibles } from './dto/canjes.dto';

/**
 * Elegibilidad y canje (spec fase-08). La elegibilidad NUNCA se precomputa:
 * se deriva en el momento del `ResultadoSeccion` de scoring (REST interno) —
 * si scoring todavía no evaluó la Sección (404) no hay canje posible, lo que
 * garantiza sola la regla "no se canjea con la Sección ABIERTA".
 */
@Injectable()
export class CanjesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityClientService,
    private readonly scoring: ScoringClientService,
    private readonly acceso: AccesoGrupoService,
    private readonly eventos: EventosPublisherService
  ) {}

  /** GET /rewards/usuarios/:usuarioId/secciones/:seccionId/elegibles */
  async elegibles(
    tenant: TenantContext,
    usuarioId: string,
    seccionId: string
  ): Promise<ElegiblesResponse> {
    const usuario = await this.usuarioAutorizado(tenant, usuarioId);
    const resultado = await this.scoring.obtenerResultado(usuarioId, seccionId);

    if (!resultado) {
      return sinElegibles('SECCION_NO_EVALUADA');
    }

    // Chequeo EXPLÍCITO de descalificación (regla de la spec: no asumir que
    // "sin zona" ya lo cubre).
    if (resultado.descalificado) {
      return sinElegibles('DESCALIFICADO');
    }

    if (!resultado.umbralZonaId) {
      // Puntaje por debajo de la zona más baja del grupo (caso fase-07).
      return sinElegibles('SIN_ZONA');
    }

    const recompensas = await this.recompensasDeZona(usuario.grupoId, resultado.umbralZonaId);

    // fase-14-26 decisión 12: los elegibles son lo que ve el PARTICIPANTE, así
    // que van sin etiquetas — el mapeador se llama con lambda y no por
    // referencia a propósito: `.map(recompensaADto)` le pasaría el índice del
    // array como segundo argumento (lo atajó el compilador al sumarlo).
    return {
      motivo: null,
      disponiblesSeleccion: recompensas
        .filter((recompensa) => recompensa.permiteSeleccion)
        .map((recompensa) => recompensaADto(recompensa)),
      disponiblesAzar: recompensas
        .filter((recompensa) => recompensa.permiteAzar)
        .map((recompensa) => recompensaADto(recompensa)),
    };
  }

  /** POST .../seleccionar — mecánica SELECCION sobre una elegible puntual. */
  async seleccionar(
    tenant: TenantContext,
    usuarioId: string,
    seccionId: string,
    recompensaId: string
  ): Promise<CanjeRecompensaDto> {
    const usuario = await this.usuarioAutorizado(tenant, usuarioId);
    const resultado = await this.resultadoCanjeable(usuario, usuarioId, seccionId);

    const recompensa = await this.prisma.client.recompensa.findFirst({
      where: { id: recompensaId },
    });

    if (
      !recompensa ||
      recompensa.estado !== EstadoCatalogo.ACTIVA ||
      recompensa.grupoId !== usuario.grupoId ||
      recompensa.umbralZonaId !== resultado.umbralZonaId
    ) {
      throw new BadRequestException('La recompensa no está entre las elegibles de esta sección');
    }

    if (!recompensa.permiteSeleccion) {
      throw new BadRequestException('La recompensa no permite selección directa');
    }

    return await this.crearCanje(tenant, usuario, seccionId, recompensa, MecanicaRecompensa.SELECCION);
  }

  /** POST .../sortear — Math.random sobre las elegibles con permiteAzar (spec). */
  async sortear(
    tenant: TenantContext,
    usuarioId: string,
    seccionId: string
  ): Promise<CanjeRecompensaDto> {
    const usuario = await this.usuarioAutorizado(tenant, usuarioId);
    const resultado = await this.resultadoCanjeable(usuario, usuarioId, seccionId);

    const candidatas = (
      await this.recompensasDeZona(usuario.grupoId, resultado.umbralZonaId as string)
    ).filter((recompensa) => recompensa.permiteAzar);

    if (candidatas.length === 0) {
      throw new ConflictException('No hay recompensas elegibles para sorteo en esta zona');
    }

    const elegida = candidatas[Math.floor(Math.random() * candidatas.length)];

    return await this.crearCanje(tenant, usuario, seccionId, elegida, MecanicaRecompensa.AZAR);
  }

  /** GET /rewards/grupos/:grupoId/secciones/:seccionId/canjes */
  async listarCanjes(
    tenant: TenantContext,
    grupoId: string,
    seccionId: string
  ): Promise<CanjeRecompensaDto[]> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    const canjes = await this.prisma.client.canjeRecompensa.findMany({
      where: { grupoId, seccionId },
      orderBy: { createdAt: 'asc' },
    });

    return canjes.map(canjeADto);
  }

  /** PATCH /rewards/canjes/:id/entregar */
  async entregar(tenant: TenantContext, canjeId: string): Promise<CanjeRecompensaDto> {
    const canje = await this.prisma.client.canjeRecompensa.findFirst({
      where: { id: canjeId },
    });

    if (!canje) {
      throw new NotFoundException('Canje no encontrado');
    }

    if (canje.estado === EstadoCanje.ENTREGADA) {
      throw new ConflictException('El canje ya fue entregado');
    }

    const ahora = new Date();

    await this.prisma.client.canjeRecompensa.updateMany({
      where: { id: canjeId },
      data: {
        estado: EstadoCanje.ENTREGADA,
        entregadaPorTutorId: tenant.principalId,
        entregadaEn: ahora,
      },
    });

    const entregado = {
      ...canje,
      estado: EstadoCanje.ENTREGADA,
      entregadaPorTutorId: tenant.principalId,
      entregadaEn: ahora,
    };

    // Retrofit fase-09: rastro de auditoría de toda escritura administrativa.
    await this.eventos.publicarAccionAdministrativa({
      organizacionId: canje.organizacionId,
      grupoId: canje.grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion: 'CANJE_ENTREGADO',
      entidadTipo: 'CanjeRecompensa',
      entidadId: canje.id,
      detalle: { antes: canjeADto(canje), despues: canjeADto(entregado) },
    });

    return canjeADto(entregado);
  }

  /**
   * Usuario objetivo autorizado (regla 3 de CLAUDE.md): USUARIO solo sobre sí
   * mismo; TUTOR solo sobre usuarios de sus grupos; siempre de la misma
   * organización (404 si no, sin revelar existencia).
   */
  private async usuarioAutorizado(tenant: TenantContext, usuarioId: string): Promise<UsuarioDto> {
    if (tenant.rol === Rol.USUARIO && tenant.principalId !== usuarioId) {
      throw new ForbiddenException('Solo podés operar sobre tus propias recompensas');
    }

    const usuario = await this.identity.obtenerUsuario(usuarioId);

    if (!usuario || usuario.organizacionId !== tenant.organizacionId) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (tenant.rol === Rol.TUTOR && !tenant.grupoIds.includes(usuario.grupoId)) {
      throw new ForbiddenException('Sin acceso a ese grupo');
    }

    return usuario;
  }

  /**
   * Resultado apto para canjear: la Sección debe estar evaluada (409 si no),
   * el usuario no descalificado (403 — criterio 3 de la spec) y con zona.
   */
  private async resultadoCanjeable(
    usuario: UsuarioDto,
    usuarioId: string,
    seccionId: string
  ): Promise<ResultadoSeccionInterno> {
    const resultado = await this.scoring.obtenerResultado(usuarioId, seccionId);

    if (!resultado) {
      throw new ConflictException(
        'La sección todavía no fue evaluada — no hay canje disponible'
      );
    }

    if (resultado.descalificado) {
      throw new ForbiddenException('Usuario descalificado en esta sección — sin canje');
    }

    if (!resultado.umbralZonaId) {
      throw new ConflictException('El puntaje no alcanzó ninguna zona — sin canje');
    }

    return resultado;
  }

  private async recompensasDeZona(grupoId: string, umbralZonaId: string): Promise<Recompensa[]> {
    return await this.prisma.client.recompensa.findMany({
      where: { grupoId, umbralZonaId, estado: EstadoCatalogo.ACTIVA },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Alta del canje + evento. El `@@unique([usuarioId, seccionId])` es la
   * garantía real de "máximo un canje por usuario por Sección" — el chequeo
   * previo solo mejora el mensaje; la P2002 cubre la carrera.
   */
  private async crearCanje(
    tenant: TenantContext,
    usuario: UsuarioDto,
    seccionId: string,
    recompensa: Recompensa,
    mecanica: MecanicaRecompensa
  ): Promise<CanjeRecompensaDto> {
    let canje: CanjeRecompensa;

    try {
      canje = await this.prisma.client.canjeRecompensa.create({
        data: {
          organizacionId: tenant.organizacionId,
          grupoId: usuario.grupoId,
          usuarioId: usuario.id,
          seccionId,
          recompensaId: recompensa.id,
          mecanica,
        },
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        throw new ConflictException('El usuario ya canjeó una recompensa en esta sección');
      }

      throw error;
    }

    await this.eventos.publicar({
      eventType: 'RecompensaCanjeada',
      routingKey: ROUTING_KEYS.RECOMPENSA_CANJEADA,
      organizacionId: canje.organizacionId,
      grupoId: canje.grupoId,
      payload: {
        canjeId: canje.id,
        usuarioId: canje.usuarioId,
        seccionId: canje.seccionId,
        recompensaId: canje.recompensaId,
        mecanica: canje.mecanica,
        organizacionId: canje.organizacionId,
        grupoId: canje.grupoId,
      },
    });

    return canjeADto(canje);
  }
}

/** Lista vacía "con motivo" (spec) — el shape completo aunque no haya nada. */
function sinElegibles(motivo: MotivoSinElegibles): ElegiblesResponse {
  return { motivo, disponiblesSeleccion: [], disponiblesAzar: [] };
}
