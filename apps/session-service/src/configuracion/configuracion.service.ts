import { BadRequestException, Injectable } from '@nestjs/common';

import { ConfiguracionSesionDto, TenantContext } from '@dorado/shared-types';

import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { esCronValido } from '../comun/cron';
import { ConfiguracionEfectiva, configuracionADto } from '../comun/mapeadores';
import { EvaluarUmbralesEn, ModoSesion } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { GuardarConfiguracionRequest } from './dto/configuracion.dto';

@Injectable()
export class ConfiguracionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoGrupoService
  ) {}

  async guardar(
    tenant: TenantContext,
    grupoId: string,
    datos: GuardarConfiguracionRequest
  ): Promise<ConfiguracionSesionDto> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    const cronSesion = datos.cronSesion ?? null;
    const cronCierreSeccion = datos.cronCierreSeccion ?? null;

    this.validarCrons(datos.modo, cronSesion, cronCierreSeccion);

    // PUT = reemplazo completo: campos no enviados vuelven al default de
    // modelo (spec fase-06). organizacionId SIEMPRE del JWT (regla 3).
    const valores = {
      organizacionId: tenant.organizacionId,
      modo: datos.modo,
      cronAperturaSesion: cronSesion,
      sesionesPorSeccion: datos.sesionesPorSeccion ?? 1,
      cronAperturaSeccion: cronCierreSeccion,
      evaluarUmbralesEn: datos.evaluarUmbralesEn ?? EvaluarUmbralesEn.SOLO_AL_CIERRE_SECCION,
    };

    // upsert no pasa por el filtro automático de tenant (opera sobre índice
    // único) — el acceso de escritura ya quedó validado arriba.
    const config = await this.prisma.client.configuracionSesion.upsert({
      where: { grupoId },
      create: { grupoId, ...valores },
      update: valores,
    });

    return configuracionADto(config);
  }

  async obtener(tenant: TenantContext, grupoId: string): Promise<ConfiguracionSesionDto> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    // findFirst pasa por el filtro automático (org + grupos del JWT).
    const config = await this.prisma.client.configuracionSesion.findFirst({
      where: { grupoId },
    });

    // Sin fila todavía: se responden los defaults de modelo (modo MANUAL,
    // 1 sesión por sección) — un Grupo recién creado ya puede operar en modo
    // manual sin paso previo de configuración. Decisión documentada en
    // docs/progreso/fase-06 (la spec no define el caso "sin configurar").
    return configuracionADto(config ?? defaultsDeConfiguracion(grupoId, tenant.organizacionId));
  }

  /**
   * Configuración vigente del grupo (fila guardada o defaults de modelo), sin
   * contexto de tenant — para la máquina de estados y las rutas /internal/*.
   * El aislamiento lo garantiza el llamador (acceso ya validado, o secreto
   * interno).
   */
  async efectiva(grupoId: string): Promise<ConfiguracionEfectiva> {
    const config = await this.prisma.client.configuracionSesion.findFirst({
      where: { grupoId },
    });

    return config ?? defaultsDeConfiguracion(grupoId, '');
  }

  private validarCrons(
    modo: ModoSesion,
    cronSesion: string | null,
    cronCierreSeccion: string | null
  ): void {
    const errores: string[] = [];

    if (cronSesion !== null && !esCronValido(cronSesion)) {
      errores.push('cronSesion no es una expresión cron válida de 5 campos');
    }

    if (cronCierreSeccion !== null && !esCronValido(cronCierreSeccion)) {
      errores.push('cronCierreSeccion no es una expresión cron válida de 5 campos');
    }

    if (modo === ModoSesion.AUTOMATICO) {
      if (!cronSesion) {
        errores.push('cronSesion es obligatorio cuando modo=AUTOMATICO');
      }

      if (!cronCierreSeccion) {
        errores.push('cronCierreSeccion es obligatorio cuando modo=AUTOMATICO');
      }
    }

    if (errores.length > 0) {
      throw new BadRequestException(errores.join('; '));
    }
  }
}

/** Defaults de modelo para un Grupo sin fila de configuración todavía. */
export function defaultsDeConfiguracion(
  grupoId: string,
  organizacionId: string
): ConfiguracionEfectiva {
  return {
    grupoId,
    organizacionId,
    modo: ModoSesion.MANUAL,
    cronAperturaSesion: null,
    sesionesPorSeccion: 1,
    cronAperturaSeccion: null,
    evaluarUmbralesEn: EvaluarUmbralesEn.SOLO_AL_CIERRE_SECCION,
  };
}
