/**
 * Actividades programadas (spec fase-14-11): una actividad puede limitarse a
 * ciertos días de la semana. `diasSemana` usa `0 = domingo … 6 = sábado`, la
 * misma convención que los cron de `session-service` — no hay una segunda
 * numeración en el proyecto. Vacío = todos los días.
 *
 * **Punto único de extensión**: cuando se agreguen fechas concretas o rangos
 * (lo que José anticipó para más adelante), se amplía `estaDisponibleEn` y los
 * DTOs; los cinco lugares que hacen enforcement no se tocan.
 *
 * El día se evalúa sobre el **día de inicio de la Sesión** y en la **timezone
 * del Grupo** (ADR-00 §6), igual que `deadlineVencido`: una Sesión que abre
 * 00:00 y cierra 00:00 del día siguiente pertenece al día en que abrió, así que
 * mirar el reloj del servidor al cerrar daría el día equivocado.
 */

/** Día de la semana (0 = domingo … 6 = sábado) del instante, en la timezone dada. */
export function diaSemanaEnTimezone(instante: Date, timezone: string): number {
  const nombre = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(instante);

  return DIAS_EN_INGLES.indexOf(nombre.toLowerCase().slice(0, 3));
}

/**
 * ¿La actividad se puede registrar en la Sesión que arrancó en
 * `fechaInicioSesion`? Sin días configurados, siempre.
 */
export function estaDisponibleEn(
  diasSemana: number[],
  fechaInicioSesion: Date,
  timezone: string
): boolean {
  if (diasSemana.length === 0) {
    return true;
  }

  return diasSemana.includes(diaSemanaEnTimezone(fechaInicioSesion, timezone));
}

/**
 * Días listos para persistir: ordenados, sin repetidos. Los 7 días se guardan
 * como `[]` (sin restricción) — misma semántica, una sola representación en la
 * base, y así `diasSemana.length > 0` alcanza para saber si está programada.
 */
export function normalizarDiasSemana(dias: number[] | undefined): number[] {
  if (!dias || dias.length === 0) {
    return [];
  }

  const unicos = [...new Set(dias)].sort((a, b) => a - b);

  return unicos.length === 7 ? [] : unicos;
}

/** Índice = número de día del proyecto (0 = domingo), valor = clave de `Intl`. */
const DIAS_EN_INGLES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
