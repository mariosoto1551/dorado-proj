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

    const sesion = await this.resolverSesionDeTrabajo(grupoId, datos.sesionId);

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
        // fase-14-33: trazabilidad, no criterio de suma. Sin `motivoRetroactivo`
        // aparte: `motivo` ya es obligatorio en TODO ajuste, y pedir dos textos
        // para el mismo movimiento es fricción sin información.
        cargadoRetroactivamenteEn: sesion.retroactiva ? new Date() : null,
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
   * Dónde cae el asiento (fase-14-31, ampliado por fase-14-33).
   *
   * El #31 decía «la Sesión abierta de la Sección abierta, o no cae» — su
   * decisión 5. El #33 la revisa: cae en cualquier Sesión de la Sección
   * **vigente**, porque la Sección es la unidad que se evalúa y mientras no
   * cerró nada de lo que contiene está decidido. Lo que no cambia es que
   * **falla cerrado**: sin Sección vigente no hay dónde escribir, y una Sección
   * ya CERRADA es intocable (regla 6).
   *
   * Es una copia local del resolvedor de activity y no una lib compartida a
   * propósito: son dos servicios con dos clientes internos distintos, y
   * compartir esto obligaría a compartir el tipo del cliente (regla 2).
   */
  private async resolverSesionDeTrabajo(
    grupoId: string,
    sesionIdPedido?: string
  ): Promise<{ seccionId: string; sesionId: string; retroactiva: boolean }> {
    const seccion = await this.session.obtenerSeccionActual(grupoId);

    if (!seccion || seccion.estado === EstadoSeccion.CERRADA) {
      throw new ConflictException(
        'No hay ninguna sección vigente en este grupo: un ajuste de puntos necesita una sesión ' +
          'donde caer. Abrí la sesión del día y volvé a intentar.'
      );
    }

    if (sesionIdPedido) {
      const pedida = seccion.sesiones.find((sesion) => sesion.id === sesionIdPedido);

      // Mismo cuerpo para "no existe", "es de otro grupo" y "es de una Sección
      // cerrada": distinguirlos le diría a quien prueba ids cuál rozó algo real.
      if (!pedida) {
        throw new ConflictException(
          'Esa sesión no pertenece a la sección vigente del grupo — una sección cerrada no se edita'
        );
      }

      return {
        seccionId: seccion.id,
        sesionId: pedida.id,
        retroactiva:
          seccion.estado !== EstadoSeccion.ABIERTA || pedida.estado !== EstadoSesion.ABIERTA,
      };
    }

    const sesionAbierta =
      seccion.estado === EstadoSeccion.ABIERTA
        ? seccion.sesiones.find((sesion) => sesion.estado === EstadoSesion.ABIERTA)
        : undefined;

    if (!sesionAbierta) {
      throw new ConflictException(
        'No hay ninguna sesión abierta en este grupo: un ajuste de puntos necesita una sesión ' +
          'donde caer. Abrí la sesión del día y volvé a intentar.'
      );
    }

    return { seccionId: seccion.id, sesionId: sesionAbierta.id, retroactiva: false };
  }
}
