import {
  AlcanceActividad,
  TipoPuntaje,
  type ActividadDto,
  type MiEstadoActividadHoyDto,
} from '@dorado/shared-types';

import { filasDeRegistro, textoDeRepeticiones } from './registro-tutor';

const CATALOGO = [
  { id: 'a1', nombre: 'Tender la cama' },
  { id: 'a2', nombre: 'Leer 20 minutos' },
] as ActividadDto[];

function estado(parcial: Partial<MiEstadoActividadHoyDto> = {}): MiEstadoActividadHoyDto {
  return {
    actividadId: 'a1',
    tipoPuntaje: TipoPuntaje.OBLIGATORIA,
    comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
    repeticionesMaximasSesion: 1,
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
    enPlan: true,
    turno: null,
    ...parcial,
  } as MiEstadoActividadHoyDto;
}

describe('filasDeRegistro', () => {
  it('toma el nombre del catálogo: el estado solo trae el id', () => {
    const [fila] = filasDeRegistro([estado()], CATALOGO, 'u1');

    expect(fila.nombre).toBe('Tender la cama');
  });

  it('esconde lo que el integrante no ve — el plan del día decide (criterio 2)', () => {
    const filas = filasDeRegistro(
      [estado({ actividadId: 'a1' }), estado({ actividadId: 'a2', enPlan: false })],
      CATALOGO,
      'u1'
    );

    expect(filas.map((f) => f.actividadId)).toEqual(['a1']);
  });

  it('una actividad sin trabas se puede marcar', () => {
    const [fila] = filasDeRegistro([estado()], CATALOGO, 'u1');

    expect(fila.puedeCompletar).toBe(true);
    expect(fila.motivoBloqueo).toBeNull();
  });

  it('la marca del propio tutor gana sobre cualquier otro motivo', () => {
    const [fila] = filasDeRegistro(
      [estado({ denegada: true, disponibleHoy: false })],
      CATALOGO,
      'u1'
    );

    expect(fila.puedeCompletar).toBe(false);
    expect(fila.motivoBloqueo).toBe('Ya la marcaste como «no hizo»');
    // Y no se apila otro «no hizo» encima: para eso está deshacer.
    expect(fila.puedeNoHizo).toBe(false);
  });

  it('el turno de otro se dice con nombre y propio (fase-14-21)', () => {
    const deOtro = filasDeRegistro(
      [estado({ turno: { usuarioIdAsignado: 'u2', nombreAsignado: 'Ana', esMio: false } })],
      CATALOGO,
      'u1'
    );
    const propio = filasDeRegistro(
      [estado({ turno: { usuarioIdAsignado: 'u1', nombreAsignado: 'Luis', esMio: true } })],
      CATALOGO,
      'u1'
    );

    expect(deOtro[0].motivoBloqueo).toBe('Hoy le toca a Ana');
    expect(deOtro[0].turnoAjenoDe).toBe('Ana');
    expect(propio[0].puedeCompletar).toBe(true);
    expect(propio[0].turnoAjenoDe).toBeNull();
  });

  it('el día que no le toca por calendario se ve, pero no se marca (fase-14-11)', () => {
    const [fila] = filasDeRegistro([estado({ disponibleHoy: false })], CATALOGO, 'u1');

    expect(fila.puedeCompletar).toBe(false);
    expect(fila.motivoBloqueo).toBe('Hoy no es uno de sus días');
  });

  it('llegado al tope no se puede marcar más', () => {
    const [fila] = filasDeRegistro(
      [estado({ tipoPuntaje: TipoPuntaje.OPCIONAL, vecesHechas: 3, topeEfectivo: 3 })],
      CATALOGO,
      'u1'
    );

    expect(fila.puedeCompletar).toBe(false);
    expect(fila.motivoBloqueo).toBe('Ya llegó al tope de hoy');
  });

  it('sin intentos disponibles el motivo lo dice distinto (todas quitadas, fase-14-12)', () => {
    const [fila] = filasDeRegistro(
      [estado({ tipoPuntaje: TipoPuntaje.OPCIONAL, vecesHechas: 0, topeEfectivo: 0 })],
      CATALOGO,
      'u1'
    );

    expect(fila.motivoBloqueo).toBe('No le queda ningún intento hoy');
  });

  it('«no hizo» es solo de obligatorias; «quitar» solo de opcionales ya marcadas', () => {
    const [obligatoria] = filasDeRegistro([estado({ vecesHechas: 1 })], CATALOGO, 'u1');
    const [opcional] = filasDeRegistro(
      [estado({ tipoPuntaje: TipoPuntaje.OPCIONAL, vecesHechas: 1, topeEfectivo: 3 })],
      CATALOGO,
      'u1'
    );
    const [opcionalSinMarcas] = filasDeRegistro(
      [estado({ tipoPuntaje: TipoPuntaje.OPCIONAL, topeEfectivo: 3 })],
      CATALOGO,
      'u1'
    );

    expect(obligatoria.puedeNoHizo).toBe(true);
    expect(obligatoria.puedeQuitar).toBe(false);
    expect(opcional.puedeNoHizo).toBe(false);
    expect(opcional.puedeQuitar).toBe(true);
    expect(opcionalSinMarcas.puedeQuitar).toBe(false);
  });

  /**
   * fase-14-15: las de equipo se ven en la lista pero las marca el jefe desde
   * «Mi equipo» — por esta vía el backend responde 400 ES_TAREA_DE_EQUIPO. El
   * Tutor ve la misma lista que el integrante, así que hereda la restricción.
   */
  it('una tarea de equipo se ve, dice por qué, y no ofrece ninguna acción', () => {
    const conEquipo = [
      { id: 'a1', nombre: 'Ordenar el living', alcance: AlcanceActividad.EQUIPO },
    ] as ActividadDto[];

    const [fila] = filasDeRegistro(
      [estado({ tipoPuntaje: TipoPuntaje.OPCIONAL, vecesHechas: 1, topeEfectivo: 3 })],
      conEquipo,
      'u1'
    );

    // Se ve: no se filtra, porque el integrante también la ve.
    expect(fila.nombre).toBe('Ordenar el living');
    expect(fila.motivoBloqueo).toBe('La marca el jefe del equipo');
    expect(fila.puedeCompletar).toBe(false);
    expect(fila.puedeNoHizo).toBe(false);
    // Ya marcada, pero se anula por su propio camino (#13), no desde acá.
    expect(fila.puedeQuitar).toBe(false);
  });
});

describe('textoDeRepeticiones', () => {
  it('no dice nada en las de una sola vez', () => {
    const [fila] = filasDeRegistro([estado()], CATALOGO, 'u1');

    expect(textoDeRepeticiones(fila)).toBe('');
  });

  it('en las repetibles muestra cuántas van', () => {
    const [fila] = filasDeRegistro(
      [estado({ tipoPuntaje: TipoPuntaje.OPCIONAL, vecesHechas: 2, topeEfectivo: 3 })],
      CATALOGO,
      'u1'
    );

    expect(textoDeRepeticiones(fila)).toBe('2 de 3');
  });
});
