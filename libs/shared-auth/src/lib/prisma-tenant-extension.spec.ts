import { describe, expect, it, vi } from 'vitest';

import { PrincipalType, Rol, TenantContext } from '@dorado/shared-types';

import { crearTenantExtension } from './prisma-tenant-extension';

function tenantDePrueba(grupoIds: string[]): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds,
    rol: grupoIds.length === 0 ? Rol.ORG_ADMIN : Rol.TUTOR,
    principalId: 'tutor-1',
    principalType: PrincipalType.TUTOR,
  };
}

interface ArgsCapturados {
  where?: Record<string, unknown>;
}

function ejecutarOperacion(params: {
  extension: ReturnType<typeof crearTenantExtension>;
  model: string;
  operation: string;
  args: Record<string, unknown>;
}): ArgsCapturados {
  let capturado: ArgsCapturados = {};
  const query = vi.fn((args: unknown) => {
    capturado = args as ArgsCapturados;
    return Promise.resolve(undefined);
  });

  params.extension.query.$allModels.$allOperations({
    model: params.model,
    operation: params.operation,
    args: params.args,
    query,
  });

  return capturado;
}

describe('crearTenantExtension', () => {
  it('agrega el filtro organizacionId a un findMany de un modelo tenant-scoped', () => {
    const extension = crearTenantExtension({
      modelos: { Usuario: { conGrupoId: true } },
      obtenerTenant: () => tenantDePrueba([]),
    });

    const args = ejecutarOperacion({ extension, model: 'Usuario', operation: 'findMany', args: {} });

    expect(args.where).toEqual({ organizacionId: 'org-1' });
  });

  it('agrega grupoId IN grupoIds cuando el modelo lo tiene y la lista no está vacía', () => {
    const extension = crearTenantExtension({
      modelos: { Usuario: { conGrupoId: true } },
      obtenerTenant: () => tenantDePrueba(['grupo-1', 'grupo-2']),
    });

    const args = ejecutarOperacion({
      extension,
      model: 'Usuario',
      operation: 'findMany',
      args: { where: { estado: 'ACTIVO' } },
    });

    expect(args.where).toEqual({
      AND: [
        { estado: 'ACTIVO' },
        { organizacionId: 'org-1', grupoId: { in: ['grupo-1', 'grupo-2'] } },
      ],
    });
  });

  it('NO filtra grupoId para un ORG_ADMIN (grupoIds vacío = toda la organización)', () => {
    const extension = crearTenantExtension({
      modelos: { Usuario: { conGrupoId: true } },
      obtenerTenant: () => tenantDePrueba([]),
    });

    const args = ejecutarOperacion({ extension, model: 'Usuario', operation: 'findMany', args: {} });

    expect(args.where).toEqual({ organizacionId: 'org-1' });
  });

  it('no toca modelos no declarados ni queries sin contexto de tenant', () => {
    const extension = crearTenantExtension({
      modelos: { Usuario: { conGrupoId: true } },
      obtenerTenant: () => undefined,
    });

    const sinTenant = ejecutarOperacion({
      extension,
      model: 'Usuario',
      operation: 'findMany',
      args: { where: { estado: 'ACTIVO' } },
    });

    expect(sinTenant.where).toEqual({ estado: 'ACTIVO' });

    const conTenant = crearTenantExtension({
      modelos: { Usuario: { conGrupoId: true } },
      obtenerTenant: () => tenantDePrueba([]),
    });

    const modeloAjeno = ejecutarOperacion({
      extension: conTenant,
      model: 'RefreshToken',
      operation: 'findMany',
      args: {},
    });

    expect(modeloAjeno.where).toBeUndefined();
  });
});
