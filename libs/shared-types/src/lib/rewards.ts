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

export interface RecompensaDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  nombre: string;
  descripcion: string | null;
  imagenUrl: string | null;
  umbralZonaId: string;
  nombreZonaSnapshot: string;
  permiteSeleccion: boolean;
  permiteAzar: boolean;
  estado: 'ACTIVA' | 'ARCHIVADA';
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
