import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import {
  ActividadDto,
  ConfiguracionContenidoGrupoDto,
  CrearMiActividadResponse,
  MisActividadesDto,
  PropuestaActividadDto,
  Rol,
  TenantContext,
} from '@dorado/shared-types';

import { ConfiguracionContenidoService } from './configuracion-contenido.service';
import {
  ActualizarConfiguracionContenidoRequest,
  CrearMiActividadRequest,
  ListarPropuestasQuery,
  RechazarPropuestaRequest,
} from './dto/contenido-usuario.dto';
import { MisActividadesService } from './mis-actividades.service';
import { PropuestasService } from './propuestas.service';

/**
 * Contenido creado por los integrantes (fase-14-10): configuración por Grupo,
 * creación por el integrante y moderación del Tutor.
 */
@Controller('activity')
@UseGuards(TenantContextGuard, RolesGuard)
export class ContenidoUsuarioController {
  constructor(
    private readonly configuracion: ConfiguracionContenidoService,
    private readonly misActividades: MisActividadesService,
    private readonly propuestas: PropuestasService
  ) {}

  /** El USUARIO también la lee: su pantalla no hardcodea modo ni topes. */
  @Get('grupos/:grupoId/configuracion-contenido')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN, Rol.USUARIO)
  async obtenerConfiguracion(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string
  ): Promise<ConfiguracionContenidoGrupoDto> {
    return await this.configuracion.obtener(tenant, grupoId);
  }

  @Put('grupos/:grupoId/configuracion-contenido')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async actualizarConfiguracion(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Body() datos: ActualizarConfiguracionContenidoRequest
  ): Promise<ConfiguracionContenidoGrupoDto> {
    return await this.configuracion.actualizar(tenant, grupoId, datos);
  }

  @Post('grupos/:grupoId/mis-actividades')
  @Roles(Rol.USUARIO)
  async crearMiActividad(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Body() datos: CrearMiActividadRequest
  ): Promise<CrearMiActividadResponse> {
    return await this.misActividades.crear(tenant, grupoId, datos);
  }

  @Get('grupos/:grupoId/mis-actividades')
  @Roles(Rol.USUARIO)
  async listarMisActividades(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string
  ): Promise<MisActividadesDto> {
    return await this.misActividades.listar(tenant, grupoId);
  }

  /** Archivar la propia (libera cupo). El autor no puede EDITARLA (decisión 11). */
  @Delete('mis-actividades/:actividadId')
  @Roles(Rol.USUARIO)
  async archivarMiActividad(
    @CurrentTenant() tenant: TenantContext,
    @Param('actividadId') actividadId: string
  ): Promise<ActividadDto> {
    return await this.misActividades.archivar(tenant, actividadId);
  }

  @Get('grupos/:grupoId/propuestas')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async listarPropuestas(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Query() query: ListarPropuestasQuery
  ): Promise<PropuestaActividadDto[]> {
    return await this.propuestas.listar(tenant, grupoId, query);
  }

  @Post('propuestas/:id/aprobar')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async aprobarPropuesta(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') propuestaId: string
  ): Promise<PropuestaActividadDto> {
    return await this.propuestas.aprobar(tenant, propuestaId);
  }

  @Post('propuestas/:id/rechazar')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async rechazarPropuesta(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') propuestaId: string,
    @Body() datos: RechazarPropuestaRequest
  ): Promise<PropuestaActividadDto> {
    return await this.propuestas.rechazar(tenant, propuestaId, datos);
  }
}
