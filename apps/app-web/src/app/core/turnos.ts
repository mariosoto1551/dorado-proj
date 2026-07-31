/**
 * Reglas de presentación de los turnos rotativos (fase-14-21). Están acá y no
 * en el componente porque son decisiones sobre QUÉ decirle al Tutor sobre el
 * reparto que armó, y eso se testea.
 */

/**
 * El resumen del reparto de una secuencia: «José: 2 de cada 4 días».
 *
 * Solo menciona a quienes aparecen **más de una vez**: con `[José, Luciana,
 * José, Alejandra]` lo único que no se ve de un vistazo en la lista es que José
 * tiene el doble, y eso es lo que el texto tiene que aclarar. Si todos aparecen
 * una vez, el reparto ya es evidente y el texto sería ruido.
 */
export function resumenDeReparto(
  secuencia: readonly string[],
  nombreDe: (usuarioId: string) => string
): string | null {
  if (secuencia.length === 0) {
    return null;
  }

  const veces = new Map<string, number>();

  for (const usuarioId of secuencia) {
    veces.set(usuarioId, (veces.get(usuarioId) ?? 0) + 1);
  }

  const repetidos = [...veces.entries()].filter(([, cantidad]) => cantidad > 1);

  if (repetidos.length === 0) {
    return `Vuelta de ${secuencia.length} ${secuencia.length === 1 ? 'turno' : 'turnos'}.`;
  }

  const detalle = repetidos
    .map(([usuarioId, cantidad]) => `${nombreDe(usuarioId)}: ${cantidad} de cada ${secuencia.length}`)
    .join(' · ');

  return `${detalle}.`;
}
