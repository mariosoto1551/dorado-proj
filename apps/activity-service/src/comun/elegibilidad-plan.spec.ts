import { describe, expect, it } from 'vitest';

import { esElegibleParaElPlan, requiereSeleccionDelPlan } from './elegibilidad-plan';
import { actividadDePrueba } from './testing/bd-registro-en-memoria';

describe('elegibilidad para el plan del día (fase-14-17)', () => {
  it('una OPCIONAL individual del catálogo del tutor es lo único que el plan esconde', () => {
    expect(esElegibleParaElPlan(actividadDePrueba())).toBe(true);
  });

  it('no esconde obligatorias, tareas de equipo, contenido propio ni las fijadas por el tutor', () => {
    expect(esElegibleParaElPlan(actividadDePrueba({ tipoPuntaje: 'OBLIGATORIA' }))).toBe(false);
    expect(esElegibleParaElPlan(actividadDePrueba({ alcance: 'EQUIPO' }))).toBe(false);
    expect(esElegibleParaElPlan(actividadDePrueba({ origen: 'USUARIO' }))).toBe(false);
    expect(esElegibleParaElPlan(actividadDePrueba({ siempreVisible: true }))).toBe(false);
  });

  it('con el modo apagado NADA requiere selección — la garantía de retro-compatibilidad', () => {
    expect(requiereSeleccionDelPlan(actividadDePrueba(), false)).toBe(false);
    expect(requiereSeleccionDelPlan(actividadDePrueba(), true)).toBe(true);
  });
});
