import { plainToInstance, Transform } from 'class-transformer';
import {
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
 * Schema de variables de entorno de notification-service (ADR-00 §8): el
 * proceso NO arranca si falta una requerida o tiene formato inválido.
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

  // Clave pública RS256 (ADR-00 §3): notification valida el JWT de usuario en
  // todas sus rutas /notification/*.
  @IsString()
  @IsNotEmpty()
  JWT_PUBLIC_KEY!: string;

  @IsString()
  @MinLength(16, {
    message: 'GATEWAY_INTERNAL_SECRET debe tener al menos 16 caracteres',
  })
  GATEWAY_INTERNAL_SECRET!: string;

  // RabbitMQ (ADR-00 §5): esta fase consume los 9 eventos notificables.
  @Matches(/^amqps?:\/\/.+/, {
    message: 'RABBITMQ_URL debe ser una URL amqp(s)://',
  })
  RABBITMQ_URL!: string;

  // REST interno (ADR-00 §4): destinatarios y nombres para las plantillas —
  // los payloads de eventos solo traen IDs a propósito (spec fase-09).
  @Matches(/^https?:\/\/.+/, {
    message: 'IDENTITY_INTERNAL_URL debe ser una URL http(s)://',
  })
  IDENTITY_INTERNAL_URL!: string;

  @Matches(/^https?:\/\/.+/, {
    message: 'ACTIVITY_INTERNAL_URL debe ser una URL http(s)://',
  })
  ACTIVITY_INTERNAL_URL!: string;

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
    throw new Error(
      `Variables de entorno inválidas en notification-service:\n- ${detalles.join('\n- ')}`
    );
  }

  return instancia;
}
