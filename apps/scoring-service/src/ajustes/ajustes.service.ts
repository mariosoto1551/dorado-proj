import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EstadoSeccion,
  EstadoSesion,
  EventoPuntosDto,
  Rol,
  TenantContext,
} from '@dorado/shared-types';

import { IdentityClientService } from '../clientes/identity-client.service';
import { SessionClientService } from '../clientes/session-client.service';
import { eventoPuntosADto } from '../comun/mapeadores';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { TipoOrigenPuntos } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { AjustarPuntosRequest } from './dto/ajustes.dto';

/**
 * Ajuste manual de puntos (fase-14-31 Parte A).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTE ENDPOINT LE FALTABA AL TUTOR DESDE LA FASE 7, Y NADIE LO HABÍA VISTO.
 *
 * Para las monedas hay ajuste manual desde el #22; para los puntos —el número
 * que decide la zona y la recompensa— no había nada: `corregir` exige el id de
 * un asiento previo, así que sirve para arreglar lo que existe, no para sumar
 * por algo que pasó fuera del catálogo. *«Ayudó con la mudanza, ponele 10»* no
 * tenía dónde entrar.
 *
 * Lo que NO cambia, y es lo que hay que cuidar al tocar este archivo: el
 * puntaje sigue **derivándose al leer** (regla 1 del proyecto). Esto escribe
 * una fila más en el ledger, inmutable, con su motivo; no toca ningún
 * acumulado porque no hay ninguno. Si algún día aparece acá un `update`, el
 * error no es de este archivo: es que alguien agregó un campo mutable.
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Injectable()
export class AjustesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityClientService,
    private readonly session: SessionClientService,
    private readonly eventos: EventosPublisherService
  ) {}

  /** POST /scoring/grupos/:grupoId/usuarios/:usuarioId/ajuste */
  async ajustar(
    tenant: TenantContext,
    grupoId: string,
    usuarioId: string,
    datos: AjustarPuntosRequest
  ): Promise<EventoPuntosDto> {
    if (tenant.rol === Rol.TUTOR && !tenant.grupoIds.includes(grupoId)) {
      throw new ForbiddenException('Sin acceso a ese grupo');
    }

    const usuario = await this.identity.obtenerUsuario(usuarioId);

    // 404 también para el usuario de otra organización o de otro grupo: no se
    // revela existencia (mismo criterio que la descalificación).
    if (
      !usuario ||
      usuario.organizacionId !== tenant.organizacionId ||
      usuario.grupoId !== grupoId
    ) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const sesion = await this.resolverSesionAbierta(grupoId);

    const evento = await this.prisma.client.eventoPuntos.create({
      data: {
        organizacionId: tenant.organizacionId,
        grupoId,
        usuarioId,
        seccionId: sesion.seccionId,
        sesionId: sesion.sesionId,
        tipoOrigen: TipoOrigenPuntos.AJUSTE_MANUAL,
        // Sin fila de origen: un id prestado sería mentira en el ledger.
        origenId: null,
        // Sin piso en 0, al revés que el ajuste de monedas: un puntaje negativo
        // es un estado legítimo del producto (la zona Rojo existe), un saldo
        // negativo no.
        puntosSnapshot: datos.puntos,
        registradoPorId: tenant.principalId,
        registradoPorTipo: tenant.principalType,
        // El campo ya significa «por qué un humano tocó el ledger a mano», que
        // es exactamente lo que es esto. Renombrarlo sería mejor nombre y peor
        // idea: es una columna persistida con filas vivas.
        motivoCorreccion: datos.motivo,
      },
    });

    // Mismo rastro que la corrección (retrofit fase-09): es el que resuelve una
    // discusión sobre por qué el puntaje de alguien cambió sin que hiciera nada.
    await this.eventos.publicarAccionAdministrativa({
      organizacionId: tenant.organizacionId,
      grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion: 'PUNTOS_AJUSTADOS',
      entidadTipo: 'EventoPuntos',
      entidadId: evento.id,
      detalle: {
        motivo: datos.motivo,
        puntos: datos.puntos,
        usuarioId,
        seccionId: sesion.seccionId,
        sesionId: sesion.sesionId,
      },
    });

    return eventoPuntosADto(evento);
  }

  /**
   * Dónde cae el asiento: la Sesión abierta de la Sección abierta.
   *
   * Es la misma resolución que hace activity al registrar, y **falla cerrado**
   * por el mismo motivo: sin Sesión no hay dónde escribir, y elegir la última
   * cerrada sería mover el puntaje de un período que ya se evaluó.
   */
  private async resolverSesionAbierta(
    grupoId: string
  ): Promise<{ seccionId: string; sesionId: string }> {
    const seccion = await this.session.obtenerSeccionActual(grupoId);
    const sesionAbierta =
      seccion?.estado === EstadoSeccion.ABIERTA
        ? seccion.sesiones.find((sesion) => sesion.estado === EstadoSesion.ABIERTA)
        : undefined;

    if (!seccion || !sesionAbierta) {
      throw new ConflictException(
        'No hay ninguna sesión abierta en este grupo: un ajuste de puntos necesita una sesión ' +
          'donde caer. Abrí la sesión del día y volvé a intentar.'
      );
    }

    return { seccionId: seccion.id, sesionId: sesionAbierta.id };
  }
}
