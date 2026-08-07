import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import type {
  ClavesNoCubiertas,
  CompletarActividadRequest as ContratoCompletar,
  RegistrarConductaRequest as ContratoRegistrarConducta,
  RegistrarNoHizoRequest as ContratoNoHizo,
  Exhaustivo,
} from '@dorado/shared-types';

/** Tope del motivo del tutor (fase-14-12): es una nota corta, no un descargo. */
export const MAX_LARGO_MOTIVO_TUTOR = 200;

// Requests de registro (spec fase-07 Parte A). Los Response son los DTOs
// públicos de shared-types (RegistroActividadDto / RegistroConductaDto),
// salvo el cronómetro, que shared-types no define (shape local).
//
// Los tres `implements` son un retrofit del fase-14-31 tanda 6: estos endpoints
// pasaron a ser destino de una propuesta del asistente, y el chequeo de
// cobertura es lo que hace que renombrar un campo acá rompa el build de quien
// arme el request en vez de fallar recién al aplicarlo.

// POST /activity/actividades/:id/completar — `usuarioId` solo aplica cuando
// registra un TUTOR/ORG_ADMIN; para USUARIO se ignora y se fuerza a sí mismo.
export class CompletarActividadRequest implements ContratoCompletar {
  @IsOptional()
  @IsUUID()
  usuarioId?: string;
}

// POST /activity/actividades/:id/no-hizo — siempre lo registra un Tutor
// (nunca autoreporte), así que el usuario objetivo es obligatorio.
export class RegistrarNoHizoRequest implements ContratoNoHizo {
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
export class RegistrarConductaRequest implements ContratoRegistrarConducta {
  @IsOptional()
  @IsUUID()
  usuarioId?: string;
}

// Cobertura de claves (fase-14-30 tanda 2): `implements` sola no ve un campo
// OPCIONAL renombrado — ver la nota de `contratos.ts`. Acá pesa más que en
// otros DTOs: los tres campos que cubre son opcionales en el contrato.
type _CompletarCubierto = Exhaustivo<
  ClavesNoCubiertas<ContratoCompletar, CompletarActividadRequest>
>;

type _NoHizoCubierto = Exhaustivo<ClavesNoCubiertas<ContratoNoHizo, RegistrarNoHizoRequest>>;

type _RegistrarConductaCubierto = Exhaustivo<
  ClavesNoCubiertas<ContratoRegistrarConducta, RegistrarConductaRequest>
>;

// POST /activity/actividades/:id/iniciar-cronometro — la spec no define el
// response; se devuelve lo necesario para que el frontend muestre el conteo.
export interface IniciarCronometroResponse {
  actividadId: string;
  sesionId: string;
  iniciadoEn: string;
  venceEn: string;
}
