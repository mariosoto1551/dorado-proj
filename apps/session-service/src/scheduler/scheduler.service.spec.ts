import { describe, expect, it, vi } from 'vitest';

import type { IdentityClientService } from '../clientes/identity-client.service';
import {
  crearBdEnMemoria,
  seccionDePrueba,
  sesionDePrueba,
  type BdEnMemoria,
} from '../comun/testing/bd-en-memoria';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { ConfiguracionSesion } from '../generated/prisma/client';
import { MaquinaSeccionesService } from '../secciones/maquina-secciones.service';
import type { EventoSesiones } from '../secciones/maquina-secciones.service';
import type { PrismaService } from '../prisma/prisma.service';
import { SchedulerService } from './scheduler.service';

// Configuración exacta del caso Destino:Dorado (spec fase-06, regla de negocio):
// sesiones lunes a sábado 00:00, 6 por sección, cierre de sección lunes 00:00.
const CONFIG_DESTINO: ConfiguracionSesion = {
  grupoId: 'grupo-1',
  organizacionId: 'org-1',
  modo: 'AUTOMATICO',
  cronAperturaSesion: '0 0 * * 1-6',
  sesionesPorSeccion: 6,
  cronAperturaSeccion: '0 0 * * 1',
  evaluarUmbralesEn: 'SOLO_AL_CIERRE_SECCION',
  createdAt: new Date(),
  updatedAt: new Date(),
} as ConfiguracionSesion;

// America/La_Paz = UTC-4: 00:00 local = 04:00Z. Semana: lunes 13 … lunes 20.
const MARTES_0000 = new Date('2026-07-14T04:00:00Z');
const DOMINGO_0000 = new Date('2026-07-19T04:00:00Z');
const LUNES_SIGUIENTE_0000 = new Date('2026-07-20T04:00:00Z');

function crearServicio(bd: BdEnMemoria, config: ConfiguracionSesion = CONFIG_DESTINO) {
  const publicados: EventoSesiones[] = [];

  const prisma = {
    client: {
      configuracionSesion: { findMany: vi.fn().mockResolvedValue([config]) },
      ultimoTickProcesado: {
        findUnique: bd.tx.ultimoTickProcesado.findUnique,
      },
      $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(bd.tx)),
    },
  } as unknown as PrismaService;

  const identity = {
    obtenerGrupo: vi.fn().mockResolvedValue({
      id: config.grupoId,
      organizacionId: config.organizacionId,
      nombre: 'Grupo Uno',
      timezone: 'America/La_Paz',
      createdAt: new Date().toISOString(),
    }),
  } as unknown as IdentityClientService;

  const eventos = {
    publicarTodos: vi.fn().mockImplementation(async (lote: EventoSesiones[]) => {
      publicados.push(...lote);
    }),
  } as unknown as EventosPublisherService;

  const servicio = new SchedulerService(prisma, identity, new MaquinaSeccionesService(), eventos);

  return { servicio, publicados, identity };
}

describe('SchedulerService — caso Destino:Dorado (criterios de aceptación fase-06)', () => {
  it('martes 00:00: cierra la sesión 1 y abre la 2 (la sección sigue ABIERTA)', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesionDePrueba({ seccionId: 'seccion-1', numero: 1 })],
    });
    const { servicio, publicados } = crearServicio(bd);

    await servicio.procesarTick(MARTES_0000);

    expect(publicados.map((evento) => evento.eventType)).toEqual([
      'SesionCerrada',
      'SesionAbierta',
    ]);
    expect(seccion.estado).toBe('ABIERTA');
    expect(bd.sesiones.at(-1)?.numero).toBe(2);
  });

  it('domingo 00:00: ningún cron matchea — no pasa nada, pero el tick queda marcado', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesionDePrueba({ seccionId: 'seccion-1', numero: 6 })],
    });
    const { servicio, publicados } = crearServicio(bd);

    await servicio.procesarTick(DOMINGO_0000);

    expect(publicados).toHaveLength(0);
    expect(bd.ticks.get('grupo-1')?.minutoEpoch).toBe(
      Math.floor(DOMINGO_0000.getTime() / 60000)
    );
  });

  it('lunes 00:00 con la sesión 6 abierta: evaluación relámpago y arranque de la semana siguiente, en el orden de la spec', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1', numero: 1 });
    const sesion6 = sesionDePrueba({ seccionId: 'seccion-1', numero: 6 });
    const bd = crearBdEnMemoria({ secciones: [seccion], sesiones: [sesion6] });
    const { servicio, publicados } = crearServicio(bd);

    await servicio.procesarTick(LUNES_SIGUIENTE_0000);

    // Caso 1–2: cierra sesión 6 → EVALUACION. Caso 3: cierra la sección y
    // abre la siguiente con su sesión 1 (modo AUTOMATICO).
    expect(publicados.map((evento) => evento.eventType)).toEqual([
      'SesionCerrada',
      'SeccionEntroEvaluacion',
      'SeccionCerrada',
      'SeccionAbierta',
      'SesionAbierta',
    ]);
    expect(seccion.estado).toBe('CERRADA');
    expect(seccion.fechaFin).toEqual(LUNES_SIGUIENTE_0000);

    const nueva = bd.secciones.at(-1);
    expect(nueva?.numero).toBe(2);
    expect(nueva?.estado).toBe('ABIERTA');
    expect(bd.sesiones.at(-1)?.seccionId).toBe(nueva?.id);
    expect(bd.sesiones.at(-1)?.numero).toBe(1);
  });

  it('el mismo minuto no se procesa dos veces (idempotencia ante reinicios, UltimoTickProcesado)', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesionDePrueba({ seccionId: 'seccion-1', numero: 1 })],
    });
    const { servicio, publicados } = crearServicio(bd);

    await servicio.procesarTick(MARTES_0000);
    await servicio.procesarTick(MARTES_0000);

    expect(publicados.map((evento) => evento.eventType)).toEqual([
      'SesionCerrada',
      'SesionAbierta',
    ]);
    expect(bd.sesiones).toHaveLength(2);
  });

  it('sin sección vigente (grupo recién pasado a AUTOMATICO): el cron de sección crea la primera', async () => {
    const bd = crearBdEnMemoria();
    const { servicio, publicados } = crearServicio(bd);

    await servicio.procesarTick(LUNES_SIGUIENTE_0000);

    expect(publicados.map((evento) => evento.eventType)).toEqual([
      'SeccionAbierta',
      'SesionAbierta',
    ]);
    expect(bd.secciones[0]?.numero).toBe(1);
  });
});

describe('SchedulerService — extensiones (extender / autocierre pospuesto)', () => {
  it('una extensión vigente suprime el autocierre del cron de sesión', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const sesion = sesionDePrueba({
      seccionId: 'seccion-1',
      numero: 1,
      autocierrePospuestoHasta: new Date(MARTES_0000.getTime() + 30 * 60000),
    });
    const bd = crearBdEnMemoria({ secciones: [seccion], sesiones: [sesion] });
    const { servicio, publicados } = crearServicio(bd);

    await servicio.procesarTick(MARTES_0000);

    expect(publicados).toHaveLength(0);
    expect(sesion.estado).toBe('ABIERTA');
  });

  it('al vencer la extensión, el cierre-y-avance corre aunque el cron no matchee ese minuto', async () => {
    const vencida = new Date(MARTES_0000.getTime() + 30 * 60000);
    const tickPosterior = new Date(MARTES_0000.getTime() + 31 * 60000);
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const sesion = sesionDePrueba({
      seccionId: 'seccion-1',
      numero: 1,
      autocierrePospuestoHasta: vencida,
    });
    const bd = crearBdEnMemoria({ secciones: [seccion], sesiones: [sesion] });
    const { servicio, publicados } = crearServicio(bd);

    await servicio.procesarTick(tickPosterior);

    expect(publicados.map((evento) => evento.eventType)).toEqual([
      'SesionCerrada',
      'SesionAbierta',
    ]);
    expect(sesion.estado).toBe('CERRADA');
    expect(bd.sesiones.at(-1)?.numero).toBe(2);
  });
});

describe('SchedulerService — resiliencia', () => {
  it('si identity no responde para un grupo, el tick no marca el minuto y no aplica transiciones (reintenta al siguiente)', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesionDePrueba({ seccionId: 'seccion-1', numero: 1 })],
    });
    const { servicio, publicados, identity } = crearServicio(bd);

    vi.mocked(identity.obtenerGrupo).mockRejectedValueOnce(new Error('identity caído'));

    await servicio.procesarTick(MARTES_0000);

    expect(publicados).toHaveLength(0);
    expect(bd.ticks.has('grupo-1')).toBe(false);

    // Próximo tick (identity recuperado): procesa normal.
    await servicio.procesarTick(new Date(MARTES_0000.getTime() + 60000));

    expect(bd.ticks.has('grupo-1')).toBe(true);
  });
});
