import { plainToInstance, Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

import { decodificarPem } from '@dorado/shared-auth';

const URL_HTTP = /^https?:\/\/.+/;
const MENSAJE_URL = 'debe ser una URL http(s)://';

/**
 * Schema de variables de entorno del Gateway (ADR-00 §8): el proceso NO
 * arranca si falta una requerida o tiene formato inválido.
 *
 * Las `<SERVICIO>_INTERNAL_URL` son OPCIONALES a propósito (spec fase-03):
 * un prefijo público cuyo servicio no tiene URL configurada responde
 * `503 Service Unavailable` hasta que la fase correspondiente lo levante.
 */
export class EnvSchema {
  @IsOptional()
  @Transform(({ value }) => parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  PORT?: number;

  @IsString()
  @MinLength(1)
  JWT_PUBLIC_KEY!: string;

  @IsString()
  @MinLength(16, {
    message: 'GATEWAY_INTERNAL_SECRET debe tener al menos 16 caracteres',
  })
  GATEWAY_INTERNAL_SECRET!: string;

  // Orígenes permitidos por CORS (spec fase-03: lista explícita, nunca '*').
  @Matches(URL_HTTP, { message: `APP_WEB_URL ${MENSAJE_URL}` })
  APP_WEB_URL!: string;

  @Matches(URL_HTTP, { message: `PUBLIC_SITE_URL ${MENSAJE_URL}` })
  PUBLIC_SITE_URL!: string;

  @IsOptional()
  @Matches(URL_HTTP, { message: `IDENTITY_INTERNAL_URL ${MENSAJE_URL}` })
  IDENTITY_INTERNAL_URL?: string;

  @IsOptional()
  @Matches(URL_HTTP, { message: `BILLING_INTERNAL_URL ${MENSAJE_URL}` })
  BILLING_INTERNAL_URL?: string;

  @IsOptional()
  @Matches(URL_HTTP, { message: `ACTIVITY_INTERNAL_URL ${MENSAJE_URL}` })
  ACTIVITY_INTERNAL_URL?: string;

  @IsOptional()
  @Matches(URL_HTTP, { message: `SESSION_INTERNAL_URL ${MENSAJE_URL}` })
  SESSION_INTERNAL_URL?: string;

  @IsOptional()
  @Matches(URL_HTTP, { message: `SCORING_INTERNAL_URL ${MENSAJE_URL}` })
  SCORING_INTERNAL_URL?: string;

  @IsOptional()
  @Matches(URL_HTTP, { message: `REWARDS_INTERNAL_URL ${MENSAJE_URL}` })
  REWARDS_INTERNAL_URL?: string;

  @IsOptional()
  @Matches(URL_HTTP, { message: `NOTIFICATION_INTERNAL_URL ${MENSAJE_URL}` })
  NOTIFICATION_INTERNAL_URL?: string;

  @IsOptional()
  @Matches(URL_HTTP, { message: `AUDIT_INTERNAL_URL ${MENSAJE_URL}` })
  AUDIT_INTERNAL_URL?: string;

  @IsOptional()
  @IsString()
  LOG_LEVEL?: string;

  @IsOptional()
  @IsString()
  NODE_ENV?: string;
}

export function validarEnv(config: Record<string, unknown>): EnvSchema {
  const instancia = plainToInstance(EnvSchema, config);
  const errores = validateSync(instancia, { skipMissingProperties: false });
  const detalles = errores.map((error) =>
    Object.values(error.constraints ?? { [error.property]: `${error.property} inválida` }).join(', ')
  );

  if (instancia.JWT_PUBLIC_KEY && !decodificarPem(instancia.JWT_PUBLIC_KEY).startsWith('-----BEGIN')) {
    detalles.push('JWT_PUBLIC_KEY no contiene un PEM válido (crudo o codificado en base64)');
  }

  if (detalles.length > 0) {
    throw new Error(`Variables de entorno inválidas en gateway:\n- ${detalles.join('\n- ')}`);
  }

  return instancia;
}
