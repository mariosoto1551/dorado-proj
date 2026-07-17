import { describe, expect, it } from 'vitest';

import {
  crearBdEnMemoria,
  seccionDePrueba,
  sesionDePrueba,
} from '../comun/testing/bd-en-memoria';
import { defaultsDeConfiguracion } from '../configuracion/configuracion.service';
import { ModoSesion } from '../generated/prisma/enums';
import { MaquinaSeccionesService } from './maquina-secciones.service';

const AHORA = new Date('2026-07-14T04:00:00Z');

function configDePrueba(sobrescribir: Partial<ReturnType<typeof defaultsDeConfiguracion>> = {}) {
  return { ...defaultsDeConfiguracion('grupo-1', 'org-1'), ...sobrescribir };
}

describe('MaquinaSeccionesService — abrirSeccion', () => {
  it('la primera sección del grupo arranca en numero 1 con su sesión 1, y publica SeccionAbierta + SesionAbierta', async () => {
    const bd = crearBdEnMemoria();
    const maquina = new MaquinaSeccionesService();

    const resultado = await maquina.abrirSeccion(bd.tx, {
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
    });

    expect(resultado.seccion.numero).toBe(1);
    expect(resultado.sesion.numero).toBe(1);
    expect(resultado.sesion.seccionId).toBe(resultado.seccion.id);
    expect(resultado.eventos.map((evento) => evento.eventType)).toEqual([
      'SeccionAbierta',
      'SesionAbierta',
    ]);
  });

  it('la sección siguiente continúa la numeración por grupo aunque la anterior esté CERRADA', async () => {
    const bd = crearBdEnMemoria({
      secciones: [seccionDePrueba({ numero: 3, estado: 'CERRADA' })],
    });
    const maquina = new MaquinaSeccionesService();

    const resultado = await maquina.abrirSeccion(bd.tx, {
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
    });

    expect(resultado.seccion.numero).toBe(4);
  });
});

describe('MaquinaSeccionesService — avanzarSesion (casos 1–2 del scheduler)', () => {
  it('con sesiones pendientes: cierra la abierta y abre la siguiente (no entra en evaluación)', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const sesion2 = sesionDePrueba({ seccionId: 'seccion-1', numero: 2 });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [
        sesionDePrueba({ seccionId: 'seccion-1', numero: 1, estado: 'CERRADA' }),
        sesion2,
      ],
    });
    const maquina = new MaquinaSeccionesService();

    const resultado = await maquina.avanzarSesion(
      bd.tx,
      seccion,
      configDePrueba({ sesionesPorSeccion: 6 }),
      AHORA
    );

    expect(resultado.entroEvaluacion).toBe(false);
    expect(resultado.eventos.map((evento) => evento.eventType)).toEqual([
      'SesionCerrada',
      'SesionAbierta',
    ]);
    expect(sesion2.estado).toBe('CERRADA');
    expect(sesion2.fechaFin).toEqual(AHORA);
    expect(bd.sesiones.at(-1)?.numero).toBe(3);
    expect(seccion.estado).toBe('ABIERTA');
  });

  it('al cerrar la sesión número sesionesPorSeccion: la sección entra en EVALUACION y NO se abre otra sesión', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const sesion6 = sesionDePrueba({ seccionId: 'seccion-1', numero: 6 });
    const bd = crearBdEnMemoria({ secciones: [seccion], sesiones: [sesion6] });
    const maquina = new MaquinaSeccionesService();

    const resultado = await maquina.avanzarSesion(
      bd.tx,
      seccion,
      configDePrueba({ sesionesPorSeccion: 6 }),
      AHORA
    );

    expect(resultado.entroEvaluacion).toBe(true);
    expect(resultado.eventos.map((evento) => evento.eventType)).toEqual([
      'SesionCerrada',
      'SeccionEntroEvaluacion',
    ]);
    expect(sesion6.estado).toBe('CERRADA');
    expect(seccion.estado).toBe('EVALUACION');
    expect(bd.sesiones).toHaveLength(1);
  });

  it('sin sesión abierta pero con todas ya corridas: entra en EVALUACION sin publicar SesionCerrada', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const bd = crearBdEnMemoria({
      secciones: [seccion],
      sesiones: [sesionDePrueba({ seccionId: 'seccion-1', numero: 2, estado: 'CERRADA' })],
    });
    const maquina = new MaquinaSeccionesService();

    const resultado = await maquina.avanzarSesion(
      bd.tx,
      seccion,
      configDePrueba({ sesionesPorSeccion: 2 }),
      AHORA
    );

    expect(resultado.eventos.map((evento) => evento.eventType)).toEqual([
      'SeccionEntroEvaluacion',
    ]);
  });
});

describe('MaquinaSeccionesService — cerrarSeccion', () => {
  it('en modo MANUAL cierra la sección (y su sesión abierta) y NO crea la siguiente — regla clave de la spec', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1', estado: 'EVALUACION' });
    const bd = crearBdEnMemoria({ secciones: [seccion], sesiones: [] });
    const maquina = new MaquinaSeccionesService();

    const resultado = await maquina.cerrarSeccion(bd.tx, seccion, configDePrueba(), AHORA);

    expect(resultado.siguiente).toBeNull();
    expect(resultado.eventos.map((evento) => evento.eventType)).toEqual(['SeccionCerrada']);
    expect(seccion.estado).toBe('CERRADA');
    expect(seccion.fechaFin).toEqual(AHORA);
    expect(bd.secciones).toHaveLength(1);
  });

  it('en modo AUTOMATICO crea la sección siguiente (numero + 1) con su primera sesión, en la misma operación', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1', numero: 5, estado: 'EVALUACION' });
    const bd = crearBdEnMemoria({ secciones: [seccion] });
    const maquina = new MaquinaSeccionesService();

    const resultado = await maquina.cerrarSeccion(
      bd.tx,
      seccion,
      configDePrueba({ modo: ModoSesion.AUTOMATICO }),
      AHORA
    );

    expect(resultado.siguiente?.numero).toBe(6);
    expect(resultado.eventos.map((evento) => evento.eventType)).toEqual([
      'SeccionCerrada',
      'SeccionAbierta',
      'SesionAbierta',
    ]);
    expect(bd.sesiones).toHaveLength(1);
    expect(bd.sesiones[0].seccionId).toBe(resultado.siguiente?.id);
  });

  it('cierra desde ABIERTA (caso de seguridad/emergencia) cerrando también la sesión abierta', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const abierta = sesionDePrueba({ seccionId: 'seccion-1', numero: 2 });
    const bd = crearBdEnMemoria({ secciones: [seccion], sesiones: [abierta] });
    const maquina = new MaquinaSeccionesService();

    const resultado = await maquina.cerrarSeccion(bd.tx, seccion, configDePrueba(), AHORA);

    expect(resultado.eventos.map((evento) => evento.eventType)).toEqual([
      'SesionCerrada',
      'SeccionCerrada',
    ]);
    expect(abierta.estado).toBe('CERRADA');
  });
});

describe('MaquinaSeccionesService — entrarEvaluacion (forzar-evaluacion)', () => {
  it('cierra la sesión abierta si la había y pasa la sección a EVALUACION', async () => {
    const seccion = seccionDePrueba({ id: 'seccion-1' });
    const abierta = sesionDePrueba({ seccionId: 'seccion-1', numero: 3 });
    const bd = crearBdEnMemoria({ secciones: [seccion], sesiones: [abierta] });
    const maquina = new MaquinaSeccionesService();

    const resultado = await maquina.entrarEvaluacion(bd.tx, seccion, AHORA);

    expect(resultado.eventos.map((evento) => evento.eventType)).toEqual([
      'SesionCerrada',
      'SeccionEntroEvaluacion',
    ]);
    expect(seccion.estado).toBe('EVALUACION');
    expect(abierta.estado).toBe('CERRADA');
  });
});

describe('MaquinaSeccionesService — payloads de eventos (event-catalog.md)', () => {
  it('SesionEventoPayload y SeccionEventoPayload llevan los campos del catálogo', async () => {
    const bd = crearBdEnMemoria();
    const maquina = new MaquinaSeccionesService();

    const resultado = await maquina.abrirSeccion(bd.tx, {
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
    });

    const [seccionAbierta, sesionAbierta] = resultado.eventos;

    expect(seccionAbierta.payload).toEqual({
      seccionId: resultado.seccion.id,
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
      numero: 1,
    });
    expect(sesionAbierta.payload).toEqual({
      sesionId: resultado.sesion.id,
      seccionId: resultado.seccion.id,
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
      numero: 1,
    });
  });
});
