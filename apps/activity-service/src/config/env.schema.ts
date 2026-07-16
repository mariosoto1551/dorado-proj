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
 * Schema de variables de entorno de activity-service (ADR-00 §8): el proceso
 * NO arranca si falta una requerida o tiene formato inválido — falla rápido y
 * con mensaje claro, nunca queda a medias.
 *
 * Sin RABBITMQ_URL a propósito: esta fase no publica ni consume eventos
 * (spec fase-05); se agrega en Fase 7 con los endpoints de registro.
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

  // Clave pública RS256 (ADR-00 §3): activity valida el JWT de usuario en
  // todas sus rutas /activity/*. La privada NUNCA va acá (solo identity emite).
  @IsString()
  @IsNotEmpty()
  JWT_PUBLIC_KEY!: string;

  @IsString()
  @MinLength(16, {
    message: 'GATEWAY_INTERNAL_SECRET debe tener al menos 16 caracteres',
  })
  GATEWAY_INTERNAL_SECRET!: string;

  // REST interno (ADR-00 §4): entitlements para el límite de actividades.
  @Matches(/^https?:\/\/.+/, {
    message: 'BILLING_INTERNAL_URL debe ser una URL http(s)://',
  })
  BILLING_INTERNAL_URL!: string;

  // REST interno (ADR-00 §4): validar que un grupoId pertenece a la
  // organización del JWT antes de escribir (regla 3 de CLAUDE.md).
  @Matches(/^https?:\/\/.+/, {
    message: 'IDENTITY_INTERNAL_URL debe ser una URL http(s)://',
  })
  IDENTITY_INTERNAL_URL!: string;

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
      `Variables de entorno inválidas en activity-service:\n- ${detalles.join('\n- ')}`
    );
  }

  return instancia;
}
