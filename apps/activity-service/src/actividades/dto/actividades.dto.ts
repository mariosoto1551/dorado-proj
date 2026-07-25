import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import {
  AlcanceActividad,
  ComportamientoAlCierre,
  EstadoCatalogo,
  TipoLimiteTiempo,
  TipoPuntaje,
} from '../../generated/prisma/enums';

/**
 * "HH:mm" 24 h (spec fase-05: hora local del Grupo; la conversión de zona
 * horaria es asunto de Fase 6/7, acá solo se persiste el string validado).
 */
const HORA_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// POST /activity/grupos/:grupoId/actividades
export class CrearActividadRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descripcion?: string | null;

  @IsEnum(TipoPuntaje)
  tipoPuntaje!: TipoPuntaje;

  // Siempre positivo (spec): el signo se aplica al registrar, en Fase 7.
  @IsInt()
  @Min(1)
  valorPuntos!: number;

  @IsEnum(TipoLimiteTiempo)
  tipoLimiteTiempo!: TipoLimiteTiempo;

  // Obligatoria/prohibida según tipoLimiteTiempo — invariante completo en
  // comun/limite-tiempo.ts (acá solo formato).
  @IsOptional()
  @Matches(HORA_HHMM, { message: 'deadlineHora debe tener formato HH:mm (24 h)' })
  deadlineHora?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  duracionCronometroMinutos?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  repeticionesMaximasSesion?: number;

  // null = sin override (se deriva en Fase 7).
  @IsOptional()
  @IsInt()
  @Min(1)
  repeticionesMaximasSeccion?: number | null;

  // fase-14-08: solo aplica a OBLIGATORIA; con OPCIONAL se fuerza ASUME_HECHA
  // en el service (400 si el cliente manda REQUIERE_CONFIRMACION para opcional).
  @IsOptional()
  @IsEnum(ComportamientoAlCierre)
  comportamientoAlCierre?: ComportamientoAlCierre;

  // fase-14-09: alcance de equipo. EQUIPO exige OPCIONAL (validado en el service).
  @IsOptional()
  @IsEnum(AlcanceActividad)
  alcance?: AlcanceActividad;

  // Puntos extra al jefe; >0 solo con alcance=EQUIPO (validado en el service).
  @IsOptional()
  @IsInt()
  @Min(0)
  bonoJefePuntos?: number;
}

// PATCH /activity/actividades/:id — edita cualquier campo del catálogo.
// `estado` NO se edita por acá: archivar es DELETE, y la spec prohíbe
// reactivar una archivada ("crear una nueva si hace falta").
export class EditarActividadRequest {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descripcion?: string | null;

  @IsOptional()
  @IsEnum(TipoPuntaje)
  tipoPuntaje?: TipoPuntaje;

  @IsOptional()
  @IsInt()
  @Min(1)
  valorPuntos?: number;

  @IsOptional()
  @IsEnum(TipoLimiteTiempo)
  tipoLimiteTiempo?: TipoLimiteTiempo;

  @IsOptional()
  @Matches(HORA_HHMM, { message: 'deadlineHora debe tener formato HH:mm (24 h)' })
  deadlineHora?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  duracionCronometroMinutos?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  repeticionesMaximasSesion?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  repeticionesMaximasSeccion?: number | null;

  @IsOptional()
  @IsEnum(ComportamientoAlCierre)
  comportamientoAlCierre?: ComportamientoAlCierre;

  @IsOptional()
  @IsEnum(AlcanceActividad)
  alcance?: AlcanceActividad;

  @IsOptional()
  @IsInt()
  @Min(0)
  bonoJefePuntos?: number;
}

// GET /activity/grupos/:grupoId/actividades?estado= — solo tutores; para
// USUARIO el filtro se fuerza a ACTIVA en el service (spec: param ignorado).
export class ListarActividadesQuery {
  @IsOptional()
  @IsIn(Object.values(EstadoCatalogo))
  estado?: EstadoCatalogo;
}

// Sin clases Response propias: los Response de este CRUD son ActividadDto de
// `libs/shared-types` (la "vista pública" según shared-types.md).
