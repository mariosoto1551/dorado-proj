import { describe, expect, it, vi } from 'vitest';

import type { TenantContext } from '@dorado/shared-types';

import type { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  RolGrupoDuplicadoException,
  RolGrupoInexistenteException,
  RolGrupoNoEncontradoException,
  UsuarioNoEsDelGrupoException,
} from '../comun/excepciones';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { PrismaService } from '../prisma/prisma.service';
import { RolesGrupoService } from './roles-grupo.service';

const TENANT_TUTOR: TenantContext = {
  organizacionId: 'org-1',
  grupoIds: ['grupo-1'],
  rol: 'TUTOR',
  principalId: 'tutor-1',
  principalType: 'TUTOR',
} as TenantContext;

const TENANT_USUARIO: TenantContext = {
  organizacionId: 'org-1',
  grupoIds: ['grupo-1'],
  rol: 'USUARIO',
  principalId: 'usuario-1',
  principalType: 'USUARIO',
} as TenantContext;

function rolFila(sobreescribir: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rol-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    nombre: 'Cocina',
    colorHex: '#22C55E',
    estado: 'ACTIVO',
    createdAt: new Date('2026-07-31T10:00:00Z'),
    updatedAt: new Date('2026-07-31T10:00:00Z'),
    ...sobreescribir,
  };
}

interface OpcionesMock {
  rolesExistentes?: ReturnType<typeof rolFila>[];
  rolBuscado?: ReturnType<typeof rolFila> | null;
  membresia?: { id: string; usuarioId: string; grupoId: string; rolGrupoId: string | null } | null;
  asignados?: Array<{ rolGrupoId: string | null; _count: { _all: number } }>;
}

function crearMocks(opciones: OpcionesMock = {}) {
  const crearRol = vi.fn().mockResolvedValue(rolFila());
  const actualizarRol = vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve(rolFila(data))
  );
  const actualizarMembresias = vi.fn().mockResolvedValue({ count: 2 });
  const actualizarMembresia = vi.fn().mockResolvedValue({});

  const prisma = {
    client: {
      rolGrupo: {
        findMany: vi.fn().mockResolvedValue(opciones.rolesExistentes ?? []),
        findFirst: vi.fn().mockResolvedValue(opciones.rolBuscado ?? null),
        create: crearRol,
        update: actualizarRol,
      },
      usuarioGrupo: {
        findFirst: vi.fn().mockResolvedValue(opciones.membresia ?? null),
        findMany: vi.fn().mockResolvedValue([]),
        groupBy: vi.fn().mockResolvedValue(opciones.asignados ?? []),
        count: vi.fn().mockResolvedValue(0),
        update: actualizarMembresia,
        updateMany: actualizarMembresias,
      },
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            rolGrupo: { update: actualizarRol },
            usuarioGrupo: { updateMany: actualizarMembresias },
          })
        ),
    },
  } as unknown as PrismaService;

  const accesoGrupo = { asegurarAcceso: vi.fn() } as unknown as AccesoGrupoService;
  const eventos = {
    publicarAccionAdministrativa: vi.fn(),
  } as unknown as EventosPublisherService;

  return {
    servicio: new RolesGrupoService(prisma, accesoGrupo, eventos),
    crearRol,
    actualizarRol,
    actualizarMembresia,
    actualizarMembresias,
    accesoGrupo,
    eventos,
  };
}

async function capturar(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }

  return null;
}

describe('RolesGrupoService — catálogo (spec fase-14-19, Parte A)', () => {
  it('crea el rol normalizando nombre y color', async () => {
    const { servicio, crearRol } = crearMocks();

    await servicio.crear(TENANT_TUTOR, 'grupo-1', {
      nombre: '  Cocina  ',
      colorHex: '#22c55e',
    });

    expect(crearRol).toHaveBeenCalledWith({
      data: {
        organizacionId: 'org-1',
        grupoId: 'grupo-1',
        nombre: 'Cocina',
        colorHex: '#22C55E',
      },
    });
  });

  it('409 ROL_GRUPO_DUPLICADO ignorando mayúsculas y espacios', async () => {
    // El @@unique del schema no alcanza: Postgres distingue mayúsculas y
    // "Cocina"/"cocina" pasarían derecho.
    const { servicio, crearRol } = crearMocks({ rolesExistentes: [rolFila()] });

    const error = await capturar(() =>
      servicio.crear(TENANT_TUTOR, 'grupo-1', { nombre: ' cocina ', colorHex: '#EF4444' })
    );

    expect(error).toBeInstanceOf(RolGrupoDuplicadoException);
    expect(crearRol).not.toHaveBeenCalled();
  });

  it('el listado del Tutor trae cantidadAsignados por rol', async () => {
    const { servicio } = crearMocks({
      rolesExistentes: [rolFila(), rolFila({ id: 'rol-2', nombre: 'Limpieza' })],
      asignados: [{ rolGrupoId: 'rol-1', _count: { _all: 3 } }],
    });

    const roles = await servicio.listar(TENANT_TUTOR, 'grupo-1', false);

    expect(roles.map((rol) => rol.cantidadAsignados)).toEqual([3, 0]);
  });

  it('el listado del participante no expone cantidadAsignados', async () => {
    const { servicio } = crearMocks({
      rolesExistentes: [rolFila()],
      membresia: { id: 'ug-1', usuarioId: 'usuario-1', grupoId: 'grupo-1', rolGrupoId: null },
    });

    const roles = await servicio.listarParaParticipante(TENANT_USUARIO, 'grupo-1');

    expect(roles).toHaveLength(1);
    expect(roles[0].cantidadAsignados).toBeUndefined();
  });

  it('un participante de otro grupo no ve el catálogo (404)', async () => {
    const { servicio } = crearMocks({ membresia: null });

    const error = await capturar(() =>
      servicio.listarParaParticipante(TENANT_USUARIO, 'grupo-ajeno')
    );

    expect(error).toBeInstanceOf(UsuarioNoEsDelGrupoException);
  });

  it('404 ROL_GRUPO_NO_ENCONTRADO al actualizar un rol inexistente', async () => {
    const { servicio } = crearMocks({ rolBuscado: null });

    const error = await capturar(() =>
      servicio.actualizar(TENANT_TUTOR, 'rol-fantasma', { nombre: 'Otro' })
    );

    expect(error).toBeInstanceOf(RolGrupoNoEncontradoException);
  });
});

describe('RolesGrupoService — archivar (decisión 12)', () => {
  it('archivar desasigna a todos los participantes que lo tenían', async () => {
    const { servicio, actualizarMembresias } = crearMocks({ rolBuscado: rolFila() });

    const actualizado = await servicio.actualizar(TENANT_TUTOR, 'rol-1', {
      estado: 'INACTIVO',
    });

    expect(actualizarMembresias).toHaveBeenCalledWith({
      where: { grupoId: 'grupo-1', rolGrupoId: 'rol-1' },
      data: { rolGrupoId: null },
    });
    expect(actualizado.cantidadAsignados).toBe(0);
  });

  it('renombrar no desasigna a nadie', async () => {
    const { servicio, actualizarMembresias } = crearMocks({ rolBuscado: rolFila() });

    await servicio.actualizar(TENANT_TUTOR, 'rol-1', { nombre: 'Cocina y despensa' });

    expect(actualizarMembresias).not.toHaveBeenCalled();
  });

  it('archivar un rol ya archivado no vuelve a desasignar', async () => {
    const { servicio, actualizarMembresias } = crearMocks({
      rolBuscado: rolFila({ estado: 'INACTIVO' }),
    });

    await servicio.actualizar(TENANT_TUTOR, 'rol-1', { estado: 'INACTIVO' });

    expect(actualizarMembresias).not.toHaveBeenCalled();
  });
});

describe('RolesGrupoService — asignación (decisiones 2 y 15)', () => {
  it('asigna el rol al participante del grupo', async () => {
    const { servicio, actualizarMembresia } = crearMocks({
      membresia: { id: 'ug-1', usuarioId: 'usuario-1', grupoId: 'grupo-1', rolGrupoId: null },
      rolBuscado: rolFila(),
    });

    const rol = await servicio.asignar(TENANT_TUTOR, 'grupo-1', 'usuario-1', {
      rolGrupoId: 'rol-1',
    });

    expect(actualizarMembresia).toHaveBeenCalledWith({
      where: { id: 'ug-1' },
      data: { rolGrupoId: 'rol-1' },
    });
    expect(rol?.id).toBe('rol-1');
  });

  it('rolGrupoId null quita el rol y devuelve null', async () => {
    const { servicio, actualizarMembresia } = crearMocks({
      membresia: { id: 'ug-1', usuarioId: 'usuario-1', grupoId: 'grupo-1', rolGrupoId: 'rol-1' },
    });

    const rol = await servicio.asignar(TENANT_TUTOR, 'grupo-1', 'usuario-1', {
      rolGrupoId: null,
    });

    expect(actualizarMembresia).toHaveBeenCalledWith({
      where: { id: 'ug-1' },
      data: { rolGrupoId: null },
    });
    expect(rol).toBeNull();
  });

  it('404 USUARIO_NO_ES_DEL_GRUPO si no es miembro', async () => {
    const { servicio, actualizarMembresia } = crearMocks({ membresia: null });

    const error = await capturar(() =>
      servicio.asignar(TENANT_TUTOR, 'grupo-1', 'ajeno', { rolGrupoId: 'rol-1' })
    );

    expect(error).toBeInstanceOf(UsuarioNoEsDelGrupoException);
    expect(actualizarMembresia).not.toHaveBeenCalled();
  });

  it('400 ROL_GRUPO_INEXISTENTE con un rol de otro grupo o archivado', async () => {
    // El findFirst del service filtra por grupoId + estado ACTIVO: un rol de
    // otro grupo simplemente no aparece, y asignarlo sería cruzar tenants.
    const { servicio, actualizarMembresia } = crearMocks({
      membresia: { id: 'ug-1', usuarioId: 'usuario-1', grupoId: 'grupo-1', rolGrupoId: null },
      rolBuscado: null,
    });

    const error = await capturar(() =>
      servicio.asignar(TENANT_TUTOR, 'grupo-1', 'usuario-1', { rolGrupoId: 'rol-de-otro-grupo' })
    );

    expect(error).toBeInstanceOf(RolGrupoInexistenteException);
    expect(actualizarMembresia).not.toHaveBeenCalled();
  });

  it('registra la acción administrativa con el rol anterior', async () => {
    const { servicio, eventos } = crearMocks({
      membresia: { id: 'ug-1', usuarioId: 'usuario-1', grupoId: 'grupo-1', rolGrupoId: 'rol-0' },
      rolBuscado: rolFila(),
    });

    await servicio.asignar(TENANT_TUTOR, 'grupo-1', 'usuario-1', { rolGrupoId: 'rol-1' });

    expect(eventos.publicarAccionAdministrativa).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'ROL_PARTICIPANTE_ASIGNADO',
        entidadTipo: 'RolGrupo',
        detalle: { usuarioId: 'usuario-1', rolGrupoId: 'rol-1', rolAnteriorId: 'rol-0' },
      })
    );
  });
});
