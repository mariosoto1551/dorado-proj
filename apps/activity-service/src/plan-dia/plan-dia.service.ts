import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PlanDelDiaDto, TenantContext } from '@dorado/shared-types';

import { IdentityClientService } from '../clientes/identity-client.service';
import { SessionClientService } from '../clientes/session-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { esElegibleParaElPlan } from '../comun/elegibilidad-plan';
import {
  ActividadNoElegibleParaElPlanException,
  ActividadNoEsDeTuRolException,
  ActividadYaEmpezadaException,
  excepcionSiNoDisponible,
  PlanDelDiaInactivoException,
} from '../comun/excepciones';
import { tieneProgramacion } from '../comun/programacion';
import { ContextoParticipanteService } from '../comun/contexto-participante.service';
import { esDestinatario } from '../comun/destinatario';
import { resolverSesionAbierta } from '../comun/sesion-abierta';
import { esVisiblePara } from '../comun/visibilidad-actividad';
import { ConfiguracionContenidoService } from '../contenido-usuario/configuracion-contenido.service';
import type { Actividad } from '../generated/prisma/client';
import { EstadoCatalogo, TipoRegistroActividad } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { AgregarAlPlanDelDiaRequest } from './dto/plan-dia.dto';

/**
 * El plan del día del integrante (spec fase-14-17): qué OPCIONALES eligió hacer
 * hoy. Es estado **operativo**, no ledger — no vale puntos, no publica eventos
 * y sus filas se borran físicamente al sacarlas del plan (misma naturaleza que
 * `CronometroActivo`, spec decisión 8).
 */
@Injectable()
export class PlanDiaService {
  private readonly logger = new Logger(PlanDiaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly session: SessionClientService,
    private readonly identity: IdentityClientService,
    private readonly config: ConfiguracionContenidoService,
    private readonly acceso: AccesoGrupoService,
    private readonly contexto: ContextoParticipanteService
  ) {}

  /** POST /activity/grupos/:grupoId/plan-dia — USUARIO (self). Idempotente. */
  async agregar(
    tenant: TenantContext,
    grupoId: string,
    datos: AgregarAlPlanDelDiaRequest
  ): Promise<PlanDelDiaDto> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    const configuracion = await this.config.resolver(grupoId);

    if (!configuracion.planDelDiaActivo) {
      throw new PlanDelDiaInactivoException();
    }

    const usuarioId = tenant.principalId;
    const actividad = await this.buscarActividadElegible(datos.actividadId, grupoId, usuarioId);
    const sesion = resolverSesionAbierta(await this.session.obtenerSeccionActual(grupoId));

    // fase-14-11: no se mete al plan algo que hoy no se puede registrar — es el
    // mismo criterio que la hoja «Elegir», que no las ofrece (decisión 11).
    await this.asegurarDisponibleHoy(actividad, grupoId, sesion.fechaInicioSesion);

    await this.prisma.client.seleccionPlanDia.upsert({
      where: {
        usuarioId_actividadId_sesionId: {
          usuarioId,
          actividadId: actividad.id,
          sesionId: sesion.sesionId,
        },
      },
      // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
      create: {
        organizacionId: tenant.organizacionId,
        grupoId: actividad.grupoId,
        usuarioId,
        actividadId: actividad.id,
        sesionId: sesion.sesionId,
      },
      // Volver a elegir algo ya elegido no es un error ni cambia nada.
      update: {},
    });

    return await this.planDe(usuarioId, sesion.sesionId);
  }

  /**
   * DELETE /activity/grupos/:grupoId/plan-dia/:actividadId — USUARIO (self).
   *
   * Sin chequeo de `planDelDiaActivo` a propósito: si el Tutor apagó el modo, la
   * fila ya no se lee y sacarla no puede hacer daño. Rechazar el DELETE en ese
   * caso solo dejaría al integrante con un botón que falla.
   */
  async quitar(
    tenant: TenantContext,
    grupoId: string,
    actividadId: string
  ): Promise<PlanDelDiaDto> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    const usuarioId = tenant.principalId;
    const sesion = resolverSesionAbierta(await this.session.obtenerSeccionActual(grupoId));

    await this.asegurarNoEmpezada(actividadId, usuarioId, sesion.sesionId);

    // deleteMany (no delete): pasa por el filtro automático de tenant, y no
    // falla si no había fila — quitar algo que no estaba es un no-op.
    await this.prisma.client.seleccionPlanDia.deleteMany({
      where: { usuarioId, actividadId, sesionId: sesion.sesionId },
    });

    return await this.planDe(usuarioId, sesion.sesionId);
  }

  /** ¿El Grupo tiene el plan del día encendido? Lo consume `mi-estado-hoy`. */
  async estaActivo(grupoId: string): Promise<boolean> {
    return (await this.config.resolver(grupoId)).planDelDiaActivo;
  }

  /** IDs elegidos para la Sesión — lo consume `mi-estado-hoy` (decisión 12). */
  async idsElegidos(usuarioId: string, sesionId: string): Promise<Set<string>> {
    const filas = await this.prisma.client.seleccionPlanDia.findMany({
      where: { usuarioId, sesionId },
      select: { actividadId: true },
    });

    return new Set(filas.map((fila) => fila.actividadId));
  }

  /**
   * Alta automática al registrar (spec decisión 9): una actividad que se
   * completa NO puede desaparecer de la lista, y el Tutor que completa en
   * nombre del integrante no sabe nada de su plan.
   *
   * Nunca lanza: que falle el alta del plan no puede tumbar un registro que ya
   * vale puntos. Se llama DESPUÉS del commit del registro, por eso mismo.
   */
  async asegurarEnPlan(
    organizacionId: string,
    actividad: Actividad,
    usuarioId: string,
    sesionId: string
  ): Promise<void> {
    if (!esElegibleParaElPlan(actividad)) {
      return;
    }

    try {
      const configuracion = await this.config.resolver(actividad.grupoId);

      if (!configuracion.planDelDiaActivo) {
        return;
      }

      await this.prisma.client.seleccionPlanDia.upsert({
        where: {
          usuarioId_actividadId_sesionId: { usuarioId, actividadId: actividad.id, sesionId },
        },
        create: {
          organizacionId,
          grupoId: actividad.grupoId,
          usuarioId,
          actividadId: actividad.id,
          sesionId,
        },
        update: {},
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo agregar la actividad ${actividad.id} al plan del día de ${usuarioId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /** El plan completo ya actualizado, para que la pantalla no re-consulte. */
  private async planDe(usuarioId: string, sesionId: string): Promise<PlanDelDiaDto> {
    const elegidos = await this.idsElegidos(usuarioId, sesionId);

    return { sesionId, actividadIds: [...elegidos] };
  }

  /**
   * La actividad, si el integrante la puede meter en su plan: activa, de su
   * grupo, visible para él (fase-14-10) y de la familia que el plan esconde.
   */
  private async buscarActividadElegible(
    actividadId: string,
    grupoId: string,
    usuarioId: string
  ): Promise<Actividad> {
    const actividad = await this.prisma.client.actividad.findFirst({
      where: { id: actividadId, grupoId, estado: EstadoCatalogo.ACTIVA },
    });

    if (!actividad || !esVisiblePara(actividad, usuarioId)) {
      throw new NotFoundException('Actividad no encontrada');
    }

    if (!esElegibleParaElPlan(actividad)) {
      throw new ActividadNoElegibleParaElPlanException();
    }

    // fase-14-19 + fase-14-24: sin esto la hoja «＋ Elegir» sería una puerta
    // lateral a lo que la lista oculta. Solo cuesta una llamada si la actividad
    // tiene alguna restricción de destinatario.
    if (actividad.rolesPermitidos.length > 0 || actividad.usuariosPermitidos.length > 0) {
      const contexto = await this.contexto.resolver(grupoId, usuarioId, [actividad]);

      if (!esDestinatario(actividad, contexto)) {
        throw new ActividadNoEsDeTuRolException();
      }
    }

    return actividad;
  }

  /** fase-14-11: el día lo decide el servidor, que conoce la timezone del Grupo. */
  private async asegurarDisponibleHoy(
    actividad: Actividad,
    grupoId: string,
    fechaInicioSesion: Date
  ): Promise<void> {
    if (!tieneProgramacion(actividad)) {
      return;
    }

    const timezone = (await this.identity.obtenerGrupo(grupoId))?.timezone;

    // Sin timezone (identity no respondió) se deja pasar: el `completar` valida
    // igual, y bloquear una elección por una falla ajena es peor.
    if (!timezone) {
      return;
    }

    // fase-14-24: días de la semana Y vigencia por fechas.
    const noDisponible = excepcionSiNoDisponible(actividad, fechaInicioSesion, timezone);

    if (noDisponible) {
      throw noDisponible;
    }
  }

  /**
   * "Empezada" (spec decisión 7): tiene alguna COMPLETADA de esta Sesión —viva
   * o quitada por el tutor, el intento se gastó igual (ítem 12)— o un
   * cronómetro corriendo. Sacarla del plan entonces escondería trabajo real.
   */
  private async asegurarNoEmpezada(
    actividadId: string,
    usuarioId: string,
    sesionId: string
  ): Promise<void> {
    const [completadas, cronometro] = await Promise.all([
      this.prisma.client.registroActividad.count({
        where: {
          usuarioId,
          actividadId,
          sesionId,
          tipo: TipoRegistroActividad.COMPLETADA,
        },
      }),
      // findUnique por la clave compuesta, igual que `asegurarCronometroVigente`
      // — CronometroActivo no es tenant-scoped y la clave ya trae el usuarioId
      // del JWT (ver el comentario de MODELOS_TENANT en prisma.service.ts).
      this.prisma.client.cronometroActivo.findUnique({
        where: { usuarioId_actividadId_sesionId: { usuarioId, actividadId, sesionId } },
      }),
    ]);

    if (completadas > 0 || cronometro) {
      throw new ActividadYaEmpezadaException();
    }
  }
}
