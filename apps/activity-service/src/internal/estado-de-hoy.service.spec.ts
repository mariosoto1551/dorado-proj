import { describe, expect, it, vi } from 'vitest';

import {
  ComportamientoAlCierre,
  EstadoSeccion,
  EstadoSesion,
  TipoPuntaje,
  type MiEstadoActividadHoyDto,
} from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import type { SessionClientService } from '../clientes/session-client.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RegistroService } from '../registro/registro.service';
import { EstadoDeHoyInternoService } from './estado-de-hoy.service';

/**
 * La lectura que hace posible anotar (fase-14-31 Parte B).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ SE PRUEBA ACÁ Y POR QUÉ IMPORTA MÁS QUE EN OTRAS LECTURAS:
 *
 * `puedeMarcarHizo` no es un dato: es una REGLA resuelta, y el armador de
 * `proponer_anotar` la usa tal cual sin volver a pensarla (esa es toda la razón
 * por la que viaja resuelta — replicarla en ai-service sería una tercera copia
 * de las reglas de visibilidad de cinco ítems). O sea que si acá dice `true`
 * donde el endpoint va a devolver 400, la propuesta se arma igual y el error
 * aparece recién con el Tutor mirando.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const ACTIVIDAD_ID = 'act-1';

function actividadDeHoy(
  sobrescribir: Partial<MiEstadoActividadHoyDto> = {}
): MiEstadoActividadHoyDto {
  return {
    actividadId: ACTIVIDAD_ID,
    tipoPuntaje: TipoPuntaje.OPCIONAL,
    comportamientoAlCierre: ComportamientoAlCierre.ASUME_HECHA,
    repeticionesMaximasSesion: 1,
    repeticionesMinimasSesion: 1,
    minimoEfectivo: 1,
    vecesHechas: 0,
    confirmada: false,
    vecesPerdidas: 0,
    topeEfectivo: 1,
    denegada: false,
    motivoTutor: null,
    deadlineEn: null,
    disponibleHoy: true,
    diasSemana: [],
    requiereSeleccion: false,
    enPlan: false,
    turno: null,
    ...sobrescribir,
  };
}

function crearMocks(fila: MiEstadoActividadHoyDto) {
  const session = {
    obtenerSeccionActual: vi.fn(async () => ({
      id: 'sec-1',
      estado: EstadoSeccion.ABIERTA,
      sesiones: [{ id: 'ses-1', estado: EstadoSesion.ABIERTA }],
    })),
  } as unknown as SessionClientService;

  const identity = {
    usuariosDelGrupo: vi.fn(async () => [{ id: 'usuario-1', nombre: 'Luciana' }]),
  } as unknown as IdentityClientService;

  const prisma = {
    client: {
      actividad: {
        findMany: vi.fn(async () => [
          { id: ACTIVIDAD_ID, nombre: 'Tender la cama', valorPuntos: 10, alcance: 'INDIVIDUAL' },
        ]),
      },
      conducta: { findMany: vi.fn(async () => []) },
      registroActividad: { findMany: vi.fn(async () => []) },
      registroConducta: { findMany: vi.fn(async () => []) },
    },
  } as unknown as PrismaService;

  const registro = {
    estadoHoyInterno: vi.fn(async () => ({
      sesionId: 'ses-1',
      planDelDiaActivo: false,
      actividades: [fila],
    })),
  } as unknown as RegistroService;

  return {
    servicio: new EstadoDeHoyInternoService(prisma, registro, session, identity),
    session,
  };
}

async function primeraActividad(fila: MiEstadoActividadHoyDto) {
  const { servicio } = crearMocks(fila);
  const estado = await servicio.delGrupo('grupo-1');

  return estado.participantes[0].actividades[0];
}

describe('EstadoDeHoyInternoService', () => {
  it('sin sesión abierta contesta que no, y no consulta nada más', async () => {
    const { servicio, session } = crearMocks(actividadDeHoy());

    (session.obtenerSeccionActual as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const estado = await servicio.delGrupo('grupo-1');

    // Es una respuesta legítima y la mitad del valor de la lectura: el modelo
    // tiene que poder decir «hoy no se puede» en vez de proponer algo que muere.
    expect(estado).toEqual({ sesionAbierta: false, participantes: [] });
  });

  describe('puedeMarcarHizo replica lo que `completar` valida', () => {
    it('una OPCIONAL disponible se puede marcar', async () => {
      const actividad = await primeraActividad(actividadDeHoy());

      expect(actividad).toMatchObject({ puedeMarcarHizo: true, motivoNoDisponible: null });
    });

    /**
     * El defecto que encontró la tanda 6: acá decía `true` y el endpoint
     * devuelve 400 SIEMPRE (`ObligatoriaNoSeCompletaException`). No hacer nada
     * es el estado de «cumplida» de una obligatoria.
     */
    it('una OBLIGATORIA que se asume hecha NO se puede marcar', async () => {
      const actividad = await primeraActividad(
        actividadDeHoy({
          tipoPuntaje: TipoPuntaje.OBLIGATORIA,
          comportamientoAlCierre: ComportamientoAlCierre.ASUME_HECHA,
        })
      );

      expect(actividad.puedeMarcarHizo).toBe(false);
      expect(actividad.motivoNoDisponible).toContain('al cerrar el día');
      // La otra mitad no cambia: marcarla como NO hecha sí se puede, y es la
      // única de las dos que tiene sentido sobre una obligatoria.
      expect(actividad.puedeMarcarNoHizo).toBe(true);
    });

    it('la que pide confirmación sí se puede, pero no dos veces', async () => {
      const confirmable = {
        tipoPuntaje: TipoPuntaje.OBLIGATORIA,
        comportamientoAlCierre: ComportamientoAlCierre.REQUIERE_CONFIRMACION,
      };

      expect(await primeraActividad(actividadDeHoy(confirmable))).toMatchObject({
        puedeMarcarHizo: true,
      });

      const yaConfirmada = await primeraActividad(
        actividadDeHoy({ ...confirmable, confirmada: true, vecesHechas: 1 })
      );

      expect(yaConfirmada.puedeMarcarHizo).toBe(false);
      expect(yaConfirmada.motivoNoDisponible).toContain('ya está confirmada');
    });

    it('el motivo dice cuál de las reglas es, no solo que no se puede', async () => {
      // El orden importa: primero lo que hizo el Tutor, después el calendario.
      const denegada = await primeraActividad(actividadDeHoy({ denegada: true }));
      const otroDia = await primeraActividad(actividadDeHoy({ disponibleHoy: false }));
      const sinCupo = await primeraActividad(
        actividadDeHoy({ vecesHechas: 1, topeEfectivo: 1 })
      );

      expect(denegada.motivoNoDisponible).toContain('no hizo');
      expect(otroDia.motivoNoDisponible).toContain('sus días');
      expect(sinCupo.motivoNoDisponible).toContain('todas las veces');
      expect(sinCupo.vecesQueAdmite).toBe(0);
    });
  });
});
