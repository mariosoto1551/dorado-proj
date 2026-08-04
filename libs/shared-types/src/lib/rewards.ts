import type {
  AlcanceActividad,
  ComportamientoAlCierre,
  TipoPuntaje,
} from './activity';

export enum MecanicaRecompensa {
  SELECCION = 'SELECCION',
  AZAR = 'AZAR',
}

export enum EstadoCanje {
  PENDIENTE_ENTREGA = 'PENDIENTE_ENTREGA',
  ENTREGADA = 'ENTREGADA',
}

/**
 * Modo de recompensas del Grupo (fase-14-22 decisión 1). `DIRECTO` es el
 * comportamiento de Fase 8 y el default: un grupo sin configuración explícita
 * canjea premios por zona igual que siempre.
 */
export enum ModoRecompensas {
  DIRECTO = 'DIRECTO',
  TIENDA = 'TIENDA',
}

export interface ConfiguracionRecompensasGrupoDto {
  grupoId: string;
  modo: ModoRecompensas;
  /** No null = se aplica al abrir la próxima Sección (decisión 9). */
  modoPendiente: ModoRecompensas | null;
  nombreMoneda: string;
  iconoMoneda: string;
}

/** Movimientos del ledger de monedas (fase-14-22 decisión 3). */
export enum TipoMovimientoMoneda {
  RENDIMIENTO_ZONA = 'RENDIMIENTO_ZONA',
  MULTA_ZONA = 'MULTA_ZONA',
  SALDO_SALDADO = 'SALDO_SALDADO',
  COMPRA = 'COMPRA',
  AJUSTE_TUTOR = 'AJUSTE_TUTOR',
  REVERSION = 'REVERSION',
  /** fase-14-28: pagó una actividad o una conducta BUENA. Siempre positivo. */
  RENDIMIENTO_ACCION = 'RENDIMIENTO_ACCION',
  /** fase-14-28: el Tutor quitó (negativo) o deshizo su quita (positivo). */
  REVERSION_ACCION = 'REVERSION_ACCION',
}

export interface MovimientoMonedaDto {
  id: string;
  tipo: TipoMovimientoMoneda;
  /** Con signo: positivo acredita, negativo debita. */
  monto: number;
  seccionId: string | null;
  motivo: string | null;
  registradoPorId: string;
  registradoPorTipo: string;
  createdAt: string;
}

/**
 * Saldo SIEMPRE derivado de la suma del ledger, nunca una columna (regla 1).
 */
export interface BilleteraDto {
  usuarioId: string;
  grupoId: string;
  saldo: number;
  nombreMoneda: string;
  iconoMoneda: string;
  /**
   * fase-14-25: para qué está ahorrando, para que el Tutor pueda reforzarlo
   * fuera de la app. `null` si no eligió objetivo o si el producto se archivó.
   */
  objetivoNombre?: string | null;
  /** Monedas que le faltan para el objetivo; `null` si no tiene. */
  objetivoFaltan?: number | null;
}

/**
 * El objetivo de ahorro del participante (fase-14-25). `faltan` se deriva
 * contra el saldo del momento, igual que en la vitrina — no se guarda.
 */
export interface ObjetivoDto {
  productoId: string;
  nombre: string;
  precio: number;
  faltan: number;
}

export interface MiBilleteraResponse extends BilleteraDto {
  movimientos: MovimientoMonedaDto[];
  /** Total de movimientos del participante, para paginar. */
  total: number;
  /**
   * fase-14-25: `null` si no eligió ninguno, o si el producto que había elegido
   * quedó archivado — en ese caso la fila NO se borra (decisión 6): si el Tutor
   * lo desarchiva, el objetivo vuelve solo.
   */
  objetivo: ObjetivoDto | null;
}

/** Body de `PUT /rewards/grupos/:grupoId/mi-objetivo` (fase-14-25). */
export interface FijarObjetivoRequest {
  productoId: string;
}

/** fase-14-22 decisión 7: el catálogo se tipa. Ortogonal al modo. */
export enum TipoItemCatalogo {
  PREMIO = 'PREMIO',
  CASTIGO = 'CASTIGO',
}

export interface RecompensaDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  nombre: string;
  descripcion: string | null;
  imagenUrl: string | null;
  tipo: TipoItemCatalogo;
  /** null en modo TIENDA: un ítem no está atado a una zona (decisión 13). */
  umbralZonaId: string | null;
  nombreZonaSnapshot: string | null;
  /** Solo los usa el modo DIRECTO (decisión 14). En TIENDA se ignoran. */
  permiteSeleccion: boolean;
  permiteAzar: boolean;
  estado: 'ACTIVA' | 'ARCHIVADA';
  /**
   * fase-14-26. Denormalizado con nombre y color: la grilla del catálogo pinta
   * los chips sin una segunda llamada por ítem. **Siempre `[]` para
   * `Rol.USUARIO`** (decisión 12): la etiqueta es organización del Tutor y no
   * se le muestra al participante por ningún camino, y este DTO es el mismo
   * que ve en los elegibles del modo DIRECTO.
   */
  etiquetas: EtiquetaCatalogoDto[];
}

/**
 * Etiqueta del catálogo de ítems (fase-14-26). No tiene ningún efecto de
 * negocio: organiza la pantalla del Tutor y habilita los atajos «todos los
 * de X» al armar una bolsa o al crear productos en masa.
 */
export interface EtiquetaCatalogoDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  nombre: string;
  /** "#RRGGBB" — el frontend nunca lo hardcodea, lo lee de la API. */
  colorHex: string;
  estado: 'ACTIVA' | 'ARCHIVADA';
}

/**
 * Resultado de la creación masiva de productos desde una etiqueta
 * (fase-14-26 decisión 11): saltea en vez de fallar, así correr el atajo dos
 * veces no puede duplicar la tienda.
 */
export interface ProductosDesdeEtiquetaDto {
  creados: ProductoTiendaDto[];
  salteados: {
    recompensaId: string;
    nombre: string;
    motivo: 'YA_TIENE_PRODUCTO' | 'ES_CASTIGO';
  }[];
}

/** Cuántas monedas rinde una zona al cerrar la Sección (decisión 4). */
export interface RendimientoZonaDto {
  umbralZonaId: string;
  nombreZona: string;
  /** Orden de la zona en scoring (1 = más baja), para ordenar la pantalla. */
  orden: number;
  colorHex: string;
  /** Puede ser negativo: dispara la bancarrota. `null` = sin configurar (0). */
  monedas: number | null;
}

/** Qué clase de registro paga monedas (fase-14-28 decisión 11). */
export enum TipoAccionRendimiento {
  ACTIVIDAD = 'ACTIVIDAD',
  CONDUCTA = 'CONDUCTA',
}

/**
 * Una fila de la pantalla «Por actividad» (fase-14-28 Parte C). Sale del
 * catálogo COMPLETO del Grupo, no de las filas guardadas: una actividad sin
 * rendimiento cargado tiene que aparecer igual (`monedas: 0`), porque si no el
 * Tutor no tiene dónde cargarla — mismo criterio que `RendimientoZonaDto`.
 */
export interface RendimientoAccionDto {
  tipoAccion: TipoAccionRendimiento;
  /** actividadId o conductaId según `tipoAccion`. */
  origenId: string;
  nombre: string;
  /** Solo lectura acá: se edita en la pantalla del catálogo (decisión 1). */
  valorPuntos: number;
  tipoPuntaje: TipoPuntaje | null;
  alcance: AlcanceActividad | null;
  comportamientoAlCierre: ComportamientoAlCierre | null;
  /** El bono en puntos del jefe, para mostrarlo al lado del bono en monedas. */
  bonoJefePuntos: number | null;
  /** Cada repetición paga (decisión 16): es el multiplicador del aviso. */
  repeticionesMaximasSesion: number | null;
  monedas: number;
  monedasBonoJefe: number;
  /**
   * Decisión 15 resuelta en el backend y no en la plantilla: una obligatoria
   * `ASUME_HECHA` nunca genera un registro positivo, así que nunca puede pagar.
   */
  puedeRendir: boolean;
  /** Por qué no rinde, escrito para mostrar tal cual. `null` si rinde. */
  motivoNoRinde: string | null;
}

/** Respuesta del `GET`/`PUT` de rendimientos por acción: el catálogo entero. */
export interface RendimientosAccionesDto {
  actividades: RendimientoAccionDto[];
  conductas: RendimientoAccionDto[];
}

export interface ConfigurarRendimientosAccionesRequest {
  rendimientos: Array<{
    tipoAccion: TipoAccionRendimiento;
    origenId: string;
    monedas: number;
    /** Se fuerza a 0 fuera de una actividad de alcance EQUIPO (decisión 8). */
    monedasBonoJefe?: number;
  }>;
}

export type ConfigurarRendimientosAccionesResponse = RendimientosAccionesDto;

/**
 * Lo que el PARTICIPANTE ve antes de completar (fase-14-28 Parte F): «+10 pts ·
 * +3 🪙» en su lista de actividades. Si no ve el precio antes de hacerla, la
 * moneda no motiva nada — que es el punto entero del ítem de su lado.
 *
 * Es deliberadamente el mínimo: sin nombre, sin puntos, sin motivos. Todo eso
 * ya lo trae `mi-estado-hoy` de activity, y el cruce lo hace la pantalla por
 * `origenId` — activity no tiene por qué saber que existe una economía
 * (decisión 2). En modo `DIRECTO` la lista viene vacía, así que «no se muestra
 * en DIRECTO» cae por construcción y no como un `if` más en la plantilla.
 */
export interface ValorEnMonedasDto {
  /** actividadId. */
  origenId: string;
  monedas: number;
  /** Lo que cobra de más el jefe en una tarea de equipo; 0 si no aplica. */
  monedasBonoJefe: number;
}

/**
 * Los DOS EJES del producto (fase-14-22 decisión 18): de dónde sale y cómo se
 * obtiene. Al azar y a elección son propiedades del PRODUCTO, nunca del premio.
 */
export enum FuenteProducto {
  ITEM = 'ITEM',
  BOLSA = 'BOLSA',
}

export enum MecanicaProducto {
  AZAR = 'AZAR',
  ELECCION = 'ELECCION',
}

export interface BolsaPremiosDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  nombre: string;
  estado: 'ACTIVA' | 'ARCHIVADA';
  /** Ítems que contiene, siempre de tipo PREMIO (decisión 20). */
  recompensaIds: string[];
}

export interface ProductoTiendaDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  nombre: string;
  descripcion: string | null;
  imagenUrl: string | null;
  precio: number;
  fuente: FuenteProducto;
  /** Se ignora cuando la fuente es ITEM. */
  mecanica: MecanicaProducto;
  recompensaId: string | null;
  bolsaId: string | null;
  estado: 'ACTIVA' | 'ARCHIVADA';
  /** Calculados contra el saldo de quien pregunta (0 si no le falta nada). */
  puedeComprar: boolean;
  faltan: number;
}

export interface CompraDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  usuarioId: string;
  productoId: string;
  nombreProductoSnapshot: string;
  precioSnapshot: number;
  obtenidoPorAzar: boolean;
  recompensaId: string;
  nombreRecompensaSnapshot: string;
  estado: EstadoCanje;
  entregadaPorTutorId: string | null;
  entregadaEn: string | null;
  revertidaEn: string | null;
  motivoReversion: string | null;
}

/** Una fila de la lista única de pendientes de entrega del Tutor. */
export interface PendienteEntregaDto {
  id: string;
  origen: 'COMPRA' | 'CASTIGO';
  usuarioId: string;
  nombreRecompensaSnapshot: string;
  /** Precio pagado (compras) o deuda saldada (castigos). */
  monto: number;
  createdAt: string;
}

export interface CastigoAsignadoDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  usuarioId: string;
  seccionId: string;
  recompensaId: string;
  nombreRecompensaSnapshot: string;
  deudaSaldada: number;
  estado: EstadoCanje;
  entregadaPorTutorId: string | null;
  entregadaEn: string | null;
  anuladoEn: string | null;
  anuladoPorTutorId: string | null;
  motivoAnulacion: string | null;
}

export interface CanjeRecompensaDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  usuarioId: string;
  seccionId: string;
  recompensaId: string;
  mecanica: MecanicaRecompensa;
  estado: EstadoCanje;
  entregadaPorTutorId: string | null;
  entregadaEn: string | null;
}
