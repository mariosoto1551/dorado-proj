import { ConflictException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TenantContext } from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import type { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  crearBdEnMemoria,
  seccionDePrueba,
  sesionDePrueba,
  type BdEnMemoria,
} from '../comun/testing/bd-en-memoria';
import {
  ConfiguracionService,
  defaultsDeConfiguracion,
} from '../configuracion/configuracion.service';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { PrismaService } from '../prisma/prisma.service';
import { proximaOcurrencia } from '../comun/cron';
import { MaquinaSeccionesService } from './maquina-secciones.service';
import type { EventoSesiones } from './maquina-secciones.service';
import { SeccionesService } from './secciones.service';

function tenantDePrueba(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'TUTOR',
    principalId: 'tutor-1',
    principalType: 'TUTOR',
  } as TenantContext;
}

function crearServicio(
  bd: BdEnMemoria,
  config: Partial<ReturnType<typeof defaultsDeConfiguracion>> = {}
) {
  const publicados: EventoSesiones[] = [];
  const configEfectiva = { ...defaultsDeConfiguracion('grupo-1', 'org-1'), ...config };

  const prisma = {
    client: {
      seccion: bd.tx.seccion,
      sesion: bd.tx.sesion,
      $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(bd.tx)),
    },
  } as unknown as PrismaService;

  const acceso = {
    asegurarAccesoEscritura: vi.fn().mockResolvedValue(undefined),
    asegurarAccesoLectura: vi.fn(),
  } as unknown as AccesoGrupoService;

  const configuracion = {
    efectiva: vi.fn().mockResolvedValue(configEfectiva),
  } as unknown as ConfiguracionService;

  const eventos = {
    publicar: vi.fn().mockImplementation(async (evento: EventoSesiones) => {
      publicados.push(evento);
    }),
    publicarTodos: vi.fn().mockImplementation(async (lote: EventoSesiones[]) => {
      publicados.push(...lote);
    }),
  } as unknown as EventosPublisherService;

  const identity = {
    obtenerGrupo: vi.fn().mockResolvedValue({
      id: 'grupo-1',
      organizacionId: 'org-1',
      nombre: 'Grupo Uno',
      timezone: 'America/La_Paz',
      createdAt: new Date().toISOString(),
    }),
  } as unknown as IdentityClientService;

  const servicio = new SeccionesService(
    prisma,
    acceso,
    configuracion,
    new MaquinaSeccionesService(),
    eventos,
    identity
  );

  return { servicio, publicados };
}

describe('SeccionesService — iniciar (spec fase-06 + arranque manual del modo auto)', () => {
  it('crea la Sección 1 con su Sesión 1 y publica SeccionAbierta + SesionAbierta', async () => {
    const bd = crearBdEnMemoria();
    const { servicio, publicados } = crearServicio(bd);

    const respuesta = await servicio.iniciar(tenantDePrueba(), 'grupo-1');

    expect(respuesta.numero).toBe(1);
    expect(respuesta.estado).toBe('ABIERTA');
    expect(respuesta.sesiones).toHaveLength(1);
    expect(respuesta.sesiones[0].numero).toBe(1);
    expect(publicados.map((evento) => evento.eventType)).toEqual([
      'SeccionAbierta',
      'SesionAbierta',
    ]);
  });

  it('409 si ya hay una Sección ABIERTA o EVALUACION vigente (regla de negocio)', async () => {
    const bd = crearBdEnMemoria({
      secciones: [seccionDePrueba({ estado: 'EVALUACION' })],
    });
    const { servicio, publicados } = crearServicio(bd);

    await expect(servicio.iniciar(tenantDePrueba(), 'grupo-1')).rejects.toThrow(
      ConflictException
    );
    expect(publicados).toHaveLength(0);
  });

  it('en modo AUTOMATICO sin Sección vigente arranca la primera (bootstrap manual, opción A)', async () => {
    const bd = crearBdEnMemoria();
    const { servicio, publicados } = crearServicio(bd, {
      modo: 'AUTOMATICO',
      cronAperturaSesion: '0 0 * * 1-6',
      cronAperturaSeccion: '0 0 * * 1',
    });

    const respuesta = await servicio.iniciar(tenantDePrueba(), 'grupo-1');

    expect(respuesta.numero).toBe(1);
    expect(respuesta.estado).toBe('ABIERTA');
    expect(respuesta.sesiones).toHaveLength(1);
    expect(publicados.map((evento) => evento.eventType)).toEqual([
      'SeccionAbierta',
      'SesionAbierta',
    ]);
  });

  it('en modo AUTOMATICO con una Sección ya vigente es 409 (el scheduler sigue desde ahí)', async () => {
    const bd = crearBdEnMemoria({
      secciones: [seccionDePrueba({ estado: 'ABIERTA' })],
    });
    const { servicio, publicados } = crearServicio(bd, {
      modo: 'AUTOMATICO',
      cronAperturaSesion: '0 0 * * 1-6',
      cronAperturaSeccion: '0 0 * * 1',
    });

    await expect(servicio.iniciar(tenantDePrueba(), 'grupo-1')).rejects.toThrow(
      ConflictException
    );
    expect(publicados).toHaveLength(0);
  });
});

describe('SeccionesService — abrirSiguiente (modo manual)', () => {
  it('cierra la sesión abierta y abre la siguiente', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const sesion1 = sesionDePrueba({ seccionId: 'seccion-1', numero: 1 });
    const bd = crearBdEnMemoria({ secciones: [seccion], sesiones: [sesion1] });
    const { servicio, publicados } = crearServicio(bd, { sesionesPorSeccion: 3 });

    const nueva = await servicio.abrirSiguiente(tenantDePrueba(), 'seccion-1');

    expect(nueva.numero).toBe(2);
    expect(sesion1.estado).toBe('CERRADA');
    expect(publicados.map((evento) => evento.eventType)).toEqual([
      'SesionCerrada',
      'SesionAbierta',
    ]);
  });

  it('409 cuando ya se abrieron todas las sesiones de la sección (no se alcanzó → alcanzado)', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesionDePrueba({ seccionId: 'seccion-1', numero: 3 })],
    });
    const { servicio } = crearServicio(bd, { sesionesPorSeccion: 3 });

    await expect(servicio.abrirSiguiente(tenantDePrueba(), 'seccion-1')).rejects.toThrow(
      ConflictException
    );
  });

  it('409 en modo AUTOMATICO', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const bd = crearBdEnMemoria({ secciones: [seccion] });
    const { servicio } = crearServicio(bd, {
      modo: 'AUTOMATICO',
      cronAperturaSesion: '0 0 * * 1-6',
      cronAperturaSeccion: '0 0 * * 1',
    });

    await expect(servicio.abrirSiguiente(tenantDePrueba(), 'seccion-1')).rejects.toThrow(
      ConflictException
    );
  });
});

describe('SeccionesService — forzarEvaluacion y cerrar', () => {
  it('forzarEvaluacion solo aplica desde ABIERTA (409 desde EVALUACION)', async () => {
    const bd = crearBdEnMemoria({
      secciones: [seccionDePrueba({ id: 'seccion-1', estado: 'EVALUACION' })],
    });
    const { servicio } = crearServicio(bd);

    await expect(
      servicio.forzarEvaluacion(tenantDePrueba(), 'seccion-1')
    ).rejects.toThrow(ConflictException);
  });

  it('cerrar en modo MANUAL no crea la sección siguiente (criterio de aceptación)', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1', estado: 'EVALUACION' });
    const bd = crearBdEnMemoria({ secciones: [seccion] });
    const { servicio, publicados } = crearServicio(bd);

    const cerrada = await servicio.cerrar(tenantDePrueba(), 'seccion-1');

    expect(cerrada.estado).toBe('CERRADA');
    expect(bd.secciones).toHaveLength(1);
    expect(publicados.map((evento) => evento.eventType)).toEqual(['SeccionCerrada']);
  });

  it('cerrar una sección ya CERRADA es 409', async () => {
    const bd = crearBdEnMemoria({
      secciones: [seccionDePrueba({ id: 'seccion-1', estado: 'CERRADA' })],
    });
    const { servicio } = crearServicio(bd);

    await expect(servicio.cerrar(tenantDePrueba(), 'seccion-1')).rejects.toThrow(
      ConflictException
    );
  });
});

describe('SeccionesService — forzar-cierre y extender (funcionan en ambos modos, criterio de aceptación)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Martes 10:23 local de La Paz (14:23Z).
    vi.setSystemTime(new Date('2026-07-14T14:23:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('forzar-cierre cierra la sesión antes de tiempo y publica SesionCerrada', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const sesion = sesionDePrueba({ id: 'sesion-1', seccionId: 'seccion-1', numero: 2 });
    const bd = crearBdEnMemoria({ secciones: [seccion], sesiones: [sesion] });
    const { servicio, publicados } = crearServicio(bd);

    const cerrada = await servicio.forzarCierre(tenantDePrueba(), 'seccion-1', 'sesion-1');

    expect(cerrada.estado).toBe('CERRADA');
    expect(sesion.estado).toBe('CERRADA');
    expect(publicados.map((evento) => evento.eventType)).toEqual(['SesionCerrada']);
  });

  it('forzar-cierre de una sesión ya cerrada es 409', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [
        sesionDePrueba({ id: 'sesion-1', seccionId: 'seccion-1', estado: 'CERRADA' }),
      ],
    });
    const { servicio } = crearServicio(bd);

    await expect(
      servicio.forzarCierre(tenantDePrueba(), 'seccion-1', 'sesion-1')
    ).rejects.toThrow(ConflictException);
  });

  it('extender en modo AUTOMATICO pospone desde el PRÓXIMO autocierre por cron (no desde ahora)', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const sesion = sesionDePrueba({ id: 'sesion-1', seccionId: 'seccion-1', numero: 2 });
    const bd = crearBdEnMemoria({ secciones: [seccion], sesiones: [sesion] });
    const { servicio } = crearServicio(bd, {
      modo: 'AUTOMATICO',
      cronAperturaSesion: '0 0 * * 1-6',
      cronAperturaSeccion: '0 0 * * 1',
    });

    await servicio.extender(tenantDePrueba(), 'sesion-1', { minutosAdicionales: 30 });

    // Próximo autocierre: miércoles 00:00 La Paz (04:00Z) + 30 min.
    const esperado = proximaOcurrencia('0 0 * * 1-6', new Date(), 'America/La_Paz');
    expect(esperado?.toISOString()).toBe('2026-07-15T04:00:00.000Z');
    expect(sesion.autocierrePospuestoHasta?.toISOString()).toBe('2026-07-15T04:30:00.000Z');
  });

  it('extender de nuevo acumula sobre la extensión previa', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const sesion = sesionDePrueba({
      id: 'sesion-1',
      seccionId: 'seccion-1',
      autocierrePospuestoHasta: new Date('2026-07-15T04:30:00Z'),
    });
    const bd = crearBdEnMemoria({ secciones: [seccion], sesiones: [sesion] });
    const { servicio } = crearServicio(bd, {
      modo: 'AUTOMATICO',
      cronAperturaSesion: '0 0 * * 1-6',
      cronAperturaSeccion: '0 0 * * 1',
    });

    await servicio.extender(tenantDePrueba(), 'sesion-1', { minutosAdicionales: 15 });

    expect(sesion.autocierrePospuestoHasta?.toISOString()).toBe('2026-07-15T04:45:00.000Z');
  });

  it('extender en modo MANUAL funciona (no hay autocierre: cuenta desde ahora) — no rompe nada', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const sesion = sesionDePrueba({ id: 'sesion-1', seccionId: 'seccion-1' });
    const bd = crearBdEnMemoria({ secciones: [seccion], sesiones: [sesion] });
    const { servicio } = crearServicio(bd);

    await servicio.extender(tenantDePrueba(), 'sesion-1', { minutosAdicionales: 30 });

    expect(sesion.autocierrePospuestoHasta?.toISOString()).toBe('2026-07-14T14:53:00.000Z');
  });
});
