import { EstadoSeccion, EstadoSesion } from '@dorado/shared-types';

import type { SeccionActualInterna } from '../clientes/session-client.service';
import { NoHaySesionAbiertaException } from './excepciones';

/**
 * Resuelve la Sección ABIERTA con Sesión ABIERTA a partir de la respuesta del
 * interno de session (fase-14-09: reusado por tareas de equipo y aprobación de
 * reportes, mismo criterio que `RegistroService.resolverSesionAbierta`).
 */
export function resolverSesionAbierta(seccion: SeccionActualInterna | null): {
  seccionId: string;
  sesionId: string;
  /** fase-14-11: el día de la Sesión decide si una actividad programada aplica. */
  fechaInicioSesion: Date;
} {
  if (!seccion || seccion.estado !== EstadoSeccion.ABIERTA) {
    throw new NoHaySesionAbiertaException();
  }

  const abierta = seccion.sesiones.find((sesion) => sesion.estado === EstadoSesion.ABIERTA);

  if (!abierta) {
    throw new NoHaySesionAbiertaException();
  }

  return {
    seccionId: seccion.id,
    sesionId: abierta.id,
    fechaInicioSesion: new Date(abierta.fechaInicio),
  };
}
