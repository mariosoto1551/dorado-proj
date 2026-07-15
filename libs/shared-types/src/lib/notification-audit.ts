import { PrincipalType } from './auth';

export interface NotificacionDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  destinatarioId: string;
  destinatarioTipo: PrincipalType;
  tipo: string;
  mensaje: string;
  leida: boolean;
  createdAt: string;
}

export interface RegistroAuditoriaDto {
  id: string;
  organizacionId: string;
  grupoId: string | null;
  actorId: string;
  actorTipo: 'TUTOR' | 'USUARIO' | 'PLATFORM_ADMIN' | 'SYSTEM';
  accion: string;
  entidadTipo: string;
  entidadId: string;
  detalle: Record<string, unknown>;
  createdAt: string;
}
