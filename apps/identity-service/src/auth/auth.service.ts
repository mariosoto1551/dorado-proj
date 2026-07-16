import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

import { OrganizacionCreadaPayload, ROUTING_KEYS } from '@dorado/shared-events';
import {
  OrganizacionDto,
  PrincipalType,
  Rol,
  TutorDto,
  UsuarioDto,
} from '@dorado/shared-types';

import { BillingClientService } from '../billing/billing-client.service';
import {
  CredencialesInvalidasException,
  IdentificadorEnUsoException,
  RefreshTokenInvalidoException,
} from '../comun/excepciones';
import { organizacionADto, tutorADto, usuarioADto } from '../comun/mapeadores';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { EstadoCuenta, RolTutor } from '../generated/prisma/enums';
import type { Tutor, Usuario } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginRequest } from './dto/login.dto';
import type { RegistrarOrganizacionRequest } from './dto/registrar-organizacion.dto';
import { RefreshEmitido, TokensService } from './tokens.service';

export interface SesionEmitida {
  accessToken: string;
  refresh: RefreshEmitido;
  principalType: PrincipalType;
  perfil: TutorDto | UsuarioDto;
}

export interface RegistroOrganizacion {
  sesion: SesionEmitida;
  organizacion: OrganizacionDto;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly billing: BillingClientService,
    private readonly eventos: EventosPublisherService
  ) {}

  async registrarOrganizacion(datos: RegistrarOrganizacionRequest): Promise<RegistroOrganizacion> {
    const passwordHash = await argon2.hash(datos.password);

    let organizacion;
    let tutor: Tutor;

    try {
      const resultado = await this.prisma.client.$transaction(async (tx) => {
        const nuevaOrganizacion = await tx.organizacion.create({
          data: { nombre: datos.nombre, emailContacto: datos.emailContacto },
        });

        // El primer Tutor de una Organización SIEMPRE es ORG_ADMIN (spec fase-02).
        const nuevoTutor = await tx.tutor.create({
          data: {
            organizacionId: nuevaOrganizacion.id,
            email: datos.emailContacto,
            passwordHash,
            nombre: datos.nombre,
            rol: RolTutor.ORG_ADMIN,
          },
        });

        return { organizacion: nuevaOrganizacion, tutor: nuevoTutor };
      });

      organizacion = resultado.organizacion;
      tutor = resultado.tutor;
    } catch (error) {
      throw this.traducirErrorUnicidad(error);
    }

    await this.eventos.publicar<OrganizacionCreadaPayload>({
      eventType: 'OrganizacionCreada',
      routingKey: ROUTING_KEYS.ORGANIZACION_CREADA,
      organizacionId: organizacion.id,
      payload: {
        organizacionId: organizacion.id,
        nombre: organizacion.nombre,
        emailContacto: organizacion.emailContacto,
        creadaPorTutorId: tutor.id,
      },
    });

    const sesion = await this.emitirSesionTutor(tutor);

    return { sesion, organizacion: organizacionADto(organizacion) };
  }

  async login(datos: LoginRequest): Promise<SesionEmitida> {
    // Identificadores únicos a nivel plataforma (spec fase-02): primero
    // Tutor.email, después Usuario.username — sin pedir organización.
    const tutor = await this.prisma.client.tutor.findFirst({
      where: { email: datos.identificador },
    });

    if (tutor) {
      await this.verificarCredencial(tutor.passwordHash, datos.password, tutor.estado);
      return await this.emitirSesionTutor(tutor);
    }

    const usuario = await this.prisma.client.usuario.findFirst({
      where: { username: datos.identificador },
    });

    if (!usuario) {
      throw new CredencialesInvalidasException();
    }

    await this.verificarCredencial(usuario.passwordHash, datos.password, usuario.estado);

    return await this.emitirSesionUsuario(usuario);
  }

  async refrescar(tokenActual: string | undefined): Promise<SesionEmitida> {
    if (!tokenActual) {
      throw new RefreshTokenInvalidoException();
    }

    const consumido = await this.tokens.consumirRefreshToken(tokenActual);

    if (!consumido) {
      throw new RefreshTokenInvalidoException();
    }

    if (consumido.principalType === PrincipalType.TUTOR) {
      const tutor = await this.prisma.client.tutor.findFirst({
        where: { id: consumido.principalId },
      });

      if (!tutor || tutor.estado !== EstadoCuenta.ACTIVO) {
        throw new RefreshTokenInvalidoException();
      }

      return await this.emitirSesionTutor(tutor);
    }

    const usuario = await this.prisma.client.usuario.findFirst({
      where: { id: consumido.principalId },
    });

    if (!usuario || usuario.estado !== EstadoCuenta.ACTIVO) {
      throw new RefreshTokenInvalidoException();
    }

    return await this.emitirSesionUsuario(usuario);
  }

  async logout(tokenActual: string | undefined): Promise<void> {
    if (tokenActual) {
      await this.tokens.revocarRefreshToken(tokenActual);
    }
  }

  /**
   * Arma la sesión completa de un Tutor: access token (con grupoIds frescos de
   * la base y plan resuelto) + refresh token nuevo + perfil.
   */
  async emitirSesionTutor(tutor: Tutor): Promise<SesionEmitida> {
    // ORG_ADMIN viaja con grupoIds vacío = acceso implícito a todos (ADR-00 §3).
    const grupoIds =
      tutor.rol === RolTutor.ORG_ADMIN
        ? []
        : (
            await this.prisma.client.tutorGrupo.findMany({
              where: { tutorId: tutor.id },
            })
          ).map((asignacion) => asignacion.grupoId);

    const plan = await this.billing.resolvePlan(tutor.organizacionId);
    const rol = tutor.rol === RolTutor.ORG_ADMIN ? Rol.ORG_ADMIN : Rol.TUTOR;

    const accessToken = await this.tokens.emitirAccessToken({
      principalId: tutor.id,
      principalType: PrincipalType.TUTOR,
      organizacionId: tutor.organizacionId,
      grupoIds,
      rol,
      plan,
    });

    const refresh = await this.tokens.emitirRefreshToken(PrincipalType.TUTOR, tutor.id);

    return {
      accessToken,
      refresh,
      principalType: PrincipalType.TUTOR,
      perfil: tutorADto(tutor, grupoIds),
    };
  }

  async emitirSesionUsuario(usuario: Usuario): Promise<SesionEmitida> {
    const plan = await this.billing.resolvePlan(usuario.organizacionId);

    const accessToken = await this.tokens.emitirAccessToken({
      principalId: usuario.id,
      principalType: PrincipalType.USUARIO,
      organizacionId: usuario.organizacionId,
      // USUARIO: exactamente 1 grupo (ADR-00 §3).
      grupoIds: [usuario.grupoId],
      rol: Rol.USUARIO,
      plan,
    });

    const refresh = await this.tokens.emitirRefreshToken(PrincipalType.USUARIO, usuario.id);

    return {
      accessToken,
      refresh,
      principalType: PrincipalType.USUARIO,
      perfil: usuarioADto(usuario),
    };
  }

  /**
   * Traduce la violación de unique de Prisma (P2002) a la excepción de negocio
   * 409; cualquier otro error se propaga tal cual.
   */
  traducirErrorUnicidad(error: unknown): Error {
    const codigo = (error as { code?: string })?.code;

    if (codigo === 'P2002') {
      return new IdentificadorEnUsoException();
    }

    return error as Error;
  }

  private async verificarCredencial(
    hash: string,
    password: string,
    estado: string
  ): Promise<void> {
    const passwordCorrecto = await argon2.verify(hash, password);

    // Mensaje único para password incorrecto y cuenta INACTIVA: no dar pistas.
    if (!passwordCorrecto || estado !== EstadoCuenta.ACTIVO) {
      throw new CredencialesInvalidasException();
    }
  }
}
