import { Controller, Get, Param, UseGuards } from '@nestjs/common';

import { InternalSecretGuard } from '@dorado/shared-auth';
import { ConfiguracionSesionDto } from '@dorado/shared-types';

import { configuracionADto } from '../comun/mapeadores';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import type { SeccionConSesionesResponse } from '../secciones/dto/secciones.dto';
import { SeccionesService } from '../secciones/secciones.service';

/**
 * Endpoints internos servicio-a-servicio (ADR-00 §4): protegidos por
 * `x-internal-secret`, NUNCA expuestos vía Gateway público. Trabajan con IDs
 * explícitos (el llamador interno es confiable) — sin contexto de tenant.
 *
 * Consumidores previstos (spec fase-06): activity-service usa
 * `secciones/actual` desde Fase 7 para saber en qué Sesión/Sección registrar;
 * scoring-service usa `configuracion` para saber si evaluarUmbralesEn=CADA_SESION.
 */
@Controller('internal/session')
@UseGuards(InternalSecretGuard)
export class InternalController {
  constructor(
    private readonly secciones: SeccionesService,
    private readonly configuracion: ConfiguracionService
  ) {}

  @Get('grupos/:grupoId/secciones/actual')
  async seccionActual(
    @Param('grupoId') grupoId: string
  ): Promise<SeccionConSesionesResponse | null> {
    return await this.secciones.buscarActual(grupoId);
  }

  @Get('grupos/:grupoId/configuracion')
  async configuracionDelGrupo(
    @Param('grupoId') grupoId: string
  ): Promise<ConfiguracionSesionDto> {
    return configuracionADto(await this.configuracion.efectiva(grupoId));
  }
}
