import { CronExpressionParser } from 'cron-parser';

/**
 * Helpers de cron para el ciclo de vida de Sesión/Sección (spec fase-06).
 * Todas las comparaciones se hacen en la timezone del Grupo (IANA, ej.
 * "America/La_Paz") — regla de negocio de la spec y ADR-00 §6: nunca en UTC
 * del servidor directamente.
 */

/** `true` si la expresión parsea como cron válido (5 campos estándar). */
export function esCronValido(expresion: string): boolean {
  if (typeof expresion !== 'string' || expresion.trim().split(/\s+/).length !== 5) {
    return false;
  }

  try {
    CronExpressionParser.parse(expresion);

    return true;
  } catch {
    return false;
  }
}

/**
 * `true` si la expresión matchea el minuto de `instante`, interpretando los
 * campos del cron en `timezone`. Comparación por igualdad de minuto (no por
 * rango) para evitar dobles disparos — spec fase-06, sección Scheduler. El
 * segundo dentro del minuto en que corra el tick no afecta el resultado.
 */
export function cronMatcheaMinuto(expresion: string, instante: Date, timezone: string): boolean {
  const inicioDelMinuto = new Date(Math.floor(instante.getTime() / 60000) * 60000);

  try {
    return CronExpressionParser.parse(expresion, { tz: timezone }).includesDate(inicioDelMinuto);
  } catch {
    return false;
  }
}

/**
 * Ocurrencias del cron en la ventana `(desde, hasta]` — abierta en `desde`,
 * cerrada en `hasta` —, en orden ascendente y evaluadas en `timezone`.
 *
 * Es la base del scheduler con recuperación (fase-14-16): un tick no pregunta
 * "¿este minuto ES el del cron?" sino "¿qué venció desde la última vez que
 * miré?", así que un disparo que cayó mientras el proceso estaba caído se
 * aplica igual en cuanto vuelve. Ventanas consecutivas no se solapan ni dejan
 * huecos, que es lo que da la idempotencia entre ticks.
 *
 * Corta al llegar a `maximo` ocurrencias (el llamador detecta el corte
 * comparando la longitud y continúa en el tick siguiente). Devuelve `[]` si la
 * expresión es inválida — mismo criterio defensivo que `cronMatcheaMinuto`: el
 * guard duro está en el PUT de configuración.
 */
export function ocurrenciasEntre(
  expresion: string,
  desde: Date,
  hasta: Date,
  timezone: string,
  maximo: number
): Date[] {
  const ocurrencias: Date[] = [];

  if (desde.getTime() >= hasta.getTime()) {
    return ocurrencias;
  }

  let iterador: ReturnType<typeof CronExpressionParser.parse>;

  try {
    iterador = CronExpressionParser.parse(expresion, { currentDate: desde, tz: timezone });
  } catch {
    return [];
  }

  while (ocurrencias.length < maximo) {
    let siguiente: Date;

    try {
      siguiente = iterador.next().toDate();
    } catch {
      // Iterador agotado (cron con rango finito): lo ya recolectado es válido.
      break;
    }

    if (siguiente.getTime() > hasta.getTime()) {
      break;
    }

    ocurrencias.push(siguiente);
  }

  return ocurrencias;
}

/**
 * Próxima ocurrencia del cron ESTRICTAMENTE posterior a `desde`, en la
 * timezone dada. Base del cálculo de `extender` (posponer el autocierre).
 * `null` si la expresión no tiene próxima ocurrencia computable.
 */
export function proximaOcurrencia(expresion: string, desde: Date, timezone: string): Date | null {
  try {
    return CronExpressionParser.parse(expresion, { currentDate: desde, tz: timezone })
      .next()
      .toDate();
  } catch {
    return null;
  }
}
