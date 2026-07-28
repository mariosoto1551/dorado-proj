import { describe, expect, it } from 'vitest';

import { cronMatcheaMinuto, esCronValido, ocurrenciasEntre, proximaOcurrencia } from './cron';

// America/La_Paz = UTC-4 fijo (sin DST): 00:00 local = 04:00Z.
const TZ = 'America/La_Paz';

// Semana de referencia (julio 2026): lunes 13, martes 14, sábado 18, domingo 19, lunes 20.
const LUNES_0000 = new Date('2026-07-13T04:00:00Z');
const MARTES_0000 = new Date('2026-07-14T04:00:00Z');
const SABADO_0000 = new Date('2026-07-18T04:00:00Z');
const DOMINGO_0000 = new Date('2026-07-19T04:00:00Z');

describe('esCronValido', () => {
  it('acepta los crons de Destino:Dorado y un cron corto de prueba', () => {
    expect(esCronValido('0 0 * * 1-6')).toBe(true);
    expect(esCronValido('0 0 * * 1')).toBe(true);
    expect(esCronValido('*/2 * * * *')).toBe(true);
  });

  it('rechaza expresiones que no son cron de 5 campos', () => {
    expect(esCronValido('')).toBe(false);
    expect(esCronValido('cada lunes')).toBe(false);
    expect(esCronValido('* * * *')).toBe(false); // 4 campos
    expect(esCronValido('0 0 0 * * 1')).toBe(false); // 6 campos (con segundos)
    expect(esCronValido('61 * * * *')).toBe(false); // minuto fuera de rango
  });
});

describe('cronMatcheaMinuto — caso Destino:Dorado (spec fase-06, criterio de aceptación)', () => {
  // modo=AUTOMATICO, cronAperturaSesion="0 0 * * 1-6", sesionesPorSeccion=6,
  // cronAperturaSeccion="0 0 * * 1" — se testea la lógica de matching de cron,
  // no tiempo real transcurrido (spec).
  const CRON_SESION = '0 0 * * 1-6';
  const CRON_SECCION = '0 0 * * 1';

  it('el cron de sesión matchea lunes a sábado a las 00:00 hora del grupo', () => {
    expect(cronMatcheaMinuto(CRON_SESION, LUNES_0000, TZ)).toBe(true);
    expect(cronMatcheaMinuto(CRON_SESION, MARTES_0000, TZ)).toBe(true);
    expect(cronMatcheaMinuto(CRON_SESION, SABADO_0000, TZ)).toBe(true);
  });

  it('el cron de sesión NO matchea el domingo (día de evaluación)', () => {
    expect(cronMatcheaMinuto(CRON_SESION, DOMINGO_0000, TZ)).toBe(false);
  });

  it('el cron de sección matchea SOLO el lunes 00:00', () => {
    expect(cronMatcheaMinuto(CRON_SECCION, LUNES_0000, TZ)).toBe(true);
    expect(cronMatcheaMinuto(CRON_SECCION, MARTES_0000, TZ)).toBe(false);
    expect(cronMatcheaMinuto(CRON_SECCION, DOMINGO_0000, TZ)).toBe(false);
  });

  it('la comparación es en la timezone del grupo, no en UTC: 00:00Z NO es 00:00 en La Paz', () => {
    expect(cronMatcheaMinuto(CRON_SESION, new Date('2026-07-13T00:00:00Z'), TZ)).toBe(false);
    // 04:00Z del lunes sí es 00:00 local (ya cubierto arriba); una hora más
    // tarde ya no matchea.
    expect(cronMatcheaMinuto(CRON_SESION, new Date('2026-07-13T05:00:00Z'), TZ)).toBe(false);
  });

  it('matchea por igualdad de minuto sin importar el segundo del tick', () => {
    expect(cronMatcheaMinuto(CRON_SESION, new Date('2026-07-13T04:00:37Z'), TZ)).toBe(true);
    expect(cronMatcheaMinuto(CRON_SESION, new Date('2026-07-13T04:00:59.999Z'), TZ)).toBe(true);
    expect(cronMatcheaMinuto(CRON_SESION, new Date('2026-07-13T04:01:00Z'), TZ)).toBe(false);
  });
});

describe('cronMatcheaMinuto — cron corto de prueba (E2E del modo automático)', () => {
  it('"*/2 * * * *" matchea los minutos pares y no los impares', () => {
    expect(cronMatcheaMinuto('*/2 * * * *', new Date('2026-07-16T10:02:15Z'), TZ)).toBe(true);
    expect(cronMatcheaMinuto('*/2 * * * *', new Date('2026-07-16T10:03:15Z'), TZ)).toBe(false);
  });

  it('una expresión inválida nunca matchea (el guard de validación está en el PUT)', () => {
    expect(cronMatcheaMinuto('no-es-cron', LUNES_0000, TZ)).toBe(false);
  });
});

describe('ocurrenciasEntre (base del scheduler con recuperación, fase-14-16)', () => {
  const CRON_SESION = '0 0 * * 1-6';

  it('devuelve las aperturas de sesión perdidas durante un corte de tres días, en orden', () => {
    const desde = new Date('2026-07-13T04:01:00Z'); // lunes 00:01, ya pasado el cron
    const hasta = new Date('2026-07-16T04:05:00Z'); // jueves 00:05

    expect(ocurrenciasEntre(CRON_SESION, desde, hasta, TZ, 500).map((d) => d.toISOString())).toEqual([
      '2026-07-14T04:00:00.000Z',
      '2026-07-15T04:00:00.000Z',
      '2026-07-16T04:00:00.000Z',
    ]);
  });

  it('la ventana es abierta en `desde` y cerrada en `hasta` — ventanas consecutivas no se solapan ni dejan huecos', () => {
    // El instante exacto del cron pertenece a la ventana que lo cierra…
    expect(ocurrenciasEntre(CRON_SESION, new Date('2026-07-13T04:00:00Z'), MARTES_0000, TZ, 500))
      .toHaveLength(1);
    // …y no a la siguiente, que lo tiene como extremo abierto.
    expect(ocurrenciasEntre(CRON_SESION, MARTES_0000, new Date('2026-07-14T23:59:00Z'), TZ, 500))
      .toHaveLength(0);
  });

  it('un corte que no cruza ningún cron no devuelve nada', () => {
    const desde = new Date('2026-07-14T10:00:00Z');
    const hasta = new Date('2026-07-14T20:00:00Z');

    expect(ocurrenciasEntre(CRON_SESION, desde, hasta, TZ, 500)).toEqual([]);
  });

  it('corta en el máximo pedido (techo de trabajo por tick)', () => {
    const desde = new Date('2026-07-13T04:00:00Z');
    const hasta = new Date('2026-07-13T10:00:00Z');

    expect(ocurrenciasEntre('* * * * *', desde, hasta, TZ, 10)).toHaveLength(10);
  });

  it('ventana vacía o invertida devuelve []', () => {
    expect(ocurrenciasEntre(CRON_SESION, MARTES_0000, MARTES_0000, TZ, 500)).toEqual([]);
    expect(ocurrenciasEntre(CRON_SESION, DOMINGO_0000, LUNES_0000, TZ, 500)).toEqual([]);
  });

  it('una expresión inválida devuelve [] (el guard duro está en el PUT)', () => {
    expect(ocurrenciasEntre('no-es-cron', LUNES_0000, DOMINGO_0000, TZ, 500)).toEqual([]);
  });
});

describe('proximaOcurrencia (base del cálculo de extender)', () => {
  it('desde el lunes 00:00:30 local, la próxima apertura de sesión es el martes 00:00 local', () => {
    const desde = new Date('2026-07-13T04:00:30Z');

    expect(proximaOcurrencia('0 0 * * 1-6', desde, TZ)?.toISOString()).toBe(
      '2026-07-14T04:00:00.000Z'
    );
  });

  it('desde el sábado 00:00:30 local, la próxima apertura de sesión salta el domingo y cae el lunes', () => {
    const desde = new Date('2026-07-18T04:00:30Z');

    expect(proximaOcurrencia('0 0 * * 1-6', desde, TZ)?.toISOString()).toBe(
      '2026-07-20T04:00:00.000Z'
    );
  });

  it('devuelve null si la expresión es inválida', () => {
    expect(proximaOcurrencia('no-es-cron', LUNES_0000, TZ)).toBeNull();
  });
});
