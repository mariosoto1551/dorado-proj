import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';

import type {
  ClavesNoCubiertas,
  Exhaustivo,
  ActualizarRolGrupoRequest as ContratoActualizarRol,
  AsignarRolGrupoRequest as ContratoAsignarRol,
  CrearRolGrupoRequest as ContratoCrearRol,
} from '@dorado/shared-types';

// Roles del participante dentro del Grupo (fase-14-19).
//
// `nombre` va a 30 caracteres y no a 120 como el de Equipo: esto se pinta como
// chip al lado del nombre del participante, no como título de una tarjeta.

const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;

// POST /identity/grupos/:grupoId/roles
export class CrearRolGrupoRequest implements ContratoCrearRol {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  nombre!: string;

  @Matches(COLOR_HEX, { message: 'El color debe tener el formato #RRGGBB' })
  colorHex!: string;
}

// PATCH /identity/roles/:rolGrupoId
export class ActualizarRolGrupoRequest implements ContratoActualizarRol {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  nombre?: string;

  @IsOptional()
  @Matches(COLOR_HEX, { message: 'El color debe tener el formato #RRGGBB' })
  colorHex?: string;

  @IsOptional()
  @IsIn(['ACTIVO', 'INACTIVO'])
  estado?: 'ACTIVO' | 'INACTIVO';
}

// PUT /identity/grupos/:grupoId/usuarios/:usuarioId/rol
export class AsignarRolGrupoRequest implements ContratoAsignarRol {
  // `null` quita el rol — es un valor válido del contrato, no un campo ausente:
  // por eso ValidateIf en vez de IsOptional (que también aceptaría `undefined`
  // y dejaría ambiguo si el cliente quiso quitar el rol o no tocarlo).
  @ValidateIf((objeto: AsignarRolGrupoRequest) => objeto.rolGrupoId !== null)
  @IsUUID()
  rolGrupoId!: string | null;
}

// Cobertura de claves (fase-14-30 tanda 2), ver `contratos.ts`.
type _CrearRolCubierto = Exhaustivo<
  ClavesNoCubiertas<ContratoCrearRol, CrearRolGrupoRequest>
>;

type _ActualizarRolCubierto = Exhaustivo<
  ClavesNoCubiertas<ContratoActualizarRol, ActualizarRolGrupoRequest>
>;

type _AsignarRolCubierto = Exhaustivo<
  ClavesNoCubiertas<ContratoAsignarRol, AsignarRolGrupoRequest>
>;
