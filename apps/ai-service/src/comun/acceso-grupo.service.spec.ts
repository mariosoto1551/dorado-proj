import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { GrupoDto, PrincipalType, Rol, TenantContext } from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import { AccesoGrupoService } from './acceso-grupo.service';

function tenant(rol: Rol, grupoIds: string[], organizacionId = 'org-1'): TenantContext {
  return {
    organizacionId,
    grupoIds,
    rol,
    principalId: 'tutor-1',
    principalType: PrincipalType.TUTOR,
  };
}

function crearServicio(grupo: GrupoDto | null) {
  const identity = { grupo: vi.fn(async () => grupo) } as unknown as IdentityClientService;

  return { identity, servicio: new AccesoGrupoService(identity) };
}

const GRUPO_PROPIO = { id: 'grupo-1', organizacionId: 'org-1' } as GrupoDto;

const GRUPO_AJENO = { id: 'grupo-b', organizacionId: 'org-2' } as GrupoDto;

describe('AccesoGrupoService', () => {
  describe('TUTOR', () => {
    it('deja leer un grupo que está en su JWT, sin salir a la red', async () => {
      const { servicio, identity } = crearServicio(GRUPO_PROPIO);

      const contexto = await servicio.contextoPara(tenant(Rol.TUTOR, ['grupo-1']), 'grupo-1');

      expect(contexto).toEqual({ organizacionId: 'org-1', grupoId: 'grupo-1' });
      expect(identity.grupo).not.toHaveBeenCalled();
    });

    it('rechaza un grupo que no está en su JWT', async () => {
      const { servicio } = crearServicio(GRUPO_PROPIO);

      await expect(
        servicio.contextoPara(tenant(Rol.TUTOR, ['grupo-1']), 'grupo-9')
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('ORG_ADMIN (grupoIds vacío por diseño)', () => {
    it('deja leer un grupo de su propia organización', async () => {
      const { servicio } = crearServicio(GRUPO_PROPIO);

      const contexto = await servicio.contextoPara(tenant(Rol.ORG_ADMIN, []), 'grupo-1');

      expect(contexto).toEqual({ organizacionId: 'org-1', grupoId: 'grupo-1' });
    });

    it('NO deja leer un grupo de otra organización (criterio de aceptación 4)', async () => {
      const { servicio } = crearServicio(GRUPO_AJENO);

      // Sin este chequeo el cross-tenant sería real: ai-service no tiene tablas
      // propias con estos datos, así que el filtro de Prisma no lo protege.
      // 404 y no 403: no se confirma que el grupo exista.
      await expect(
        servicio.contextoPara(tenant(Rol.ORG_ADMIN, []), 'grupo-b')
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('con identity caído no deja leer nada (fail-closed)', async () => {
      const { servicio } = crearServicio(null);

      await expect(
        servicio.contextoPara(tenant(Rol.ORG_ADMIN, []), 'grupo-1')
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
