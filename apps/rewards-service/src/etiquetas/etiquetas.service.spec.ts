import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { Rol, type TenantContext } from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  crearBdEnMemoria,
  etiquetaDePrueba,
  recompensaDePrueba,
  type BdEnMemoria,
} from '../comun/testing/bd-en-memoria';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { EtiquetasService } from './etiquetas.service';

function tenantTutor(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: Rol.TUTOR,
    principalId: 'tutor-1',
    principalType: 'TUTOR',
  } as TenantContext;
}

function crearServicio(bd: BdEnMemoria = crearBdEnMemoria()) {
  const identity = {
    obtenerGrupo: vi.fn(),
    obtenerUsuario: vi.fn(),
  } as unknown as IdentityClientService;
  const eventos = {
    publicar: vi.fn(),
    publicarAccionAdministrativa: vi.fn(),
  } as unknown as EventosPublisherService;

  return {
    servicio: new EtiquetasService(bd.prisma, new AccesoGrupoService(identity), eventos),
    eventos,
    bd,
  };
}

describe('EtiquetasService — catálogo', () => {
  it('crea una etiqueta con nombre y color', async () => {
    const { servicio, bd } = crearServicio();

    const etiqueta = await servicio.crear(tenantTutor(), 'grupo-1', {
      nombre: 'Pantalla',
      colorHex: '#8B5CF6',
    });

    expect(etiqueta.nombre).toBe('Pantalla');
    expect(etiqueta.colorHex).toBe('#8B5CF6');
    expect(etiqueta.estado).toBe('ACTIVA');
    // organizacionId SIEMPRE del JWT, nunca del cliente (regla 3).
    expect(bd.etiquetas[0].organizacionId).toBe('org-1');
  });

  it('rechaza dos etiquetas con el mismo nombre en el grupo', async () => {
    const { servicio } = crearServicio(
      crearBdEnMemoria({ etiquetas: [etiquetaDePrueba({ nombre: 'Pantalla' })] })
    );

    await expect(
      servicio.crear(tenantTutor(), 'grupo-1', { nombre: 'Pantalla', colorHex: '#111111' })
    ).rejects.toMatchObject({ code: 'ETIQUETA_DUPLICADA' });
  });

  it('lista solo las activas si no se pide estado', async () => {
    const { servicio } = crearServicio(
      crearBdEnMemoria({
        etiquetas: [
          etiquetaDePrueba({ nombre: 'Pantalla' }),
          etiquetaDePrueba({ nombre: 'Vieja', estado: 'ARCHIVADA' }),
        ],
      })
    );

    const etiquetas = await servicio.listar(tenantTutor(), 'grupo-1', {});

    expect(etiquetas.map((etiqueta) => etiqueta.nombre)).toEqual(['Pantalla']);
  });

  it('renombrar cambia el chip en todos los ítems sin tocarlos de a uno', async () => {
    const etiqueta = etiquetaDePrueba({ nombre: 'Pantalla' });
    const items = [recompensaDePrueba(), recompensaDePrueba(), recompensaDePrueba()];
    const bd = crearBdEnMemoria({
      etiquetas: [etiqueta],
      recompensas: items,
      etiquetasEnRecompensa: items.map((item) => ({
        id: `asig-${item.id}`,
        etiquetaId: etiqueta.id,
        recompensaId: item.id,
      })),
    });
    const { servicio } = crearServicio(bd);

    await servicio.editar(tenantTutor(), etiqueta.id, { nombre: 'Tiempo de pantalla' });

    const mapa = await servicio.mapaPorRecompensa('grupo-1');

    expect(mapa.size).toBe(3);

    for (const item of items) {
      expect(mapa.get(item.id)?.[0].nombre).toBe('Tiempo de pantalla');
    }
  });
});

describe('EtiquetasService — archivar es reversible (decisiones 6 y 7)', () => {
  it('archivar la saca de los chips PERO conserva las asignaciones', async () => {
    const etiqueta = etiquetaDePrueba();
    const item = recompensaDePrueba();
    const bd = crearBdEnMemoria({
      etiquetas: [etiqueta],
      recompensas: [item],
      etiquetasEnRecompensa: [
        { id: 'asig-1', etiquetaId: etiqueta.id, recompensaId: item.id },
      ],
    });
    const { servicio } = crearServicio(bd);

    await servicio.archivar(tenantTutor(), etiqueta.id);

    expect((await servicio.mapaPorRecompensa('grupo-1')).size).toBe(0);
    // La fila sigue ahí: es lo que hace que desarchivar restituya el estado.
    expect(bd.etiquetasEnRecompensa).toHaveLength(1);
  });

  it('desarchivar devuelve exactamente los mismos ítems', async () => {
    const etiqueta = etiquetaDePrueba({ estado: 'ARCHIVADA' });
    const items = [recompensaDePrueba(), recompensaDePrueba()];
    const bd = crearBdEnMemoria({
      etiquetas: [etiqueta],
      recompensas: items,
      etiquetasEnRecompensa: items.map((item) => ({
        id: `asig-${item.id}`,
        etiquetaId: etiqueta.id,
        recompensaId: item.id,
      })),
    });
    const { servicio } = crearServicio(bd);

    const vuelta = await servicio.desarchivar(tenantTutor(), etiqueta.id);

    expect(vuelta.estado).toBe('ACTIVA');
    expect((await servicio.mapaPorRecompensa('grupo-1')).size).toBe(2);
  });
});

describe('EtiquetasService — asignación', () => {
  it('reemplaza el juego completo, no incrementa', async () => {
    const [uno, dos] = [etiquetaDePrueba({ nombre: 'A' }), etiquetaDePrueba({ nombre: 'B' })];
    const item = recompensaDePrueba();
    const bd = crearBdEnMemoria({ etiquetas: [uno, dos], recompensas: [item] });
    const { servicio } = crearServicio(bd);

    await servicio.asignar(tenantTutor(), item.id, [uno.id, dos.id]);
    const finales = await servicio.asignar(tenantTutor(), item.id, [dos.id]);

    expect(finales.map((etiqueta) => etiqueta.nombre)).toEqual(['B']);
    expect(bd.etiquetasEnRecompensa).toHaveLength(1);
  });

  it('una lista vacía deja el ítem sin etiquetas', async () => {
    const etiqueta = etiquetaDePrueba();
    const item = recompensaDePrueba();
    const bd = crearBdEnMemoria({
      etiquetas: [etiqueta],
      recompensas: [item],
      etiquetasEnRecompensa: [
        { id: 'asig-1', etiquetaId: etiqueta.id, recompensaId: item.id },
      ],
    });
    const { servicio } = crearServicio(bd);

    expect(await servicio.asignar(tenantTutor(), item.id, [])).toEqual([]);
    expect(bd.etiquetasEnRecompensa).toHaveLength(0);
  });

  it('rechaza más de 5 etiquetas en un ítem (decisión 8)', async () => {
    const etiquetas = ['A', 'B', 'C', 'D', 'E', 'F'].map((nombre) =>
      etiquetaDePrueba({ nombre })
    );
    const item = recompensaDePrueba();
    const { servicio } = crearServicio(
      crearBdEnMemoria({ etiquetas, recompensas: [item] })
    );

    await expect(
      servicio.asignar(
        tenantTutor(),
        item.id,
        etiquetas.map((etiqueta) => etiqueta.id)
      )
    ).rejects.toMatchObject({ code: 'DEMASIADAS_ETIQUETAS' });
  });

  it('los ids repetidos cuentan una sola vez y no duplican filas', async () => {
    const etiqueta = etiquetaDePrueba();
    const item = recompensaDePrueba();
    const bd = crearBdEnMemoria({ etiquetas: [etiqueta], recompensas: [item] });
    const { servicio } = crearServicio(bd);

    await servicio.asignar(tenantTutor(), item.id, [etiqueta.id, etiqueta.id]);

    expect(bd.etiquetasEnRecompensa).toHaveLength(1);
  });

  it('rechaza una etiqueta de OTRO grupo (aislamiento de tenant)', async () => {
    const ajena = etiquetaDePrueba({ grupoId: 'grupo-2' });
    const item = recompensaDePrueba({ grupoId: 'grupo-1' });
    const { servicio } = crearServicio(
      crearBdEnMemoria({ etiquetas: [ajena], recompensas: [item] })
    );

    await expect(
      servicio.asignar(tenantTutor(), item.id, [ajena.id])
    ).rejects.toMatchObject({ code: 'ETIQUETA_INVALIDA' });
  });

  it('rechaza una etiqueta archivada', async () => {
    const etiqueta = etiquetaDePrueba({ estado: 'ARCHIVADA' });
    const item = recompensaDePrueba();
    const { servicio } = crearServicio(
      crearBdEnMemoria({ etiquetas: [etiqueta], recompensas: [item] })
    );

    await expect(
      servicio.asignar(tenantTutor(), item.id, [etiqueta.id])
    ).rejects.toMatchObject({ code: 'ETIQUETA_INVALIDA' });
  });

  it('404 si el ítem no existe', async () => {
    const { servicio } = crearServicio();

    await expect(
      servicio.asignar(tenantTutor(), 'no-existe', [])
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('EtiquetasService — costo cero para quien no usa el ítem (decisión 13)', () => {
  it('sin etiquetas en el grupo, no consulta la tabla de asignaciones', async () => {
    const bd = crearBdEnMemoria({ recompensas: [recompensaDePrueba()] });
    const espia = vi.spyOn(bd.prisma.client.etiquetaEnRecompensa, 'findMany');
    const { servicio } = crearServicio(bd);

    expect((await servicio.mapaPorRecompensa('grupo-1')).size).toBe(0);
    expect(espia).not.toHaveBeenCalled();
  });
});
