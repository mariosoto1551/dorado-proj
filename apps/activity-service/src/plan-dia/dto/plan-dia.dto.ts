import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

// POST /activity/grupos/:grupoId/plan-dia — el `usuarioId` NO viaja: el plan es
// del integrante del JWT y de nadie más (regla 3 de CLAUDE.md).
export class AgregarAlPlanDelDiaRequest {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  actividadId!: string;
}

// Sin clase Response propia: el Response es `PlanDelDiaDto` de
// `libs/shared-types` (la "vista pública" según shared-types.md).
