import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { validarConjuntoUmbrales, zonaParaPuntaje, type RangoUmbral } from './zonas';

// Los umbrales default de Destino:Dorado (CLAUDE.md) como caso representativo:
// Rojo (más bajo, sin piso útil desde 0), Amarillo, Verde, Dorado sin tope.
const CUATRO_ZONAS: (RangoUmbral & { nombre: string })[] = [
  { nombre: 'Rojo', orden: 1, puntosMin: -1000, puntosMax: 49 },
  { nombre: 'Amarillo', orden: 2, puntosMin: 50, puntosMax: 99 },
  { nombre: 'Verde', orden: 3, puntosMin: 100, puntosMax: 149 },
  { nombre: 'Dorado', orden: 4, puntosMin: 150, puntosMax: null },
];

describe('zonaParaPuntaje — regla central 4.7', () => {
  it('matchea la zona cuyo rango contiene el puntaje', () => {
    expect(zonaParaPuntaje(CUATRO_ZONAS, 75)?.nombre).toBe('Amarillo');
  });

  it('puntosMin y puntosMax son inclusive en ambos extremos', () => {
    expect(zonaParaPuntaje(CUATRO_ZONAS, 50)?.nombre).toBe('Amarillo');
    expect(zonaParaPuntaje(CUATRO_ZONAS, 99)?.nombre).toBe('Amarillo');
    expect(zonaParaPuntaje(CUATRO_ZONAS, 100)?.nombre).toBe('Verde');
  });

  it('puntosMax null = sin tope (la zona más alta agarra cualquier exceso)', () => {
    expect(zonaParaPuntaje(CUATRO_ZONAS, 150)?.nombre).toBe('Dorado');
    expect(zonaParaPuntaje(CUATRO_ZONAS, 99999)?.nombre).toBe('Dorado');
  });

  it('un puntaje por debajo de la zona más baja no tiene zona (null)', () => {
    expect(zonaParaPuntaje(CUATRO_ZONAS, -2000)).toBeNull();
  });

  it('sin umbrales configurados devuelve null', () => {
    expect(zonaParaPuntaje([], 100)).toBeNull();
  });
});

describe('validarConjuntoUmbrales — invariantes del conjunto', () => {
  it('acepta el conjunto contiguo de 4 zonas', () => {
    expect(() => validarConjuntoUmbrales(CUATRO_ZONAS)).not.toThrow();
  });

  it('acepta una única zona (contigüidad trivial), con o sin tope', () => {
    expect(() =>
      validarConjuntoUmbrales([{ orden: 1, puntosMin: 0, puntosMax: null }])
    ).not.toThrow();
    expect(() =>
      validarConjuntoUmbrales([{ orden: 1, puntosMin: 0, puntosMax: 100 }])
    ).not.toThrow();
  });

  it('rechaza órdenes con huecos (1, 3)', () => {
    expect(() =>
      validarConjuntoUmbrales([
        { orden: 1, puntosMin: 0, puntosMax: 49 },
        { orden: 3, puntosMin: 50, puntosMax: null },
      ])
    ).toThrow(BadRequestException);
  });

  it('rechaza órdenes que no arrancan en 1', () => {
    expect(() =>
      validarConjuntoUmbrales([{ orden: 2, puntosMin: 0, puntosMax: null }])
    ).toThrow(BadRequestException);
  });

  it('rechaza rangos solapados (el siguiente arranca antes de que termine el anterior)', () => {
    expect(() =>
      validarConjuntoUmbrales([
        { orden: 1, puntosMin: 0, puntosMax: 50 },
        { orden: 2, puntosMin: 50, puntosMax: null },
      ])
    ).toThrow(BadRequestException);
  });

  it('rechaza huecos de puntos (49 → 60)', () => {
    expect(() =>
      validarConjuntoUmbrales([
        { orden: 1, puntosMin: 0, puntosMax: 49 },
        { orden: 2, puntosMin: 60, puntosMax: null },
      ])
    ).toThrow(BadRequestException);
  });

  it('rechaza puntosMax menor que puntosMin', () => {
    expect(() =>
      validarConjuntoUmbrales([{ orden: 1, puntosMin: 10, puntosMax: 5 }])
    ).toThrow(BadRequestException);
  });

  it('rechaza puntosMax null en una zona que no es la más alta', () => {
    expect(() =>
      validarConjuntoUmbrales([
        { orden: 1, puntosMin: 0, puntosMax: null },
        { orden: 2, puntosMin: 100, puntosMax: null },
      ])
    ).toThrow(BadRequestException);
  });
});
