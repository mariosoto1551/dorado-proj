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
