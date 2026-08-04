import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { EtiquetaCatalogoDto, Rol, TenantContext } from '@dorado/shared-types';

import { EtiquetasService } from './etiquetas.service';
import {
  AsignarEtiquetasRequest,
  CrearEtiquetaRequest,
  EditarEtiquetaRequest,
  ListarEtiquetasQuery,
} from './dto/etiquetas.dto';

/**
 * Etiquetas del catálogo (fase-14-26). **Ningún endpoint es accesible para
 * `USUARIO`**: la etiqueta es organización del Tutor (decisión 3) y no se le
 * muestra al participante por ningún camino — ni acá, ni denormalizada en
 * `RecompensaDto`, donde el service la vacía según el rol.
 */
@Controller('rewards')
@UseGuards(TenantContextGuard, RolesGuard)
export class EtiquetasController {
  constructor(private readonly etiquetas: EtiquetasService) {}

  @Post('grupos/:grupoId/etiquetas')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async crear(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Body() datos: CrearEtiquetaRequest
  ): Promise<EtiquetaCatalogoDto> {
    return await this.etiquetas.crear(tenant, grupoId, datos);
  }

  @Get('grupos/:grupoId/etiquetas')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async listar(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Query() query: ListarEtiquetasQuery
  ): Promise<EtiquetaCatalogoDto[]> {
    return await this.etiquetas.listar(tenant, grupoId, query);
  }

  @Patch('etiquetas/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async editar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() datos: EditarEtiquetaRequest
  ): Promise<EtiquetaCatalogoDto> {
    return await this.etiquetas.editar(tenant, id, datos);
  }

  /** Archiva. No desasigna nada (decisión 7) y se puede revertir. */
  @Delete('etiquetas/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async archivar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ): Promise<EtiquetaCatalogoDto> {
    return await this.etiquetas.archivar(tenant, id);
  }

  @Patch('etiquetas/:id/desarchivar')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async desarchivar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ): Promise<EtiquetaCatalogoDto> {
    return await this.etiquetas.desarchivar(tenant, id);
  }

  /** Reemplazo completo del juego de etiquetas de un ítem (spec B.1). */
  @Put('recompensas/:id/etiquetas')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async asignar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() datos: AsignarEtiquetasRequest
  ): Promise<EtiquetaCatalogoDto[]> {
    return await this.etiquetas.asignar(tenant, id, datos.etiquetaIds);
  }
}
