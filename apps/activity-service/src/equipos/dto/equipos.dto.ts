import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { EstadoReporte } from '../../generated/prisma/enums';

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
