import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import { Rol, SeccionDto, SesionDto, TenantContext } from '@dorado/shared-types';

import {
  ExtenderSesionRequest,
  ListarSeccionesQuery,
  SeccionConSesionesResponse,
} from './dto/secciones.dto';
import { SeccionesService } from './secciones.service';

@Controller('session')
@UseGuards(TenantContextGuard, RolesGuard)
export class SeccionesController {
  constructor(private readonly secciones: SeccionesService) {}

  @Post('grupos/:grupoId/secciones/iniciar')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async iniciar(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string
  ): Promise<SeccionConSesionesResponse> {
    return await this.secciones.iniciar(tenant, grupoId);
  }

  @Get('grupos/:grupoId/secciones')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN, Rol.USUARIO)
  async listar(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Query() query: ListarSeccionesQuery
  ): Promise<SeccionDto[]> {
    return await this.secciones.listar(tenant, grupoId, query);
  }

  @Get('grupos/:grupoId/secciones/actual')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN, Rol.USUARIO)
  async actual(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string
  ): Promise<SeccionConSesionesResponse | null> {
    return await this.secciones.actual(tenant, grupoId);
  }

  @Get('secciones/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN, Rol.USUARIO)
  async detalle(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ): Promise<SeccionConSesionesResponse> {
    return await this.secciones.detalle(tenant, id);
  }

  @Post('secciones/:id/sesiones/abrir-siguiente')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async abrirSiguiente(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ): Promise<SesionDto> {
    return await this.secciones.abrirSiguiente(tenant, id);
  }

  @Post('secciones/:id/sesiones/:sesionId/forzar-cierre')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async forzarCierre(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Param('sesionId') sesionId: string
  ): Promise<SesionDto> {
    return await this.secciones.forzarCierre(tenant, id, sesionId);
  }

  @Post('sesiones/:id/extender')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async extender(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() datos: ExtenderSesionRequest
  ): Promise<SesionDto> {
    return await this.secciones.extender(tenant, id, datos);
  }

  @Post('secciones/:id/forzar-evaluacion')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async forzarEvaluacion(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ): Promise<SeccionDto> {
    return await this.secciones.forzarEvaluacion(tenant, id);
  }

  @Post('secciones/:id/cerrar')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async cerrar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ): Promise<SeccionDto> {
    return await this.secciones.cerrar(tenant, id);
  }
}
