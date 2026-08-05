import { Injectable, Logger } from '@nestjs/common';

import {
  ConfiguracionRecompensasGrupoDto,
  ModoRecompensas,
  TenantContext,
} from '@dorado/shared-types';

import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CambiarModoRecompensasRequest } from './dto/configuracion.dto';

/**
 * Valores de un Grupo que nunca configuró nada. Es LA garantía de retro-
 * compatibilidad del ítem (decisión 1): sin fila, el modo es DIRECTO y el
 * grupo se comporta exactamente como en Fase 8.
 */
const POR_DEFECTO = {
  modo: ModoRecompensas.DIRECTO,
  modoPendiente: null,
  nombreMoneda: 'monedas',
  iconoMoneda: '🪙',
} as const;

/**
 * Configuración de recompensas por Grupo (spec fase-14-22, Parte B.3 y D).
 *
 * `ConfiguracionRecompensasGrupo` NO está en MODELOS_TENANT a propósito (mismo
 * criterio que `ConfiguracionScoringGrupo` en scoring): el acceso se valida
 * explícito con `AccesoGrupoService` y la clave es `grupoId`, así que no hay
 * camino de fuga entre organizaciones. De paso, eso permite que el consumidor
 * de `SeccionAbierta` —que corre sin contexto de tenant— lea y escriba igual.
 */
@Injectable()
export class ConfiguracionService {
  private readonly logger = new Logger(ConfiguracionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoGrupoService,
    private readonly eventos: EventosPublisherService
  ) {}

  async obtener(
    tenant: TenantContext,
    grupoId: string
  ): Promise<ConfiguracionRecompensasGrupoDto> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    return await this.leer(grupoId);
  }

  async cambiar(
    tenant: TenantContext,
    grupoId: string,
    datos: CambiarModoRecompensasRequest
  ): Promise<ConfiguracionRecompensasGrupoDto> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    const antes = await this.leer(grupoId);
    const cambios = this.resolverCambioDeModo(antes.modo, datos);

    const config = await this.prisma.client.configuracionRecompensasGrupo.upsert({
      where: { grupoId },
      create: {
        // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
        organizacionId: tenant.organizacionId,
        grupoId,
        ...cambios,
        ...(datos.nombreMoneda !== undefined && { nombreMoneda: datos.nombreMoneda }),
        ...(datos.iconoMoneda !== undefined && { iconoMoneda: datos.iconoMoneda }),
      },
      update: {
        ...cambios,
        ...(datos.nombreMoneda !== undefined && { nombreMoneda: datos.nombreMoneda }),
        ...(datos.iconoMoneda !== undefined && { iconoMoneda: datos.iconoMoneda }),
      },
    });

    const despues = this.aDto(config);

    // Retrofit fase-09: rastro de auditoría de toda escritura administrativa.
    await this.eventos.publicarAccionAdministrativa({
      organizacionId: tenant.organizacionId,
      grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion: 'MODO_RECOMPENSAS_CAMBIADO',
      entidadTipo: 'ConfiguracionRecompensasGrupo',
      entidadId: config.id,
      detalle: { antes, despues, aplicarAhora: datos.aplicarAhora === true },
    });

    return despues;
  }

  /**
   * Modo vigente de un Grupo, sin contexto de tenant. Lo usan los consumidores
   * (el cierre económico del tramo 3) para decidir si hacen algo o no.
   */
  async obtenerModo(grupoId: string): Promise<ModoRecompensas> {
    const config = await this.prisma.client.configuracionRecompensasGrupo.findUnique({
      where: { grupoId },
    });

    return (config?.modo as ModoRecompensas) ?? POR_DEFECTO.modo;
  }

  /**
   * Aplica el cambio de modo diferido al abrir una Sección (decisión 9).
   * Devuelve el modo que quedó vigente, o `null` si no había nada pendiente.
   */
  async aplicarModoPendiente(grupoId: string): Promise<ModoRecompensas | null> {
    const config = await this.prisma.client.configuracionRecompensasGrupo.findUnique({
      where: { grupoId },
    });

    if (!config?.modoPendiente) {
      return null;
    }

    const modo = config.modoPendiente;

    await this.prisma.client.configuracionRecompensasGrupo.update({
      where: { grupoId },
      data: { modo, modoPendiente: null },
    });

    this.logger.log(
      `Modo de recompensas del grupo ${grupoId} aplicado: ${modo} (estaba pendiente)`
    );

    return modo as ModoRecompensas;
  }

  /**
   * decisión 9. Pedir el modo que ya está vigente **cancela** un pendiente:
   * es la forma natural de arrepentirse de un cambio diferido, sin endpoint
   * aparte.
   */
  private resolverCambioDeModo(
    modoVigente: ModoRecompensas,
    datos: CambiarModoRecompensasRequest
  ): { modo?: ModoRecompensas; modoPendiente: ModoRecompensas | null } {
    if (datos.aplicarAhora === true) {
      return { modo: datos.modo, modoPendiente: null };
    }

    if (datos.modo === modoVigente) {
      return { modoPendiente: null };
    }

    return { modoPendiente: datos.modo };
  }

  /**
   * Config vigente SIN contexto de tenant, con los defaults aplicados. Pública
   * desde el fase-14-30: la usa también el endpoint interno, por el mismo
   * criterio que `obtenerModo` — quien la llama ya validó el grupo, o es un
   * llamador interno confiable.
   */
  async leer(grupoId: string): Promise<ConfiguracionRecompensasGrupoDto> {
    const config = await this.prisma.client.configuracionRecompensasGrupo.findUnique({
      where: { grupoId },
    });

    if (!config) {
      return { grupoId, ...POR_DEFECTO };
    }

    return this.aDto(config);
  }

  private aDto(config: {
    grupoId: string;
    modo: string;
    modoPendiente: string | null;
    nombreMoneda: string;
    iconoMoneda: string;
  }): ConfiguracionRecompensasGrupoDto {
    return {
      grupoId: config.grupoId,
      modo: config.modo as ModoRecompensas,
      modoPendiente: (config.modoPendiente as ModoRecompensas | null) ?? null,
      nombreMoneda: config.nombreMoneda,
      iconoMoneda: config.iconoMoneda,
    };
  }
}
