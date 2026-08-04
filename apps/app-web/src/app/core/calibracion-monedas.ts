import type { RendimientoAccionDto, RendimientoZonaDto } from '@dorado/shared-types';

/**
 * El aviso de calibración de fase-14-28 (decisión 18), sin Angular en el medio
 * — mismo criterio que `core/termometro.ts` de fase-14-27 y `core/turnos.ts` de
 * fase-14-21: la aritmética se prueba sola.
 *
 * POR QUÉ EXISTE: fase-14-22 avisa al ponerle precio a un producto («≈ N
 * semanas en Verde»); acá el aviso va del otro lado — **cuánto rinde ahora una
 * semana completa** con esta calibración. Sumar ingreso por actividad devalúa
 * todos los precios de la tienda a la vez, y ese es el efecto que el Tutor no
 * puede ver solo mirando los números que acaba de escribir.
 */

export interface Calibracion {
  /** Techo semanal por acciones: lo más alto que alguien puede llegar a cobrar. */
  porAcciones: number;
  /** Lo que paga la zona MÁS ALTA al cerrar. Se comparan dos techos. */
  porZona: number;
}

/**
 * Máximo teórico por semana (la definición que eligió José):
 * `Σ (monedas × repeticiones) × sesiones de la Sección`.
 *
 * Tres cosas que este número decide a propósito:
 *
 * 1. **Multiplica por las repeticiones** porque cada repetición paga (decisión
 *    16). Una actividad de 2 🪙 con tope 3 rinde 6 en un día, no 2.
 * 2. **Incluye el bono del jefe**: es un techo, y el techo lo toca quien es
 *    jefe de todas las tareas de equipo. Contar el caso promedio haría que el
 *    aviso subestime justo el escenario que puede romper la economía.
 * 3. **Las conductas cuentan una vez por sesión.** No tienen tope por sesión —
 *    el Tutor puede registrar la misma diez veces—, así que un máximo real
 *    sería infinito. Una vez por día es la estimación honesta, y es lo que el
 *    texto del aviso dice con el «≈».
 *
 * Las acciones que no pueden rendir (`puedeRendir: false`, decisión 15) no
 * suman aunque tengan un número cargado: nunca van a pagar.
 */
export function calcularCalibracion(
  actividades: RendimientoAccionDto[],
  conductas: RendimientoAccionDto[],
  sesionesPorSeccion: number,
  zonas: RendimientoZonaDto[]
): Calibracion {
  const sesiones = Math.max(sesionesPorSeccion, 1);

  const porSesion =
    sumar(actividades, (fila) => {
      const repeticiones = Math.max(fila.repeticionesMaximasSesion ?? 1, 1);

      return fila.monedas * repeticiones + fila.monedasBonoJefe;
    }) + sumar(conductas, (fila) => fila.monedas);

  return {
    porAcciones: porSesion * sesiones,
    porZona: Math.max(0, ...zonas.map((zona) => zona.monedas ?? 0)),
  };
}

function sumar(
  filas: RendimientoAccionDto[],
  valor: (fila: RendimientoAccionDto) => number
): number {
  return filas
    .filter((fila) => fila.puedeRendir)
    .reduce((total, fila) => total + valor(fila), 0);
}
