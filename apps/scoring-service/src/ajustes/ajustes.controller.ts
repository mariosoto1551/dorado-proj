import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';

import { CurrentTenant, Roles, RolesGuard, TenantContextGuard } from '@dorado/shared-auth';
import { EventoPuntosDto, Rol, TenantContext } from '@dorado/shared-types';

import { AjustesService } from './ajustes.service';
import { AjustarPuntosRequest } from './dto/ajustes.dto';

/**
 * El ajuste manual de puntos (fase-14-31 Parte A). Espeja la ruta del ajuste de
 * monedas de rewards (`/rewards/grupos/:g/usuarios/:u/ajuste`) a propósito: son
 * la misma operación sobre los dos números del participante, y el Tutor no
 * tiene por qué aprender dos formas distintas de lo mismo.
 */
@Controller('scoring')
@UseGuards(TenantContextGuard, RolesGuard)
export class AjustesController {
  constructor(private readonly ajustes: AjustesService) {}

  @Post('grupos/:grupoId/usuarios/:usuarioId/ajuste')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async ajustar(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Param('usuarioId') usuarioId: string,
    @Body() datos: AjustarPuntosRequest
  ): Promise<EventoPuntosDto> {
    return await this.ajustes.ajustar(tenant, grupoId, usuarioId, datos);
  }
}
