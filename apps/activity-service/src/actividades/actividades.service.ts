import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { ActividadDto, Rol, TenantContext } from '@dorado/shared-types';

import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { TareaEquipoDebeSerOpcionalException } from '../comun/excepciones';
import { asegurarLimiteActividadesDelGrupo } from '../comun/limite-plan-actividades';
import { validarCamposLimiteTiempo } from '../comun/limite-tiempo';
import { normalizarDiasSemana } from '../comun/programacion';
import { actividadADto } from '../comun/mapeadores';
import {
  esVisiblePara,
  filtroVisibilidadUsuario,
} from '../comun/visibilidad-actividad';
import { BillingClientService } from '../clientes/billing-client.service';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Actividad } from '../generated/prisma/client';
import {
  AlcanceActividad,
  ComportamientoAlCierre,
  EstadoCatalogo,
  TipoPuntaje,
} from '../generated/prisma/enums';
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
    private readonly acceso: AccesoGrupoService,
    private readonly eventos: EventosPublisherService
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

    const equipo = this.resolverAlcance(
      datos.tipoPuntaje,
      datos.alcance,
      datos.bonoJefePuntos
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
        comportamientoAlCierre: this.resolverComportamiento(
          datos.tipoPuntaje,
          datos.comportamientoAlCierre
        ),
        alcance: equipo.alcance,
        bonoJefePuntos: equipo.bonoJefePuntos,
        diasSemana: normalizarDiasSemana(datos.diasSemana),
        siempreVisible: this.resolverSiempreVisible(
          datos.tipoPuntaje,
          equipo.alcance,
          datos.siempreVisible
        ),
        creadaPorTutorId: tenant.principalId,
      },
    });

    // Retrofit fase-09: rastro de auditoría de toda escritura administrativa.
    await this.publicarAuditoria(tenant, 'ACTIVIDAD_CREADA', actividad.id, actividad.grupoId, {
      despues: actividadADto(actividad),
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
    const esUsuario = tenant.rol === Rol.USUARIO;
    const estado = esUsuario ? EstadoCatalogo.ACTIVA : query.estado;

    const actividades = await this.prisma.client.actividad.findMany({
      // El filtro organizacionId (+ grupoId IN grupoIds) lo agrega la tenant
      // extension; grupoId acá acota al grupo pedido dentro de los accesibles.
      where: {
        grupoId,
        ...(estado && { estado }),
        // fase-14-10: el contenido de un integrante es personal — no aparece en
        // el catálogo de sus compañeros (el tutor sí ve todo, para moderar).
        ...(esUsuario && filtroVisibilidadUsuario(tenant.principalId)),
      },
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

    // Estado efectivo del comportamiento al cierre (fase-14-08): si el tipo
    // pasa a OPCIONAL se fuerza ASUME_HECHA (aunque el cliente no lo mande); si
    // sigue OBLIGATORIA, conserva el existente salvo que se pida uno nuevo.
    const tipoPuntajeEfectivo = datos.tipoPuntaje ?? (existente.tipoPuntaje as TipoPuntaje);
    const comportamientoEfectivo = this.resolverComportamiento(
      tipoPuntajeEfectivo,
      datos.comportamientoAlCierre,
      existente.comportamientoAlCierre as ComportamientoAlCierre
    );

    // Alcance efectivo (fase-14-09): mismo criterio que el comportamiento — se
    // revalida contra el tipoPuntaje efectivo, tomando lo pedido o lo existente.
    const equipo = this.resolverAlcance(
      tipoPuntajeEfectivo,
      datos.alcance ?? (existente.alcance as AlcanceActividad),
      datos.bonoJefePuntos ?? existente.bonoJefePuntos
    );

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
        comportamientoAlCierre: comportamientoEfectivo,
        alcance: equipo.alcance,
        bonoJefePuntos: equipo.bonoJefePuntos,
        // fase-14-11: solo se toca si el request lo trae (un PATCH parcial no
        // debe borrar la programación existente).
        ...(datos.diasSemana !== undefined && {
          diasSemana: normalizarDiasSemana(datos.diasSemana),
        }),
        // fase-14-17: se recalcula siempre (igual que alcance y comportamiento):
        // volver OBLIGATORIA o de EQUIPO una opcional fija tiene que apagar el
        // flag, aunque el PATCH no lo mande.
        siempreVisible: this.resolverSiempreVisible(
          tipoPuntajeEfectivo,
          equipo.alcance,
          datos.siempreVisible,
          existente.siempreVisible
        ),
      },
    });

    const actualizada = await this.prisma.client.actividad.findFirst({ where: { id } });

    if (!actualizada) {
      throw new NotFoundException('Actividad no encontrada');
    }

    await this.publicarAuditoria(tenant, 'ACTIVIDAD_EDITADA', id, actualizada.grupoId, {
      antes: actividadADto(existente),
      despues: actividadADto(actualizada),
    });

    return actividadADto(actualizada);
  }

  /** Soft delete (spec): ARCHIVADA. No hay reactivación por endpoint. */
  async archivar(tenant: TenantContext, id: string): Promise<ActividadDto> {
    const existente = await this.buscarAccesible(tenant, id);

    await this.prisma.client.actividad.updateMany({
      where: { id },
      data: { estado: EstadoCatalogo.ARCHIVADA },
    });

    await this.publicarAuditoria(tenant, 'ACTIVIDAD_ARCHIVADA', id, existente.grupoId, {
      antes: actividadADto(existente),
    });

    return actividadADto({ ...existente, estado: EstadoCatalogo.ARCHIVADA });
  }

  /**
   * Comportamiento al cierre efectivo (fase-14-08). `REQUIERE_CONFIRMACION`
   * solo tiene sentido con OBLIGATORIA: para OPCIONAL se fuerza ASUME_HECHA, y
   * si el cliente lo pide explícitamente para una opcional es un 400. Con
   * OBLIGATORIA usa lo pedido; si no se pidió, el fallback (default ASUME_HECHA
   * al crear, o el valor existente al editar).
   */
  private resolverComportamiento(
    tipoPuntaje: TipoPuntaje,
    pedido: ComportamientoAlCierre | undefined,
    fallback: ComportamientoAlCierre = ComportamientoAlCierre.ASUME_HECHA
  ): ComportamientoAlCierre {
    if (tipoPuntaje === TipoPuntaje.OPCIONAL) {
      if (pedido === ComportamientoAlCierre.REQUIERE_CONFIRMACION) {
        throw new BadRequestException(
          'comportamientoAlCierre=REQUIERE_CONFIRMACION solo aplica a actividades OBLIGATORIA'
        );
      }

      return ComportamientoAlCierre.ASUME_HECHA;
    }

    return pedido ?? fallback;
  }

  /**
   * Alcance + bono al jefe efectivos (fase-14-09). Una tarea de EQUIPO debe ser
   * OPCIONAL (decisión 11 de la spec — el castigo colectivo queda fuera de
   * alcance); el bono al jefe solo tiene sentido con alcance EQUIPO, para
   * INDIVIDUAL se fuerza a 0.
   */
  private resolverAlcance(
    tipoPuntaje: TipoPuntaje,
    alcance: AlcanceActividad | undefined,
    bonoJefePuntos: number | undefined
  ): { alcance: AlcanceActividad; bonoJefePuntos: number } {
    const alcanceEfectivo = alcance ?? AlcanceActividad.INDIVIDUAL;

    if (alcanceEfectivo === AlcanceActividad.EQUIPO && tipoPuntaje !== TipoPuntaje.OPCIONAL) {
      throw new TareaEquipoDebeSerOpcionalException();
    }

    if (alcanceEfectivo === AlcanceActividad.INDIVIDUAL) {
      return { alcance: alcanceEfectivo, bonoJefePuntos: 0 };
    }

    return { alcance: alcanceEfectivo, bonoJefePuntos: bonoJefePuntos ?? 0 };
  }

  /**
   * `siempreVisible` efectivo (fase-14-17). El flag solo significa algo en una
   * OPCIONAL INDIVIDUAL —que es lo único que el plan del día esconde—, así que
   * en cualquier otro caso se fuerza a false en vez de rechazar el request:
   * mismo criterio que `bonoJefePuntos` en una actividad INDIVIDUAL.
   */
  private resolverSiempreVisible(
    tipoPuntaje: TipoPuntaje,
    alcance: AlcanceActividad,
    pedido: boolean | undefined,
    fallback = false
  ): boolean {
    if (tipoPuntaje !== TipoPuntaje.OPCIONAL || alcance !== AlcanceActividad.INDIVIDUAL) {
      return false;
    }

    return pedido ?? fallback;
  }

  /** Retrofit fase-09: evento genérico de auditoría (consumido por Audit). */
  private async publicarAuditoria(
    tenant: TenantContext,
    accion: string,
    actividadId: string,
    grupoId: string,
    detalle: Record<string, unknown>
  ): Promise<void> {
    await this.eventos.publicarAccionAdministrativa({
      organizacionId: tenant.organizacionId,
      grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion,
      entidadTipo: 'Actividad',
      entidadId: actividadId,
      detalle,
    });
  }

  /**
   * Fila accesible para el tenant (el filtro automático agrega organizacionId
   * y, para TUTOR/USUARIO, grupoId IN grupoIds) — 404 si no existe o no es
   * suya. Un USUARIO además no ve ARCHIVADA (misma regla que las listas) ni la
   * actividad personal de otro integrante (fase-14-10, Parte C).
   */
  private async buscarAccesible(tenant: TenantContext, id: string): Promise<Actividad> {
    const actividad = await this.prisma.client.actividad.findFirst({ where: { id } });
    const esUsuario = tenant.rol === Rol.USUARIO;

    if (
      !actividad ||
      (esUsuario && actividad.estado !== EstadoCatalogo.ACTIVA) ||
      (esUsuario && !esVisiblePara(actividad, tenant.principalId))
    ) {
      throw new NotFoundException('Actividad no encontrada');
    }

    return actividad;
  }

  /**
   * Chequeo de entitlements previo a crear (spec fase-05). La regla vive en
   * `comun/limite-plan-actividades.ts` porque la comparten los flujos de
   * contenido creado por integrantes (fase-14-10).
   */
  private async asegurarLimiteActividades(
    organizacionId: string,
    grupoId: string
  ): Promise<void> {
    await asegurarLimiteActividadesDelGrupo(
      this.prisma,
      this.billing,
      this.logger,
      organizacionId,
      grupoId
    );
  }
}
