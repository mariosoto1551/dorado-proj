/**
 * Sorteo uniforme sin ponderación (spec fase-08 para `sortear`, reutilizado por
 * la bancarrota de fase-14-22 y por los productos SORPRESA). Vive suelto para
 * que los tres caminos usen exactamente la misma mecánica — que un castigo
 * salga con otra distribución que un premio sería una diferencia invisible y
 * difícil de explicar.
 */
export function elegirAlAzar<T>(items: readonly T[]): T | null {
  if (items.length === 0) {
    return null;
  }

  return items[Math.floor(Math.random() * items.length)];
}
