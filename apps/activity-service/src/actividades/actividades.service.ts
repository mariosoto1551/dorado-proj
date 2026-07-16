import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { ActividadDto, Rol, TenantContext } from '@dorado/shared-types';

import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { LimitePlanAlcanzadoException } from '../comun/excepciones';
import { validarCamposLimiteTiempo } from '../comun/limite-tiempo';
import { actividadADto } from '../comun/mapeadores';
import { BillingClientService } from '../clientes/billing-client.service';
import type { Actividad } from '../generated/prisma/client';
import { EstadoCatalogo } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CrearActividadRequest,
  EditarActividadRequest,
  ListarActividadesQuery,
} from './dto/actividades.dto';

@Injectable()
export class ActividadesService {
  private readonly logger = new Logger(ActividadesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingClientService,
    private readonly acceso: AccesoGrupoService
  ) {}

  async crear(
    tenant: TenantContext,
    grupoId: string,
    datos: CrearActividadRequest
  ): Promise<ActividadDto> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    // Campos condicionales ANTES del límite de plan: un request malformado
    // falla rápido (400) sin gastar la llamada REST a billing.
    const campos = validarCamposLimiteTiempo(
      datos.tipoLimiteTiempo,
      datos.deadlineHora ?? null,
      datos.duracionCronometroMinutos ?? null
    );

    await this.asegurarLimiteActividades(tenant.organizacionId, grupoId);

    const actividad = await this.prisma.client.actividad.create({
      data: {
        // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
        organizacionId: tenant.organizacionId,
        grupoId,
        nombre: datos.nombre,
        descripcion: datos.descripcion ?? null,
        tipoPuntaje: datos.tipoPuntaje,
        valorPuntos: datos.valorPuntos,
        tipoLimiteTiempo: datos.tipoLimiteTiempo,
        deadlineHora: campos.deadlineHora,
        duracionCronometroMinutos: campos.duracionCronometroMinutos,
        ...(datos.repeticionesMaximasSesion !== undefined && {
          repeticionesMaximasSesion: datos.repeticionesMaximasSesion,
        }),
        repeticionesMaximasSeccion: datos.repeticionesMaximasSeccion ?? null,
        creadaPorTutorId: tenant.principalId,
      },
    });

    return actividadADto(actividad);
  }

  async listar(
    tenant: TenantContext,
    grupoId: string,
    query: ListarActividadesQuery
  ): Promise<ActividadDto[]> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    // USUARIO solo ve ACTIVA y su query param se ignora (spec fase-05).
    const estado =
      tenant.rol === Rol.USUARIO ? EstadoCatalogo.ACTIVA : query.estado;

    const actividades = await this.prisma.client.actividad.findMany({
      // El filtro organizacionId (+ grupoId IN grupoIds) lo agrega la tenant
      // extension; grupoId acá acota al grupo pedido dentro de los accesibles.
      where: { grupoId, ...(estado && { estado }) },
      orderBy: { createdAt: 'asc' },
    });

    return actividades.map(actividadADto);
  }

  async detalle(tenant: TenantContext, id: string): Promise<ActividadDto> {
    const actividad = await this.buscarAccesible(tenant, id);

    return actividadADto(actividad);
  }

  async editar(
    tenant: TenantContext,
    id: string,
    datos: EditarActividadRequest
  ): Promise<ActividadDto> {
    const existente = await this.buscarAccesible(tenant, id);

    // Estado efectivo post-PATCH de los campos de límite de tiempo. Si el tipo
    // CAMBIA, los condicionales no provistos se resetean a null (no se
    // arrastra la config del tipo anterior); si no cambia, conservan su valor.
    const tipoEfectivo = datos.tipoLimiteTiempo ?? existente.tipoLimiteTiempo;
    const cambioTipo =
      datos.tipoLimiteTiempo !== undefined &&
      datos.tipoLimiteTiempo !== existente.tipoLimiteTiempo;
    const deadlineEfectiva =
      datos.deadlineHora !== undefined
        ? datos.deadlineHora
        : cambioTipo
          ? null
          : existente.deadlineHora;
    const duracionEfectiva =
      datos.duracionCronometroMinutos !== undefined
        ? datos.duracionCronometroMinutos
        : cambioTipo
          ? null
          : existente.duracionCronometroMinutos;

    const campos = validarCamposLimiteTiempo(tipoEfectivo, deadlineEfectiva, duracionEfectiva);

    // updateMany (no update): pasa por el filtro automático de tenant.
    await this.prisma.client.actividad.updateMany({
      where: { id },
      data: {
        ...(datos.nombre !== undefined && { nombre: datos.nombre }),
        ...(datos.descripcion !== undefined && { descripcion: datos.descripcion }),
        ...(datos.tipoPuntaje !== undefined && { tipoPuntaje: datos.tipoPuntaje }),
        ...(datos.valorPuntos !== undefined && { valorPuntos: datos.valorPuntos }),
        tipoLimiteTiempo: tipoEfectivo,
        deadlineHora: campos.deadlineHora,
        duracionCronometroMinutos: campos.duracionCronometroMinutos,
        ...(datos.repeticionesMaximasSesion !== undefined && {
          repeticionesMaximasSesion: datos.repeticionesMaximasSesion,
        }),
        ...(datos.repeticionesMaximasSeccion !== undefined && {
          repeticionesMaximasSeccion: datos.repeticionesMaximasSeccion,
        }),
      },
    });

    const actualizada = await this.prisma.client.actividad.findFirst({ where: { id } });

    if (!actualizada) {
      throw new NotFoundException('Actividad no encontrada');
    }

    return actividadADto(actualizada);
  }

  /** Soft delete (spec): ARCHIVADA. No hay reactivación por endpoint. */
  async archivar(tenant: TenantContext, id: string): Promise<ActividadDto> {
    const existente = await this.buscarAccesible(tenant, id);

    await this.prisma.client.actividad.updateMany({
      where: { id },
      data: { estado: EstadoCatalogo.ARCHIVADA },
    });

    return actividadADto({ ...existente, estado: EstadoCatalogo.ARCHIVADA });
  }

  /**
   * Fila accesible para el tenant (el filtro automático agrega organizacionId
   * y, para TUTOR/USUARIO, grupoId IN grupoIds) — 404 si no existe o no es
   * suya. Un USUARIO además no ve ARCHIVADA (misma regla que las listas).
   */
  private async buscarAccesible(tenant: TenantContext, id: string): Promise<Actividad> {
    const actividad = await this.prisma.client.actividad.findFirst({ where: { id } });

    if (
      !actividad ||
      (tenant.rol === Rol.USUARIO && actividad.estado !== EstadoCatalogo.ACTIVA)
    ) {
      throw new NotFoundException('Actividad no encontrada');
    }

    return actividad;
  }

  /**
   * Chequeo de entitlements previo a crear (spec fase-05): cuenta las
   * actividades ACTIVA del grupo contra `limites.actividadesPorGrupo`. Si
   * billing no está disponible se omite con warning (fail-open, misma
   * decisión que fase-04 — los límites solo viven en billing).
   */
  private async asegurarLimiteActividades(
    organizacionId: string,
    grupoId: string
  ): Promise<void> {
    const entitlements = await this.billing.resolveEntitlements(organizacionId);

    if (!entitlements) {
      this.logger.warn(
        `Billing no disponible — se omite el chequeo de límite de actividades para ${organizacionId}`
      );

      return;
    }

    const limite = entitlements.limites.actividadesPorGrupo;

    if (limite === null) {
      return;
    }

    const actuales = await this.prisma.client.actividad.count({
      where: { grupoId, estado: EstadoCatalogo.ACTIVA },
    });

    if (actuales >= limite) {
      throw new LimitePlanAlcanzadoException();
    }
  }
}
