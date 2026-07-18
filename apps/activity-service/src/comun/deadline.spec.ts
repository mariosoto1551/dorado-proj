import { describe, expect, it } from 'vitest';

import { deadlineVencido } from './deadline';

// America/La_Paz = UTC-4 fijo (sin DST): 2026-07-13T04:00:00Z es lunes 00:00
// hora local — el arranque típico de una Sesión diaria de Destino:Dorado.
const TZ = 'America/La_Paz';
const INICIO_SESION = new Date('2026-07-13T04:00:00Z');

describe('deadlineVencido — hora límite del día de la Sesión, en tz del Grupo', () => {
  it('antes de la hora límite del mismo día NO está vencido', () => {
    // 17:59 local = 21:59Z
    expect(
      deadlineVencido(INICIO_SESION, '18:00', TZ, new Date('2026-07-13T21:59:00Z'))
    ).toBe(false);
  });

  it('la hora exacta del deadline todavía vale (vence recién DESPUÉS)', () => {
    expect(
      deadlineVencido(INICIO_SESION, '18:00', TZ, new Date('2026-07-13T22:00:00Z'))
    ).toBe(false);
  });

  it('un minuto después de la hora límite está vencido', () => {
    expect(
      deadlineVencido(INICIO_SESION, '18:00', TZ, new Date('2026-07-13T22:01:00Z'))
    ).toBe(true);
  });

  it('cualquier día posterior al del inicio de la Sesión está vencido (la sesión quedó abierta de más)', () => {
    // Martes 09:00 local, deadline era lunes 18:00.
    expect(
      deadlineVencido(INICIO_SESION, '18:00', TZ, new Date('2026-07-14T13:00:00Z'))
    ).toBe(true);
  });

  it('compara en la timezone del Grupo, no en UTC: 20:00Z del lunes sigue siendo lunes 16:00 local', () => {
    // En UTC ya es 20:00 (> 18:00), pero en La Paz son las 16:00 — no venció.
    expect(
      deadlineVencido(INICIO_SESION, '18:00', TZ, new Date('2026-07-13T20:00:00Z'))
    ).toBe(false);
  });

  it('el día local puede diferir del día UTC: sesión que arranca lunes 22:00 local (martes 02:00Z)', () => {
    const inicioLunesNoche = new Date('2026-07-14T02:00:00Z'); // lunes 22:00 La Paz

    // Lunes 23:00 local (martes 03:00Z), deadline 23:30 del lunes: no venció.
    expect(
      deadlineVencido(inicioLunesNoche, '23:30', TZ, new Date('2026-07-14T03:00:00Z'))
    ).toBe(false);
    // Martes 00:10 local: día posterior — venció.
    expect(
      deadlineVencido(inicioLunesNoche, '23:30', TZ, new Date('2026-07-14T04:10:00Z'))
    ).toBe(true);
  });
});
