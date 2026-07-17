import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

import type { SeccionDto, SesionDto } from '@dorado/shared-types';

import { EstadoSeccion } from '../../generated/prisma/enums';

// GET /session/grupos/:grupoId/secciones?estado=
export class ListarSeccionesQuery {
  @IsOptional()
  @IsIn(Object.values(EstadoSeccion))
  estado?: EstadoSeccion;
}

// POST /session/sesiones/:id/extender — pospone el autocierre automático de
// esa Sesión (relevante solo en modo AUTOMATICO, spec fase-06).
export class ExtenderSesionRequest {
  @IsInt()
  @Min(1)
  minutosAdicionales!: number;
}

/**
 * Detalle de Sección + sus Sesiones (spec: GET /session/secciones/:id y
 * .../secciones/actual). shared-types.md no define el shape compuesto — se
 * anida el array bajo `sesiones`, igual que la relación del modelo.
 */
export interface SeccionConSesionesResponse extends SeccionDto {
  sesiones: SesionDto[];
}

// El resto de los Response de este controller son SeccionDto/SesionDto de
// `libs/shared-types` (la "vista pública" según shared-types.md).
