import { IsOptional, IsUUID } from 'class-validator';

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
