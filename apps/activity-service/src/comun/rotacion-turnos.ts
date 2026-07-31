/**
 * La aritmética de la rotación (spec fase-14-21). Está separada del service a
 * propósito: es la parte que decide **a quién le toca**, y es la que tiene que
 * poder probarse sin base ni bus de por medio.
 *
 * El modelo mental que hay que tener presente: la secuencia es una **lista
 * ordenada de posiciones**, no un conjunto de participantes. `[José, Luciana,
 * José, Alejandra]` son 4 posiciones y 3 personas — José recibe 2 de cada 4
 * turnos porque aparece dos veces, no porque haya una regla de peso.
 */

/** Una posición inválida se saltea; el motivo se muestra al Tutor. */
export type MotivoSalteo = 'YA_NO_ESTA_EN_EL_GRUPO' | 'SIN_EL_ROL';

export interface CandidatoTurno {
  usuarioId: string;
  /** Índice dentro de `ordenUsuarioIds` que consumiría este turno. */
  indice: number;
}

export interface ResultadoAvance {
  /** null = ninguna posición de la vuelta quedó válida (decisión 19). */
  candidato: CandidatoTurno | null;
  /** Posiciones que se saltearon para llegar hasta acá, con su motivo. */
  salteadas: Array<{ indice: number; usuarioId: string; motivo: MotivoSalteo }>;
}

/**
 * Baraja una copia (Fisher-Yates). Recibe el generador para que los tests
 * puedan fijarlo: un turno que reparte castigos no se prueba con `Math.random`
 * suelto.
 */
export function barajar<T>(items: readonly T[], aleatorio: () => number = Math.random): T[] {
  const copia = [...items];

  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }

  return copia;
}

/**
 * El siguiente turno de una vuelta ya sellada, salteando las posiciones que hoy
 * no pueden recibirlo (decisiones 14 y 18: alguien que se fue del grupo o que
 * perdió el rol que la actividad exige).
 *
 * `desdeIndice` es el índice a evaluar primero — el que sigue al último turno
 * consumido, o 0 si la vuelta recién empieza. Nunca se deriva de la fecha
 * (decisión 1): siempre sale de lo que ya está escrito.
 *
 * Devuelve `candidato: null` si se recorre la vuelta entera sin nadie válido.
 * Es preferible a elegir un reemplazante que el Tutor no decidió (decisión 19).
 */
export function siguienteTurno(
  ordenUsuarioIds: readonly string[],
  desdeIndice: number,
  puedeRecibir: (usuarioId: string) => MotivoSalteo | null
): ResultadoAvance {
  const salteadas: ResultadoAvance['salteadas'] = [];

  for (let offset = 0; offset < ordenUsuarioIds.length; offset++) {
    const indice = desdeIndice + offset;

    // La vuelta se agotó: el llamador tiene que sellar la siguiente.
    if (indice >= ordenUsuarioIds.length) {
      break;
    }

    const usuarioId = ordenUsuarioIds[indice];
    const motivo = puedeRecibir(usuarioId);

    if (!motivo) {
      return { candidato: { usuarioId, indice }, salteadas };
    }

    salteadas.push({ indice, usuarioId, motivo });
  }

  return { candidato: null, salteadas };
}

/** ¿La vuelta ya se consumió entera? (el último índice usado fue el final). */
export function vueltaAgotada(
  ordenUsuarioIds: readonly string[],
  ultimoIndice: number | null
): boolean {
  if (ultimoIndice === null) {
    return false;
  }

  return ultimoIndice >= ordenUsuarioIds.length - 1;
}

/**
 * El orden sellado de una vuelta nueva a partir de la secuencia vigente
 * (decisión 15). En `ORDEN_FIJO` es la copia literal; en `AZAR` se barajan las
 * POSICIONES, no las personas (decisión 13) — con `[José, Luciana, José,
 * Alejandra]` cada vuelta sigue teniendo 4 turnos y José sigue teniendo 2, lo
 * que cambia es cuáles.
 */
export function sellarOrdenDeVuelta(
  posiciones: readonly string[],
  modo: 'ORDEN_FIJO' | 'AZAR',
  aleatorio: () => number = Math.random
): string[] {
  return modo === 'AZAR' ? barajar(posiciones, aleatorio) : [...posiciones];
}
