import { describe, expect, it } from 'vitest';

import { diaSemanaEnTimezone, estaDisponibleEn } from './programacion';

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
    expect(estaDisponibleEn([], lunes, LA_PAZ)).toBe(true);
    expect(estaDisponibleEn([], martes, LA_PAZ)).toBe(true);
  });

  it('con días configurados solo está disponible en esos días', () => {
    expect(estaDisponibleEn([MARTES, VIERNES], martes, LA_PAZ)).toBe(true);
    expect(estaDisponibleEn([MARTES, VIERNES], lunes, LA_PAZ)).toBe(false);
  });

  it('la sesión que arranca lunes 22:00 local cuenta como LUNES (no como el martes UTC)', () => {
    const lunesDeNoche = new Date('2026-07-14T02:00:00Z');

    expect(estaDisponibleEn([LUNES], lunesDeNoche, LA_PAZ)).toBe(true);
    expect(estaDisponibleEn([MARTES], lunesDeNoche, LA_PAZ)).toBe(false);
  });

  it('los 7 días configurados equivale a sin restricción', () => {
    const todos = [0, 1, 2, 3, 4, 5, 6];

    expect(estaDisponibleEn(todos, lunes, LA_PAZ)).toBe(true);
    expect(estaDisponibleEn(todos, martes, LA_PAZ)).toBe(true);
  });
});
