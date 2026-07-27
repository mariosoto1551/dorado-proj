/**
 * Días de la semana, en la única convención del proyecto: **0 = domingo … 6 =
 * sábado** (la de los cron de `session-service` y la de `Actividad.diasSemana`
 * de fase-14-11). La UI los muestra arrancando en lunes, que es como se lee una
 * semana acá, pero el valor guardado nunca cambia.
 *
 * Vive en `core/` porque lo usan la configuración de sesión (fase-06), el form
 * de actividades del tutor y la pantalla de hoy del integrante (fase-14-11).
 */

export interface DiaSemana {
  valor: number;
  etiqueta: string;
}

/** Orden de presentación: lunes primero, domingo último. */
export const DIAS_SEMANA: readonly DiaSemana[] = [
  { valor: 1, etiqueta: 'Lun' },
  { valor: 2, etiqueta: 'Mar' },
  { valor: 3, etiqueta: 'Mié' },
  { valor: 4, etiqueta: 'Jue' },
  { valor: 5, etiqueta: 'Vie' },
  { valor: 6, etiqueta: 'Sáb' },
  { valor: 0, etiqueta: 'Dom' },
];

export const NOMBRE_DIA: Record<number, string> = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
};

/**
 * Resumen en lenguaje natural: "todos los días" / "los martes y jueves" /
 * "de lunes a viernes". `vacio` es el texto cuando no hay ningún día elegido,
 * que según el contexto significa cosas distintas (en la config de sesión es un
 * error; en una actividad programada significa "todos los días").
 */
export function describirDias(dias: number[], vacio = 'todos los días'): string {
  if (dias.length === 0 || dias.length === 7) {
    return dias.length === 7 ? 'todos los días' : vacio;
  }

  const ordenados = [...dias].sort((a, b) => ordenSemana(a) - ordenSemana(b));
  const contiguo = ordenados.every(
    (dia, i) => i === 0 || ordenSemana(dia) === ordenSemana(ordenados[i - 1]) + 1
  );

  if (contiguo && ordenados.length >= 3) {
    return `de ${NOMBRE_DIA[ordenados[0]]} a ${NOMBRE_DIA[ordenados[ordenados.length - 1]]}`;
  }

  const nombres = ordenados.map((dia) => plural(NOMBRE_DIA[dia]));

  if (nombres.length === 1) {
    return `los ${nombres[0]}`;
  }

  return `los ${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

/** Pluraliza un día ("domingo" → "domingos"); los que ya terminan en "s" no cambian. */
function plural(nombre: string): string {
  return nombre.endsWith('s') ? nombre : `${nombre}s`;
}

/** Lunes=1 … Sábado=6, Domingo=7 (para ordenar con la semana arrancando en lunes). */
function ordenSemana(dia: number): number {
  return dia === 0 ? 7 : dia;
}
