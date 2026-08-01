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
}

export interface MiBilleteraResponse extends BilleteraDto {
  movimientos: MovimientoMonedaDto[];
  /** Total de movimientos del participante, para paginar. */
  total: number;
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
