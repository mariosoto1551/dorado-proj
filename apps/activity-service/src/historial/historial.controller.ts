import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
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
  HistorialSesionDto,
  NotaRegistroDto,
  Rol,
  TenantContext,
  TipoRegistroHistorial,
} from '@dorado/shared-types';

import { CrearNotaRegistroRequest, HistorialQuery } from './dto/historial.dto';
import { HistorialService } from './historial.service';
import { NotasService } from './notas.service';

/**
 * Historial de la sesión (spec fase-14-18). Solo TUTOR/ORG_ADMIN: es una
 * herramienta de gestión y nada de acá viaja a la app del integrante.
 */
@Controller('activity')
@UseGuards(TenantContextGuard, RolesGuard)
export class HistorialController {
  constructor(
    private readonly historial: HistorialService,
    private readonly notas: NotasService
  ) {}

  /** Línea de tiempo del grupo en la Sesión vigente. */
  @Get('grupos/:grupoId/historial')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async historialDeLaSesion(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Query() filtros: HistorialQuery
  ): Promise<HistorialSesionDto> {
    return await this.historial.historialDeLaSesion(tenant, grupoId, filtros);
  }

  /** Nota interna sobre un registro. NUNCA la ve el integrante. */
  @Post('historial/:registroTipo/:registroId/notas')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async crearNota(
    @CurrentTenant() tenant: TenantContext,
    @Param('registroTipo') registroTipo: string,
    @Param('registroId') registroId: string,
    @Body() datos: CrearNotaRegistroRequest
  ): Promise<NotaRegistroDto> {
    return await this.notas.crear(tenant, aTipoRegistro(registroTipo), registroId, datos);
  }

  @Delete('notas/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  @HttpCode(204)
  async borrarNota(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') notaId: string
  ): Promise<void> {
    await this.notas.borrar(tenant, notaId);
  }
}

/** El tipo viaja en la ruta, así que se valida a mano (no hay DTO de params). */
function aTipoRegistro(valor: string): TipoRegistroHistorial {
  const tipos = Object.values(TipoRegistroHistorial) as string[];

  if (!tipos.includes(valor)) {
    throw new BadRequestException(`registroTipo debe ser uno de: ${tipos.join(', ')}`);
  }

  return valor as TipoRegistroHistorial;
}
