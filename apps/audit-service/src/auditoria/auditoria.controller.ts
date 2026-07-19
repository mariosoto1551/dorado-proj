import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import { RegistroAuditoriaDto, Rol, TenantContext } from '@dorado/shared-types';

import { AuditoriaService } from './auditoria.service';
import { ListarAuditoriaQuery, ListarAuditoriaResponse } from './dto/auditoria.dto';

/**
 * SOLO GET a propósito (criterio de aceptación 5 de la spec): audit no tiene
 * ningún POST/PATCH/DELETE — toda su escritura llega por eventos. Si alguna
 * vez hace falta escribir acá, la acción se modela como evento en el servicio
 * de origen (nota final de la spec fase-09).
 */
@Controller('audit')
@UseGuards(TenantContextGuard, RolesGuard)
@Roles(Rol.TUTOR, Rol.ORG_ADMIN)
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get('grupos/:grupoId')
  async listarPorGrupo(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Query() query: ListarAuditoriaQuery
  ): Promise<ListarAuditoriaResponse> {
    return await this.auditoria.listarPorGrupo(tenant, grupoId, query);
  }

  @Get('entidades/:entidadTipo/:entidadId')
  async timelineDeEntidad(
    @CurrentTenant() tenant: TenantContext,
    @Param('entidadTipo') entidadTipo: string,
    @Param('entidadId') entidadId: string
  ): Promise<RegistroAuditoriaDto[]> {
    return await this.auditoria.timelineDeEntidad(tenant, entidadTipo, entidadId);
  }
}
