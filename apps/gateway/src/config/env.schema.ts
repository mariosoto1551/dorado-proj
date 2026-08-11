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

  // Panel de PLATFORM_ADMIN (fase-14-05). Opcional: es una app aparte y puede
  // no estar desplegada. Si lo está, su origen tiene que entrar a la lista de
  // CORS o el preflight le corta todas las llamadas.
  @IsOptional()
  @Matches(URL_HTTP, { message: `ADMIN_WEB_URL ${MENSAJE_URL}` })
  ADMIN_WEB_URL?: string;

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

  // fase-14-29: asistente de IA. Opcional como todas: un prefijo sin URL
  // configurada responde 503 hasta que su servicio se levante.
  @IsOptional()
  @Matches(URL_HTTP, { message: `AI_INTERNAL_URL ${MENSAJE_URL}` })
  AI_INTERNAL_URL?: string;

  /**
   * Proxies delante del Gateway (ver `proxy/trust-proxy.ts`). Sin definir, no
   * se confía en ningún `X-Forwarded-For`. Con Caddy o Render: `1`.
   *
   * Se valida acá igual que el resto —el proceso no arranca con un valor
   * inválido— pero la conversión vive en `resolverTrustProxy`, que es quien la
   * usa. `true` se rechaza a propósito (haría spoofeable el rate limiting).
   */
  @IsOptional()
  @IsString()
  @Matches(/^(?!true$)(?:false|\d+|[A-Za-z0-9.:,/_-]+)$/, {
    message:
      'TRUST_PROXY debe ser un entero de saltos (1 con Caddy/Render), un preset ' +
      '(loopback, uniquelocal), una lista de IPs/CIDRs, o false. `true` no se acepta: ' +
      'confiaría en toda la cadena y cualquiera podría elegir su propia IP.',
  })
  TRUST_PROXY?: string;

  /**
   * Fuerza el `Strict-Transport-Security`. Por defecto se manda cuando hay un
   * proxy delante (que es quien termina TLS). Ver `cabeceras-seguridad`.
   */
  @IsOptional()
  @Matches(/^(true|false)$/, { message: 'HSTS debe ser "true" o "false"' })
  HSTS?: string;

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
