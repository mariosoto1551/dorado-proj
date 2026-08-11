import { EstadoSeccion, EstadoSesion } from '@dorado/shared-types';

import type { SeccionActualInterna } from '../clientes/session-client.service';
import { NoHaySesionAbiertaException, SesionNoEditableException } from './excepciones';

/**
 * Resuelve la Sección ABIERTA con Sesión ABIERTA a partir de la respuesta del
 * interno de session (fase-14-09: reusado por tareas de equipo y aprobación de
 * reportes, mismo criterio que `RegistroService.resolverSesionAbierta`).
 *
 * fase-14-33: sigue existiendo, y no por compatibilidad — es el resolvedor de
 * los caminos que **no** admiten Sesión ajena (el registro del integrante, el
 * turno vigente, el plan del día). Los que sí la admiten usan
 * `resolverSesionDeTrabajo`.
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

/** Dónde cae una escritura del Tutor (fase-14-33). */
export interface SesionDeTrabajo {
  seccionId: string;
  sesionId: string;
  /** Número dentro de la Sección (1..n): lo que la pantalla muestra. */
  sesionNumero: number;
  /** ABIERTA solo si es la Sesión en curso de una Sección ABIERTA. */
  sesionEstado: EstadoSesion;
  /**
   * fase-14-11 + fase-14-24 + fase-14-21: el día de la Sesión **elegida** —
   * no el de hoy— es el que decide programación, vigencia y turno (decisión 4).
   */
  fechaInicioSesion: Date;
  /**
   * true si NO es la Sesión ABIERTA de una Sección ABIERTA. Gobierna las tres
   * cosas que cambian en una escritura retroactiva: motivo obligatorio, marca
   * en la fila, y el salteo de deadline/cronómetro (decisiones 5 y 7).
   */
  retroactiva: boolean;
}

/**
 * La Sesión donde cae una escritura del Tutor (fase-14-33).
 *
 * Sin `sesionIdPedido` resuelve exactamente lo que resolvía antes de este ítem
 * —la Sesión ABIERTA de una Sección ABIERTA, 409 si no la hay— y por eso
 * ningún cliente viejo cambia de comportamiento (decisión 10).
 *
 * Con `sesionIdPedido`, el universo editable es **la lista de Sesiones que el
 * interno de session ya devuelve**: ese endpoint entrega la Sección no-CERRADA
 * más reciente con todas sus Sesiones, que es exactamente lo que la decisión 2
 * define como editable. No hay una consulta nueva ni un endpoint nuevo — lo
 * único que faltaba era poder apuntarle.
 *
 * El `sesionIdPedido` **nunca llega crudo del body**: el controlador lo pasa
 * solo si el principal no es un USUARIO (decisión 11), y acá se valida contra
 * esa lista. Es la regla 3 del proyecto con otra ropa: si el cliente pudiera
 * nombrar cualquier Sesión, podría nombrar la de otro grupo.
 */
export function resolverSesionDeTrabajo(
  seccion: SeccionActualInterna | null,
  sesionIdPedido?: string
): SesionDeTrabajo {
  if (!seccion) {
    throw new NoHaySesionAbiertaException();
  }

  if (!sesionIdPedido) {
    const abierta = resolverSesionAbierta(seccion);

    return {
      ...abierta,
      sesionNumero: numeroDe(seccion, abierta.sesionId),
      sesionEstado: EstadoSesion.ABIERTA,
      retroactiva: false,
    };
  }

  // La Sección CERRADA no puede llegar hasta acá (el interno solo devuelve la
  // no-CERRADA más reciente), pero se valida explícito igual: de esto depende
  // la regla 6, y una invariante que solo se sostiene por lo que hace otro
  // servicio es una que se rompe el día que ese servicio cambia.
  if (seccion.estado === EstadoSeccion.CERRADA) {
    throw new SesionNoEditableException();
  }

  const pedida = seccion.sesiones.find((sesion) => sesion.id === sesionIdPedido);

  if (!pedida) {
    throw new SesionNoEditableException();
  }

  const esLaAbierta =
    seccion.estado === EstadoSeccion.ABIERTA && pedida.estado === EstadoSesion.ABIERTA;

  return {
    seccionId: seccion.id,
    sesionId: pedida.id,
    sesionNumero: pedida.numero,
    sesionEstado: pedida.estado,
    fechaInicioSesion: new Date(pedida.fechaInicio),
    retroactiva: !esLaAbierta,
  };
}

/**
 * La Sección vigente admite escritura (fase-14-33): cualquiera que no esté
 * CERRADA. Lo usan las lecturas para decirle al frontend si tiene que mostrar
 * los botones, sin que la pantalla reimplemente la regla 6.
 */
export function seccionEsEditable(seccion: SeccionActualInterna | null): boolean {
  return seccion !== null && seccion.estado !== EstadoSeccion.CERRADA;
}

function numeroDe(seccion: SeccionActualInterna, sesionId: string): number {
  return seccion.sesiones.find((sesion) => sesion.id === sesionId)?.numero ?? 1;
}
