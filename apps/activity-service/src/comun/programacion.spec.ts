import { describe, expect, it } from 'vitest';

import {
  diaSemanaEnTimezone,
  esFechaCivilValida,
  estaDisponibleEn,
  fechaCivilEnTimezone,
  motivoNoDisponible,
  tieneProgramacion,
  vigenciaVencidaEn,
} from './programacion';

// America/La_Paz = UTC-4 fijo (sin DST), igual que en deadline.spec.ts.
// 2026-07-13T04:00:00Z es lunes 00:00 local.
const LA_PAZ = 'America/La_Paz';
const LUNES = 1;
const MARTES = 2;
const VIERNES = 5;
const DOMINGO = 0;

describe('diaSemanaEnTimezone', () => {
  it('usa la convención del proyecto: 0 = domingo … 6 = sábado', () => {
    // Domingo 12/07/2026 12:00 local.
    expect(diaSemanaEnTimezone(new Date('2026-07-12T16:00:00Z'), LA_PAZ)).toBe(DOMINGO);
    // Lunes 13/07/2026 00:00 local.
    expect(diaSemanaEnTimezone(new Date('2026-07-13T04:00:00Z'), LA_PAZ)).toBe(LUNES);
    // Sábado 18/07/2026 12:00 local.
    expect(diaSemanaEnTimezone(new Date('2026-07-18T16:00:00Z'), LA_PAZ)).toBe(6);
  });

  it('resuelve el día en la timezone del Grupo, no en UTC', () => {
    // Martes 02:00 UTC = lunes 22:00 en La Paz: para el Grupo es LUNES.
    const instante = new Date('2026-07-14T02:00:00Z');

    expect(diaSemanaEnTimezone(instante, 'UTC')).toBe(MARTES);
    expect(diaSemanaEnTimezone(instante, LA_PAZ)).toBe(LUNES);
  });
});

describe('estaDisponibleEn', () => {
  const lunes = new Date('2026-07-13T04:00:00Z'); // lunes 00:00 La Paz
  const martes = new Date('2026-07-14T04:00:00Z'); // martes 00:00 La Paz

  it('sin días configurados está disponible siempre (default retro-compatible)', () => {
    expect(estaDisponibleEn({ diasSemana: [] }, lunes, LA_PAZ)).toBe(true);
    expect(estaDisponibleEn({ diasSemana: [] }, martes, LA_PAZ)).toBe(true);
  });

  it('con días configurados solo está disponible en esos días', () => {
    expect(estaDisponibleEn({ diasSemana: [MARTES, VIERNES] }, martes, LA_PAZ)).toBe(true);
    expect(estaDisponibleEn({ diasSemana: [MARTES, VIERNES] }, lunes, LA_PAZ)).toBe(false);
  });

  it('la sesión que arranca lunes 22:00 local cuenta como LUNES (no como el martes UTC)', () => {
    const lunesDeNoche = new Date('2026-07-14T02:00:00Z');

    expect(estaDisponibleEn({ diasSemana: [LUNES] }, lunesDeNoche, LA_PAZ)).toBe(true);
    expect(estaDisponibleEn({ diasSemana: [MARTES] }, lunesDeNoche, LA_PAZ)).toBe(false);
  });

  it('los 7 días configurados equivale a sin restricción', () => {
    const todos = [0, 1, 2, 3, 4, 5, 6];

    expect(estaDisponibleEn({ diasSemana: todos }, lunes, LA_PAZ)).toBe(true);
    expect(estaDisponibleEn({ diasSemana: todos }, martes, LA_PAZ)).toBe(true);
  });
});

// --- Vigencia por fechas (fase-14-24) ---

describe('fechaCivilEnTimezone', () => {
  it('da la fecha del GRUPO, no la del servidor', () => {
    expect(fechaCivilEnTimezone(new Date('2026-07-13T04:00:00Z'), LA_PAZ)).toBe('2026-07-13');
    // 2026-07-14T02:00Z es lunes 13 a las 22:00 en La Paz: el día NO es el 14.
    expect(fechaCivilEnTimezone(new Date('2026-07-14T02:00:00Z'), LA_PAZ)).toBe('2026-07-13');
    expect(fechaCivilEnTimezone(new Date('2026-07-14T02:00:00Z'), 'UTC')).toBe('2026-07-14');
  });

  it('cruza bien el fin de año', () => {
    expect(fechaCivilEnTimezone(new Date('2027-01-01T02:00:00Z'), LA_PAZ)).toBe('2026-12-31');
  });
});

describe('estaDisponibleEn — vigencia', () => {
  const navidad = new Date('2026-12-24T16:00:00Z'); // 24/12 12:00 La Paz
  const dia23 = new Date('2026-12-23T16:00:00Z');
  const dia25 = new Date('2026-12-25T16:00:00Z');

  it('sin fechas está disponible siempre (default retro-compatible)', () => {
    expect(estaDisponibleEn({ diasSemana: [] }, navidad, LA_PAZ)).toBe(true);
  });

  it('desde = hasta es «solo ese día», el caso que José pidió por nombre', () => {
    const soloNavidad = {
      diasSemana: [],
      vigenteDesde: '2026-12-24',
      vigenteHasta: '2026-12-24',
    };

    expect(estaDisponibleEn(soloNavidad, navidad, LA_PAZ)).toBe(true);
    expect(estaDisponibleEn(soloNavidad, dia23, LA_PAZ)).toBe(false);
    expect(estaDisponibleEn(soloNavidad, dia25, LA_PAZ)).toBe(false);
  });

  it('solo «desde»: arranca ese día y sigue', () => {
    const desde = { diasSemana: [], vigenteDesde: '2026-12-24' };

    expect(estaDisponibleEn(desde, dia23, LA_PAZ)).toBe(false);
    expect(estaDisponibleEn(desde, navidad, LA_PAZ)).toBe(true);
    expect(estaDisponibleEn(desde, dia25, LA_PAZ)).toBe(true);
  });

  it('solo «hasta»: vence ese día, inclusive', () => {
    const hasta = { diasSemana: [], vigenteHasta: '2026-12-24' };

    expect(estaDisponibleEn(hasta, dia23, LA_PAZ)).toBe(true);
    expect(estaDisponibleEn(hasta, navidad, LA_PAZ)).toBe(true);
    expect(estaDisponibleEn(hasta, dia25, LA_PAZ)).toBe(false);
  });

  it('la vigencia se evalúa en la TIMEZONE DEL GRUPO, no en UTC', () => {
    // Sesión que arranca el 30/03 a las 22:00 en La Paz = 31/03 02:00 UTC.
    const treintaDeNoche = new Date('2026-03-31T02:00:00Z');
    const hastaEl30 = { diasSemana: [], vigenteHasta: '2026-03-30' };

    expect(estaDisponibleEn(hastaEl30, treintaDeNoche, LA_PAZ)).toBe(true);
    expect(estaDisponibleEn(hastaEl30, treintaDeNoche, 'UTC')).toBe(false);
  });
});

describe('estaDisponibleEn — el cruce de vigencia Y días (decisión 8)', () => {
  // Marzo 2026: el 2 es lunes, el 3 martes; el 6 de abril es lunes.
  const lunesDeMarzo = new Date('2026-03-02T16:00:00Z');
  const martesDeMarzo = new Date('2026-03-03T16:00:00Z');
  const lunesDeAbril = new Date('2026-04-06T16:00:00Z');

  const lunesYMiercolesDeMarzo = {
    diasSemana: [1, 3],
    vigenteDesde: '2026-03-01',
    vigenteHasta: '2026-03-30',
  };

  it('un lunes de marzo cumple las dos condiciones', () => {
    expect(estaDisponibleEn(lunesYMiercolesDeMarzo, lunesDeMarzo, LA_PAZ)).toBe(true);
  });

  it('un martes de marzo cumple la vigencia pero NO el día', () => {
    expect(estaDisponibleEn(lunesYMiercolesDeMarzo, martesDeMarzo, LA_PAZ)).toBe(false);
  });

  it('un lunes de abril cumple el día pero NO la vigencia', () => {
    expect(estaDisponibleEn(lunesYMiercolesDeMarzo, lunesDeAbril, LA_PAZ)).toBe(false);
  });
});

describe('motivoNoDisponible', () => {
  const lunesDeAbril = new Date('2026-04-06T16:00:00Z');
  const martesDeMarzo = new Date('2026-03-03T16:00:00Z');
  const programacion = { diasSemana: [1], vigenteHasta: '2026-03-30' };

  it('la vigencia gana sobre el día: el motivo más definitivo primero', () => {
    // Un lunes de abril cumple el día [1] pero está fuera del rango de marzo.
    expect(motivoNoDisponible(programacion, lunesDeAbril, LA_PAZ)).toBe('FUERA_DE_VIGENCIA');
  });

  it('dentro de la vigencia, el motivo es el día', () => {
    expect(motivoNoDisponible(programacion, martesDeMarzo, LA_PAZ)).toBe('OTRO_DIA');
  });

  it('null cuando corre', () => {
    expect(motivoNoDisponible({ diasSemana: [] }, martesDeMarzo, LA_PAZ)).toBeNull();
  });
});

describe('vigenciaVencidaEn — lo que se archiva vs. lo que hoy no toca', () => {
  const treintaYUno = new Date('2026-03-31T16:00:00Z');

  it('vencida: el «hasta» quedó atrás', () => {
    expect(vigenciaVencidaEn('2026-03-30', treintaYUno, LA_PAZ)).toBe(true);
  });

  it('NO vencida el mismo día del «hasta» (extremo inclusivo)', () => {
    expect(vigenciaVencidaEn('2026-03-31', treintaYUno, LA_PAZ)).toBe(false);
  });

  it('sin «hasta» nunca vence', () => {
    expect(vigenciaVencidaEn(null, treintaYUno, LA_PAZ)).toBe(false);
  });

  it('una actividad de los martes NO está vencida un lunes: son cosas distintas', () => {
    // Lo que hoy no toca vuelve mañana; lo vencido no vuelve. Es la razón de que
    // el archivado automático mire ESTO y no `estaDisponibleEn`.
    const lunes = new Date('2026-03-02T16:00:00Z');

    expect(estaDisponibleEn({ diasSemana: [2] }, lunes, LA_PAZ)).toBe(false);
    expect(vigenciaVencidaEn(null, lunes, LA_PAZ)).toBe(false);
  });
});

describe('tieneProgramacion — el gate que evita el cruce REST', () => {
  it('false sin días ni fechas: el caso de todo lo anterior al ítem', () => {
    expect(tieneProgramacion({ diasSemana: [] })).toBe(false);
    expect(
      tieneProgramacion({ diasSemana: [], vigenteDesde: null, vigenteHasta: null })
    ).toBe(false);
  });

  it('true con días, con desde, o con hasta', () => {
    expect(tieneProgramacion({ diasSemana: [2] })).toBe(true);
    expect(tieneProgramacion({ diasSemana: [], vigenteDesde: '2026-03-01' })).toBe(true);
    expect(tieneProgramacion({ diasSemana: [], vigenteHasta: '2026-03-30' })).toBe(true);
  });
});

describe('esFechaCivilValida', () => {
  it('acepta una fecha real', () => {
    expect(esFechaCivilValida('2026-12-24')).toBe(true);
    expect(esFechaCivilValida('2028-02-29')).toBe(true); // bisiesto
  });

  it('rechaza formatos y días que no existen', () => {
    expect(esFechaCivilValida('2026-2-4')).toBe(false);
    expect(esFechaCivilValida('24/12/2026')).toBe(false);
    // El caso que motiva no confiar en `new Date`: rueda al 2 de marzo.
    expect(esFechaCivilValida('2026-02-30')).toBe(false);
    expect(esFechaCivilValida('2026-13-01')).toBe(false);
  });
});
