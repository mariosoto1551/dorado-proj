/**
 * Reglas de presentación de los turnos rotativos (fase-14-21). Están acá y no
 * en el componente porque son decisiones sobre QUÉ decirle al Tutor sobre el
 * reparto que armó, y eso se testea.
 */

import type { FrecuenciaTurno, ModoTurno, TurnoActividadDto } from '@dorado/shared-types';

/**
 * Lo que el armador de turnos tiene en pantalla, sin persistir (fase-14-23).
 * Desde la T1 el componente es CONTROLADO: no llama a la API por su cuenta,
 * emite este estado y el formulario que lo contiene decide cuándo guardarlo.
 */
export interface EstadoTurnoForm {
  activo: boolean;
  modo: ModoTurno;
  frecuencia: FrecuenciaTurno;
  /** Lista ordenada de usuarioId, con repetidos permitidos (decisión 12 del #21). */
  secuencia: string[];
}

/** Qué llamada hay que hacer al guardar la actividad, si es que hay alguna. */
export type AccionTurno = 'ninguna' | 'guardar' | 'apagar';

/**
 * Decide qué persistir de los turnos al apretar Guardar (fase-14-23, T1).
 *
 * Existe porque con un solo botón de submit la pregunta «¿hay algo que mandar?»
 * deja de ser obvia: antes la respuesta era siempre sí, porque el usuario había
 * apretado un botón que solo hacía eso. Los casos que importan:
 *
 * - Apagar solo tiene sentido si había algo encendido; si nunca rotó, destildar
 *   una casilla que ya estaba destildada no debería mandar un DELETE.
 * - Una secuencia vacía no se guarda: el backend exige al menos una posición, y
 *   mandarla sería cambiar un error de formulario por un 400.
 * - Sin cambios respecto de lo guardado no se manda nada. Un PUT idempotente no
 *   rompería, pero sella una vuelta nueva de la rotación (decisión 15 del #21):
 *   guardar la actividad sin haber tocado los turnos no debe alterar a quién le
 *   toca mañana.
 */
export function accionDeTurno(
  original: TurnoActividadDto | null,
  actual: EstadoTurnoForm
): AccionTurno {
  const rotabaAntes = original?.activo === true;

  if (!actual.activo) {
    return rotabaAntes ? 'apagar' : 'ninguna';
  }

  if (actual.secuencia.length === 0) {
    return 'ninguna';
  }

  return hayCambios(original, actual) ? 'guardar' : 'ninguna';
}

function hayCambios(original: TurnoActividadDto | null, actual: EstadoTurnoForm): boolean {
  if (!original || !original.activo) {
    return true;
  }

  const secuenciaOriginal = original.posiciones.map((posicion) => posicion.usuarioId);

  return (
    original.modo !== actual.modo ||
    original.frecuencia !== actual.frecuencia ||
    secuenciaOriginal.length !== actual.secuencia.length ||
    secuenciaOriginal.some((usuarioId, i) => usuarioId !== actual.secuencia[i])
  );
}

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

/**
 * El texto del chip de turnos en la tarjeta de la lista (fase-14-23, T1).
 *
 * Contesta de una vez las dos preguntas que el Tutor se hace mirando la lista:
 * si la actividad rota y a quién le toca. `null` para una actividad sin turnos
 * activos: la AUSENCIA del chip es la que dice «es de todos» (decisión 2), así
 * que devolver texto acá pintaría un chip que no debería existir.
 *
 * Sin asignación vigente —no hay Sesión abierta todavía, o hoy no se selló
 * turno, que son estados normales y no errores— el chip anuncia la rotación
 * pero no arriesga un nombre: el de la vuelta anterior sería directamente
 * falso (decisión 3).
 */
export function textoDelChipDeTurno(
  tieneTurnoActivo: boolean,
  nombreAsignado: string | null
): string | null {
  if (!tieneTurnoActivo) {
    return null;
  }

  return nombreAsignado ? `Hoy: ${nombreAsignado}` : 'Por turnos';
}
