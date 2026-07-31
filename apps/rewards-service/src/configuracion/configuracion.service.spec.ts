import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ModoRecompensas, type TenantContext } from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  configuracionDePrueba,
  crearBdEnMemoria,
  type BdEnMemoria,
} from '../comun/testing/bd-en-memoria';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { ConfiguracionService } from './configuracion.service';

function tenantTutor(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'TUTOR',
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
    servicio: new ConfiguracionService(bd.prisma, new AccesoGrupoService(identity), eventos),
    bd,
    eventos,
  };
}

describe('ConfiguracionService — retro-compatibilidad (decisión 1)', () => {
  it('un grupo SIN fila de configuración está en DIRECTO', async () => {
    const { servicio } = crearServicio();

    const config = await servicio.obtener(tenantTutor(), 'grupo-1');

    expect(config).toEqual({
      grupoId: 'grupo-1',
      modo: ModoRecompensas.DIRECTO,
      modoPendiente: null,
      nombreMoneda: 'monedas',
      iconoMoneda: '🪙',
    });
  });

  it('obtenerModo de un grupo sin fila devuelve DIRECTO (lo usan los consumidores)', async () => {
    const { servicio } = crearServicio();

    await expect(servicio.obtenerModo('grupo-sin-config')).resolves.toBe(
      ModoRecompensas.DIRECTO
    );
  });

  it('rechaza leer la config de un grupo ajeno', async () => {
    const { servicio } = crearServicio();

    await expect(servicio.obtener(tenantTutor(), 'grupo-de-otro')).rejects.toThrow(
      ForbiddenException
    );
  });
});

describe('ConfiguracionService — cambio de modo (decisión 9)', () => {
  it('sin aplicarAhora, el cambio queda PENDIENTE y el modo vigente no se toca', async () => {
    const { servicio, bd } = crearServicio();

    const config = await servicio.cambiar(tenantTutor(), 'grupo-1', {
      modo: ModoRecompensas.TIENDA,
    });

    expect(config.modo).toBe(ModoRecompensas.DIRECTO);
    expect(config.modoPendiente).toBe(ModoRecompensas.TIENDA);
    expect(bd.configuraciones).toHaveLength(1);
  });

  it('con aplicarAhora, el modo cambia al instante y no queda nada pendiente', async () => {
    const { servicio } = crearServicio();

    const config = await servicio.cambiar(tenantTutor(), 'grupo-1', {
      modo: ModoRecompensas.TIENDA,
      aplicarAhora: true,
    });

    expect(config.modo).toBe(ModoRecompensas.TIENDA);
    expect(config.modoPendiente).toBeNull();
  });

  it('pedir el modo que ya está vigente CANCELA un pendiente', async () => {
    const bd = crearBdEnMemoria({
      configuraciones: [
        configuracionDePrueba({ modo: 'DIRECTO', modoPendiente: 'TIENDA' }),
      ],
    });
    const { servicio } = crearServicio(bd);

    const config = await servicio.cambiar(tenantTutor(), 'grupo-1', {
      modo: ModoRecompensas.DIRECTO,
    });

    expect(config.modo).toBe(ModoRecompensas.DIRECTO);
    expect(config.modoPendiente).toBeNull();
  });

  it('los cosméticos de la moneda se aplican al instante, sin depender del modo', async () => {
    const { servicio } = crearServicio();

    const config = await servicio.cambiar(tenantTutor(), 'grupo-1', {
      modo: ModoRecompensas.TIENDA,
      nombreMoneda: 'Doradas',
      iconoMoneda: '⭐',
    });

    expect(config.nombreMoneda).toBe('Doradas');
    expect(config.iconoMoneda).toBe('⭐');
    // El modo sigue diferido aunque los cosméticos ya cambiaron.
    expect(config.modo).toBe(ModoRecompensas.DIRECTO);
  });

  it('la organizacionId sale del JWT, nunca del cliente (regla 3)', async () => {
    const { servicio, bd } = crearServicio();

    await servicio.cambiar(tenantTutor(), 'grupo-1', { modo: ModoRecompensas.TIENDA });

    expect(bd.configuraciones[0].organizacionId).toBe('org-1');
  });

  it('publica el rastro de auditoría con el antes y el después', async () => {
    const { servicio, eventos } = crearServicio();

    await servicio.cambiar(tenantTutor(), 'grupo-1', {
      modo: ModoRecompensas.TIENDA,
      aplicarAhora: true,
    });

    expect(eventos.publicarAccionAdministrativa).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'MODO_RECOMPENSAS_CAMBIADO',
        entidadTipo: 'ConfiguracionRecompensasGrupo',
        detalle: expect.objectContaining({
          antes: expect.objectContaining({ modo: ModoRecompensas.DIRECTO }),
          despues: expect.objectContaining({ modo: ModoRecompensas.TIENDA }),
          aplicarAhora: true,
        }),
      })
    );
  });

  it('rechaza escribir la config de un grupo ajeno', async () => {
    const { servicio } = crearServicio();

    await expect(
      servicio.cambiar(tenantTutor(), 'grupo-de-otro', { modo: ModoRecompensas.TIENDA })
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('ConfiguracionService — aplicar el modo pendiente', () => {
  it('aplica el pendiente y lo deja en null', async () => {
    const bd = crearBdEnMemoria({
      configuraciones: [
        configuracionDePrueba({ modo: 'DIRECTO', modoPendiente: 'TIENDA' }),
      ],
    });
    const { servicio } = crearServicio(bd);

    await expect(servicio.aplicarModoPendiente('grupo-1')).resolves.toBe(
      ModoRecompensas.TIENDA
    );

    expect(bd.configuraciones[0].modo).toBe('TIENDA');
    expect(bd.configuraciones[0].modoPendiente).toBeNull();
  });

  it('es idempotente: aplicarlo dos veces no cambia nada la segunda', async () => {
    const bd = crearBdEnMemoria({
      configuraciones: [
        configuracionDePrueba({ modo: 'DIRECTO', modoPendiente: 'TIENDA' }),
      ],
    });
    const { servicio } = crearServicio(bd);

    await servicio.aplicarModoPendiente('grupo-1');

    await expect(servicio.aplicarModoPendiente('grupo-1')).resolves.toBeNull();
    expect(bd.configuraciones[0].modo).toBe('TIENDA');
  });

  it('sin fila de configuración no hace nada', async () => {
    const { servicio } = crearServicio();

    await expect(servicio.aplicarModoPendiente('grupo-sin-config')).resolves.toBeNull();
  });
});
