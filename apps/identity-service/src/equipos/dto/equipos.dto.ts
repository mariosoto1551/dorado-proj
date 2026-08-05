import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import type {
  ClavesNoCubiertas,
  Exhaustivo,
  AgregarMiembroEquipoRequest as ContratoAgregarMiembro,
  CrearEquipoRequest as ContratoCrearEquipo,
  EditarEquipoRequest as ContratoEditarEquipo,
  SustituirJefeEquipoRequest as ContratoSustituirJefe,
} from '@dorado/shared-types';

// POST /identity/grupos/:grupoId/equipos
export class CrearEquipoRequest implements ContratoCrearEquipo {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  @IsUUID()
  jefeUsuarioId!: string;

  // ids de los integrantes NO-jefe; el jefe se suma aparte.
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  miembrosIds!: string[];
}

// PATCH /identity/equipos/:equipoId
export class EditarEquipoRequest implements ContratoEditarEquipo {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsIn(['ACTIVO', 'INACTIVO'])
  estado?: 'ACTIVO' | 'INACTIVO';
}

// POST /identity/equipos/:equipoId/miembros
export class AgregarMiembroEquipoRequest implements ContratoAgregarMiembro {
  @IsUUID()
  usuarioId!: string;
}

// POST /identity/equipos/:equipoId/jefe
export class SustituirJefeEquipoRequest implements ContratoSustituirJefe {
  @IsUUID()
  nuevoJefeUsuarioId!: string;
}

// Cobertura de claves (fase-14-30 tanda 2), ver `contratos.ts`.
type _CrearEquipoCubierto = Exhaustivo<
  ClavesNoCubiertas<ContratoCrearEquipo, CrearEquipoRequest>
>;

type _EditarEquipoCubierto = Exhaustivo<
  ClavesNoCubiertas<ContratoEditarEquipo, EditarEquipoRequest>
>;

type _AgregarMiembroCubierto = Exhaustivo<
  ClavesNoCubiertas<ContratoAgregarMiembro, AgregarMiembroEquipoRequest>
>;

type _SustituirJefeCubierto = Exhaustivo<
  ClavesNoCubiertas<ContratoSustituirJefe, SustituirJefeEquipoRequest>
>;
