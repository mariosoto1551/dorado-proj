import { describe, expect, it } from 'vitest';

import type { ActividadDto } from '@dorado/shared-types';

import { compararPrioridad } from './prioridad-actividades';

/** Actividad mínima con lo único que mira el comparador. */
function actividad(
  nombre: string,
  tipoPuntaje: 'OBLIGATORIA' | 'OPCIONAL',
  tipoLimiteTiempo: 'DEADLINE' | 'CRONOMETRO' | 'SIN_LIMITE',
  deadlineHora: string | null = null
): ActividadDto {
  return { nombre, tipoPuntaje, tipoLimiteTiempo, deadlineHora } as ActividadDto;
}

/**
 * Instante de vencimiento derivado de "HH:mm" sobre un día fijo. En una misma
 * Sesión todos los deadlines caen el mismo día, así que alcanza para el orden.
 */
function venceEn(item: ActividadDto): number {
  return item.deadlineHora
    ? Date.parse(`2026-07-13T${item.deadlineHora}:00Z`)
    : Number.MAX_SAFE_INTEGER;
}

function ordenar(items: ActividadDto[]): string[] {
  return [...items]
    .sort((a, b) => compararPrioridad(a, b, venceEn))
    .map((item) => item.nombre);
}

describe('compararPrioridad — orden de la lista del integrante (fase-14-14)', () => {
  it('el criterio de aceptación completo: obligatorias arriba, hora límite adentro', () => {
    // Se pasan desordenadas a propósito.
    const items = [
      actividad('opcional sin límite', 'OPCIONAL', 'SIN_LIMITE'),
      actividad('obligatoria 20:00', 'OBLIGATORIA', 'DEADLINE', '20:00'),
      actividad('opcional cronómetro', 'OPCIONAL', 'CRONOMETRO'),
      actividad('obligatoria sin hora', 'OBLIGATORIA', 'SIN_LIMITE'),
      actividad('opcional 18:00', 'OPCIONAL', 'DEADLINE', '18:00'),
      actividad('obligatoria 14:00', 'OBLIGATORIA', 'DEADLINE', '14:00'),
    ];

    expect(ordenar(items)).toEqual([
      'obligatoria 14:00',
      'obligatoria 20:00',
      'obligatoria sin hora',
      'opcional 18:00',
      'opcional cronómetro',
      'opcional sin límite',
    ]);
  });

  it('el tipo manda sobre la hora: una opcional que vence hoy va DEBAJO de una obligatoria sin hora', () => {
    const items = [
      actividad('opcional 18:00', 'OPCIONAL', 'DEADLINE', '18:00'),
      actividad('obligatoria sin hora', 'OBLIGATORIA', 'SIN_LIMITE'),
    ];

    expect(ordenar(items)).toEqual(['obligatoria sin hora', 'opcional 18:00']);
  });

  it('entre dos con hora límite, primero la que vence antes', () => {
    const items = [
      actividad('tarde', 'OPCIONAL', 'DEADLINE', '22:00'),
      actividad('temprano', 'OPCIONAL', 'DEADLINE', '07:30'),
    ];

    expect(ordenar(items)).toEqual(['temprano', 'tarde']);
  });

  it('el cronómetro va entre el deadline y el sin límite', () => {
    const items = [
      actividad('sin límite', 'OPCIONAL', 'SIN_LIMITE'),
      actividad('cronómetro', 'OPCIONAL', 'CRONOMETRO'),
      actividad('deadline', 'OPCIONAL', 'DEADLINE', '12:00'),
    ];

    expect(ordenar(items)).toEqual(['deadline', 'cronómetro', 'sin límite']);
  });

  it('empatadas conservan el orden de la API (sort estable, sin desempate artificial)', () => {
    const items = [
      actividad('primera', 'OPCIONAL', 'SIN_LIMITE'),
      actividad('segunda', 'OPCIONAL', 'SIN_LIMITE'),
      actividad('tercera', 'OPCIONAL', 'SIN_LIMITE'),
    ];

    expect(ordenar(items)).toEqual(['primera', 'segunda', 'tercera']);
  });

  it('las sin hora límite no se desordenan entre sí (el bug de Infinity − Infinity = NaN)', () => {
    // Con Infinity el comparador devolvería NaN y el orden sería impredecible.
    const items = [
      actividad('a', 'OPCIONAL', 'SIN_LIMITE'),
      actividad('b', 'OPCIONAL', 'SIN_LIMITE'),
      actividad('c', 'OPCIONAL', 'SIN_LIMITE'),
      actividad('d', 'OPCIONAL', 'SIN_LIMITE'),
    ];

    expect(ordenar(items)).toEqual(['a', 'b', 'c', 'd']);
    expect(compararPrioridad(items[0], items[1], venceEn)).toBe(0);
  });
});
