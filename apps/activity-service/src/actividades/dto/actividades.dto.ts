import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
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

/** Fecha civil "YYYY-MM-DD" (fase-14-24). El calendario real lo valida el service. */
const FECHA_CIVIL = /^\d{4}-\d{2}-\d{2}$/;

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

  // Siempre positivo (spec): el signo se aplica al registrar, en Fase 7. En una
  // OBLIGATORIA es el castigo por no hacerla.
  @IsInt()
  @Min(1)
  valorPuntos!: number;

  // fase-14-20: lo que suma CUMPLIRLA. Solo se conserva en OBLIGATORIA +
  // REQUIERE_CONFIRMACION; en el resto el service lo fuerza a 0 (decisión 4).
  @IsOptional()
  @IsInt()
  @Min(0)
  puntosPorCumplir?: number;

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

  // fase-14-11: días en que se puede registrar (0=domingo…6=sábado). Vacío o
  // ausente = todos los días. El service normaliza (ordena y deduplica).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  diasSemana?: number[];

  // fase-14-17: la opcional aparece en la lista sin que el integrante la elija.
  // Solo tiene sentido en OPCIONAL + INDIVIDUAL (validado en el service).
  @IsOptional()
  @IsBoolean()
  siempreVisible?: boolean;

  // fase-14-19: ids de RolGrupo (identity) que pueden verla y registrarla.
  // Vacío u omitido = la ven todos. El service valida que existan y estén
  // ACTIVO en el grupo, y que la actividad sea INDIVIDUAL.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  rolesPermitidos?: string[];

  // fase-14-24: destinatario NOMINAL — ids de Usuario. Excluyente con
  // rolesPermitidos y equiposPermitidos (400 DESTINATARIO_AMBIGUO si viene más
  // de uno); el service valida que sean del grupo y que la actividad sea INDIVIDUAL.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  usuariosPermitidos?: string[];

  // fase-14-24: ids de Equipo. Exige alcance = EQUIPO (decisión 5).
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  equiposPermitidos?: string[];

  // fase-14-24: vigencia, fecha CIVIL del calendario local del Grupo. null
  // explícito la borra; el service valida el formato real (30/02 no pasa) y que
  // desde <= hasta.
  @IsOptional()
  @Matches(FECHA_CIVIL, { message: 'vigenteDesde debe tener formato YYYY-MM-DD' })
  vigenteDesde?: string | null;

  @IsOptional()
  @Matches(FECHA_CIVIL, { message: 'vigenteHasta debe tener formato YYYY-MM-DD' })
  vigenteHasta?: string | null;
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

  // fase-14-20: se recalcula en CADA patch contra los valores finales de la
  // fila, no contra los del request (mismo criterio que `siempreVisible`).
  @IsOptional()
  @IsInt()
  @Min(0)
  puntosPorCumplir?: number;

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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  diasSemana?: number[];

  // fase-14-17: la opcional aparece en la lista sin que el integrante la elija.
  // Solo tiene sentido en OPCIONAL + INDIVIDUAL (validado en el service).
  @IsOptional()
  @IsBoolean()
  siempreVisible?: boolean;

  // fase-14-19: ids de RolGrupo (identity) que pueden verla y registrarla.
  // Vacío u omitido = la ven todos. El service valida que existan y estén
  // ACTIVO en el grupo, y que la actividad sea INDIVIDUAL.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  rolesPermitidos?: string[];

  // fase-14-24: destinatario NOMINAL — ids de Usuario. Excluyente con
  // rolesPermitidos y equiposPermitidos (400 DESTINATARIO_AMBIGUO si viene más
  // de uno); el service valida que sean del grupo y que la actividad sea INDIVIDUAL.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  usuariosPermitidos?: string[];

  // fase-14-24: ids de Equipo. Exige alcance = EQUIPO (decisión 5).
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  equiposPermitidos?: string[];

  // fase-14-24: vigencia, fecha CIVIL del calendario local del Grupo. null
  // explícito la borra; el service valida el formato real (30/02 no pasa) y que
  // desde <= hasta.
  @IsOptional()
  @Matches(FECHA_CIVIL, { message: 'vigenteDesde debe tener formato YYYY-MM-DD' })
  vigenteDesde?: string | null;

  @IsOptional()
  @Matches(FECHA_CIVIL, { message: 'vigenteHasta debe tener formato YYYY-MM-DD' })
  vigenteHasta?: string | null;
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
