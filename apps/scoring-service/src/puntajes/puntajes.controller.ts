import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import {
  PuntajeEquipoDto,
  PuntajeUsuarioDto,
  Rol,
  TenantContext,
} from '@dorado/shared-types';

import { PuntajesService } from './puntajes.service';

@Controller('scoring')
@UseGuards(TenantContextGuard, RolesGuard)
export class PuntajesController {
  constructor(private readonly puntajes: PuntajesService) {}

  @Get('usuarios/:usuarioId/secciones/:seccionId/puntaje')
  @Roles(Rol.USUARIO, Rol.TUTOR, Rol.ORG_ADMIN)
  async puntajeDeUsuario(
    @CurrentTenant() tenant: TenantContext,
    @Param('usuarioId') usuarioId: string,
    @Param('seccionId') seccionId: string
  ): Promise<PuntajeUsuarioDto> {
    return await this.puntajes.puntajeDeUsuario(tenant, usuarioId, seccionId);
  }

  @Get('grupos/:grupoId/secciones/:seccionId/puntajes')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async puntajesDeGrupo(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Param('seccionId') seccionId: string
  ): Promise<PuntajeUsuarioDto[]> {
    return await this.puntajes.puntajesDeGrupo(tenant, grupoId, seccionId);
  }

  /** Puntaje derivado del equipo (fase-14-09). seccionId opcional. */
  @Get('equipos/:equipoId/puntaje')
  @Roles(Rol.USUARIO, Rol.TUTOR, Rol.ORG_ADMIN)
  async puntajeDeEquipo(
    @CurrentTenant() tenant: TenantContext,
    @Param('equipoId') equipoId: string,
    @Query('seccionId') seccionId?: string
  ): Promise<PuntajeEquipoDto> {
    return await this.puntajes.puntajeDeEquipo(tenant, equipoId, seccionId);
  }
}
