import {
  type EventoHistorialDto,
  TipoEventoHistorial,
  TipoRegistroHistorial,
} from '@dorado/shared-types';

/** Mismo tope que el backend (fase-14-18). */
export const MAX_LARGO_NOTA = 500;

/** Sobre qué tabla cuelga la nota de este evento. */
export function tipoDeRegistro(evento: EventoHistorialDto): TipoRegistroHistorial {
  if (evento.tipo === TipoEventoHistorial.CONDUCTA) {
    return TipoRegistroHistorial.CONDUCTA;
  }

  if (evento.tipo === TipoEventoHistorial.TAREA_EQUIPO) {
    return TipoRegistroHistorial.TAREA_EQUIPO;
  }

  return TipoRegistroHistorial.ACTIVIDAD;
}

/**
 * El color nunca es el único portador de significado (WCAG): cada fila lleva
 * icono **y** etiqueta de texto además del acento.
 */
export function iconoDeEvento(evento: EventoHistorialDto): string {
  switch (evento.tipo) {
    case TipoEventoHistorial.ACTIVIDAD_NO_HIZO:
      return '✕';
    case TipoEventoHistorial.CONDUCTA:
      return evento.puntos < 0 ? '▼' : '★';
    case TipoEventoHistorial.TAREA_EQUIPO:
      return '👥';
    default:
      return '✓';
  }
}

export function etiquetaDeEvento(evento: EventoHistorialDto): string {
  switch (evento.tipo) {
    case TipoEventoHistorial.ACTIVIDAD_NO_HIZO:
      return 'No hizo';
    case TipoEventoHistorial.CONDUCTA:
      return evento.puntos < 0 ? 'Conducta mala' : 'Conducta buena';
    case TipoEventoHistorial.TAREA_EQUIPO:
      return 'Tarea de equipo';
    default:
      // Una confirmación de obligatoria vale 0 y no es lo mismo que completar
      // una opcional: se nombra distinto (fase-14-08).
      return evento.puntos === 0 ? 'Confirmada' : 'Completada';
  }
}

export function acentoDeEvento(evento: EventoHistorialDto): string {
  if (evento.anulado) {
    return 'text-slate-400 dark:text-slate-500';
  }

  if (evento.tipo === TipoEventoHistorial.TAREA_EQUIPO) {
    return 'text-teal-600 dark:text-teal-400';
  }

  return evento.puntos < 0
    ? 'text-red-600 dark:text-red-400'
    : 'text-emerald-600 dark:text-emerald-400';
}

/**
 * Hora en la timezone del GRUPO, no en la del navegador (spec, decisión 15):
 * el servidor manda el instante absoluto y quién lo mira puede estar de viaje.
 */
export function formatearHora(iso: string, timezone: string): string {
  if (!iso) {
    return '';
  }

  const fecha = new Date(iso);

  if (Number.isNaN(fecha.getTime())) {
    return '';
  }

  try {
    return new Intl.DateTimeFormat('es', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    }).format(fecha);
  } catch {
    // Timezone inválida (dato viejo o mal cargado): antes que romper la
    // pantalla entera, se cae a la del navegador.
    return new Intl.DateTimeFormat('es', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(fecha);
  }
}
