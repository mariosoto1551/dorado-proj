import { describe, expect, it } from 'vitest';

import type { MiEstadoActividadHoyDto } from '@dorado/shared-types';

import {
  sePuedeQuitarDelPlan,
  seMuestraEnLaLista,
  seOfreceParaElegir,
} from './plan-del-dia';

/** Estado del servidor con lo único que miran las tres reglas. */
function estado(sobrescribir: Partial<MiEstadoActividadHoyDto> = {}): MiEstadoActividadHoyDto {
  return {
    requiereSeleccion: true,
    enPlan: false,
    disponibleHoy: true,
    vecesHechas: 0,
    vecesPerdidas: 0,
    ...sobrescribir,
  } as MiEstadoActividadHoyDto;
}

describe('plan del día — qué se ve en la lista (fase-14-17)', () => {
  it('con el modo apagado el servidor manda enPlan=true, así que se ve todo', () => {
    expect(seMuestraEnLaLista(estado({ requiereSeleccion: false, enPlan: true }))).toBe(true);
  });

  it('una opcional que requiere selección y no está elegida no se muestra', () => {
    expect(seMuestraEnLaLista(estado())).toBe(false);
  });

  it('elegida, se muestra', () => {
    expect(seMuestraEnLaLista(estado({ enPlan: true }))).toBe(true);
  });

  it('sin estado cargado se MUESTRA: esconder por un dato que no llegó es peor', () => {
    expect(seMuestraEnLaLista(undefined)).toBe(true);
  });
});

describe('plan del día — qué se ofrece en la hoja «Elegir» (fase-14-17)', () => {
  it('ofrece lo que el plan esconde y todavía no se eligió', () => {
    expect(seOfreceParaElegir(estado())).toBe(true);
  });

  it('no ofrece lo ya elegido ni lo que nunca se esconde', () => {
    expect(seOfreceParaElegir(estado({ enPlan: true }))).toBe(false);
    expect(seOfreceParaElegir(estado({ requiereSeleccion: false, enPlan: true }))).toBe(false);
  });

  it('no ofrece una actividad programada para otro día (fase-14-11)', () => {
    expect(seOfreceParaElegir(estado({ disponibleHoy: false }))).toBe(false);
  });
});

describe('plan del día — cuándo se puede sacar del plan (fase-14-17)', () => {
  it('se puede sacar lo elegido y no empezado', () => {
    expect(sePuedeQuitarDelPlan(estado({ enPlan: true }), false)).toBe(true);
  });

  it('no se puede si ya la hizo, si el tutor le quemó un intento o si el cronómetro corre', () => {
    expect(sePuedeQuitarDelPlan(estado({ enPlan: true, vecesHechas: 1 }), false)).toBe(false);
    expect(sePuedeQuitarDelPlan(estado({ enPlan: true, vecesPerdidas: 1 }), false)).toBe(false);
    expect(sePuedeQuitarDelPlan(estado({ enPlan: true }), true)).toBe(false);
  });

  it('nunca se ofrece quitar algo que no se eligió (obligatorias, equipo, «Mis metas»)', () => {
    expect(sePuedeQuitarDelPlan(estado({ requiereSeleccion: false, enPlan: true }), false)).toBe(
      false
    );
  });
});
