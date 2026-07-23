import { plainToInstance, Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

import { decodificarPem } from '@dorado/shared-auth';

/**
 * Schema de variables de entorno de identity-service (ADR-00 §8): el proceso
 * NO arranca si falta una requerida o tiene formato inválido — falla rápido y
 * con mensaje claro, nunca queda a medias.
 *
 * Mecanismo elegido para todo el monorepo: `class-validator` (ya se usa para
 * los DTOs de request; un solo mecanismo de validación).
 */
export class EnvSchema {
  @IsOptional()
  @Transform(({ value }) => parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  PORT?: number;

  @Matches(/^postgres(ql)?:\/\/.+/, {
    message: 'DATABASE_URL debe ser una URL postgresql://',
  })
  DATABASE_URL!: string;

  @Matches(/^amqps?:\/\/.+/, {
    message: 'RABBITMQ_URL debe ser una URL amqp:// o amqps://',
  })
  RABBITMQ_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_PRIVATE_KEY!: string;

  @IsString()
  @IsNotEmpty()
  JWT_PUBLIC_KEY!: string;

  @IsString()
  @MinLength(16, {
    message: 'GATEWAY_INTERNAL_SECRET debe tener al menos 16 caracteres',
  })
  GATEWAY_INTERNAL_SECRET!: string;

  // REST interno hacia billing (ADR-00 §4): plan del JWT y entitlements.
  @Matches(/^https?:\/\/.+/, {
    message: 'BILLING_INTERNAL_URL debe ser una URL http(s)://',
  })
  BILLING_INTERNAL_URL!: string;

  // Bootstrap del PLATFORM_ADMIN (fase-14-05): si ambas vienen y la cuenta no
  // existe, se crea al arrancar. Opcionales: sin ellas, no hay admin (ej. tests).
  @IsOptional()
  @IsString()
  @Matches(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, {
    message: 'PLATFORM_ADMIN_EMAIL debe ser un email válido',
  })
  PLATFORM_ADMIN_EMAIL?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, {
    message: 'PLATFORM_ADMIN_PASSWORD debe tener al menos 8 caracteres',
  })
  PLATFORM_ADMIN_PASSWORD?: string;

  @IsOptional()
  @IsString()
  PLATFORM_ADMIN_NOMBRE?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  REFRESH_COOKIE_SECURE?: string;

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

  for (const clave of ['JWT_PRIVATE_KEY', 'JWT_PUBLIC_KEY'] as const) {
    const valor = instancia[clave];

    if (valor && !decodificarPem(valor).startsWith('-----BEGIN')) {
      detalles.push(`${clave} no contiene un PEM válido (crudo o codificado en base64)`);
    }
  }

  if (detalles.length > 0) {
    throw new Error(
      `Variables de entorno inválidas en identity-service:\n- ${detalles.join('\n- ')}`
    );
  }

  return instancia;
}
