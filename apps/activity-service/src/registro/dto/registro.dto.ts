import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Tope del motivo del tutor (fase-14-12): es una nota corta, no un descargo. */
export const MAX_LARGO_MOTIVO_TUTOR = 200;

// Requests de registro (spec fase-07 Parte A). Los Response son los DTOs
// públicos de shared-types (RegistroActividadDto / RegistroConductaDto),
// salvo el cronómetro, que shared-types no define (shape local).

// POST /activity/actividades/:id/completar — `usuarioId` solo aplica cuando
// registra un TUTOR/ORG_ADMIN; para USUARIO se ignora y se fuerza a sí mismo.
export class CompletarActividadRequest {
  @IsOptional()
  @IsUUID()
  usuarioId?: string;
}

// POST /activity/actividades/:id/no-hizo — siempre lo registra un Tutor
// (nunca autoreporte), así que el usuario objetivo es obligatorio.
export class RegistrarNoHizoRequest {
  @IsUUID()
  usuarioId!: string;

  // fase-14-12: nota opcional que el integrante lee en su pantalla.
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LARGO_MOTIVO_TUTOR)
  motivo?: string;
}

// DELETE /activity/registros-actividad/:id — el motivo viaja como query param:
// un DELETE con body pasa por demasiados intermediarios (gateway incluido) que
// tienen derecho a descartarlo (fase-14-12).
export class QuitarCompletadaQuery {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LARGO_MOTIVO_TUTOR)
  motivo?: string;
}

// POST /activity/conductas/:id/registrar — obligatorio si TUTOR/ORG_ADMIN,
// ignorado/forzado a self si USUARIO (spec).
export class RegistrarConductaRequest {
  @IsOptional()
  @IsUUID()
  usuarioId?: string;
}

// POST /activity/actividades/:id/iniciar-cronometro — la spec no define el
// response; se devuelve lo necesario para que el frontend muestre el conteo.
export interface IniciarCronometroResponse {
  actividadId: string;
  sesionId: string;
  iniciadoEn: string;
  venceEn: string;
}
