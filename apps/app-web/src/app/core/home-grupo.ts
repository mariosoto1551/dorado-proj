import { EstadoSesion, type SeccionDto, type UmbralZonaDto } from '@dorado/shared-types';

/**
 * Reglas de presentación del home del grupo (fase-14-23 T3), separadas del
 * componente para poder testearlas solas — mismo criterio que `core/turnos.ts`
 * de la T1.
 */

/** Lo único que el home necesita saber de la Sección para decidir qué ofrecer. */
export interface EstadoDelGrupo {
  seccion: (Pick<SeccionDto, 'id' | 'numero' | 'estado'> & { sesiones: { estado: EstadoSesion }[] }) | null;
  /** false en modo automático: ahí el scheduler abre y cerrar a mano no aplica. */
  esManual: boolean;
}

/** La acción principal del home: una sola, la que toca ahora. */
export interface AccionPrincipal {
  etiqueta: string;
  /** Segmentos de routerLink relativos al grupo (se prefijan con /grupos/:id). */
  destino: string[];
}

/**
 * Qué botón grande mostrar. Es UNA sola acción a propósito: el home ofrecía
 * antes dos botones del mismo peso («Configurar sesión» y «Panel de la semana»)
 * y ninguno de los dos era claramente el siguiente paso.
 */
export function accionPrincipal(estado: EstadoDelGrupo): AccionPrincipal {
  const seccion = estado.seccion;

  if (!seccion) {
    return { etiqueta: 'Iniciar la primera semana', destino: ['secciones', 'actual'] };
  }

  if (seccion.estado === 'EVALUACION') {
    return { etiqueta: 'Ir a evaluación', destino: ['secciones', seccion.id, 'evaluacion'] };
  }

  if (seccion.estado === 'CERRADA') {
    return { etiqueta: 'Abrir la semana siguiente', destino: ['secciones', 'actual'] };
  }

  const haySesionAbierta = seccion.sesiones.some((s) => s.estado === EstadoSesion.ABIERTA);

  if (!haySesionAbierta && estado.esManual) {
    return { etiqueta: 'Abrir la sesión de hoy', destino: ['secciones', 'actual'] };
  }

  return { etiqueta: 'Registrar lo de hoy', destino: ['secciones', 'actual'] };
}

/**
 * Cuánto falta para la zona siguiente, como fracción 0–1 para pintar la barra.
 *
 * En la zona más alta (sin tope) devuelve 1: llegar arriba de todo se muestra
 * lleno y no como una barra a medias que sugiere que falta algo.
 */
export function progresoHaciaLaZonaSiguiente(
  puntaje: number,
  umbrales: UmbralZonaDto[]
): number {
  if (umbrales.length === 0) {
    return 0;
  }

  const ordenados = [...umbrales].sort((a, b) => a.orden - b.orden);
  const actual = ordenados.find(
    (u) => puntaje >= u.puntosMin && (u.puntosMax === null || puntaje <= u.puntosMax)
  );

  if (!actual || actual.puntosMax === null) {
    return actual ? 1 : 0;
  }

  const ancho = actual.puntosMax - actual.puntosMin + 1;

  if (ancho <= 0) {
    return 1;
  }

  return Math.min(1, Math.max(0, (puntaje - actual.puntosMin + 1) / ancho));
}

/** «2 cosas te esperan» / «1 cosa te espera». */
export function textoDePendientes(cantidad: number): string {
  return cantidad === 1 ? '1 cosa te espera' : `${cantidad} cosas te esperan`;
}
