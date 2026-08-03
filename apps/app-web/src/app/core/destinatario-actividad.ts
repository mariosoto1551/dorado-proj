/**
 * Reglas de presentación del destinatario y la vigencia de una actividad
 * (fase-14-24). Están acá y no en el componente por el mismo criterio que
 * `turnos.ts` (#23 T1), `home-grupo.ts` (T3) y `registro-tutor.ts` (T4): son
 * decisiones sobre **qué mostrar**, y eso se testea.
 *
 * Ninguna de estas funciones decide nada de negocio: el servidor ya resolvió
 * quién ve qué. Acá solo se traduce el estado que llegó a texto y a secciones.
 */

import type { ActividadDto } from '@dorado/shared-types';

/** Los cuatro modos de destinatario, derivados de los arrays (nunca guardados). */
export type ModoDestinatario = 'TODOS' | 'ROLES' | 'USUARIOS' | 'EQUIPOS';

/** Una sección de la lista agrupada del Tutor. */
export interface GrupoDeActividades {
  modo: ModoDestinatario;
  titulo: string;
  actividades: ActividadDto[];
}

/** Nombre por id, para armar los chips sin ir a buscar a la API otra vez. */
export interface Nombres {
  usuarios: Map<string, string>;
  roles: Map<string, string>;
  equipos: Map<string, string>;
}

/**
 * El modo, derivado. Espeja `modoDestinatario` del backend a propósito: la
 * alternativa era mandar el modo en el DTO, y un campo derivado que viaja es un
 * campo que se puede desincronizar con los arrays que lo originan.
 */
export function modoDestinatario(actividad: ActividadDto): ModoDestinatario {
  if (actividad.usuariosPermitidos.length > 0) {
    return 'USUARIOS';
  }

  if (actividad.equiposPermitidos.length > 0) {
    return 'EQUIPOS';
  }

  if (actividad.rolesPermitidos.length > 0) {
    return 'ROLES';
  }

  return 'TODOS';
}

/** Orden fijo de las secciones: de lo más general a lo más específico. */
export const ORDEN_SECCIONES: ModoDestinatario[] = ['TODOS', 'ROLES', 'USUARIOS', 'EQUIPOS'];

const TITULOS: Record<ModoDestinatario, string> = {
  TODOS: 'De todo el grupo',
  ROLES: 'Por rol',
  USUARIOS: 'De personas',
  EQUIPOS: 'De equipos',
};

/**
 * La lista del Tutor, agrupada por destinatario y filtrada por el buscador
 * (fase-14-24, decisión 13).
 *
 * **Las secciones vacías no se devuelven**: un grupo que no usa equipos no
 * debería ver un encabezado «De equipos (0)» para siempre. Es la diferencia
 * entre agrupar para ordenar y agrupar para llenar la pantalla.
 */
export function agruparPorDestinatario(
  actividades: ActividadDto[],
  busqueda = ''
): GrupoDeActividades[] {
  const filtradas = filtrarPorNombre(actividades, busqueda);

  return ORDEN_SECCIONES.map((modo) => ({
    modo,
    titulo: TITULOS[modo],
    actividades: filtradas.filter((actividad) => modoDestinatario(actividad) === modo),
  })).filter((grupo) => grupo.actividades.length > 0);
}

/** Búsqueda por nombre: sin distinguir mayúsculas ni acentos. */
export function filtrarPorNombre(
  actividades: ActividadDto[],
  busqueda: string
): ActividadDto[] {
  const termino = normalizar(busqueda);

  if (termino === '') {
    return actividades;
  }

  return actividades.filter((actividad) => normalizar(actividad.nombre).includes(termino));
}

/**
 * El chip de destinatario: «Ana y Luis», «Cocina», «Equipo Rojo». `null` cuando
 * es de todo el grupo — ahí el chip sería ruido, porque es el default.
 *
 * Un id sin nombre conocido (el participante se fue del grupo, por ejemplo) se
 * omite en vez de mostrarse crudo: un uuid en la tarjeta no le dice nada a nadie.
 */
export function textoDestinatario(actividad: ActividadDto, nombres: Nombres): string | null {
  const modo = modoDestinatario(actividad);

  if (modo === 'TODOS') {
    return null;
  }

  const [ids, diccionario] =
    modo === 'USUARIOS'
      ? [actividad.usuariosPermitidos, nombres.usuarios]
      : modo === 'EQUIPOS'
        ? [actividad.equiposPermitidos, nombres.equipos]
        : [actividad.rolesPermitidos, nombres.roles];

  const resueltos = ids
    .map((id) => diccionario.get(id))
    .filter((nombre): nombre is string => Boolean(nombre));

  return resueltos.length > 0 ? enumerar(resueltos) : null;
}

/**
 * El chip de vigencia: «solo el 24/12», «desde el 01/03», «hasta el 30/03»,
 * «del 01/03 al 30/03». `null` si es permanente.
 */
export function textoVigencia(actividad: ActividadDto): string | null {
  const { vigenteDesde, vigenteHasta } = actividad;

  if (!vigenteDesde && !vigenteHasta) {
    return null;
  }

  if (vigenteDesde && vigenteDesde === vigenteHasta) {
    return `solo el ${formatearFecha(vigenteDesde)}`;
  }

  if (vigenteDesde && vigenteHasta) {
    return `del ${formatearFecha(vigenteDesde)} al ${formatearFecha(vigenteHasta)}`;
  }

  return vigenteDesde
    ? `desde el ${formatearFecha(vigenteDesde)}`
    : `hasta el ${formatearFecha(vigenteHasta as string)}`;
}

/**
 * ¿Ya venció, mirado desde `hoy`? Solo para avisar en la lista del Tutor: la
 * decisión de archivarla la toma el servidor al cerrar la Sesión, en la
 * timezone del Grupo. Acá se usa el reloj del navegador a propósito, porque es
 * un aviso y no una regla — y si difiere por unas horas, el peor caso es que el
 * chip diga «vence hoy» un rato de más.
 */
export function estaVencida(actividad: ActividadDto, hoy = new Date()): boolean {
  if (!actividad.vigenteHasta) {
    return false;
  }

  return fechaCivilLocal(hoy) > actividad.vigenteHasta;
}

/** ¿Vence justo hoy? Es el aviso que evita la sorpresa del archivado. */
export function venceHoy(actividad: ActividadDto, hoy = new Date()): boolean {
  return Boolean(actividad.vigenteHasta) && actividad.vigenteHasta === fechaCivilLocal(hoy);
}

/** `"YYYY-MM-DD"` → `"24/12"`; se omite el año cuando es el corriente. */
export function formatearFecha(fecha: string, hoy = new Date()): string {
  const [anio, mes, dia] = fecha.split('-');

  return anio === String(hoy.getFullYear()) ? `${dia}/${mes}` : `${dia}/${mes}/${anio}`;
}

/** `"YYYY-MM-DD"` del navegador, sin pasar por UTC (que correría el día). */
export function fechaCivilLocal(momento = new Date()): string {
  const mes = String(momento.getMonth() + 1).padStart(2, '0');
  const dia = String(momento.getDate()).padStart(2, '0');

  return `${momento.getFullYear()}-${mes}-${dia}`;
}

/** «Ana», «Ana y Luis», «Ana, Luis y Sol». */
function enumerar(nombres: string[]): string {
  if (nombres.length === 1) {
    return nombres[0];
  }

  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

function normalizar(texto: string): string {
  // NFD separa la tilde de la letra y el rango U+0300–U+036F la borra: buscar
  // "practicar" tiene que encontrar "Práctica de piano".
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
