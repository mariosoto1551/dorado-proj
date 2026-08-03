/**
 * Disponibilidad de una actividad: **días de la semana** (spec fase-14-11) y
 * **vigencia por fechas** (spec fase-14-24).
 *
 * `diasSemana` usa `0 = domingo … 6 = sábado`, la misma convención que los cron
 * de `session-service` — no hay una segunda numeración en el proyecto. Vacío =
 * todos los días.
 *
 * `vigenteDesde`/`vigenteHasta` son fechas **civiles** `"YYYY-MM-DD"` del
 * calendario local del Grupo (no instantes), misma convención que `deadlineHora`
 * guarda `"HH:mm"` local. Null = sin límite por ese lado; los dos null =
 * permanente, que es el default y el comportamiento previo al ítem 24.
 *
 * **Las dos condiciones se cruzan** (fase-14-24, decisión 8): "los lunes y
 * miércoles, del 1 al 30 de marzo" exige cumplir las dos. Es el caso que motiva
 * que la vigencia entre por acá y no por un chequeo aparte.
 *
 * **Punto único de extensión**: los 8 lugares que hacen enforcement llaman a
 * `estaDisponibleEn` y nada más. El ítem 24 fue la primera extensión que cobró
 * ese diseño (el 11 la anticipó por nombre); cualquier condición futura de
 * "¿corre hoy?" va acá y hereda los 8 llamadores sin tocarlos.
 *
 * El día se evalúa sobre el **día de inicio de la Sesión** y en la **timezone
 * del Grupo** (ADR-00 §6), igual que `deadlineVencido`: una Sesión que abre
 * 00:00 y cierra 00:00 del día siguiente pertenece al día en que abrió, así que
 * mirar el reloj del servidor al cerrar daría el día equivocado.
 */

/**
 * Todo lo que decide si una actividad corre hoy. Objeto de parámetros y no
 * argumentos sueltos: con la vigencia serían 5 posicionales, y tres de ellos
 * del mismo tipo pegados (regla 2 del estilo del proyecto).
 */
export interface ProgramacionActividad {
  diasSemana: number[];
  vigenteDesde?: string | null;
  vigenteHasta?: string | null;
}

/** Día de la semana (0 = domingo … 6 = sábado) del instante, en la timezone dada. */
export function diaSemanaEnTimezone(instante: Date, timezone: string): number {
  const nombre = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(instante);

  return DIAS_EN_INGLES.indexOf(nombre.toLowerCase().slice(0, 3));
}

/**
 * Fecha civil `"YYYY-MM-DD"` del instante, en la timezone dada.
 *
 * Usa `en-CA` porque su formato corto ES `YYYY-MM-DD` — armarlo a mano desde
 * `getFullYear()` daría la fecha del servidor, no la del Grupo, que es
 * exactamente el bug que este módulo existe para no cometer.
 */
export function fechaCivilEnTimezone(instante: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
}

/**
 * ¿La actividad se puede registrar en la Sesión que arrancó en
 * `fechaInicioSesion`? Sin días ni fechas configurados, siempre.
 */
export function estaDisponibleEn(
  programacion: ProgramacionActividad,
  fechaInicioSesion: Date,
  timezone: string
): boolean {
  return (
    cumpleVigencia(programacion, fechaInicioSesion, timezone) &&
    cumpleDiaDeSemana(programacion.diasSemana, fechaInicioSesion, timezone)
  );
}

/**
 * ¿La actividad tiene alguna restricción de cuándo corre?
 *
 * Es el gate que evita pagar el cruce REST a identity (resolver la timezone del
 * Grupo) en las actividades sin programación — o sea, la enorme mayoría. Mismo
 * patrón que `hayRestriccionesDeRol` (#19) y `hayRestriccionesDeEquipo` (#24).
 */
export function tieneProgramacion(programacion: ProgramacionActividad): boolean {
  return (
    programacion.diasSemana.length > 0 ||
    Boolean(programacion.vigenteDesde) ||
    Boolean(programacion.vigenteHasta)
  );
}

/** Por qué no corre hoy. `null` = sí corre. */
export type MotivoNoDisponible = 'FUERA_DE_VIGENCIA' | 'OTRO_DIA';

/**
 * El motivo, no solo el booleano: los dos casos se le comunican distinto al
 * usuario ("todavía no empezó" / "los martes") y **se archivan distinto** — lo
 * que venció no vuelve, lo que hoy no toca vuelve mañana.
 *
 * La vigencia se evalúa primero: una actividad de los martes fuera de su rango
 * está fuera de vigencia, no "en otro día". El motivo más definitivo gana.
 */
export function motivoNoDisponible(
  programacion: ProgramacionActividad,
  fechaInicioSesion: Date,
  timezone: string
): MotivoNoDisponible | null {
  if (!cumpleVigencia(programacion, fechaInicioSesion, timezone)) {
    return 'FUERA_DE_VIGENCIA';
  }

  if (!cumpleDiaDeSemana(programacion.diasSemana, fechaInicioSesion, timezone)) {
    return 'OTRO_DIA';
  }

  return null;
}

/**
 * ¿Ya venció? Se pregunta aparte de `estaDisponibleEn` porque el archivado
 * automático (fase-14-24, decisión 11) distingue lo que **no corre hoy** de lo
 * que **no va a correr nunca más**: la actividad de los martes no corre un lunes
 * y no se archiva; la que venció el 30/03 sí.
 *
 * Comparación de strings `YYYY-MM-DD`, que es lexicográfica y cronológica a la
 * vez — el punto de guardar la fecha en ese formato y no como `DateTime`.
 */
export function vigenciaVencidaEn(
  vigenteHasta: string | null | undefined,
  fechaInicioSesion: Date,
  timezone: string
): boolean {
  if (!vigenteHasta) {
    return false;
  }

  return fechaCivilEnTimezone(fechaInicioSesion, timezone) > vigenteHasta;
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

/** `"YYYY-MM-DD"` con un mes y un día que existen de verdad (30/02 no pasa). */
export function esFechaCivilValida(fecha: string): boolean {
  if (!FORMATO_FECHA_CIVIL.test(fecha)) {
    return false;
  }

  // `new Date("2026-02-30")` no tira: rueda al 2 de marzo. Se compara el
  // ida-y-vuelta contra el original, que es lo que delata el desborde.
  const comoUtc = new Date(`${fecha}T00:00:00Z`);

  return !Number.isNaN(comoUtc.getTime()) && comoUtc.toISOString().slice(0, 10) === fecha;
}

function cumpleVigencia(
  programacion: ProgramacionActividad,
  fechaInicioSesion: Date,
  timezone: string
): boolean {
  const { vigenteDesde, vigenteHasta } = programacion;

  if (!vigenteDesde && !vigenteHasta) {
    return true;
  }

  const hoy = fechaCivilEnTimezone(fechaInicioSesion, timezone);

  // Ambos extremos son INCLUSIVOS: `desde = hasta = "2026-12-24"` es "solo el 24
  // de diciembre", que es el caso que José pidió por nombre.
  if (vigenteDesde && hoy < vigenteDesde) {
    return false;
  }

  return !(vigenteHasta && hoy > vigenteHasta);
}

function cumpleDiaDeSemana(
  diasSemana: number[],
  fechaInicioSesion: Date,
  timezone: string
): boolean {
  if (diasSemana.length === 0) {
    return true;
  }

  return diasSemana.includes(diaSemanaEnTimezone(fechaInicioSesion, timezone));
}

/** Índice = número de día del proyecto (0 = domingo), valor = clave de `Intl`. */
const DIAS_EN_INGLES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const FORMATO_FECHA_CIVIL = /^\d{4}-\d{2}-\d{2}$/;
