import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { GrupoDto, TenantContext } from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import { AccesoGrupoService } from './acceso-grupo.service';

const GRUPO_PROPIO: GrupoDto = {
  id: 'grupo-1',
  organizacionId: 'org-1',
  nombre: 'Grupo Uno',
  timezone: 'America/La_Paz',
  createdAt: new Date().toISOString(),
};

function tenantDePrueba(sobrescribir: Partial<TenantContext> = {}): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'TUTOR',
    principalId: 'tutor-1',
    principalType: 'TUTOR',
    ...sobrescribir,
  } as TenantContext;
}

function crearServicio(grupoDeIdentity: GrupoDto | null = GRUPO_PROPIO) {
  const obtenerGrupo = vi.fn().mockResolvedValue(grupoDeIdentity);
  const identity = { obtenerGrupo } as unknown as IdentityClientService;

  return { servicio: new AccesoGrupoService(identity), obtenerGrupo };
}

describe('AccesoGrupoService — escritura (POST sobre /grupos/:grupoId/*)', () => {
  it('TUTOR asignado al grupo pasa sin llamar a identity (el JWT alcanza)', async () => {
    const { servicio, obtenerGrupo } = crearServicio();

    await expect(
      servicio.asegurarAccesoEscritura(tenantDePrueba(), 'grupo-1')
    ).resolves.toBeUndefined();
    expect(obtenerGrupo).not.toHaveBeenCalled();
  });

  it('TUTOR no asignado al grupo recibe 403', async () => {
    const { servicio } = crearServicio();

    await expect(
      servicio.asegurarAccesoEscritura(tenantDePrueba(), 'grupo-ajeno')
    ).rejects.toThrow(ForbiddenException);
  });

  it('ORG_ADMIN pasa si identity confirma que el grupo es de su organización', async () => {
    const { servicio, obtenerGrupo } = crearServicio();
    const admin = tenantDePrueba({ rol: 'ORG_ADMIN', grupoIds: [] } as Partial<TenantContext>);

    await expect(
      servicio.asegurarAccesoEscritura(admin, 'grupo-1')
    ).resolves.toBeUndefined();
    expect(obtenerGrupo).toHaveBeenCalledWith('grupo-1');
  });

  it('ORG_ADMIN recibe 404 si el grupo es de OTRA organización (no revela existencia)', async () => {
    const { servicio } = crearServicio({ ...GRUPO_PROPIO, organizacionId: 'org-ajena' });
    const admin = tenantDePrueba({ rol: 'ORG_ADMIN', grupoIds: [] } as Partial<TenantContext>);

    await expect(servicio.asegurarAccesoEscritura(admin, 'grupo-1')).rejects.toThrow(
      NotFoundException
    );
  });

  it('ORG_ADMIN recibe 404 si el grupo no existe', async () => {
    const { servicio } = crearServicio(null);
    const admin = tenantDePrueba({ rol: 'ORG_ADMIN', grupoIds: [] } as Partial<TenantContext>);

    await expect(servicio.asegurarAccesoEscritura(admin, 'grupo-x')).rejects.toThrow(
      NotFoundException
    );
  });
});

describe('AccesoGrupoService — lectura (GET de listas)', () => {
  it('USUARIO de otro grupo recibe 403', () => {
    const { servicio } = crearServicio();
    const usuario = tenantDePrueba({
      rol: 'USUARIO',
      principalType: 'USUARIO',
    } as Partial<TenantContext>);

    expect(() => servicio.asegurarAccesoLectura(usuario, 'grupo-ajeno')).toThrow(
      ForbiddenException
    );
  });

  it('USUARIO de su propio grupo pasa', () => {
    const { servicio } = crearServicio();
    const usuario = tenantDePrueba({
      rol: 'USUARIO',
      principalType: 'USUARIO',
    } as Partial<TenantContext>);

    expect(() => servicio.asegurarAccesoLectura(usuario, 'grupo-1')).not.toThrow();
  });

  it('ORG_ADMIN (grupoIds vacío) pasa sin REST — el filtro de tenant de Prisma acota', () => {
    const { servicio, obtenerGrupo } = crearServicio();
    const admin = tenantDePrueba({ rol: 'ORG_ADMIN', grupoIds: [] } as Partial<TenantContext>);

    expect(() => servicio.asegurarAccesoLectura(admin, 'cualquier-grupo')).not.toThrow();
    expect(obtenerGrupo).not.toHaveBeenCalled();
  });
});
