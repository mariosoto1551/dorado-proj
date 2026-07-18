import { Controller, Get, Param, UseGuards } from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import { PuntajeUsuarioDto, Rol, TenantContext } from '@dorado/shared-types';

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
}
