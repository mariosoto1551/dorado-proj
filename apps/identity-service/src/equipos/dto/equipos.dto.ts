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

// POST /identity/grupos/:grupoId/equipos
export class CrearEquipoRequest {
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
export class EditarEquipoRequest {
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
export class AgregarMiembroEquipoRequest {
  @IsUUID()
  usuarioId!: string;
}

// POST /identity/equipos/:equipoId/jefe
export class SustituirJefeEquipoRequest {
  @IsUUID()
  nuevoJefeUsuarioId!: string;
}
