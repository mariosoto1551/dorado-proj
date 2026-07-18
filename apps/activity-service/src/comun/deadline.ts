/**
 * Chequeo de DEADLINE (spec fase-07, validación 5 de `completar`): la hora
 * límite `deadlineHora` ("HH:mm") aplica al DÍA en que arrancó la Sesión, en
 * la timezone del Grupo (ADR-00 §6: los timestamps de negocio se evalúan en
 * hora del Grupo, nunca en UTC del servidor).
 *
 * Se compara por partes de calendario vía Intl (sin construir el instante
 * absoluto — evita aritmética de offsets y es estable ante DST): si "ahora"
 * cae en un día posterior al día de inicio de la Sesión, el deadline ya pasó;
 * si es el mismo día, se compara "HH:mm" lexicográficamente (zero-padded).
 */
export function deadlineVencido(
  fechaInicioSesion: Date,
  deadlineHora: string,
  timezone: string,
  ahora: Date
): boolean {
  const diaSesion = diaEnTimezone(fechaInicioSesion, timezone);
  const diaAhora = diaEnTimezone(ahora, timezone);

  if (diaAhora !== diaSesion) {
    // La Sesión arrancó siempre en el pasado: un día distinto es posterior.
    return true;
  }

  return horaEnTimezone(ahora, timezone) > deadlineHora;
}

/** "YYYY-MM-DD" del instante en la timezone dada (en-CA da ese formato). */
function diaEnTimezone(instante: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
}

/** "HH:mm" (00–23) del instante en la timezone dada. */
function horaEnTimezone(instante: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instante);
}
