import { describe, expect, it } from 'vitest';

import type { RolGrupoDto } from '@dorado/shared-types';

import { sinIntegrantesConEsosRoles } from './roles-grupo';

function rol(id: string, cantidadAsignados: number): RolGrupoDto {
  return {
    id,
    grupoId: 'grupo-1',
    nombre: id,
    colorHex: '#22C55E',
    estado: 'ACTIVO',
    cantidadAsignados,
    createdAt: '2026-07-31T10:00:00.000Z',
  };
}

describe('sinIntegrantesConEsosRoles (fase-14-19)', () => {
  it('una actividad sin restricción nunca dispara el aviso', () => {
    expect(sinIntegrantesConEsosRoles([], [rol('cocina', 0)])).toBe(false);
  });

  it('avisa cuando ninguno de sus roles tiene integrantes', () => {
    expect(sinIntegrantesConEsosRoles(['cocina'], [rol('cocina', 0)])).toBe(true);
  });

  it('no avisa si alguno de sus roles tiene integrantes', () => {
    const roles = [rol('cocina', 0), rol('limpieza', 2)];

    expect(sinIntegrantesConEsosRoles(['cocina', 'limpieza'], roles)).toBe(false);
  });

  it('un rol archivado (ausente del catálogo activo) cuenta como sin nadie', () => {
    expect(sinIntegrantesConEsosRoles(['archivado'], [rol('cocina', 3)])).toBe(true);
  });

  it('sin catálogo cargado no afirma nada — un aviso falso es peor que ninguno', () => {
    expect(sinIntegrantesConEsosRoles(['cocina'], [])).toBe(false);
  });
});
