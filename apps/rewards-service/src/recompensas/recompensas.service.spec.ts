import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  TipoItemCatalogo,
  type TenantContext,
  type UmbralZonaDto,
} from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import type { ScoringClientService } from '../clientes/scoring-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  configuracionDePrueba,
  crearBdEnMemoria,
  recompensaDePrueba,
  type BdEnMemoria,
} from '../comun/testing/bd-en-memoria';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { RecompensasService } from './recompensas.service';

const UMBRAL_DORADO: UmbralZonaDto = {
  id: 'umbral-dorado',
  organizacionId: 'org-1',
  grupoId: 'grupo-1',
  nombreZona: 'Dorado',
  orden: 4,
  puntosMin: 150,
  puntosMax: null,
  colorHex: '#EAB308',
};

function tenantTutor(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'TUTOR',
    principalId: 'tutor-1',
    principalType: 'TUTOR',
  } as TenantContext;
}

function tenantUsuario(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'USUARIO',
    principalId: 'usuario-1',
    principalType: 'USUARIO',
  } as TenantContext;
}

function crearServicio(opciones: { bd?: BdEnMemoria; umbral?: UmbralZonaDto | null } = {}) {
  const bd = opciones.bd ?? crearBdEnMemoria();

  const scoring = {
    obtenerUmbral: vi
      .fn()
      .mockResolvedValue(opciones.umbral === undefined ? UMBRAL_DORADO : opciones.umbral),
    obtenerResultado: vi.fn(),
  } as unknown as ScoringClientService;

  const identity = { obtenerGrupo: vi.fn(), obtenerUsuario: vi.fn() } as unknown as IdentityClientService;
  const eventos = {
    publicar: vi.fn(),
    publicarAccionAdministrativa: vi.fn(),
  } as unknown as EventosPublisherService;

  const acceso = new AccesoGrupoService(identity);
  // Real, no mock: el modo por defecto (DIRECTO) es justamente lo que estos
  // tests tienen que seguir viendo después de fase-14-22.
  const configuracion = new ConfiguracionService(bd.prisma, acceso, eventos);

  return {
    servicio: new RecompensasService(bd.prisma, scoring, acceso, eventos, configuracion),
    bd,
  };
}

describe('RecompensasService — crear', () => {
  it('valida el umbral contra scoring y copia nombreZonaSnapshot', async () => {
    const { servicio, bd } = crearServicio();

    const recompensa = await servicio.crear(tenantTutor(), 'grupo-1', {
      umbralZonaId: 'umbral-dorado',
      nombre: 'Salida al cine',
      permiteSeleccion: true,
    });

    expect(recompensa).toMatchObject({
      umbralZonaId: 'umbral-dorado',
      nombreZonaSnapshot: 'Dorado',
      permiteSeleccion: true,
      permiteAzar: false,
      estado: 'ACTIVA',
    });
    expect(bd.recompensas).toHaveLength(1);
  });

  it('sin tipo explícito, el ítem nace PREMIO (retro-compatible, decisión 7)', async () => {
    const { servicio } = crearServicio();

    const recompensa = await servicio.crear(tenantTutor(), 'grupo-1', {
      umbralZonaId: 'umbral-dorado',
      nombre: 'Salida al cine',
    });

    expect(recompensa.tipo).toBe('PREMIO');
  });

  it('se puede crear un CASTIGO (decisión 7)', async () => {
    const { servicio } = crearServicio();

    const recompensa = await servicio.crear(tenantTutor(), 'grupo-1', {
      tipo: TipoItemCatalogo.CASTIGO,
      umbralZonaId: 'umbral-dorado',
      nombre: 'Sin postre',
    });

    expect(recompensa.tipo).toBe('CASTIGO');
  });

  it('en modo DIRECTO la zona es OBLIGATORIA (decisión 13)', async () => {
    const { servicio } = crearServicio();

    await expect(
      servicio.crear(tenantTutor(), 'grupo-1', { nombre: 'Sin zona' })
    ).rejects.toThrow(BadRequestException);
  });

  it('en modo TIENDA el ítem NO se ata a ninguna zona (decisión 13)', async () => {
    const bd = crearBdEnMemoria({
      configuraciones: [configuracionDePrueba({ modo: 'TIENDA' })],
    });
    const { servicio } = crearServicio({ bd });

    const recompensa = await servicio.crear(tenantTutor(), 'grupo-1', {
      nombre: 'Bici',
    });

    expect(recompensa.umbralZonaId).toBeNull();
    expect(recompensa.nombreZonaSnapshot).toBeNull();
  });

  it('en modo TIENDA, un umbralZonaId que venga se ignora (decisión 13)', async () => {
    const bd = crearBdEnMemoria({
      configuraciones: [configuracionDePrueba({ modo: 'TIENDA' })],
    });
    const { servicio } = crearServicio({ bd });

    const recompensa = await servicio.crear(tenantTutor(), 'grupo-1', {
      umbralZonaId: 'umbral-dorado',
      nombre: 'Bici',
    });

    expect(recompensa.umbralZonaId).toBeNull();
  });

  it('umbral inexistente en scoring → 400', async () => {
    const { servicio } = crearServicio({ umbral: null });

    await expect(
      servicio.crear(tenantTutor(), 'grupo-1', { umbralZonaId: 'x', nombre: 'R' })
    ).rejects.toThrow(BadRequestException);
  });

  it('umbral de OTRO grupo → 400 (la zona debe ser del mismo grupo)', async () => {
    const { servicio } = crearServicio({ umbral: { ...UMBRAL_DORADO, grupoId: 'grupo-2' } });

    await expect(
      servicio.crear(tenantTutor(), 'grupo-1', { umbralZonaId: 'umbral-dorado', nombre: 'R' })
    ).rejects.toThrow(BadRequestException);
  });
});

describe('RecompensasService — listar y archivar', () => {
  it('USUARIO solo ve ACTIVA aunque pida ARCHIVADA (criterio fase-05)', async () => {
    const bd = crearBdEnMemoria({
      recompensas: [
        recompensaDePrueba({ id: 'r-activa' }),
        recompensaDePrueba({ id: 'r-arch', estado: 'ARCHIVADA' }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    const lista = await servicio.listar(tenantUsuario(), 'grupo-1', {
      estado: 'ARCHIVADA',
    } as never);

    expect(lista.map((r) => r.id)).toEqual(['r-activa']);
  });

  it('archivar es soft delete (ARCHIVADA), nunca DELETE físico', async () => {
    const bd = crearBdEnMemoria({ recompensas: [recompensaDePrueba({ id: 'r-1' })] });
    const { servicio } = crearServicio({ bd });

    const archivada = await servicio.archivar(tenantTutor(), 'r-1');

    expect(archivada.estado).toBe('ARCHIVADA');
    expect(bd.recompensas).toHaveLength(1);
    expect(bd.recompensas[0].estado).toBe('ARCHIVADA');
  });
});

describe('RecompensasService — editar', () => {
  it('cambiar la zona revalida contra scoring y re-copia el snapshot', async () => {
    const bd = crearBdEnMemoria({
      recompensas: [
        recompensaDePrueba({ id: 'r-1', umbralZonaId: 'umbral-rojo', nombreZonaSnapshot: 'Rojo' }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    const editada = await servicio.editar(tenantTutor(), 'r-1', {
      umbralZonaId: 'umbral-dorado',
    });

    expect(editada.umbralZonaId).toBe('umbral-dorado');
    expect(editada.nombreZonaSnapshot).toBe('Dorado');
  });

  it('editar sin tocar la zona no llama a scoring y conserva el snapshot', async () => {
    const bd = crearBdEnMemoria({
      recompensas: [recompensaDePrueba({ id: 'r-1', nombreZonaSnapshot: 'Dorado' })],
    });
    const { servicio } = crearServicio({ bd, umbral: null });

    const editada = await servicio.editar(tenantTutor(), 'r-1', { nombre: 'Nuevo nombre' });

    expect(editada.nombre).toBe('Nuevo nombre');
    expect(editada.nombreZonaSnapshot).toBe('Dorado');
  });
});
