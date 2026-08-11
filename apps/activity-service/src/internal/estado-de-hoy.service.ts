import { Injectable } from '@nestjs/common';

import {
  AlcanceActividad,
  ComportamientoAlCierre,
  EstadoSeccion,
  EstadoSesion,
  type ActividadDeHoyInternaDto,
  type EstadoDeHoyInternoDto,
  type MarcaDeHoyInternaDto,
  type MiEstadoActividadHoyDto,
  type ParticipanteDeHoyInternoDto,
  TipoPuntaje,
} from '@dorado/shared-types';

import { IdentityClientService } from '../clientes/identity-client.service';
import { SessionClientService } from '../clientes/session-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegistroService } from '../registro/registro.service';

/** Los dos valores del enum de Prisma, sin importar el cliente generado. */
const COMPLETADA = 'COMPLETADA';

const NO_HIZO = 'NO_HIZO';

/**
 * El estado operativo del día de TODO el grupo (fase-14-31 Parte B).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOS COSAS QUE ESTE SERVICIO HACE A PROPÓSITO:
 *
 * 1. **Las reglas de «se puede marcar» se calculan acá**, donde vive el
 *    endpoint que las hace cumplir, y viajan resueltas. La alternativa era que
 *    las replicara el armador de la propuesta —el patrón de `violacionDeTurno`
 *    y compañía—, y para esta familia sería peor: son cinco ítems de reglas de
 *    visibilidad (#10, #11, #17, #19, #21) que ya están resueltas en
 *    `estadoHoyInterno`. Replicarlas sería una tercera copia.
 *
 * 2. **Las marcas se traen en tres consultas para todo el grupo**, no en tres
 *    por persona. La lista de hoy sí es por persona (la compone
 *    `estadoHoyInterno`), pero eso es una llamada por integrante en un grupo
 *    familiar, no una por marca.
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Injectable()
export class EstadoDeHoyInternoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registro: RegistroService,
    private readonly session: SessionClientService,
    private readonly identity: IdentityClientService
  ) {}

  async delGrupo(grupoId: string, sesionIdPedido?: string): Promise<EstadoDeHoyInternoDto> {
    const seccion = await this.session.obtenerSeccionActual(grupoId);
    // fase-14-33: con `sesionIdPedido` se mira otra Sesión de la Sección
    // vigente. Un id que no es de esa Sección cae en `undefined` y devuelve el
    // «no se puede» de siempre — la lectura no es el lugar del 409.
    const sesionAbierta = sesionIdPedido
      ? seccion?.sesiones.find((sesion) => sesion.id === sesionIdPedido)
      : seccion?.estado === EstadoSeccion.ABIERTA
        ? seccion.sesiones.find((sesion) => sesion.estado === EstadoSesion.ABIERTA)
        : undefined;

    // Sin sesión no hay nada que anotar ni que quitar, y decirlo es la mitad
    // del valor de la lectura: el modelo tiene que poder contestar «hoy no se
    // puede» en vez de armar una propuesta que muere al aplicar.
    if (!sesionAbierta) {
      return { sesionAbierta: false, participantes: [] };
    }

    // fase-14-33: `sesionAbierta: true` sigue significando «se puede anotar»,
    // no «es hoy» — lo que decide es que la Sección admita escritura. La Sesión
    // concreta viaja aparte para que el modelo pueda nombrarla en la propuesta.
    const seccionEditable = seccion !== null && seccion.estado !== EstadoSeccion.CERRADA;

    if (!seccionEditable) {
      return { sesionAbierta: false, participantes: [] };
    }

    const usuarios = await this.identity.usuariosDelGrupo(grupoId);
    const [actividades, conductas, registrosActividad, registrosConducta] = await Promise.all([
      this.prisma.client.actividad.findMany({
        where: { grupoId },
        select: { id: true, nombre: true, valorPuntos: true, alcance: true },
      }),
      this.prisma.client.conducta.findMany({
        where: { grupoId },
        select: { id: true, nombre: true },
      }),
      this.prisma.client.registroActividad.findMany({
        where: {
          sesionId: sesionAbierta.id,
          OR: [
            // Vivas: se pueden quitar. Eliminadas sin revertir: son las marcas
            // rojas del Tutor, que se pueden deshacer.
            { tipo: COMPLETADA, eliminado: false },
            { tipo: COMPLETADA, eliminado: true, revertidoPorTutorId: null },
            { tipo: NO_HIZO, eliminado: false },
          ],
        },
        select: {
          id: true,
          usuarioId: true,
          actividadId: true,
          tipo: true,
          eliminado: true,
          valorPuntosSnapshot: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.client.registroConducta.findMany({
        where: { sesionId: sesionAbierta.id, eliminado: false },
        select: {
          id: true,
          usuarioId: true,
          conductaId: true,
          valorPuntosSnapshot: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const nombreActividad = new Map(actividades.map((fila) => [fila.id, fila.nombre]));
    const valorActividad = new Map(actividades.map((fila) => [fila.id, fila.valorPuntos]));
    const deEquipo = new Set(
      actividades
        .filter((fila) => fila.alcance === AlcanceActividad.EQUIPO)
        .map((fila) => fila.id)
    );
    const nombreConducta = new Map(conductas.map((fila) => [fila.id, fila.nombre]));

    const participantes: ParticipanteDeHoyInternoDto[] = [];

    for (const usuario of usuarios) {
      const estado = await this.registro.estadoHoyInterno(grupoId, usuario.id, sesionAbierta.id);

      participantes.push({
        usuarioId: usuario.id,
        nombre: usuario.nombre,
        actividades: estado.actividades.map((fila) =>
          this.aActividadDeHoy(fila, nombreActividad, valorActividad, deEquipo)
        ),
        marcas: [
          ...registrosActividad
            .filter((fila) => fila.usuarioId === usuario.id)
            .map((fila) => this.aMarcaDeActividad(fila, nombreActividad)),
          ...registrosConducta
            .filter((fila) => fila.usuarioId === usuario.id)
            .map((fila) => ({
              registroId: fila.id,
              tipo: 'CONDUCTA' as const,
              descripcion: `conducta «${nombreConducta.get(fila.conductaId) ?? 'sin nombre'}»`,
              puntos: fila.valorPuntosSnapshot,
            })),
        ],
      });
    }

    return {
      sesionAbierta: true,
      // fase-14-33: a qué Sesión corresponde lo que se está leyendo. Sin esto,
      // una propuesta sobre el lunes sería indistinguible de una sobre hoy —
      // exactamente el dato que el Tutor necesita para revisarla.
      sesionId: sesionAbierta.id,
      sesionNumero: sesionAbierta.numero,
      esSesionAbierta: sesionAbierta.estado === EstadoSesion.ABIERTA,
      participantes,
    };
  }

  /**
   * El «se puede o no» ya resuelto, con el orden de motivos que le importa a
   * quien decide: primero lo que hizo el Tutor, después lo que decidió el
   * calendario. Es el mismo orden de `registro-tutor.ts` en el frontend, que
   * responde la misma pregunta para la pantalla.
   */
  private aActividadDeHoy(
    fila: MiEstadoActividadHoyDto,
    nombres: Map<string, string>,
    valores: Map<string, number>,
    deEquipo: Set<string>
  ): ActividadDeHoyInternaDto {
    const vecesQueAdmite = Math.max(0, fila.topeEfectivo - fila.vecesHechas);
    const motivo = this.motivoNoDisponible(fila, deEquipo.has(fila.actividadId), vecesQueAdmite);

    return {
      actividadId: fila.actividadId,
      nombre: nombres.get(fila.actividadId) ?? 'Actividad',
      tipoPuntaje: fila.tipoPuntaje,
      valorPuntos: valores.get(fila.actividadId) ?? 0,
      vecesHechas: fila.vecesHechas,
      vecesQueAdmite,
      puedeMarcarHizo: motivo === null,
      // El «no hizo» es solo de obligatorias, no se apila sobre una marca viva
      // —para eso está revertirla— y las de equipo se anulan por su camino.
      puedeMarcarNoHizo:
        fila.tipoPuntaje === TipoPuntaje.OBLIGATORIA &&
        !fila.denegada &&
        !deEquipo.has(fila.actividadId),
      motivoNoDisponible: motivo,
    };
  }

  private motivoNoDisponible(
    fila: MiEstadoActividadHoyDto,
    esDeEquipo: boolean,
    vecesQueAdmite: number
  ): string | null {
    if (esDeEquipo) {
      return 'la marca el jefe del equipo, no se registra de a uno';
    }

    // La PRIMERA regla que valida `completar` (ObligatoriaNoSeCompletaException)
    // y la única que faltaba acá — se encontró al escribir `proponer_anotar`
    // (fase-14-31 tanda 6), que es lo que pasa cuando se lee un campo con una
    // pregunta nueva encima: `puedeMarcarHizo` decía `true` para una obligatoria
    // que el endpoint rechaza siempre.
    //
    // Una OBLIGATORIA no se marca como hecha: no hacer nada ES su estado de
    // cumplida, y el puntaje se resuelve al cerrar. La excepción es la que pide
    // confirmación explícita, que sí entra por este mismo endpoint.
    if (
      fila.tipoPuntaje === TipoPuntaje.OBLIGATORIA &&
      fila.comportamientoAlCierre !== ComportamientoAlCierre.REQUIERE_CONFIRMACION
    ) {
      return 'las obligatorias no se marcan como hechas: se dan por cumplidas al cerrar el día';
    }

    // La que sí pide confirmación no se confirma dos veces.
    if (fila.tipoPuntaje === TipoPuntaje.OBLIGATORIA && fila.confirmada) {
      return 'ya está confirmada hoy';
    }

    if (fila.denegada) {
      return 'ya está marcada como «no hizo» hoy';
    }

    if (!fila.disponibleHoy) {
      return 'hoy no es uno de sus días';
    }

    if (fila.turno && !fila.turno.esMio) {
      return `hoy le toca a ${fila.turno.nombreAsignado ?? 'otra persona'}`;
    }

    if (fila.requiereSeleccion && !fila.enPlan) {
      return 'no la eligió para su plan de hoy';
    }

    if (vecesQueAdmite === 0) {
      return 'ya la hizo todas las veces que admite hoy';
    }

    return null;
  }

  private aMarcaDeActividad(
    fila: { id: string; actividadId: string; tipo: string; eliminado: boolean; valorPuntosSnapshot: number },
    nombres: Map<string, string>
  ): MarcaDeHoyInternaDto {
    const nombre = nombres.get(fila.actividadId) ?? 'Actividad';

    if (fila.tipo === NO_HIZO) {
      return {
        registroId: fila.id,
        tipo: 'NO_HIZO',
        descripcion: `«${nombre}» marcada como no hecha`,
        puntos: fila.valorPuntosSnapshot,
      };
    }

    if (fila.eliminado) {
      return {
        registroId: fila.id,
        tipo: 'REPETICION_QUITADA',
        descripcion: `una repetición de «${nombre}» que le quitaste`,
        puntos: fila.valorPuntosSnapshot,
      };
    }

    return {
      registroId: fila.id,
      tipo: 'COMPLETADA',
      descripcion: `«${nombre}» hecha`,
      puntos: fila.valorPuntosSnapshot,
    };
  }
}
