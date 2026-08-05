/**
 * Un chequeo en tiempo de compilación para las clases de request de los
 * servicios (fase-14-30 tanda 2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ `implements` NO ALCANZA:
 *
 * Que una clase con decoradores `implements` su contrato de esta librería es lo
 * que hace que renombrar un campo **obligatorio** rompa el build. Pero por
 * tipado estructural, una clase a la que le falta un campo **opcional** del
 * contrato sigue siendo asignable: renombrar `permiteAutoreporte` en el
 * servicio no rompería nada, y quien arme un request con esta forma —el
 * asistente de IA— simplemente dejaría de poder configurarlo.
 *
 * Es el mismo agujero exacto que el fase-14-29 encontró del otro lado del
 * cable, con los esquemas Zod y `z.ZodType<Contrato>` (ver la nota larga de
 * `apps/ai-service/src/propuestas/esquemas.ts`), y se cierra de la misma forma:
 * comparando las CLAVES, que es lo que la asignabilidad no mira.
 *
 * Uso, una línea por clase, al lado de su `implements`:
 *
 * ```ts
 * type _CrearConductaCubierto = Exhaustivo<
 *   ClavesNoCubiertas<ContratoCrear, CrearConductaRequest>
 * >;
 * ```
 *
 * Si el contrato declara una clave que la clase no tiene, el error nombra
 * exactamente cuál.
 *
 * Van como DOS tipos y no como uno solo envolviendo al otro porque la
 * restricción `extends never` no se puede verificar sobre tipos genéricos: hace
 * falta aplicarla donde los dos tipos ya son concretos. Es el mismo par que usa
 * `apps/ai-service/src/propuestas/esquemas.ts` para los esquemas Zod.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Falla a compilar si `T` no es `never`, mostrando qué claves quedaron. */
export type Exhaustivo<T extends never> = T;

/** Las claves que el contrato declara y la clase no tiene. */
export type ClavesNoCubiertas<TContrato, TClase> = Exclude<keyof TContrato, keyof TClase>;
