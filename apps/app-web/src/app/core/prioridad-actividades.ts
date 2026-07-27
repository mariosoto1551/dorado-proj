import type { ActividadDto } from '@dorado/shared-types';

/**
 * Orden de la lista de hoy del integrante (fase-14-14, decisión 1 de
 * `docs/phases/fase-14-14-prioridad-visual-de-la-lista.md`):
 *
 * 1. Las OBLIGATORIAS siempre arriba de las opcionales.
 * 2. Dentro de cada grupo: primero lo que tiene hora límite, después cronómetro,
 *    al final sin límite.
 * 3. Entre dos con hora límite, la que vence antes.
 *
 * Vive en `core/` y no en el componente para poder testear el orden exacto que
 * pide el criterio de aceptación, sin montar la pantalla entera.
 */

/** Peso del tipo: las obligatorias van siempre arriba. */
function pesoTipo(actividad: ActividadDto): number {
  return actividad.tipoPuntaje === 'OBLIGATORIA' ? 0 : 1;
}

/**
 * Peso del límite de tiempo: lo que tiene reloj corriendo apura más. El
 * cronómetro apura menos que un deadline porque lo arranca el integrante cuando
 * quiere, así que va en el medio.
 */
function pesoLimite(actividad: ActividadDto): number {
  switch (actividad.tipoLimiteTiempo) {
    case 'DEADLINE':
      return 0;
    case 'CRONOMETRO':
      return 1;
    default:
      return 2;
  }
}

/**
 * Comparador para `Array.prototype.sort`. `venceEn` devuelve el instante de
 * vencimiento en ms, o `Number.MAX_SAFE_INTEGER` si la actividad no tiene hora
 * límite (nunca `Infinity`: `Infinity - Infinity` es NaN y volvería el
 * comparador inconsistente, con orden impredecible entre las sin deadline).
 *
 * `sort` es estable por especificación, así que dos actividades empatadas en los
 * tres criterios conservan el orden en que vinieron de la API (`createdAt asc`).
 */
export function compararPrioridad(
  a: ActividadDto,
  b: ActividadDto,
  venceEn: (actividad: ActividadDto) => number
): number {
  const porTipo = pesoTipo(a) - pesoTipo(b);

  if (porTipo !== 0) {
    return porTipo;
  }

  const porLimite = pesoLimite(a) - pesoLimite(b);

  if (porLimite !== 0) {
    return porLimite;
  }

  return venceEn(a) - venceEn(b);
}
