import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

import { EvaluarUmbralesEn, ModoSesion } from '../../generated/prisma/enums';

// PUT /session/grupos/:grupoId/configuracion — upsert de reemplazo completo:
// los campos no enviados vuelven a su default de modelo (spec fase-06).
// Los nombres de campo son los del contrato público ConfiguracionSesionDto de
// shared-types.md (`cronSesion`/`cronCierreSeccion`); el mapeo a las columnas
// de la spec fase-06 (`cronAperturaSesion`/`cronAperturaSeccion`) vive en
// comun/mapeadores.ts — ver nota ahí.
export class GuardarConfiguracionRequest {
  @IsEnum(ModoSesion)
  modo!: ModoSesion;

  // Validez de cron (5 campos) y obligatoriedad si modo=AUTOMATICO se chequean
  // en el service con cron-parser (acá solo el tipo).
  @IsOptional()
  @IsString()
  cronSesion?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  sesionesPorSeccion?: number;

  @IsOptional()
  @IsString()
  cronCierreSeccion?: string | null;

  @IsOptional()
  @IsEnum(EvaluarUmbralesEn)
  evaluarUmbralesEn?: EvaluarUmbralesEn;
}

// Sin clase Response propia: el Response de PUT/GET es ConfiguracionSesionDto
// de `libs/shared-types` (la "vista pública" según shared-types.md).
