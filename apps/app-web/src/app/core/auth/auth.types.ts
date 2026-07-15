import type {
  OrganizacionDto,
  PrincipalType,
  TutorDto,
  UsuarioDto,
} from '@dorado/shared-types';

/**
 * Shapes de las respuestas de /api/auth/* tal como las devuelve
 * identity-service (fase-02). No están en libs/shared-types (el contrato
 * documentado en shared-types.md no las incluye — hueco anotado en
 * docs/progreso/fase-02-identity.md, desviación 5); se tipan acá espejando
 * el wire format real.
 */
export interface SesionRespuesta {
  accessToken: string;
  principalType: PrincipalType;
  perfil: TutorDto | UsuarioDto;
}

export interface RegistrarOrganizacionRespuesta {
  accessToken: string;
  tutor: TutorDto;
  organizacion: OrganizacionDto;
}

export interface PreviewInvitacionRespuesta {
  grupoNombre: string;
  organizacionNombre: string;
  tipoInvitado: 'TUTOR' | 'USUARIO';
  expiraEn: string;
  estado: string;
}

/** Sobre de error único de todos los servicios (ADR-00 §7). */
export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  correlationId: string;
}
