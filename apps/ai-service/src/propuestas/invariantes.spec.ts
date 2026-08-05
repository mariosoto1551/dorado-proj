import { describe, expect, it } from 'vitest';

import { limpiarVacios, normalizarLimiteTiempo, violacionDeInvariantes } from './invariantes';

/**
 * Estos tests son la forma ejecutable de un bug que encontró la verificación
 * contra OpenAI real, no una hipótesis: el modelo armó cuatro actividades de
 * shape impecable, la propuesta se guardó, y **las cuatro fallaron con 400 al
 * aplicarlas** porque mandaba `deadlineHora` en actividades `SIN_LIMITE`.
 */
describe('limpiarVacios', () => {
  it('saca los strings vacíos: "" es la ausencia, no un valor', () => {
    // Misma trampa que se cobró media hora en la tanda 2 con OPENAI_API_KEY=.
    expect(limpiarVacios({ nombre: 'Tender', deadlineHora: '', vigenteDesde: '' }, true)).toEqual({
      nombre: 'Tender',
    });
  });

  it('saca los arrays vacíos: [] es "sin restricción", igual que no mandarlo', () => {
    // Si quedaran, el chequeo de «un solo modo de destinatario» contaría modos
    // que nadie usó y rechazaría propuestas correctas.
    expect(
      limpiarVacios({ nombre: 'x', rolesPermitidos: [], usuariosPermitidos: [] }, true)
    ).toEqual({ nombre: 'x' });
  });

  it('NO toca el 0 ni el false, que sí son valores', () => {
    expect(limpiarVacios({ bonoJefePuntos: 0, siempreVisible: false }, true)).toEqual({
      bonoJefePuntos: 0,
      siempreVisible: false,
    });
  });

  /**
   * El hallazgo que hizo falla la primera corrida real: **el modelo no puede
   * omitir una propiedad declarada**, así que su única forma de decir «no
   * aplica» es `null`. En un alta hay que entenderlo como ausencia.
   */
  it('en un ALTA, null es "no lo puse"', () => {
    expect(
      limpiarVacios({ nombre: 'x', deadlineHora: null, duracionCronometroMinutos: null }, true)
    ).toEqual({ nombre: 'x' });
  });

  /**
   * En un PATCH significa lo contrario: `null` BORRA el campo (fase-14-24, así
   * se quita una vigencia). Sacarlo perdería la única forma de expresarlo.
   */
  it('en un PATCH, null se conserva porque BORRA el campo', () => {
    expect(limpiarVacios({ vigenteHasta: null }, false)).toEqual({ vigenteHasta: null });
  });
});

describe('violacionDeInvariantes', () => {
  const base = {
    nombre: 'Tender la cama',
    tipoPuntaje: 'OPCIONAL' as const,
    valorPuntos: 5,
    tipoLimiteTiempo: 'SIN_LIMITE' as const,
  };

  /**
   * La regla del archivo: **se rechaza lo ambiguo, se normaliza lo
   * determinado.** Dos corridas reales terminaron con el modelo quemando las
   * ocho iteraciones del loop contra un invariante que el servidor podía
   * resolver solo, y la conversación terminó SIN propuesta — que para el Tutor
   * es peor que una propuesta con un campo de más.
   */
  describe('límite de tiempo (el que falló al aplicar)', () => {
    it('SIN_LIMITE con deadlineHora NO se rechaza: se limpia', () => {
      // Con SIN_LIMITE los dos campos son null y no hay otra lectura posible.
      // Pedirle al modelo que acierte algo derivable es hacerle hacer trabajo
      // que además hace mal, y pagarlo en tokens.
      expect(violacionDeInvariantes({ ...base, deadlineHora: '00:00' }, false)).toBeNull();
      expect(
        normalizarLimiteTiempo({ ...base, deadlineHora: '00:00', duracionCronometroMinutos: 1 })
      ).toEqual(base);
    });

    it('DEADLINE sin hora SÍ se rechaza: esa hora no se puede inventar', () => {
      expect(
        violacionDeInvariantes({ ...base, tipoLimiteTiempo: 'DEADLINE' }, false)
      ).toContain('deadlineHora');
    });

    it('DEADLINE conserva la hora y limpia los minutos', () => {
      const datos = {
        ...base,
        tipoLimiteTiempo: 'DEADLINE' as const,
        deadlineHora: '20:30',
        duracionCronometroMinutos: 1,
      };

      expect(violacionDeInvariantes(datos, false)).toBeNull();
      expect(normalizarLimiteTiempo(datos)).toEqual({
        ...base,
        tipoLimiteTiempo: 'DEADLINE',
        deadlineHora: '20:30',
      });
    });

    it('CRONOMETRO exige minutos y limpia la hora', () => {
      expect(
        violacionDeInvariantes({ ...base, tipoLimiteTiempo: 'CRONOMETRO' }, false)
      ).toContain('duracionCronometroMinutos');

      const datos = {
        ...base,
        tipoLimiteTiempo: 'CRONOMETRO' as const,
        duracionCronometroMinutos: 10,
        deadlineHora: '20:30',
      };

      expect(violacionDeInvariantes(datos, false)).toBeNull();
      expect(normalizarLimiteTiempo(datos).deadlineHora).toBeUndefined();
    });

    it('en un PATCH que no toca el tipo, no se limpia nada (lo define la fila)', () => {
      expect(normalizarLimiteTiempo({ valorPuntos: 8, deadlineHora: '10:00' })).toEqual({
        valorPuntos: 8,
        deadlineHora: '10:00',
      });
    });

    it('en un PATCH que no toca el tipo no se juzga: lo define la fila existente', () => {
      // Mismo criterio que el fase-14-24 con el destinatario: en un parcial, la
      // ambigüedad nace del cruce request+fila, y acá solo se ve el request.
      expect(violacionDeInvariantes({ valorPuntos: 8 }, true)).toBeNull();
    });

    it('en un POST sin tipoLimiteTiempo sí se reclama', () => {
      expect(violacionDeInvariantes({ nombre: 'x' }, false)).toContain('tipoLimiteTiempo');
    });
  });

  it('REQUIERE_CONFIRMACION en una OPCIONAL se rechaza', () => {
    expect(
      violacionDeInvariantes(
        { ...base, comportamientoAlCierre: 'REQUIERE_CONFIRMACION' },
        false
      )
    ).toContain('OBLIGATORIA');
  });

  it('una actividad de EQUIPO no puede ser OBLIGATORIA (no hay castigo colectivo)', () => {
    expect(
      violacionDeInvariantes({ ...base, tipoPuntaje: 'OBLIGATORIA', alcance: 'EQUIPO' }, false)
    ).toContain('OPCIONAL');
  });

  it('el mínimo de repeticiones no puede superar al máximo', () => {
    expect(
      violacionDeInvariantes(
        { ...base, repeticionesMinimasSesion: 5, repeticionesMaximasSesion: 3 },
        false
      )
    ).toContain('no puede superar');
  });

  describe('destinatario según alcance', () => {
    const equipoId = '33333333-3333-4333-8333-333333333333';

    it('equiposPermitidos sin alcance EQUIPO se rechaza', () => {
      expect(
        violacionDeInvariantes({ ...base, equiposPermitidos: [equipoId] }, false)
      ).toContain('alcance EQUIPO');
    });

    it('con alcance EQUIPO no se usan roles ni personas', () => {
      expect(
        violacionDeInvariantes({ ...base, alcance: 'EQUIPO', rolesPermitidos: [equipoId] }, false)
      ).toContain('equiposPermitidos');
    });
  });

  describe('vigencia', () => {
    it('rechaza una fecha con formato válido pero que no existe', () => {
      // El 30 de febrero pasa el regex y no pasa el calendario.
      expect(violacionDeInvariantes({ ...base, vigenteDesde: '2026-02-30' }, false)).toContain(
        'no es una fecha real'
      );
    });

    it('rechaza desde posterior a hasta', () => {
      expect(
        violacionDeInvariantes(
          { ...base, vigenteDesde: '2026-05-10', vigenteHasta: '2026-05-01' },
          false
        )
      ).toContain('posterior');
    });

    it('acepta un rango correcto', () => {
      expect(
        violacionDeInvariantes(
          { ...base, vigenteDesde: '2026-05-01', vigenteHasta: '2026-05-10' },
          false
        )
      ).toBeNull();
    });
  });

  it('una actividad normal no viola nada', () => {
    expect(violacionDeInvariantes(base, false)).toBeNull();
  });
});
