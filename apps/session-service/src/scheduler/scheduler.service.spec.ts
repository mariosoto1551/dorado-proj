import { describe, expect, it, vi } from 'vitest';

import type { IdentityClientService } from '../clientes/identity-client.service';
import {
  crearBdEnMemoria,
  seccionDePrueba,
  sesionDePrueba,
  type BdEnMemoria,
  type Tick,
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
const LUNES_0000 = new Date('2026-07-13T04:00:00Z');
const MARTES_0000 = new Date('2026-07-14T04:00:00Z');
const JUEVES_0000 = new Date('2026-07-16T04:00:00Z');
const DOMINGO_0000 = new Date('2026-07-19T04:00:00Z');
const LUNES_SIGUIENTE_0000 = new Date('2026-07-20T04:00:00Z');

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;

function menos(instante: Date, ms: number): Date {
  return new Date(instante.getTime() - ms);
}

function mas(instante: Date, ms: number): Date {
  return new Date(instante.getTime() + ms);
}

/**
 * Marca de agua previa del grupo. Casi todos los tests la necesitan: sin ella
 * el primer tick sólo fija `evaluadoHasta = ahora` sin aplicar nada (no se
 * replica historia — decisión 3 de fase-14-16).
 */
function tickPrevio(evaluadoHasta: Date): Tick {
  return { grupoId: 'grupo-1', evaluadoHasta };
}

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
      ticks: [tickPrevio(menos(MARTES_0000, MINUTO))],
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

  it('domingo 00:00: ningún cron matchea — no pasa nada, pero la marca de agua avanza', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesionDePrueba({ seccionId: 'seccion-1', numero: 6 })],
      ticks: [tickPrevio(menos(DOMINGO_0000, MINUTO))],
    });
    const { servicio, publicados } = crearServicio(bd);

    await servicio.procesarTick(DOMINGO_0000);

    expect(publicados).toHaveLength(0);
    expect(bd.ticks.get('grupo-1')?.evaluadoHasta).toEqual(DOMINGO_0000);
  });

  it('lunes 00:00 con la sesión 6 abierta: evaluación relámpago y arranque de la semana siguiente, en el orden de la spec', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1', numero: 1 });
    const sesion6 = sesionDePrueba({ seccionId: 'seccion-1', numero: 6 });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesion6],
      ticks: [tickPrevio(menos(LUNES_SIGUIENTE_0000, MINUTO))],
    });
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

  it('sin sección vigente (grupo recién pasado a AUTOMATICO): el cron de sección crea la primera', async () => {
    const bd = crearBdEnMemoria({ ticks: [tickPrevio(menos(LUNES_SIGUIENTE_0000, MINUTO))] });
    const { servicio, publicados } = crearServicio(bd);

    await servicio.procesarTick(LUNES_SIGUIENTE_0000);

    expect(publicados.map((evento) => evento.eventType)).toEqual([
      'SeccionAbierta',
      'SesionAbierta',
    ]);
    expect(bd.secciones[0]?.numero).toBe(1);
  });
});

describe('SchedulerService — recuperación de transiciones perdidas (fase-14-16)', () => {
  it('EL BUG QUE RESUELVE: el proceso no estaba vivo en el minuto del cron — el tick siguiente lo aplica igual', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesionDePrueba({ seccionId: 'seccion-1', numero: 1 })],
      // Último tick antes del deploy; el proceso volvió 2 minutos y medio
      // después, ya pasado el minuto del cron.
      ticks: [tickPrevio(menos(MARTES_0000, MINUTO))],
    });
    const { servicio, publicados } = crearServicio(bd);

    await servicio.procesarTick(mas(MARTES_0000, 90_000));

    expect(publicados.map((evento) => evento.eventType)).toEqual([
      'SesionCerrada',
      'SesionAbierta',
    ]);
    expect(bd.sesiones.at(-1)?.numero).toBe(2);
  });

  it('tres días caído: aplica las tres aperturas de sesión perdidas, en orden', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesionDePrueba({ seccionId: 'seccion-1', numero: 1 })],
      ticks: [tickPrevio(mas(LUNES_0000, MINUTO))],
    });
    const { servicio, publicados } = crearServicio(bd);

    // Vuelve el jueves 00:05: se perdieron martes, miércoles y jueves 00:00.
    await servicio.procesarTick(mas(JUEVES_0000, 5 * MINUTO));

    expect(publicados.map((evento) => evento.eventType)).toEqual([
      'SesionCerrada',
      'SesionAbierta',
      'SesionCerrada',
      'SesionAbierta',
      'SesionCerrada',
      'SesionAbierta',
    ]);
    expect(bd.sesiones.map((sesion) => sesion.numero)).toEqual([1, 2, 3, 4]);
    expect(bd.sesiones.at(-1)?.estado).toBe('ABIERTA');
  });

  it('cada transición recuperada se sella con el instante PROGRAMADO, no con el de la recuperación', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const sesion1 = sesionDePrueba({ seccionId: 'seccion-1', numero: 1 });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesion1],
      ticks: [tickPrevio(mas(LUNES_0000, MINUTO))],
    });
    const { servicio } = crearServicio(bd);

    await servicio.procesarTick(mas(JUEVES_0000, 5 * MINUTO));

    // La sesión 1 tenía que cerrar el martes 00:00, no el jueves 00:05: si se
    // sellara con el instante de la recuperación, scoring vería dos días de
    // más en esa sesión.
    expect(sesion1.fechaFin).toEqual(MARTES_0000);
    expect(bd.sesiones[1]?.fechaFin).toEqual(new Date('2026-07-15T04:00:00Z'));
    expect(bd.sesiones[2]?.fechaFin).toEqual(JUEVES_0000);
  });

  it('lunes recuperado: primero el cron de sesión y después el de sección, aunque caigan en el mismo instante', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1', numero: 1 });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesionDePrueba({ seccionId: 'seccion-1', numero: 6 })],
      ticks: [tickPrevio(mas(DOMINGO_0000, MINUTO))],
    });
    const { servicio, publicados } = crearServicio(bd);

    await servicio.procesarTick(mas(LUNES_SIGUIENTE_0000, 3 * MINUTO));

    expect(publicados.map((evento) => evento.eventType)).toEqual([
      'SesionCerrada',
      'SeccionEntroEvaluacion',
      'SeccionCerrada',
      'SeccionAbierta',
      'SesionAbierta',
    ]);
    expect(seccion.fechaFin).toEqual(LUNES_SIGUIENTE_0000);
  });

  it('sin marca de agua previa NO se replica historia: el primer tick sólo la fija', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesionDePrueba({ seccionId: 'seccion-1', numero: 1 })],
    });
    const { servicio, publicados } = crearServicio(bd);

    await servicio.procesarTick(MARTES_0000);

    expect(publicados).toHaveLength(0);
    expect(bd.ticks.get('grupo-1')?.evaluadoHasta).toEqual(MARTES_0000);
  });

  it('una marca de agua muy vieja se recorta a la ventana máxima (7 días) en vez de fabricar meses de secciones', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1', numero: 1 });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesionDePrueba({ seccionId: 'seccion-1', numero: 6 })],
      // 40 días atrás: sin recorte serían ~5 cierres de sección.
      ticks: [tickPrevio(menos(LUNES_SIGUIENTE_0000, 40 * DIA))],
    });
    const { servicio, publicados } = crearServicio(bd);

    await servicio.procesarTick(LUNES_SIGUIENTE_0000);

    // Ventana recortada a (lunes 13 00:00, lunes 20 00:00]: un solo cierre de
    // sección, el del lunes 20.
    expect(publicados.filter((evento) => evento.eventType === 'SeccionCerrada')).toHaveLength(1);
    expect(bd.ticks.get('grupo-1')?.evaluadoHasta).toEqual(LUNES_SIGUIENTE_0000);
  });

  it('con un cron por minuto y una ventana enorme, el tick se acota a 500 ocurrencias y continúa en el siguiente', async () => {
    const configPorMinuto = { ...CONFIG_DESTINO, cronAperturaSesion: '* * * * *' };
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const desde = menos(MARTES_0000, 2 * DIA);
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesionDePrueba({ seccionId: 'seccion-1', numero: 1 })],
      ticks: [tickPrevio(desde)],
    });
    const { servicio } = crearServicio(bd, configPorMinuto as ConfiguracionSesion);

    await servicio.procesarTick(MARTES_0000);

    // La marca de agua queda en la ocurrencia 500 (no en `ahora`): no se
    // descarta trabajo, se reparte entre ticks.
    expect(bd.ticks.get('grupo-1')?.evaluadoHasta).toEqual(mas(desde, 500 * MINUTO));
    expect(bd.ticks.get('grupo-1')?.evaluadoHasta?.getTime()).toBeLessThan(MARTES_0000.getTime());
  });
});

describe('SchedulerService — idempotencia (ventana sin solapamiento)', () => {
  it('el mismo instante no se procesa dos veces', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesionDePrueba({ seccionId: 'seccion-1', numero: 1 })],
      ticks: [tickPrevio(menos(MARTES_0000, MINUTO))],
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

  it('dos ticks distintos dentro del mismo minuto tampoco duplican (el segundo ve la ventana vacía)', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesionDePrueba({ seccionId: 'seccion-1', numero: 1 })],
      ticks: [tickPrevio(menos(MARTES_0000, MINUTO))],
    });
    const { servicio, publicados } = crearServicio(bd);

    await servicio.procesarTick(mas(MARTES_0000, 10_000));
    await servicio.procesarTick(mas(MARTES_0000, 50_000));

    expect(publicados.map((evento) => evento.eventType)).toEqual([
      'SesionCerrada',
      'SesionAbierta',
    ]);
    expect(bd.sesiones).toHaveLength(2);
  });
});

describe('SchedulerService — extensiones (extender / autocierre pospuesto)', () => {
  it('una extensión vigente suprime el autocierre del cron de sesión', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const sesion = sesionDePrueba({
      seccionId: 'seccion-1',
      numero: 1,
      autocierrePospuestoHasta: mas(MARTES_0000, 30 * MINUTO),
    });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesion],
      ticks: [tickPrevio(menos(MARTES_0000, MINUTO))],
    });
    const { servicio, publicados } = crearServicio(bd);

    await servicio.procesarTick(MARTES_0000);

    expect(publicados).toHaveLength(0);
    expect(sesion.estado).toBe('ABIERTA');
  });

  it('la extensión se evalúa contra el instante de la OCURRENCIA, no contra el de la recuperación', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const sesion = sesionDePrueba({
      seccionId: 'seccion-1',
      numero: 1,
      autocierrePospuestoHasta: mas(MARTES_0000, 30 * MINUTO),
    });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesion],
      ticks: [tickPrevio(menos(MARTES_0000, MINUTO))],
    });
    const { servicio, publicados } = crearServicio(bd);

    // El tick del cron (00:00) se recupera a las 00:20: la extensión estaba
    // vigente a las 00:00, así que ese autocierre queda suprimido igual.
    await servicio.procesarTick(mas(MARTES_0000, 20 * MINUTO));

    expect(publicados).toHaveLength(0);
    expect(sesion.estado).toBe('ABIERTA');
  });

  it('al vencer la extensión, el cierre-y-avance corre aunque el cron no matchee ese minuto', async () => {
    const vencida = mas(MARTES_0000, 30 * MINUTO);
    const tickPosterior = mas(MARTES_0000, 31 * MINUTO);
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const sesion = sesionDePrueba({
      seccionId: 'seccion-1',
      numero: 1,
      autocierrePospuestoHasta: vencida,
    });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesion],
      ticks: [tickPrevio(mas(MARTES_0000, 29 * MINUTO))],
    });
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
  it('si identity no responde, la marca de agua no avanza y el reintento SÍ recupera la transición perdida', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const anterior = menos(MARTES_0000, MINUTO);
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesionDePrueba({ seccionId: 'seccion-1', numero: 1 })],
      ticks: [tickPrevio(anterior)],
    });
    const { servicio, publicados, identity } = crearServicio(bd);

    vi.mocked(identity.obtenerGrupo).mockRejectedValueOnce(new Error('identity caído'));

    await servicio.procesarTick(MARTES_0000);

    expect(publicados).toHaveLength(0);
    expect(bd.ticks.get('grupo-1')?.evaluadoHasta).toEqual(anterior);

    // Próximo tick (identity recuperado): el cron de las 00:00 ya pasó, pero
    // sigue dentro de la ventana — antes de fase-14-16 esta transición se
    // perdía para siempre.
    await servicio.procesarTick(mas(MARTES_0000, MINUTO));

    expect(publicados.map((evento) => evento.eventType)).toEqual([
      'SesionCerrada',
      'SesionAbierta',
    ]);
    expect(bd.ticks.get('grupo-1')?.evaluadoHasta).toEqual(mas(MARTES_0000, MINUTO));
  });
});
