import { describe, expect, it } from 'vitest';

import type { UsuarioDto } from '@dorado/shared-types';

import { soloActivos } from './usuarios';

function usuario(id: string, estado: 'ACTIVO' | 'INACTIVO'): UsuarioDto {
  return {
    id,
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    username: id,
    nombre: id,
    avatarId: 'avatar-1',
    estado,
    createdAt: '2026-08-03T10:00:00.000Z',
  };
}

describe('soloActivos', () => {
  it('deja afuera a los dados de baja', () => {
    const padron = [usuario('ana', 'ACTIVO'), usuario('luis', 'INACTIVO')];

    expect(soloActivos(padron).map((u) => u.id)).toEqual(['ana']);
  });

  it('conserva el orden del padrón — la lista del Tutor es por antigüedad', () => {
    const padron = [
      usuario('ana', 'ACTIVO'),
      usuario('luis', 'INACTIVO'),
      usuario('sol', 'ACTIVO'),
    ];

    expect(soloActivos(padron).map((u) => u.id)).toEqual(['ana', 'sol']);
  });

  it('no muta el padrón que recibe', () => {
    const padron = [usuario('ana', 'ACTIVO'), usuario('luis', 'INACTIVO')];

    soloActivos(padron);

    expect(padron).toHaveLength(2);
  });

  it('un grupo entero dado de baja no ofrece a nadie', () => {
    expect(soloActivos([usuario('ana', 'INACTIVO')])).toEqual([]);
  });
});
