import {
  AlcanceActividad,
  ComportamientoAlCierre,
  EstadoCatalogo,
  EstadoPropuesta,
  OrigenActividad,
  TipoLimiteTiempo,
  TipoPuntaje,
} from '../generated/prisma/enums';
import type { PrismaService } from '../prisma/prisma.service';

/** Lo mínimo de una propuesta para derivar la Actividad que le corresponde. */
export interface PropuestaParaActividad {
  organizacionId: string;
  grupoId: string;
  creadaPorUsuarioId: string;
  nombre: string;
  descripcion: string | null;
  valorPuntos: number;
  repeticionesMaximasSesion: number;
}

/**
 * Datos de la `Actividad` que nace de una propuesta de integrante (fase-14-10,
 * decisión 8). Los campos de comportamiento son FIJOS, no los elige el
 * integrante: OPCIONAL (nunca obligatoria → nunca castigo), SIN_LIMITE,
 * INDIVIDUAL (nunca reparte puntos a sus hermanos) y sin bono de jefe.
 *
 * `creadaPorTutorId` es el Tutor que aprobó, o null si se creó en modo LIBRE
 * (ahí no hubo tutor en el camino).
 */
export function datosActividadDesdePropuesta(
  propuesta: PropuestaParaActividad,
  creadaPorTutorId: string | null
) {
  return {
    organizacionId: propuesta.organizacionId,
    grupoId: propuesta.grupoId,
    nombre: propuesta.nombre,
    descripcion: propuesta.descripcion,
    tipoPuntaje: TipoPuntaje.OPCIONAL,
    valorPuntos: propuesta.valorPuntos,
    tipoLimiteTiempo: TipoLimiteTiempo.SIN_LIMITE,
    deadlineHora: null,
    duracionCronometroMinutos: null,
    repeticionesMaximasSesion: propuesta.repeticionesMaximasSesion,
    repeticionesMaximasSeccion: null,
    comportamientoAlCierre: ComportamientoAlCierre.ASUME_HECHA,
    alcance: AlcanceActividad.INDIVIDUAL,
    bonoJefePuntos: 0,
    estado: EstadoCatalogo.ACTIVA,
    origen: OrigenActividad.USUARIO,
    creadaPorUsuarioId: propuesta.creadaPorUsuarioId,
    creadaPorTutorId,
  };
}

/**
 * Cupo propio ya usado por un integrante (spec fase-14-10, decisión 4):
 * actividades personales ACTIVA + propuestas PENDIENTE. Las pendientes cuentan
 * para que no pueda acumular decenas de propuestas esperando aprobación.
 */
export async function contarCupoUsado(
  prisma: PrismaService,
  grupoId: string,
  usuarioId: string
): Promise<number> {
  const [activas, pendientes] = await Promise.all([
    prisma.client.actividad.count({
      where: {
        grupoId,
        creadaPorUsuarioId: usuarioId,
        origen: OrigenActividad.USUARIO,
        estado: EstadoCatalogo.ACTIVA,
      },
    }),
    prisma.client.propuestaActividad.count({
      where: { grupoId, creadaPorUsuarioId: usuarioId, estado: EstadoPropuesta.PENDIENTE },
    }),
  ]);

  return activas + pendientes;
}
