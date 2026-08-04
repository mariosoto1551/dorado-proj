import type { UmbralZonaDto } from '@dorado/shared-types';

/**
 * Geometría del termómetro de zonas del home del grupo.
 *
 * Vive acá y no en el componente por la misma razón que `home-grupo.ts`: son
 * reglas puras (escala, colisiones de etiquetas) que se testean solas, sin
 * montar Angular.
 *
 * Todas las posiciones son **porcentaje desde abajo** (0 = piso del tubo,
 * 100 = techo), que es como las consume el template (`bottom: X%`).
 */

/** Un participante, con lo mínimo que el termómetro necesita de él. */
export interface ParticipanteTermometro {
  usuarioId: string;
  nombre: string;
  puntajeTotal: number;
  descalificado: boolean;
}

/** Una zona dibujada como banda del tubo. */
export interface TramoTermometro {
  id: string;
  nombre: string;
  colorHex: string;
  /** Borde inferior de la banda, en % del alto. */
  desde: number;
  /** Borde superior de la banda, en % del alto. */
  hasta: number;
  /** La zona más alta cuando no declara `puntosMax`: se dibuja con flecha. */
  abierta: boolean;
}

/** Fuera de escala: el puntaje se sale del rango que declaran los umbrales. */
export type FueraDeEscala = 'ABAJO' | 'ARRIBA' | null;

/** Un participante ya ubicado sobre el tubo. */
export interface MarcaTermometro {
  usuarioId: string;
  nombre: string;
  puntaje: number;
  descalificado: boolean;
  colorHex: string;
  /** Dónde está REALMENTE el puntaje. Acá apunta la línea guía. */
  posicion: number;
  /** Dónde se dibuja la etiqueta tras separarla de sus vecinas. */
  posicionEtiqueta: number;
  fueraDeEscala: FueraDeEscala;
}

export interface EscalaTermometro {
  tramos: TramoTermometro[];
  /** Ordenadas de mayor a menor puntaje. */
  marcas: MarcaTermometro[];
  /** Puntaje del piso del tubo (el `puntosMin` de la zona más baja). */
  base: number;
  /** Puntaje del techo del tubo (exclusivo). */
  tope: number;
  /** Promedio del grupo, o null si no hay a quién promediar. */
  promedio: number | null;
  posicionPromedio: number;
  /** Zona donde cae el promedio; null si no hay promedio. */
  zonaPromedio: TramoTermometro | null;
  /** Color del mercurio y del bulbo; gris si no hay promedio. */
  colorPromedio: string;
}

export interface OpcionesTermometro {
  /**
   * Separación mínima entre CENTROS de etiquetas contiguas, en % del alto.
   * El componente la calcula desde el alto real en px del tubo.
   */
  separacionMinima?: number;
}

/** Separación de etiquetas por defecto, pensada para un tubo de ~340 px. */
const SEPARACION_POR_DEFECTO = 8;

/** Alto virtual del tramo abierto cuando es la única zona configurada. */
const ANCHO_MINIMO_TRAMO_ABIERTO = 10;

const GRIS_SIN_ZONA = '#94a3b8';

/**
 * Arma la escala completa: bandas, promedio y participantes ya separados.
 *
 * La zona más alta no tiene tope (`puntosMax: null` en el seed), así que se le
 * da el mismo alto que a la anterior en vez de estirarla hasta el puntaje
 * máximo del momento: con techo dinámico la escala se deforma cada vez que
 * alguien suma puntos y deja de poder compararse entre semanas.
 */
export function construirEscala(
  umbrales: UmbralZonaDto[],
  participantes: ParticipanteTermometro[],
  opciones: OpcionesTermometro = {}
): EscalaTermometro {
  const ordenados = [...umbrales].sort((a, b) => a.orden - b.orden);

  if (ordenados.length === 0) {
    return escalaVacia();
  }

  const cortes = calcularCortes(ordenados);
  const base = cortes[0];
  const tope = cortes[cortes.length - 1];
  const total = tope - base;
  const posicionDe = (puntaje: number): number =>
    limitar(((puntaje - base) / total) * 100, 0, 100);

  const tramos = ordenados.map((u, i) => ({
    id: u.id,
    nombre: u.nombreZona,
    colorHex: u.colorHex,
    desde: posicionDe(cortes[i]),
    hasta: posicionDe(cortes[i + 1]),
    abierta: i === ordenados.length - 1 && u.puntosMax === null,
  }));

  const marcas = ubicarEtiquetas(
    ordenarParaElTubo(participantes).map((p) => ({
      usuarioId: p.usuarioId,
      nombre: p.nombre,
      puntaje: p.puntajeTotal,
      descalificado: p.descalificado,
      colorHex: tramoDelPuntaje(p.puntajeTotal, cortes, tramos)?.colorHex ?? GRIS_SIN_ZONA,
      posicion: posicionDe(p.puntajeTotal),
      posicionEtiqueta: posicionDe(p.puntajeTotal),
      fueraDeEscala: fueraDeEscalaDe(p.puntajeTotal, base, tope),
    })),
    opciones.separacionMinima ?? SEPARACION_POR_DEFECTO
  );

  const promedio = promediarNoDescalificados(participantes);
  const zonaPromedio = promedio === null ? null : tramoDelPuntaje(promedio, cortes, tramos);

  return {
    tramos,
    marcas,
    base,
    tope,
    promedio,
    posicionPromedio: promedio === null ? 0 : posicionDe(promedio),
    zonaPromedio,
    colorPromedio: zonaPromedio?.colorHex ?? GRIS_SIN_ZONA,
  };
}

function escalaVacia(): EscalaTermometro {
  return {
    tramos: [],
    marcas: [],
    base: 0,
    tope: 0,
    promedio: null,
    posicionPromedio: 0,
    zonaPromedio: null,
    colorPromedio: GRIS_SIN_ZONA,
  };
}

/**
 * Los n+1 bordes de las n zonas, en puntos.
 *
 * El borde entre dos zonas es el `puntosMin` de la de arriba, no el
 * `puntosMax + 1` de la de abajo: si un Grupo dejó un hueco al configurar sus
 * umbrales, esto lo reparte en vez de dibujar una franja muerta.
 */
function calcularCortes(ordenados: UmbralZonaDto[]): number[] {
  const cortes: number[] = [];

  for (const umbral of ordenados) {
    const anterior = cortes[cortes.length - 1];

    // Umbrales mal configurados (no monótonos) romperían la escala entera.
    cortes.push(anterior === undefined ? umbral.puntosMin : Math.max(umbral.puntosMin, anterior + 1));
  }

  const ultimo = ordenados[ordenados.length - 1];
  const pisoDelUltimo = cortes[cortes.length - 1];

  if (ultimo.puntosMax !== null) {
    cortes.push(Math.max(ultimo.puntosMax + 1, pisoDelUltimo + 1));

    return cortes;
  }

  const anchoDelAnterior =
    cortes.length >= 2 ? pisoDelUltimo - cortes[cortes.length - 2] : 0;

  cortes.push(pisoDelUltimo + Math.max(ANCHO_MINIMO_TRAMO_ABIERTO, anchoDelAnterior));

  return cortes;
}

/** Mayor puntaje primero; a igual puntaje, alfabético (orden estable). */
function ordenarParaElTubo(participantes: ParticipanteTermometro[]): ParticipanteTermometro[] {
  return [...participantes].sort(
    (a, b) => b.puntajeTotal - a.puntajeTotal || a.nombre.localeCompare(b.nombre)
  );
}

/**
 * En qué banda cae un puntaje. Los que se salen por abajo cuentan como la zona
 * más baja y los que se pasan por arriba como la más alta: el tubo los muestra
 * pegados al borde con una flecha, no sin color.
 */
function tramoDelPuntaje(
  puntaje: number,
  cortes: number[],
  tramos: TramoTermometro[]
): TramoTermometro | null {
  for (let i = 0; i < tramos.length; i++) {
    if (puntaje < cortes[i + 1]) {
      return tramos[i];
    }
  }

  return tramos[tramos.length - 1] ?? null;
}

function fueraDeEscalaDe(puntaje: number, base: number, tope: number): FueraDeEscala {
  if (puntaje < base) {
    return 'ABAJO';
  }

  if (puntaje >= tope) {
    return 'ARRIBA';
  }

  return null;
}

/**
 * El descalificado no cuenta para el promedio del grupo: su puntaje ya no
 * representa cómo viene la semana, y arrastraría el mercurio hacia abajo.
 */
function promediarNoDescalificados(participantes: ParticipanteTermometro[]): number | null {
  const cuentan = participantes.filter((p) => !p.descalificado);

  if (cuentan.length === 0) {
    return null;
  }

  const suma = cuentan.reduce((total, p) => total + p.puntajeTotal, 0);

  return Math.round(suma / cuentan.length);
}

/**
 * Separa verticalmente las etiquetas que se pisan, sin mover el punto real.
 *
 * Es la razón de ser de esta función: dos participantes con 80 y 79 puntos caen
 * casi en el mismo lugar y uno taparía al otro. Acá las etiquetas se empujan
 * entre sí lo mínimo necesario y la línea guía del template sigue apuntando a
 * `posicion`, así que nada depende de hover ni de tocar — en un teléfono el
 * hover no existe.
 *
 * `marcas` entra ordenada de mayor a menor posición.
 */
function ubicarEtiquetas(marcas: MarcaTermometro[], separacionPedida: number): MarcaTermometro[] {
  if (marcas.length === 0) {
    return marcas;
  }

  // Con muchos participantes la separación pedida no entra: se comprime hasta
  // el máximo que cabe, que es lo que evita que la última quede fuera del tubo.
  const sep = Math.min(separacionPedida, 100 / marcas.length);
  const mitad = sep / 2;

  // Bajada: cada etiqueta se corre hacia abajo hasta despegarse de la de arriba.
  for (let i = 0; i < marcas.length; i++) {
    const techo = i === 0 ? 100 - mitad : marcas[i - 1].posicionEtiqueta - sep;

    marcas[i].posicionEtiqueta = Math.min(marcas[i].posicion, techo);
  }

  // Subida: las que se pasaron del piso vuelven, empujando a las de arriba.
  for (let i = marcas.length - 1; i >= 0; i--) {
    const piso = i === marcas.length - 1 ? mitad : marcas[i + 1].posicionEtiqueta + sep;

    marcas[i].posicionEtiqueta = Math.max(marcas[i].posicionEtiqueta, piso);
  }

  return marcas;
}

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}
