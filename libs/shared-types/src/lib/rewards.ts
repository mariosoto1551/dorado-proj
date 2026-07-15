export enum MecanicaRecompensa {
  SELECCION = 'SELECCION',
  AZAR = 'AZAR',
}

export enum EstadoCanje {
  PENDIENTE_ENTREGA = 'PENDIENTE_ENTREGA',
  ENTREGADA = 'ENTREGADA',
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
