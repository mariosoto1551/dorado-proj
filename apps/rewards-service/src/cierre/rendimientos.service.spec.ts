import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { TenantContext, UmbralZonaDto } from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import type { ScoringClientService } from '../clientes/scoring-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  crearBdEnMemoria,
  rendimientoDePrueba,
  type BdEnMemoria,
} from '../comun/testing/bd-en-memoria';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { RendimientosService } from './rendimientos.service';

function zona(id: string, nombre: string, orden: number): UmbralZonaDto {
  return {
    id,
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    nombreZona: nombre,
    orden,
    puntosMin: 0,
    puntosMax: null,
    colorHex: '#000000',
  };
}

const ZONAS = [
  zona('umbral-rojo', 'Rojo', 1),
  zona('umbral-amarillo', 'Amarillo', 2),
  zona('umbral-verde', 'Verde', 3),
  zona('umbral-dorado', 'Dorado', 4),
];

function tenantTutor(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'TUTOR',
    principalId: 'tutor-1',
    principalType: 'TUTOR',
  } as TenantContext;
}

function crearServicio(opciones: { bd?: BdEnMemoria; zonas?: UmbralZonaDto[] } = {}) {
  const bd = opciones.bd ?? crearBdEnMemoria();

  const scoring = {
    obtenerUmbral: vi.fn(),
    obtenerResultado: vi.fn(),
    umbralesDelGrupo: vi.fn().mockResolvedValue(opciones.zonas ?? ZONAS),
  } as unknown as ScoringClientService;

  const identity = {
    obtenerGrupo: vi.fn(),
    obtenerUsuario: vi.fn(),
  } as unknown as IdentityClientService;

  const eventos = {
    publicar: vi.fn(),
    publicarAccionAdministrativa: vi.fn(),
  } as unknown as EventosPublisherService;

  return {
    servicio: new RendimientosService(
      bd.prisma,
      scoring,
      new AccesoGrupoService(identity),
      eventos
    ),
    bd,
    eventos,
  };
}

describe('RendimientosService — listar', () => {
  it('lista TODAS las zonas del grupo, con null en las que no tienen monedas', async () => {
    const bd = crearBdEnMemoria({
      rendimientos: [rendimientoDePrueba({ umbralZonaId: 'umbral-verde', monedas: 12 })],
    });
    const { servicio } = crearServicio({ bd });

    const rendimientos = await servicio.listar(tenantTutor(), 'grupo-1');

    expect(rendimientos).toHaveLength(4);
    expect(rendimientos.map((r) => r.monedas)).toEqual([null, null, 12, null]);
    // Y viene con lo que la pantalla necesita para ordenar y pintar.
    expect(rendimientos[0]).toMatchObject({ nombreZona: 'Rojo', orden: 1 });
  });

  it('un grupo sin zonas devuelve lista vacía, no rompe', async () => {
    const { servicio } = crearServicio({ zonas: [] });

    await expect(servicio.listar(tenantTutor(), 'grupo-1')).resolves.toEqual([]);
  });
});

describe('RendimientosService — configurar', () => {
  it('guarda el rendimiento con el snapshot del nombre de zona', async () => {
    const { servicio, bd } = crearServicio();

    await servicio.configurar(tenantTutor(), 'grupo-1', {
      rendimientos: [{ umbralZonaId: 'umbral-dorado', monedas: 25 }],
    });

    expect(bd.rendimientos).toHaveLength(1);
    expect(bd.rendimientos[0]).toMatchObject({
      umbralZonaId: 'umbral-dorado',
      nombreZonaSnapshot: 'Dorado',
      monedas: 25,
      organizacionId: 'org-1',
    });
  });

  it('acepta valores negativos: son los que disparan la bancarrota', async () => {
    const { servicio, bd } = crearServicio();

    await servicio.configurar(tenantTutor(), 'grupo-1', {
      rendimientos: [{ umbralZonaId: 'umbral-rojo', monedas: -5 }],
    });

    expect(bd.rendimientos[0].monedas).toBe(-5);
  });

  it('es idempotente: reconfigurar la misma zona reemplaza, no duplica', async () => {
    const { servicio, bd } = crearServicio();

    await servicio.configurar(tenantTutor(), 'grupo-1', {
      rendimientos: [{ umbralZonaId: 'umbral-verde', monedas: 12 }],
    });
    await servicio.configurar(tenantTutor(), 'grupo-1', {
      rendimientos: [{ umbralZonaId: 'umbral-verde', monedas: 15 }],
    });

    expect(bd.rendimientos).toHaveLength(1);
    expect(bd.rendimientos[0].monedas).toBe(15);
  });

  it('carga el preset de las 4 zonas de una', async () => {
    const { servicio, bd } = crearServicio();

    const resultado = await servicio.configurar(tenantTutor(), 'grupo-1', {
      rendimientos: [
        { umbralZonaId: 'umbral-rojo', monedas: -5 },
        { umbralZonaId: 'umbral-amarillo', monedas: 5 },
        { umbralZonaId: 'umbral-verde', monedas: 12 },
        { umbralZonaId: 'umbral-dorado', monedas: 25 },
      ],
    });

    expect(bd.rendimientos).toHaveLength(4);
    expect(resultado.map((r) => r.monedas)).toEqual([-5, 5, 12, 25]);
  });

  it('una zona que no es del grupo → 400 (regla 2: se cruza por ID vía REST)', async () => {
    const { servicio, bd } = crearServicio();

    await expect(
      servicio.configurar(tenantTutor(), 'grupo-1', {
        rendimientos: [{ umbralZonaId: 'umbral-de-otro-grupo', monedas: 10 }],
      })
    ).rejects.toThrow(BadRequestException);

    expect(bd.rendimientos).toHaveLength(0);
  });

  it('publica el rastro de auditoría', async () => {
    const { servicio, eventos } = crearServicio();

    await servicio.configurar(tenantTutor(), 'grupo-1', {
      rendimientos: [{ umbralZonaId: 'umbral-verde', monedas: 12 }],
    });

    expect(eventos.publicarAccionAdministrativa).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'RENDIMIENTOS_CONFIGURADOS',
        entidadTipo: 'RendimientoZona',
      })
    );
  });

  it('rechaza configurar un grupo ajeno', async () => {
    const { servicio } = crearServicio();

    await expect(
      servicio.configurar(tenantTutor(), 'grupo-de-otro', {
        rendimientos: [{ umbralZonaId: 'umbral-verde', monedas: 12 }],
      })
    ).rejects.toThrow(ForbiddenException);
  });
});
