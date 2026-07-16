import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';

import {
  InvitacionCanjeadaPayload,
  InvitacionGeneradaPayload,
  ROUTING_KEYS,
  UsuarioUnidoPayload,
} from '@dorado/shared-events';
import { DomainException } from '@dorado/shared-auth';
import { InvitacionDto, TenantContext, TipoInvitado } from '@dorado/shared-types';

import { AuthService, SesionEmitida } from '../auth/auth.service';
import { BillingClientService } from '../billing/billing-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  InvitacionNoCanjeableException,
  InvitacionNoEncontradaException,
  InvitacionNoRevocableException,
  LimitePlanAlcanzadoException,
} from '../comun/excepciones';
import { invitacionADto } from '../comun/mapeadores';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Invitacion } from '../generated/prisma/client';
import {
  EstadoCuenta,
  EstadoInvitacion,
  RolTutor,
  TipoInvitado as TipoInvitadoPrisma,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { generarCodigoInvitacion } from './codigo.util';
import type {
  CanjearInvitacionRequest,
  PreviewInvitacionResponse,
} from './dto/invitaciones.dto';

/** expiraEn = now + 72h (spec fase-02). */
const HORAS_EXPIRACION = 72;

/** Reintentos ante la improbable colisión del código único (32^8 combinaciones). */
const MAX_INTENTOS_CODIGO = 5;

// Los Usuario creados por canje arrancan con un avatar predefinido; la spec no
// incluye avatarId en el body de canje (hueco documentado en progreso) y el
// PATCH /identity/usuarios/:id permite cambiarlo después.
const AVATAR_DEFAULT = 'avatar-01';

@Injectable()
export class InvitacionesService {
  private readonly logger = new Logger(InvitacionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accesoGrupo: AccesoGrupoService,
    private readonly auth: AuthService,
    private readonly eventos: EventosPublisherService,
    private readonly billing: BillingClientService
  ) {}

  // ---------- Autenticados (/identity/...) ----------

  async crear(
    tenant: TenantContext,
    grupoId: string,
    tipoInvitado: TipoInvitado
  ): Promise<InvitacionDto> {
    await this.accesoGrupo.asegurarAcceso(tenant, grupoId);

    const expiraEn = new Date(Date.now() + HORAS_EXPIRACION * 60 * 60 * 1000);
    const invitacion = await this.crearConCodigoUnico({
      tenant,
      grupoId,
      tipoInvitado,
      expiraEn,
    });

    await this.eventos.publicar<InvitacionGeneradaPayload>({
      eventType: 'InvitacionGenerada',
      routingKey: ROUTING_KEYS.INVITACION_GENERADA,
      organizacionId: invitacion.organizacionId,
      grupoId: invitacion.grupoId,
      payload: {
        invitacionId: invitacion.id,
        organizacionId: invitacion.organizacionId,
        grupoId: invitacion.grupoId,
        tipoInvitado,
        codigo: invitacion.codigo,
        expiraEn: invitacion.expiraEn.toISOString(),
        creadoPorTutorId: invitacion.creadoPorTutorId,
      },
    });

    return invitacionADto(invitacion);
  }

  async listar(tenant: TenantContext, grupoId: string): Promise<InvitacionDto[]> {
    await this.accesoGrupo.asegurarAcceso(tenant, grupoId);

    const invitaciones = await this.prisma.client.invitacion.findMany({
      where: { grupoId },
      orderBy: { createdAt: 'desc' },
    });

    return invitaciones.map(invitacionADto);
  }

  async revocar(tenant: TenantContext, id: string): Promise<void> {
    const invitacion = await this.prisma.client.invitacion.findFirst({ where: { id } });

    if (!invitacion) {
      throw new NotFoundException('Invitación no encontrada');
    }

    await this.accesoGrupo.asegurarAcceso(tenant, invitacion.grupoId);

    if (invitacion.estado !== EstadoInvitacion.PENDIENTE) {
      throw new InvitacionNoRevocableException(invitacion.estado);
    }

    await this.prisma.client.invitacion.updateMany({
      where: { id },
      data: { estado: EstadoInvitacion.REVOCADA },
    });
  }

  // ---------- Públicos (/auth/invitaciones/...) ----------

  async preview(codigo: string): Promise<PreviewInvitacionResponse> {
    const invitacion = await this.obtenerCanjeable(codigo);
    const grupo = await this.prisma.client.grupo.findFirst({
      where: { id: invitacion.grupoId },
    });
    const organizacion = await this.prisma.client.organizacion.findFirst({
      where: { id: invitacion.organizacionId },
    });

    return {
      grupoNombre: grupo?.nombre ?? '',
      organizacionNombre: organizacion?.nombre ?? '',
      tipoInvitado: invitacion.tipoInvitado as TipoInvitado,
      expiraEn: invitacion.expiraEn.toISOString(),
      estado: invitacion.estado,
    };
  }

  async canjear(codigo: string, datos: CanjearInvitacionRequest): Promise<SesionEmitida> {
    const invitacion = await this.obtenerCanjeable(codigo);

    if (invitacion.tipoInvitado === TipoInvitadoPrisma.TUTOR) {
      return await this.canjearComoTutor(invitacion, datos);
    }

    return await this.canjearComoUsuario(invitacion, datos);
  }

  /**
   * Regla obligatoria de la spec: una invitación vencida no se canjea aunque
   * siga PENDIENTE en la base — se chequea la fecha en tiempo real y, si
   * venció, se actualiza a EXPIRADA en el mismo request antes de devolver 410.
   */
  private async obtenerCanjeable(codigo: string): Promise<Invitacion> {
    const invitacion = await this.prisma.client.invitacion.findFirst({
      where: { codigo },
    });

    if (!invitacion) {
      throw new InvitacionNoEncontradaException();
    }

    if (invitacion.estado !== EstadoInvitacion.PENDIENTE) {
      throw new InvitacionNoCanjeableException(invitacion.estado);
    }

    if (invitacion.expiraEn <= new Date()) {
      await this.prisma.client.invitacion.updateMany({
        where: { id: invitacion.id },
        data: { estado: EstadoInvitacion.EXPIRADA },
      });

      throw new InvitacionNoCanjeableException(EstadoInvitacion.EXPIRADA);
    }

    return invitacion;
  }

  private async canjearComoTutor(
    invitacion: Invitacion,
    datos: CanjearInvitacionRequest
  ): Promise<SesionEmitida> {
    if (!datos.email) {
      throw new DomainException('EMAIL_REQUERIDO', 'email es requerido para canjear una invitación de TUTOR', 400);
    }

    await this.asegurarLimiteCanje(invitacion.organizacionId, TipoInvitadoPrisma.TUTOR);

    const email = datos.email;
    const passwordHash = await argon2.hash(datos.password);

    let tutor;

    try {
      tutor = await this.prisma.client.$transaction(async (tx) => {
        const nuevoTutor = await tx.tutor.create({
          data: {
            organizacionId: invitacion.organizacionId,
            email,
            passwordHash,
            nombre: datos.nombre,
            rol: RolTutor.TUTOR,
          },
        });

        await tx.tutorGrupo.create({
          data: { tutorId: nuevoTutor.id, grupoId: invitacion.grupoId },
        });

        await this.marcarCanjeada(tx, invitacion.id, nuevoTutor.id);

        return nuevoTutor;
      });
    } catch (error) {
      throw this.auth.traducirErrorUnicidad(error);
    }

    await this.publicarInvitacionCanjeada(invitacion, tutor.id);

    return await this.auth.emitirSesionTutor(tutor);
  }

  private async canjearComoUsuario(
    invitacion: Invitacion,
    datos: CanjearInvitacionRequest
  ): Promise<SesionEmitida> {
    if (!datos.username) {
      throw new DomainException('USERNAME_REQUERIDO', 'username es requerido para canjear una invitación de USUARIO', 400);
    }

    await this.asegurarLimiteCanje(invitacion.organizacionId, TipoInvitadoPrisma.USUARIO);

    const username = datos.username;
    const passwordHash = await argon2.hash(datos.password);

    let usuario;

    try {
      usuario = await this.prisma.client.$transaction(async (tx) => {
        const nuevoUsuario = await tx.usuario.create({
          data: {
            organizacionId: invitacion.organizacionId,
            grupoId: invitacion.grupoId,
            username,
            passwordHash,
            nombre: datos.nombre,
            avatarId: AVATAR_DEFAULT,
          },
        });

        await this.marcarCanjeada(tx, invitacion.id, nuevoUsuario.id);

        return nuevoUsuario;
      });
    } catch (error) {
      throw this.auth.traducirErrorUnicidad(error);
    }

    await this.publicarInvitacionCanjeada(invitacion, usuario.id);

    await this.eventos.publicar<UsuarioUnidoPayload>({
      eventType: 'UsuarioUnido',
      routingKey: ROUTING_KEYS.USUARIO_UNIDO,
      organizacionId: invitacion.organizacionId,
      grupoId: invitacion.grupoId,
      payload: {
        usuarioId: usuario.id,
        organizacionId: invitacion.organizacionId,
        grupoId: invitacion.grupoId,
        nombre: usuario.nombre,
        invitacionId: invitacion.id,
      },
    });

    return await this.auth.emitirSesionUsuario(usuario);
  }

  /**
   * Marca la invitación CANJEADA de forma atómica: el `estado: PENDIENTE` en el
   * where cierra la carrera de dos canjes simultáneos del mismo código (el
   * segundo no matchea ninguna fila y el canje entero se revierte).
   */
  private async marcarCanjeada(
    tx: Pick<PrismaService['client'], 'invitacion'>,
    invitacionId: string,
    canjeadaPorId: string
  ): Promise<void> {
    const resultado = await tx.invitacion.updateMany({
      where: { id: invitacionId, estado: EstadoInvitacion.PENDIENTE },
      data: {
        estado: EstadoInvitacion.CANJEADA,
        canjeadaPorId,
        canjeadaEn: new Date(),
      },
    });

    if (resultado.count === 0) {
      throw new InvitacionNoCanjeableException(EstadoInvitacion.CANJEADA);
    }
  }

  private async publicarInvitacionCanjeada(
    invitacion: Invitacion,
    canjeadaPorId: string
  ): Promise<void> {
    await this.eventos.publicar<InvitacionCanjeadaPayload>({
      eventType: 'InvitacionCanjeada',
      routingKey: ROUTING_KEYS.INVITACION_CANJEADA,
      organizacionId: invitacion.organizacionId,
      grupoId: invitacion.grupoId,
      payload: {
        invitacionId: invitacion.id,
        organizacionId: invitacion.organizacionId,
        grupoId: invitacion.grupoId,
        canjeadaPorId,
        tipoInvitado: invitacion.tipoInvitado as TipoInvitado,
      },
    });
  }

  /**
   * Chequeo de entitlements previo a crear el Tutor/Usuario del canje (spec
   * fase-04): cuenta las cuentas ACTIVAS de la organización contra el límite
   * del plan. Solo ACTIVO: una cuenta desactivada no ocupa cupo (la spec no lo
   * precisa — decisión documentada en docs/progreso/fase-04-billing.md, igual
   * que la omisión del chequeo si billing no está disponible).
   */
  private async asegurarLimiteCanje(
    organizacionId: string,
    tipoInvitado: TipoInvitadoPrisma
  ): Promise<void> {
    const entitlements = await this.billing.resolveEntitlements(organizacionId);

    if (!entitlements) {
      this.logger.warn(
        `Billing no disponible — se omite el chequeo de límite de ${
          tipoInvitado === TipoInvitadoPrisma.TUTOR ? 'tutores' : 'usuarios'
        } para ${organizacionId}`
      );

      return;
    }

    if (tipoInvitado === TipoInvitadoPrisma.TUTOR) {
      const limite = entitlements.limites.tutores;

      if (limite === null) {
        return;
      }

      const actuales = await this.prisma.client.tutor.count({
        where: { organizacionId, estado: EstadoCuenta.ACTIVO },
      });

      if (actuales >= limite) {
        throw new LimitePlanAlcanzadoException('tutores');
      }

      return;
    }

    const limite = entitlements.limites.usuarios;

    if (limite === null) {
      return;
    }

    const actuales = await this.prisma.client.usuario.count({
      where: { organizacionId, estado: EstadoCuenta.ACTIVO },
    });

    if (actuales >= limite) {
      throw new LimitePlanAlcanzadoException('usuarios');
    }
  }

  private async crearConCodigoUnico(params: {
    tenant: TenantContext;
    grupoId: string;
    tipoInvitado: TipoInvitado;
    expiraEn: Date;
  }): Promise<Invitacion> {
    for (let intento = 1; intento <= MAX_INTENTOS_CODIGO; intento++) {
      try {
        return await this.prisma.client.invitacion.create({
          data: {
            organizacionId: params.tenant.organizacionId,
            grupoId: params.grupoId,
            tipoInvitado: params.tipoInvitado,
            codigo: generarCodigoInvitacion(),
            creadoPorTutorId: params.tenant.principalId,
            expiraEn: params.expiraEn,
          },
        });
      } catch (error) {
        const codigo = (error as { code?: string })?.code;

        if (codigo !== 'P2002' || intento === MAX_INTENTOS_CODIGO) {
          throw error;
        }
      }
    }

    // Inalcanzable (el for retorna o lanza), pero TypeScript no lo sabe.
    throw new Error('No se pudo generar un código de invitación único');
  }
}
