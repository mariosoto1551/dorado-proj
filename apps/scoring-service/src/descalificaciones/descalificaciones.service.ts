import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ROUTING_KEYS } from '@dorado/shared-events';
import { DescalificacionDto, Rol, TenantContext } from '@dorado/shared-types';

import { IdentityClientService } from '../clientes/identity-client.service';
import { descalificacionADto } from '../comun/mapeadores';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { PrismaService } from '../prisma/prisma.service';
import type { DescalificarUsuarioRequest } from './dto/descalificaciones.dto';

/**
 * Descalificación (spec fase-07 / arquitectura-base 4.5): SIEMPRE manual
 * (nunca automática por cruzar un umbral) y con alcance de UNA Sección — en
 * la siguiente el usuario participa normal sin reincorporación, porque no hay
 * fila para esa nueva seccionId (criterio de aceptación 4).
 */
@Injectable()
export class DescalificacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityClientService,
    private readonly eventos: EventosPublisherService
  ) {}

  /** POST /scoring/secciones/:seccionId/usuarios/:usuarioId/descalificar */
  async descalificar(
    tenant: TenantContext,
    seccionId: string,
    usuarioId: string,
    datos: DescalificarUsuarioRequest
  ): Promise<DescalificacionDto> {
    const usuario = await this.identity.obtenerUsuario(usuarioId);

    if (!usuario || usuario.organizacionId !== tenant.organizacionId) {
      // 404 también para usuarios de otra organización: no revelar existencia.
      throw new NotFoundException('Usuario no encontrado');
    }

    if (tenant.rol === Rol.TUTOR && !tenant.grupoIds.includes(usuario.grupoId)) {
      throw new ForbiddenException('Sin acceso a ese grupo');
    }

    let descalificacion;

    try {
      descalificacion = await this.prisma.client.descalificacionSeccion.create({
        data: {
          organizacionId: tenant.organizacionId,
          grupoId: usuario.grupoId,
          usuarioId,
          seccionId,
          motivo: datos.motivo,
          registradaPorTutorId: tenant.principalId,
        },
      });
    } catch (error) {
      // @@unique([usuarioId, seccionId]): única por usuario+sección (spec).
      if ((error as { code?: string })?.code === 'P2002') {
        throw new ConflictException('El usuario ya está descalificado en esta sección');
      }

      throw error;
    }

    await this.eventos.publicar({
      eventType: 'UsuarioDescalificado',
      routingKey: ROUTING_KEYS.USUARIO_DESCALIFICADO,
      organizacionId: tenant.organizacionId,
      grupoId: usuario.grupoId,
      payload: {
        usuarioId,
        seccionId,
        organizacionId: tenant.organizacionId,
        grupoId: usuario.grupoId,
        motivo: datos.motivo,
        registradaPorTutorId: tenant.principalId,
      },
    });

    return descalificacionADto(descalificacion);
  }

  /** GET /scoring/secciones/:seccionId/descalificaciones */
  async listar(tenant: TenantContext, seccionId: string): Promise<DescalificacionDto[]> {
    // El filtro automático de tenant acota por organizacionId (+ grupoIds
    // para TUTOR); no hay grupoId en la URL que validar.
    const descalificaciones = await this.prisma.client.descalificacionSeccion.findMany({
      where: { seccionId },
      orderBy: { createdAt: 'asc' },
    });

    return descalificaciones.map(descalificacionADto);
  }
}
