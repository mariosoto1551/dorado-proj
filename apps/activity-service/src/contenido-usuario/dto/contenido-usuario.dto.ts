import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Enums de `shared-types` (no los de Prisma): un enum de TS es asignable a su
// literal, así que el valor validado se puede escribir directo en la base, y de
// paso el DTO habla el mismo lenguaje que el frontend.
import {
  EstadoPropuesta,
  ModoCreacionContenidoUsuario,
} from '@dorado/shared-types';

// Techo duro de los topes configurables por el Tutor (fase-14-10, Parte A). No
// es una regla de negocio de la spec: es un límite de cordura para que un tope
// mal tipeado (999999) no vuelva inútil el control de puntaje.
const TOPE_MAXIMO_PUNTOS = 100;
const TOPE_MAXIMO_ACTIVIDADES = 50;

// PUT /activity/grupos/:grupoId/configuracion-contenido
export class ActualizarConfiguracionContenidoRequest {
  @IsOptional()
  @IsEnum(ModoCreacionContenidoUsuario)
  modoCreacionUsuario?: ModoCreacionContenidoUsuario;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(TOPE_MAXIMO_PUNTOS)
  maxPuntosActividadUsuario?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(TOPE_MAXIMO_ACTIVIDADES)
  maxActividadesActivasPorUsuario?: number;

  // fase-14-17: enciende el plan del día para el grupo.
  @IsOptional()
  @IsBoolean()
  planDelDiaActivo?: boolean;
}

/**
 * POST /activity/grupos/:grupoId/mis-actividades — el integrante elige solo
 * estos cuatro campos. El resto es fijo (spec fase-14-10, decisión 8):
 * OPCIONAL / SIN_LIMITE / INDIVIDUAL / ASUME_HECHA, sin bono de jefe. `alcance`
 * y `tipoPuntaje` NO viajan en el request a propósito: un integrante no puede
 * crear obligatorias ni tareas de equipo ni siquiera intentándolo.
 */
export class CrearMiActividadRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descripcion?: string | null;

  // El tope real es `maxPuntosActividadUsuario` del grupo (validado en el
  // service, 400 PUNTOS_SOBRE_TOPE_DEL_GRUPO): acá solo el piso.
  @IsInt()
  @Min(1)
  valorPuntos!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  repeticionesMaximasSesion?: number;
}

// GET /activity/grupos/:grupoId/propuestas?estado=
export class ListarPropuestasQuery {
  @IsOptional()
  @IsEnum(EstadoPropuesta)
  estado?: EstadoPropuesta;
}

// POST /activity/propuestas/:id/rechazar
export class RechazarPropuestaRequest {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
