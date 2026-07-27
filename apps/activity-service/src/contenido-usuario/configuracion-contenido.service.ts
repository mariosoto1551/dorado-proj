import { Injectable } from '@nestjs/common';

import {
  ConfiguracionContenidoGrupoDto,
  ModoCreacionContenidoUsuario,
  TenantContext,
} from '@dorado/shared-types';

import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ActualizarConfiguracionContenidoRequest } from './dto/contenido-usuario.dto';

/**
 * Defaults del ítem 10 (spec fase-14-10, Parte A). Se aplican en memoria cuando
 * el grupo no tiene fila: un grupo preexistente queda RESTRICTIVO (comportamiento
 * previo exacto) sin necesidad de migrar datos ni de escribir filas al leer.
 */
const DEFAULTS = {
  modoCreacionUsuario: ModoCreacionContenidoUsuario.RESTRICTIVO,
  maxPuntosActividadUsuario: 5,
  maxActividadesActivasPorUsuario: 5,
} as const;

/**
 * Configuración de creación de contenido por integrantes, por Grupo
 * (fase-14-10, Parte A). Es config mutable (no ledger): lleva `updatedAt` y cada
 * cambio publica auditoría, así que el histórico queda en audit-service.
 */
@Injectable()
export class ConfiguracionContenidoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoGrupoService,
    private readonly eventos: EventosPublisherService
  ) {}

  /** GET — config vigente; defaults si el grupo no tiene fila. */
  async obtener(
    tenant: TenantContext,
    grupoId: string
  ): Promise<ConfiguracionContenidoGrupoDto> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    return await this.resolver(grupoId);
  }

  /**
   * Config vigente sin chequeo de acceso — para los flujos que ya validaron el
   * grupo (creación de actividad propia, aprobación de propuesta).
   */
  async resolver(grupoId: string): Promise<ConfiguracionContenidoGrupoDto> {
    // El filtro automático de tenant agrega organizacionId (y grupoId ∈ grupoIds
    // para TUTOR/USUARIO), así que una fila de otra org nunca se ve desde acá.
    const fila = await this.prisma.client.configuracionContenidoGrupo.findFirst({
      where: { grupoId },
    });

    if (!fila) {
      return { grupoId, ...DEFAULTS };
    }

    return {
      grupoId,
      modoCreacionUsuario:
        fila.modoCreacionUsuario as ConfiguracionContenidoGrupoDto['modoCreacionUsuario'],
      maxPuntosActividadUsuario: fila.maxPuntosActividadUsuario,
      maxActividadesActivasPorUsuario: fila.maxActividadesActivasPorUsuario,
    };
  }

  /** PUT — upsert de la fila (se crea en el primer cambio). */
  async actualizar(
    tenant: TenantContext,
    grupoId: string,
    datos: ActualizarConfiguracionContenidoRequest
  ): Promise<ConfiguracionContenidoGrupoDto> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    const antes = await this.resolver(grupoId);
    const despues: ConfiguracionContenidoGrupoDto = {
      grupoId,
      modoCreacionUsuario: datos.modoCreacionUsuario ?? antes.modoCreacionUsuario,
      maxPuntosActividadUsuario:
        datos.maxPuntosActividadUsuario ?? antes.maxPuntosActividadUsuario,
      maxActividadesActivasPorUsuario:
        datos.maxActividadesActivasPorUsuario ?? antes.maxActividadesActivasPorUsuario,
    };

    await this.prisma.client.configuracionContenidoGrupo.upsert({
      where: { grupoId },
      create: {
        // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
        organizacionId: tenant.organizacionId,
        grupoId,
        modoCreacionUsuario: despues.modoCreacionUsuario,
        maxPuntosActividadUsuario: despues.maxPuntosActividadUsuario,
        maxActividadesActivasPorUsuario: despues.maxActividadesActivasPorUsuario,
      },
      update: {
        modoCreacionUsuario: despues.modoCreacionUsuario,
        maxPuntosActividadUsuario: despues.maxPuntosActividadUsuario,
        maxActividadesActivasPorUsuario: despues.maxActividadesActivasPorUsuario,
      },
    });

    // Cambiar el modo NO toca lo ya creado (spec fase-14-10, decisión 10): las
    // actividades de integrantes que estaban ACTIVA siguen activas, y las
    // propuestas PENDIENTE siguen resolubles. Solo cambia qué se puede crear.
    await this.eventos.publicarAccionAdministrativa({
      organizacionId: tenant.organizacionId,
      grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion: 'CONFIG_CONTENIDO_ACTUALIZADA',
      entidadTipo: 'ConfiguracionContenidoGrupo',
      entidadId: grupoId,
      detalle: { antes, despues },
    });

    return despues;
  }
}
