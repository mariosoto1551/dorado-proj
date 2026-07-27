import { describe, expect, it } from 'vitest';

import { deadlineVencido, instanteDeDeadline } from './deadline';

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

describe('instanteDeDeadline — instante absoluto para la cuenta regresiva (fase-14-14)', () => {
  it('resuelve la hora local del Grupo al instante UTC (La Paz = UTC−4)', () => {
    expect(instanteDeDeadline(INICIO_SESION, '14:00', TZ).toISOString()).toBe(
      '2026-07-13T18:00:00.000Z'
    );
  });

  it('usa el día de INICIO de la Sesión, no el día UTC de ese instante', () => {
    // La sesión arranca lunes 22:00 La Paz = martes 02:00Z. El deadline 23:30
    // es del LUNES local (martes 03:30Z), no del martes.
    const inicioLunesNoche = new Date('2026-07-14T02:00:00Z');

    expect(instanteDeDeadline(inicioLunesNoche, '23:30', TZ).toISOString()).toBe(
      '2026-07-14T03:30:00.000Z'
    );
  });

  it('es consistente con deadlineVencido: justo antes no venció, justo después sí', () => {
    const vence = instanteDeDeadline(INICIO_SESION, '18:00', TZ);
    const unMinutoAntes = new Date(vence.getTime() - 60_000);
    const unMinutoDespues = new Date(vence.getTime() + 60_000);

    expect(deadlineVencido(INICIO_SESION, '18:00', TZ, unMinutoAntes)).toBe(false);
    expect(deadlineVencido(INICIO_SESION, '18:00', TZ, unMinutoDespues)).toBe(true);
  });

  it('con horario de verano usa el offset REAL de esa fecha, no uno fijo', () => {
    // New York: EST (UTC−5) en enero, EDT (UTC−4) en julio. Si el cálculo usara
    // un offset fijo, uno de los dos saldría corrido una hora.
    const invierno = new Date('2026-01-15T13:00:00Z'); // 08:00 EST
    const verano = new Date('2026-07-15T12:00:00Z'); // 08:00 EDT

    expect(instanteDeDeadline(invierno, '14:00', 'America/New_York').toISOString()).toBe(
      '2026-01-15T19:00:00.000Z'
    );
    expect(instanteDeDeadline(verano, '14:00', 'America/New_York').toISOString()).toBe(
      '2026-07-15T18:00:00.000Z'
    );
  });

  it('el día del salto de DST resuelve la tarde con el offset ya cambiado', () => {
    // 2026-03-08: New York adelanta el reloj a las 02:00. Un deadline de las
    // 14:00 de ese día ya está en EDT (UTC−4) ⇒ 18:00Z, no 19:00Z.
    const domingoDelCambio = new Date('2026-03-08T10:00:00Z'); // 05:00 EDT

    expect(
      instanteDeDeadline(domingoDelCambio, '14:00', 'America/New_York').toISOString()
    ).toBe('2026-03-08T18:00:00.000Z');
  });

  it('medianoche y fin del día no se corren de día', () => {
    expect(instanteDeDeadline(INICIO_SESION, '00:00', TZ).toISOString()).toBe(
      '2026-07-13T04:00:00.000Z'
    );
    expect(instanteDeDeadline(INICIO_SESION, '23:59', TZ).toISOString()).toBe(
      '2026-07-14T03:59:00.000Z'
    );
  });
});
