import { EstadoSeccion, EstadoSesion, type UmbralZonaDto } from '@dorado/shared-types';

import {
  accionPrincipal,
  progresoHaciaLaZonaSiguiente,
  textoDePendientes,
  type EstadoDelGrupo,
} from './home-grupo';

/** Los cuatro tramos del seed (ver CLAUDE.md), que es el caso real. */
const UMBRALES = [
  { id: '1', orden: 1, nombreZona: 'Rojo', puntosMin: 0, puntosMax: 9, colorHex: '#EF4444' },
  { id: '2', orden: 2, nombreZona: 'Amarillo', puntosMin: 10, puntosMax: 24, colorHex: '#F59E0B' },
  { id: '3', orden: 3, nombreZona: 'Verde', puntosMin: 25, puntosMax: 49, colorHex: '#22C55E' },
  { id: '4', orden: 4, nombreZona: 'Dorado', puntosMin: 50, puntosMax: null, colorHex: '#EAB308' },
] as unknown as UmbralZonaDto[];

function estado(parcial: Partial<EstadoDelGrupo> = {}): EstadoDelGrupo {
  return { seccion: null, esManual: true, ...parcial };
}

function seccion(
  estadoSeccion: EstadoSeccion,
  sesiones: EstadoSesion[] = []
): EstadoDelGrupo['seccion'] {
  return {
    id: 'sec-1',
    numero: 3,
    estado: estadoSeccion,
    sesiones: sesiones.map((e) => ({ estado: e })),
  };
}

describe('accionPrincipal', () => {
  it('sin Sección ofrece iniciar la primera semana, no dos botones del mismo peso', () => {
    expect(accionPrincipal(estado())).toEqual({
      etiqueta: 'Iniciar la primera semana',
      destino: ['secciones', 'actual'],
    });
  });

  it('con la sesión abierta, lo que toca es registrar', () => {
    const accion = accionPrincipal(
      estado({ seccion: seccion(EstadoSeccion.ABIERTA, [EstadoSesion.ABIERTA]) })
    );

    expect(accion.etiqueta).toBe('Registrar lo de hoy');
  });

  it('en modo MANUAL sin sesión abierta, lo que toca es abrirla', () => {
    const accion = accionPrincipal(
      estado({ seccion: seccion(EstadoSeccion.ABIERTA, [EstadoSesion.CERRADA]) })
    );

    expect(accion.etiqueta).toBe('Abrir la sesión de hoy');
  });

  it('en AUTOMÁTICO no ofrece abrir la sesión: la abre el scheduler', () => {
    const accion = accionPrincipal(
      estado({
        seccion: seccion(EstadoSeccion.ABIERTA, [EstadoSesion.CERRADA]),
        esManual: false,
      })
    );

    expect(accion.etiqueta).toBe('Registrar lo de hoy');
  });

  it('en EVALUACION manda a evaluar esa Sección', () => {
    const accion = accionPrincipal(estado({ seccion: seccion(EstadoSeccion.EVALUACION) }));

    expect(accion).toEqual({
      etiqueta: 'Ir a evaluación',
      destino: ['secciones', 'sec-1', 'evaluacion'],
    });
  });

  it('con la Sección cerrada ofrece abrir la siguiente', () => {
    const accion = accionPrincipal(estado({ seccion: seccion(EstadoSeccion.CERRADA) }));

    expect(accion.etiqueta).toBe('Abrir la semana siguiente');
  });
});

describe('progresoHaciaLaZonaSiguiente', () => {
  it('al piso de la zona la barra recién arranca', () => {
    // 25 es el primero de Verde (25–49): 1 de 25 puntos del tramo.
    expect(progresoHaciaLaZonaSiguiente(25, UMBRALES)).toBeCloseTo(1 / 25, 5);
  });

  it('al techo de la zona la barra está llena', () => {
    expect(progresoHaciaLaZonaSiguiente(49, UMBRALES)).toBe(1);
  });

  it('en la zona más alta (sin tope) muestra lleno y no una barra a medias', () => {
    expect(progresoHaciaLaZonaSiguiente(50, UMBRALES)).toBe(1);
    expect(progresoHaciaLaZonaSiguiente(9999, UMBRALES)).toBe(1);
  });

  it('sin umbrales cargados no inventa progreso', () => {
    expect(progresoHaciaLaZonaSiguiente(30, [])).toBe(0);
  });

  it('un puntaje fuera de todo tramo (negativo) tampoco inventa', () => {
    expect(progresoHaciaLaZonaSiguiente(-5, UMBRALES)).toBe(0);
  });
});

describe('textoDePendientes', () => {
  it('concuerda en singular y plural', () => {
    expect(textoDePendientes(1)).toBe('1 cosa te espera');
    expect(textoDePendientes(3)).toBe('3 cosas te esperan');
  });
});
