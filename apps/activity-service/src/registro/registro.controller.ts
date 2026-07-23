import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import {
  CompletadaOpcionalDto,
  MiEstadoHoyDto,
  RegistroActividadDto,
  RegistroConductaDto,
  Rol,
  TenantContext,
} from '@dorado/shared-types';

import { RegistroService } from './registro.service';
import {
  CompletarActividadRequest,
  IniciarCronometroResponse,
  RegistrarConductaRequest,
  RegistrarNoHizoRequest,
} from './dto/registro.dto';

/** Endpoints de registro de la fase 7 (Parte A), tabla exacta de la spec. */
@Controller('activity')
@UseGuards(TenantContextGuard, RolesGuard)
export class RegistroController {
  constructor(private readonly registro: RegistroService) {}

  /** Estado de las actividades de hoy del propio USUARIO (fase-14-08). */
  @Get('grupos/:grupoId/mi-estado-hoy')
  @Roles(Rol.USUARIO)
  async miEstadoHoy(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string
  ): Promise<MiEstadoHoyDto> {
    return await this.registro.miEstadoHoy(tenant, grupoId);
  }

  @Post('actividades/:id/iniciar-cronometro')
  @Roles(Rol.USUARIO)
  async iniciarCronometro(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') actividadId: string
  ): Promise<IniciarCronometroResponse> {
    return await this.registro.iniciarCronometro(tenant, actividadId);
  }

  @Post('actividades/:id/completar')
  @Roles(Rol.USUARIO, Rol.TUTOR, Rol.ORG_ADMIN)
  async completar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') actividadId: string,
    @Body() datos: CompletarActividadRequest
  ): Promise<RegistroActividadDto> {
    return await this.registro.completar(tenant, actividadId, datos);
  }

  @Post('actividades/:id/no-hizo')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async registrarNoHizo(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') actividadId: string,
    @Body() datos: RegistrarNoHizoRequest
  ): Promise<RegistroActividadDto> {
    return await this.registro.registrarNoHizo(tenant, actividadId, datos);
  }

  /** Completadas OPCIONALES de un usuario en la sesión abierta (fase-14). */
  @Get('grupos/:grupoId/usuarios/:usuarioId/completadas')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async completadasOpcionales(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Param('usuarioId') usuarioId: string
  ): Promise<CompletadaOpcionalDto[]> {
    return await this.registro.listarCompletadasOpcionales(tenant, grupoId, usuarioId);
  }

  /** Quitar (soft-delete) una completada de actividad de un usuario (fase-14). */
  @Delete('registros-actividad/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async eliminarRegistroActividad(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') registroId: string
  ): Promise<RegistroActividadDto> {
    return await this.registro.eliminarRegistroActividad(tenant, registroId);
  }

  @Post('conductas/:id/registrar')
  @Roles(Rol.USUARIO, Rol.TUTOR, Rol.ORG_ADMIN)
  async registrarConducta(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') conductaId: string,
    @Body() datos: RegistrarConductaRequest
  ): Promise<RegistroConductaDto> {
    return await this.registro.registrarConducta(tenant, conductaId, datos);
  }

  @Delete('registros-conducta/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async eliminarRegistroConducta(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') registroId: string
  ): Promise<RegistroConductaDto> {
    return await this.registro.eliminarRegistroConducta(tenant, registroId);
  }
}
