import {
  AlcanceActividad,
  TipoPuntaje,
  type ActividadDto,
  type MiEstadoActividadHoyDto,
} from '@dorado/shared-types';

/**
 * Reglas de la lista con la que el Tutor registra el día de un integrante
 * (fase-14-23 T4), separadas del componente para testearlas solas — mismo
 * criterio que `core/turnos.ts` (T1) y `core/home-grupo.ts` (T3).
 *
 * NO deciden qué se puede hacer: eso lo decide el servidor y lo dice el DTO.
 * Traducen ese estado a lo que la fila muestra y ofrece, para que el Tutor vea
 * **la misma lista que el integrante** y entienda por qué algo no se puede.
 */

export interface FilaRegistro {
  actividadId: string;
  nombre: string;
  tipoPuntaje: TipoPuntaje;
  vecesHechas: number;
  topeEfectivo: number;
  puedeCompletar: boolean;
  puedeNoHizo: boolean;
  puedeQuitar: boolean;
  /** Por qué no se puede marcar. null = se puede. */
  motivoBloqueo: string | null;
  /** Nombre de a quién le toca hoy, si la actividad rota y no es de este. */
  turnoAjenoDe: string | null;
}

/**
 * Arma las filas del integrante uniendo su estado de hoy con el catálogo (que
 * es de donde sale el nombre — el DTO de estado trae `actividadId`, no texto).
 *
 * Se descartan las que el integrante **no ve**: `enPlan = false` es la regla
 * única del plan del día (#17), y una actividad que él no ve no puede
 * aparecerle al Tutor como marcable (criterio 2 de la tanda). Las que ve pero
 * no puede hacer hoy **sí** aparecen, con el motivo escrito.
 */
export function filasDeRegistro(
  estado: MiEstadoActividadHoyDto[],
  catalogo: ActividadDto[],
  usuarioId: string
): FilaRegistro[] {
  const porId = new Map(catalogo.map((a) => [a.id, a]));

  return estado
    .filter((e) => e.enPlan)
    .map((e) => {
      const turnoAjenoDe =
        e.turno && e.turno.usuarioIdAsignado !== null && e.turno.usuarioIdAsignado !== usuarioId
          ? e.turno.nombreAsignado
          : null;

      // fase-14-15: las de equipo se VEN en la lista del integrante y no se
      // marcan desde ahí —las completa el jefe desde «Mi equipo», y por esta vía
      // el backend responde 400 ES_TAREA_DE_EQUIPO—. El Tutor ve la misma lista
      // (criterio 2), así que hereda la misma restricción: ofrecerle un botón
      // que el servidor va a rechazar es peor que no ofrecerlo.
      const esDeEquipo = porId.get(e.actividadId)?.alcance === AlcanceActividad.EQUIPO;

      const motivoBloqueo = esDeEquipo
        ? 'La marca el jefe del equipo'
        : motivoDeBloqueo(e, turnoAjenoDe);
      const esOpcional = e.tipoPuntaje === TipoPuntaje.OPCIONAL;

      return {
        actividadId: e.actividadId,
        nombre: porId.get(e.actividadId)?.nombre ?? 'Actividad',
        tipoPuntaje: e.tipoPuntaje,
        vecesHechas: e.vecesHechas,
        topeEfectivo: e.topeEfectivo,
        puedeCompletar: motivoBloqueo === null,
        // El «no hizo» es solo para obligatorias, y no se apila sobre una marca
        // que ya está viva: para eso está «deshacer» en las marcas de hoy. Las
        // de equipo se anulan desde «Mi equipo» (#13), no desde acá.
        puedeNoHizo:
          e.tipoPuntaje === TipoPuntaje.OBLIGATORIA && !e.denegada && !esDeEquipo,
        // Quitar es corregir una OPCIONAL marcada de más (#12). Las de equipo
        // también son opcionales, pero se anulan por su propio camino (#13).
        puedeQuitar: esOpcional && e.vecesHechas > 0 && !esDeEquipo,
        motivoBloqueo,
        turnoAjenoDe,
      };
    });
}

/**
 * El primer motivo que impide marcar, en el orden en que le importa al Tutor:
 * lo que él mismo hizo (la marca roja) antes que lo que decidió el calendario.
 */
function motivoDeBloqueo(
  estado: MiEstadoActividadHoyDto,
  turnoAjenoDe: string | null
): string | null {
  if (estado.denegada) {
    return 'Ya la marcaste como «no hizo»';
  }

  if (turnoAjenoDe) {
    return `Hoy le toca a ${turnoAjenoDe}`;
  }

  if (!estado.disponibleHoy) {
    return 'Hoy no es uno de sus días';
  }

  if (estado.vecesHechas >= estado.topeEfectivo) {
    return estado.topeEfectivo === 0
      ? 'No le queda ningún intento hoy'
      : 'Ya llegó al tope de hoy';
  }

  return null;
}

/** «2 de 3» para las repetibles; vacío para las de una sola vez. */
export function textoDeRepeticiones(fila: FilaRegistro): string {
  if (fila.topeEfectivo <= 1 && fila.vecesHechas <= 1) {
    return '';
  }

  return `${fila.vecesHechas} de ${fila.topeEfectivo}`;
}
