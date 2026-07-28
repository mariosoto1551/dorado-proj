import {
  AlcanceActividad,
  OrigenActividad,
  TipoPuntaje,
} from '../generated/prisma/enums';

/**
 * Elegibilidad para el plan del día (spec fase-14-17, decisión 1).
 *
 * El plan solo esconde **una** familia de actividades: las OPCIONALES
 * INDIVIDUALES del catálogo del Tutor que el Tutor no fijó. Todo lo demás se ve
 * siempre, y por buenas razones:
 *
 * - OBLIGATORIA: no es un menú, no se elige.
 * - EQUIPO: este usuario no la marca (la marca el jefe, ítem 15).
 * - `origen = USUARIO` («Mis metas»): ya las creó a propósito.
 * - `siempreVisible`: el Tutor la fijó justamente para que esté a la vista.
 *
 * Vive acá, en un solo lugar, porque la misma regla la usan tres caminos:
 * `mi-estado-hoy` (qué marcar como `requiereSeleccion`), `PlanDiaService`
 * (qué se puede meter al plan) y el alta automática al completar.
 */
export function esElegibleParaElPlan(actividad: {
  tipoPuntaje: string;
  alcance: string;
  origen: string;
  siempreVisible: boolean;
}): boolean {
  return (
    actividad.tipoPuntaje === TipoPuntaje.OPCIONAL &&
    actividad.alcance === AlcanceActividad.INDIVIDUAL &&
    actividad.origen === OrigenActividad.TUTOR &&
    !actividad.siempreVisible
  );
}

/**
 * La actividad está sujeta al plan **ahora**: es elegible y el Grupo tiene el
 * modo encendido. Con el modo apagado devuelve `false` para todas, que es lo
 * que garantiza que un grupo preexistente no cambie de comportamiento.
 */
export function requiereSeleccionDelPlan(
  actividad: {
    tipoPuntaje: string;
    alcance: string;
    origen: string;
    siempreVisible: boolean;
  },
  planDelDiaActivo: boolean
): boolean {
  return planDelDiaActivo && esElegibleParaElPlan(actividad);
}
