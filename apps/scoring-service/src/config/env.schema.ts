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
 * Schema de variables de entorno de scoring-service (ADR-00 §8): el proceso
 * NO arranca si falta una requerida o tiene formato inválido — falla rápido y
 * con mensaje claro, nunca queda a medias.
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

  // Clave pública RS256 (ADR-00 §3): scoring valida el JWT de usuario en
  // todas sus rutas /scoring/*. La privada NUNCA va acá (solo identity emite).
  @IsString()
  @IsNotEmpty()
  JWT_PUBLIC_KEY!: string;

  @IsString()
  @MinLength(16, {
    message: 'GATEWAY_INTERNAL_SECRET debe tener al menos 16 caracteres',
  })
  GATEWAY_INTERNAL_SECRET!: string;

  // RabbitMQ (ADR-00 §5): esta fase consume 6 eventos y publica 2.
  @Matches(/^amqps?:\/\/.+/, {
    message: 'RABBITMQ_URL debe ser una URL amqp(s)://',
  })
  RABBITMQ_URL!: string;

  // REST interno (ADR-00 §4): usuarios ACTIVO del grupo para la evaluación y
  // validación de acceso/pertenencia (regla 3 de CLAUDE.md).
  @Matches(/^https?:\/\/.+/, {
    message: 'IDENTITY_INTERNAL_URL debe ser una URL http(s)://',
  })
  IDENTITY_INTERNAL_URL!: string;

  // REST interno (ADR-00 §4): `evaluarUmbralesEn` del grupo al consumir
  // SesionCerrada (spec fase-07).
  @Matches(/^https?:\/\/.+/, {
    message: 'SESSION_INTERNAL_URL debe ser una URL http(s)://',
  })
  SESSION_INTERNAL_URL!: string;

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
      `Variables de entorno inválidas en scoring-service:\n- ${detalles.join('\n- ')}`
    );
  }

  return instancia;
}
