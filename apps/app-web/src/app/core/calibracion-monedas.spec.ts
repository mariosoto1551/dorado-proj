import { describe, expect, it } from 'vitest';

import type { RendimientoAccionDto, RendimientoZonaDto } from '@dorado/shared-types';
import { AlcanceActividad, TipoAccionRendimiento } from '@dorado/shared-types';

import { calcularCalibracion } from './calibracion-monedas';

function accion(sobrescribir: Partial<RendimientoAccionDto> = {}): RendimientoAccionDto {
  return {
    tipoAccion: TipoAccionRendimiento.ACTIVIDAD,
    origenId: 'actividad-1',
    nombre: 'Tender la cama',
    valorPuntos: 10,
    tipoPuntaje: null,
    alcance: AlcanceActividad.INDIVIDUAL,
    comportamientoAlCierre: null,
    bonoJefePuntos: 0,
    repeticionesMaximasSesion: 1,
    monedas: 0,
    monedasBonoJefe: 0,
    puedeRendir: true,
    motivoNoRinde: null,
    ...sobrescribir,
  };
}

function zona(monedas: number | null): RendimientoZonaDto {
  return {
    umbralZonaId: `umbral-${monedas}`,
    nombreZona: 'Zona',
    orden: 1,
    colorHex: '#000000',
    monedas,
  };
}

describe('calcularCalibracion — el aviso de la decisión 18', () => {
  it('multiplica por las repeticiones: cada repetición paga (decisión 16)', () => {
    const calibracion = calcularCalibracion(
      [accion({ monedas: 2, repeticionesMaximasSesion: 3 })],
      [],
      7,
      []
    );

    // 2 🪙 × 3 repeticiones × 7 sesiones. Sin el ×3 el aviso subestimaría en
    // un factor 3 justo la actividad que más puede inflar la economía.
    expect(calibracion.porAcciones).toBe(42);
  });

  it('suma el bono del jefe: el número es un TECHO, no un promedio', () => {
    const calibracion = calcularCalibracion(
      [
        accion({
          monedas: 5,
          monedasBonoJefe: 2,
          alcance: AlcanceActividad.EQUIPO,
        }),
      ],
      [],
      1,
      []
    );

    expect(calibracion.porAcciones).toBe(7);
  });

  it('cuenta las conductas una vez por sesión: no tienen tope y el máximo sería infinito', () => {
    const calibracion = calcularCalibracion(
      [],
      [accion({ tipoAccion: TipoAccionRendimiento.CONDUCTA, monedas: 4 })],
      5,
      []
    );

    expect(calibracion.porAcciones).toBe(20);
  });

  it('ignora lo que NO puede rendir aunque tenga un número cargado', () => {
    // Una obligatoria ASUME_HECHA nunca se completa (decisión 15): contarla
    // haría que el aviso prometa monedas que nadie va a cobrar.
    const calibracion = calcularCalibracion(
      [
        accion({ monedas: 5 }),
        accion({ origenId: 'actividad-2', monedas: 100, puedeRendir: false }),
      ],
      [],
      1,
      []
    );

    expect(calibracion.porAcciones).toBe(5);
  });

  it('compara contra la zona MÁS ALTA: dos techos, no un techo y un promedio', () => {
    const calibracion = calcularCalibracion([], [], 1, [zona(-5), zona(12), zona(25)]);

    expect(calibracion.porZona).toBe(25);
  });

  it('una zona sin configurar no cuenta, y sin zonas el otro lado es 0', () => {
    expect(calcularCalibracion([], [], 1, [zona(null)]).porZona).toBe(0);
    expect(calcularCalibracion([], [], 1, []).porZona).toBe(0);
  });

  it('una zona negativa no arrastra el techo a negativo', () => {
    // El rendimiento por zona puede ser negativo (la multa de fase-14-22),
    // pero «el techo del otro camino» nunca lo es.
    expect(calcularCalibracion([], [], 1, [zona(-5)]).porZona).toBe(0);
  });

  it('con 0 sesiones configuradas cuenta 1: nunca divide ni anula el aviso', () => {
    const calibracion = calcularCalibracion([accion({ monedas: 3 })], [], 0, []);

    expect(calibracion.porAcciones).toBe(3);
  });

  it('sin nada cargado el aviso es 0 y no rompe', () => {
    expect(calcularCalibracion([], [], 7, [])).toEqual({ porAcciones: 0, porZona: 0 });
  });

  it('el caso completo del preview que aprobó José', () => {
    // 3🪙 × 2 reps + 5🪙 + 4🪙 = 15 por sesión, × 7 días = 105.
    const calibracion = calcularCalibracion(
      [
        accion({ monedas: 3, repeticionesMaximasSesion: 2 }),
        accion({ origenId: 'actividad-2', monedas: 5 }),
      ],
      [accion({ tipoAccion: TipoAccionRendimiento.CONDUCTA, monedas: 4 })],
      7,
      [zona(25)]
    );

    expect(calibracion).toEqual({ porAcciones: 105, porZona: 25 });
  });
});
