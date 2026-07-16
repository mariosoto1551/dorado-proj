import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { TipoLimiteTiempo } from '../generated/prisma/enums';
import { validarCamposLimiteTiempo } from './limite-tiempo';

// Criterio de aceptación fase-05: validación de campos condicionales de
// tipoLimiteTiempo cubierta con tests — los 3 casos.
describe('validarCamposLimiteTiempo', () => {
  describe('DEADLINE', () => {
    it('acepta deadlineHora y normaliza duración a null', () => {
      expect(
        validarCamposLimiteTiempo(TipoLimiteTiempo.DEADLINE, '20:30', null)
      ).toEqual({ deadlineHora: '20:30', duracionCronometroMinutos: null });
    });

    it('rechaza si falta deadlineHora', () => {
      expect(() =>
        validarCamposLimiteTiempo(TipoLimiteTiempo.DEADLINE, null, null)
      ).toThrow(BadRequestException);
    });

    it('rechaza duracionCronometroMinutos presente', () => {
      expect(() =>
        validarCamposLimiteTiempo(TipoLimiteTiempo.DEADLINE, '20:30', 15)
      ).toThrow(BadRequestException);
    });
  });

  describe('CRONOMETRO', () => {
    it('acepta duración y normaliza deadlineHora a null', () => {
      expect(
        validarCamposLimiteTiempo(TipoLimiteTiempo.CRONOMETRO, null, 45)
      ).toEqual({ deadlineHora: null, duracionCronometroMinutos: 45 });
    });

    it('rechaza si falta duracionCronometroMinutos', () => {
      expect(() =>
        validarCamposLimiteTiempo(TipoLimiteTiempo.CRONOMETRO, null, null)
      ).toThrow(BadRequestException);
    });

    it('rechaza deadlineHora presente', () => {
      expect(() =>
        validarCamposLimiteTiempo(TipoLimiteTiempo.CRONOMETRO, '08:00', 45)
      ).toThrow(BadRequestException);
    });
  });

  describe('SIN_LIMITE', () => {
    it('acepta ambos campos en null', () => {
      expect(
        validarCamposLimiteTiempo(TipoLimiteTiempo.SIN_LIMITE, null, null)
      ).toEqual({ deadlineHora: null, duracionCronometroMinutos: null });
    });

    it('rechaza deadlineHora presente', () => {
      expect(() =>
        validarCamposLimiteTiempo(TipoLimiteTiempo.SIN_LIMITE, '20:30', null)
      ).toThrow(BadRequestException);
    });

    it('rechaza duracionCronometroMinutos presente', () => {
      expect(() =>
        validarCamposLimiteTiempo(TipoLimiteTiempo.SIN_LIMITE, null, 10)
      ).toThrow(BadRequestException);
    });
  });
});
