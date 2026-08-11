import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import type {
  ClavesNoCubiertas,
  CompletarActividadRequest as ContratoCompletar,
  RegistrarConductaRequest as ContratoRegistrarConducta,
  RegistrarNoHizoRequest as ContratoNoHizo,
  Exhaustivo,
} from '@dorado/shared-types';

/** Tope del motivo del tutor (fase-14-12): es una nota corta, no un descargo. */
export const MAX_LARGO_MOTIVO_TUTOR = 200;

/**
 * fase-14-33: los dos campos que habilitan escribir en una Sesión pasada de la
 * Sección vigente. Se declaran a mano en cada request (no por herencia) por lo
 * que explica `EscrituraEnSesionRequest` en shared-types: ampliar un contrato
 * tiene que ser una decisión visible endpoint por endpoint.
 *
 * `@IsOptional()` en los dos: sin ellos el endpoint se comporta exactamente
 * como antes de este ítem (decisión 10). Ojo con la trampa ya conocida del
 * proyecto —`@IsOptional()` deja pasar el string vacío—: por eso el motivo
 * lleva además `@IsNotEmpty()`, y quien decide si **hace falta** es el servicio,
 * que es el único que sabe si la Sesión pedida es la abierta.
 */
export const MAX_LARGO_MOTIVO_RETROACTIVO = 200;

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

  // fase-14-33
  @IsOptional()
  @IsUUID()
  sesionId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LARGO_MOTIVO_RETROACTIVO)
  motivoRetroactivo?: string;
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

  // fase-14-33. Distinto de `motivo`: aquel explica la MARCA al integrante,
  // éste explica por qué la fila aparece en un día que ya había terminado.
  @IsOptional()
  @IsUUID()
  sesionId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LARGO_MOTIVO_RETROACTIVO)
  motivoRetroactivo?: string;
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

  // fase-14-33
  @IsOptional()
  @IsUUID()
  sesionId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LARGO_MOTIVO_RETROACTIVO)
  motivoRetroactivo?: string;
}

/**
 * fase-14-33: query de las lecturas del Tutor que pueden mirar otra Sesión
 * (`estado-hoy`, `completadas`, `marcas`). Sin `sesionId` devuelven la Sesión
 * abierta, igual que siempre.
 */
export class SesionDeLaSeccionQuery {
  @IsOptional()
  @IsUUID()
  sesionId?: string;
}

/**
 * fase-14-33: `POST /registros-actividad/:id/revertir` pasa a aceptar cuerpo.
 * Antes no tenía ninguno —deshacer una marca de la Sesión abierta no necesita
 * explicación— y sigue sin necesitarlo ahí: el motivo solo se exige cuando la
 * fila es de una Sesión que ya cerró.
 */
export class RevertirMarcaRequest {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LARGO_MOTIVO_RETROACTIVO)
  motivoRetroactivo?: string;
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
