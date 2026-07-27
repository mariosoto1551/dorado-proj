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

/**
 * Instante absoluto en que vence el deadline de la Sesión: `deadlineHora` del
 * día en que arrancó la Sesión, en la timezone del Grupo (fase-14-14).
 *
 * Existe SOLO para que el frontend pueda mostrar una cuenta regresiva. La
 * validación de `completar` sigue siendo `deadlineVencido`, que compara por
 * partes de calendario y no necesita aritmética de offsets — esta función no la
 * reemplaza, convive con ella.
 */
export function instanteDeDeadline(
  fechaInicioSesion: Date,
  deadlineHora: string,
  timezone: string
): Date {
  const dia = diaEnTimezone(fechaInicioSesion, timezone);

  return instanteDeHoraLocal(`${dia}T${deadlineHora}:00`, timezone);
}

/**
 * Resuelve una hora de pared ("YYYY-MM-DDTHH:mm:ss", sin zona) interpretada en
 * `timezone` al instante UTC que le corresponde.
 *
 * Va en dos pasadas porque el offset depende del instante que se está buscando
 * (el huevo y la gallina del horario de verano): la primera lo estima leyendo
 * la hora local como si fuera UTC, y la segunda lo corrige con el offset real
 * de esa fecha. Converge para todos los casos reales, saltos de DST incluidos.
 *
 * Caso patológico conocido: una hora de pared que NO existe (la que se saltea
 * al adelantar el reloj) resuelve al instante contiguo. Un deadline a las 02:30
 * del día del cambio de hora es un caso que no vale complicar el código.
 */
function instanteDeHoraLocal(horaDePared: string, timezone: string): Date {
  const objetivo = Date.parse(`${horaDePared}Z`);
  let instante = objetivo;

  for (let pasada = 0; pasada < 2; pasada += 1) {
    const offset = paredComoUtc(new Date(instante), timezone) - instante;
    instante = objetivo - offset;
  }

  return new Date(instante);
}

/**
 * La hora de pared del instante en `timezone`, leída como si fuera UTC. La
 * diferencia contra el instante real es exactamente el offset de la zona.
 */
function paredComoUtc(instante: Date, timezone: string): number {
  return Date.parse(
    `${diaEnTimezone(instante, timezone)}T${horaConSegundosEnTimezone(instante, timezone)}Z`
  );
}

/** "HH:mm:ss" (00–23) del instante en la timezone dada. */
function horaConSegundosEnTimezone(instante: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(instante);
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
