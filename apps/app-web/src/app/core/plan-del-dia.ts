import type { MiEstadoActividadHoyDto } from '@dorado/shared-types';

/**
 * El plan del día (fase-14-17): con el modo activo, las OPCIONALES del catálogo
 * del tutor no se muestran hasta que el integrante las elige.
 *
 * Vive en `core/` y no en el componente por la misma razón que
 * `prioridad-actividades.ts` (ítem 14): son tres reglas de una línea que
 * deciden qué se ve, y se pueden testear sin montar la pantalla entera.
 *
 * Las tres toman el estado del servidor (`mi-estado-hoy`) y **fallan hacia
 * mostrar**: sin estado cargado la actividad se ve. Esconder algo por un dato
 * que no llegó es mucho peor que mostrarlo de más — el servidor valida igual.
 */

/** ¿Va en la lista de hoy? Regla única: el servidor ya resolvió `enPlan`. */
export function seMuestraEnLaLista(estado: MiEstadoActividadHoyDto | undefined): boolean {
  return estado?.enPlan ?? true;
}

/**
 * ¿Se ofrece en la hoja «Elegir»? Solo lo que el plan esconde, que todavía no
 * está elegido y que hoy se puede hacer (fase-14-11: ofrecer una actividad
 * programada para otro día sería ofrecer algo que el servidor rechaza).
 */
export function seOfreceParaElegir(estado: MiEstadoActividadHoyDto | undefined): boolean {
  return estado !== undefined && estado.requiereSeleccion && !estado.enPlan && estado.disponibleHoy;
}

/**
 * ¿Se puede sacar del plan? Solo lo elegido y **no empezado**: sin completadas
 * (ni siquiera las que el tutor quitó — el intento se gastó igual, ítem 12) y
 * sin el cronómetro corriendo. El servidor responde 409 `ACTIVIDAD_YA_EMPEZADA`
 * en el mismo caso, así que el botón no promete lo que no se puede.
 */
export function sePuedeQuitarDelPlan(
  estado: MiEstadoActividadHoyDto | undefined,
  cronometroCorriendo: boolean
): boolean {
  return (
    estado !== undefined &&
    estado.requiereSeleccion &&
    estado.enPlan &&
    estado.vecesHechas === 0 &&
    estado.vecesPerdidas === 0 &&
    !cronometroCorriendo
  );
}
