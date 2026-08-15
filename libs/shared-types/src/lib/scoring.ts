import { PrincipalType } from './auth';

export enum TipoOrigenPuntos {
  ACTIVIDAD_COMPLETADA = 'ACTIVIDAD_COMPLETADA',
  NO_HIZO = 'NO_HIZO',
  CONDUCTA = 'CONDUCTA',
  CORRECCION = 'CORRECCION',
  /** fase-14-31: el Tutor suma o resta a mano, por algo de fuera del catálogo. */
  AJUSTE_MANUAL = 'AJUSTE_MANUAL',
}

export interface EventoPuntosDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  usuarioId: string;
  seccionId: string;
  sesionId: string;
  tipoOrigen: TipoOrigenPuntos;
  /** `null` solo en `AJUSTE_MANUAL`: no hay fila de origen a la que apuntar. */
  origenId: string | null;
  puntosSnapshot: number;
  registradoPorId: string;
  registradoPorTipo: PrincipalType;
  corregidoDeId: string | null;
  /**
   * fase-14-33: el asiento se escribió en una Sesión que ya había cerrado.
   * `null` en todo lo anterior a ese ítem y en todo lo del día. **No afecta
   * cómo suma**: el puntaje se sigue derivando al leer sobre todos los asientos
   * de la Sección, con marca o sin ella (regla 1).
   */
  cargadoRetroactivamenteEn: string | null;
  createdAt: string;
}

export interface UmbralZonaDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  nombreZona: string;
  orden: number;
  puntosMin: number;
  puntosMax: number | null;
  colorHex: string;
}

export interface PuntajeUsuarioDto {
  usuarioId: string;
  seccionId: string;
  puntajeTotal: number;
  zona: UmbralZonaDto | null;
  descalificado: boolean;
}

/**
 * Config de scoring por Grupo (fase-14). `puntosIniciales` es la base con la
 * que cada usuario arranca en CADA Sección — se suma al derivar el puntaje.
 * La configura el admin del grupo; 0 = arrancar en cero (histórico).
 */
export interface ConfiguracionScoringGrupoDto {
  puntosIniciales: number;
}

export interface DescalificacionDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  usuarioId: string;
  seccionId: string;
  motivo: string;
  registradaPorTutorId: string;
  createdAt: string;
}

/**
 * Puntaje derivado de un Equipo (fase-14-09): suma de los EventoPuntos con ese
 * equipoId. Vista de solo lectura del ledger — nunca un acumulado guardado.
 */
export interface PuntajeEquipoDto {
  equipoId: string;
  /** null = todas las secciones; si viene, solo esa. */
  seccionId: string | null;
  puntajeTotal: number;
  porMiembro: Array<{ usuarioId: string; puntos: number }>;
}

/**
 * Puntaje de un participante dentro del resumen del Grupo (fase-14-29 tanda 3,
 * herramienta `resumen_puntajes`). Sin nombre a propósito: scoring no conoce
 * nombres y no debe salir a identity para armar esto — quien consume el
 * resumen ya tiene la lista de participantes y compone por ID (regla 2).
 */
export interface PuntajeResumidoDto {
  usuarioId: string;
  puntajeTotal: number;
  /** Nombre de la zona alcanzada, o null si ninguna matcheó / está descalificado. */
  nombreZona: string | null;
  descalificado: boolean;
}

/**
 * Foto de los puntajes del Grupo en la Sección más reciente que tenga
 * movimiento (fase-14-29). La Sección se resuelve dentro de scoring, desde su
 * propio ledger: pedírsela a session-service encadenaría un tercer servicio
 * para responder una pregunta que el ledger ya contesta.
 *
 * `seccionId` en null (y la lista vacía) significa que el Grupo todavía no
 * registró un solo punto — no es un error.
 */
export interface ResumenPuntajesGrupoDto {
  grupoId: string;
  seccionId: string | null;
  /** Si los puntajes salen del snapshot `ResultadoSeccion` (Sección ya evaluada) o del ledger en vivo. */
  origen: 'SNAPSHOT' | 'EN_VIVO';
  puntajes: PuntajeResumidoDto[];
}

// --- Contratos de request de la escala (fase-14-30 tanda 2) ---
//
// Ver la nota equivalente en activity.ts: las clases con decoradores de
// scoring-service los `implements`, para que un campo renombrado rompa el build
// de quien arme un request con esta forma en vez de fallar al aplicarlo.

export interface CrearUmbralRequest {
  nombreZona: string;
  /** 1 = la zona más baja. Define el orden de la escala, no el puntaje. */
  orden: number;
  puntosMin: number;
  /**
   * `null` = sin techo, y es **la zona más alta**. No es lo mismo que omitirlo:
   * por eso el request lo acepta explícitamente (la clase usa `ValidateIf` y no
   * `IsOptional`, que también saltearía el null).
   */
  puntosMax?: number | null;
  /** "#RRGGBB" — el frontend nunca lo hardcodea, lo lee de la API. */
  colorHex: string;
}

/** PATCH: todo opcional, `puntosMax: null` incluido con su significado. */
export type EditarUmbralRequest = Partial<CrearUmbralRequest>;

/** PUT /scoring/grupos/:grupoId/configuracion. 0 = arrancar en cero. */
export interface GuardarConfiguracionScoringRequest {
  puntosIniciales: number;
}

/**
 * `POST /scoring/grupos/:grupoId/usuarios/:usuarioId/ajuste` (fase-14-31).
 *
 * Espeja `AjustarMonedasRequest` campo por campo **salvo el nombre del
 * número**: puntos y monedas son dos cosas independientes (decisión 1 del
 * #28) y llamarle `monto` a los puntos las confundiría en la primera lectura.
 *
 * La otra diferencia deliberada con las monedas no está acá sino en el
 * servicio: **no hay piso en 0**. Un puntaje negativo es un estado legítimo
 * —la zona Rojo existe y `puntosMin` puede ser negativo—; un saldo negativo no.
 */
export interface AjustarPuntosRequest {
  /** Con signo: positivo suma, negativo resta. Nunca 0. */
  puntos: number;
  /** Obligatorio: un movimiento manual sin explicación es inauditable. */
  motivo: string;
  /**
   * fase-14-33: en qué Sesión de la Sección vigente cae el asiento. Sin él, la
   * abierta — el comportamiento del #31, byte por byte.
   *
   * **No hay `motivoRetroactivo` acá y no es un olvido**: `motivo` ya es
   * obligatorio para todo ajuste, y pedir dos textos para el mismo movimiento
   * es fricción sin información. La marca en la fila sí se escribe igual.
   */
  sesionId?: string;
}

/**
 * La configuración de scoring por REST interno (fase-14-30 tanda 3). Sin
 * campos de tenant y con el default aplicado: un grupo sin fila arranca cada
 * Sección en 0, que es el comportamiento histórico.
 */
export interface ConfiguracionScoringInternaDto {
  puntosIniciales: number;
}

/**
 * Un ajuste manual del ledger, servido por REST interno para el timeline
 * (fase-14-34).
 *
 * Existe porque el historial de la sesión vive en activity-service y estos
 * asientos viven en scoring: sin este endpoint, la única forma de mostrarlos
 * juntos sería un join entre bases, que es exactamente lo que la regla 2
 * prohíbe. Va por ID y sin nombres — quien arma el timeline ya los resolvió.
 *
 * **Solo `AJUSTE_MANUAL`.** Las `CORRECCION` quedan afuera a propósito: son el
 * contra-asiento automático de una fila que el timeline ya muestra tachada, y
 * repetirlas como una fila propia contaría dos veces el mismo hecho.
 */
export interface AjusteHistorialInternoDto {
  id: string;
  usuarioId: string;
  /** Con signo, tal cual quedó en el ledger. */
  puntos: number;
  /** Siempre presente: el endpoint de ajuste lo exige. */
  motivo: string;
  registradoPorId: string;
  registradoPorTipo: string;
  cargadoRetroactivamenteEn: string | null;
  createdAt: string;
}
