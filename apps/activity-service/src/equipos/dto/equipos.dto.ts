import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { EstadoReporte } from '../../generated/prisma/enums';
import { MAX_LARGO_MOTIVO_TUTOR } from '../../registro/dto/registro.dto';

// POST /activity/equipos/:equipoId/reportes — el jefe reporta una conducta MALA.
export class CrearReporteMiembroRequest {
  @IsUUID()
  reportadoUsuarioId!: string;

  @IsUUID()
  conductaId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}

// POST /activity/reportes/:id/rechazar
export class RechazarReporteRequest {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}

// GET /activity/grupos/:grupoId/reportes?estado=
export class ListarReportesQuery {
  @IsOptional()
  @IsEnum(EstadoReporte)
  estado?: EstadoReporte;
}

// DELETE /activity/registros-tarea-equipo/:id?motivo= — el motivo viaja por
// query param por lo mismo que en fase-14-12: un DELETE con body atraviesa
// intermediarios (el Gateway entre ellos) que tienen derecho a descartarlo.
export class AnularTareaEquipoQuery {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LARGO_MOTIVO_TUTOR)
  motivo?: string;
}
