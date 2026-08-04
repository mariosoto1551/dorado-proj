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
 * Schema de variables de entorno de ai-service (ADR-00 §8): el proceso NO
 * arranca si falta una requerida o tiene formato inválido — falla rápido y con
 * mensaje claro, nunca queda a medias.
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

  // Clave pública RS256 (ADR-00 §3): ai valida el JWT de usuario en todas sus
  // rutas /ai/*. La privada NUNCA va acá (solo identity emite).
  @IsString()
  @IsNotEmpty()
  JWT_PUBLIC_KEY!: string;

  @IsString()
  @MinLength(16, {
    message: 'GATEWAY_INTERNAL_SECRET debe tener al menos 16 caracteres',
  })
  GATEWAY_INTERNAL_SECRET!: string;

  // REST interno (ADR-00 §4): billing resuelve si el plan habilita el
  // asistente y con qué cuota de tokens (fase-14-29 Parte A). Es el único
  // cliente interno de la tanda 2; los de lectura del catálogo entran en la 3.
  @Matches(/^https?:\/\/.+/, {
    message: 'BILLING_INTERNAL_URL debe ser una URL http(s)://',
  })
  BILLING_INTERNAL_URL!: string;

  /**
   * Key de un **service account** de un **project** de OpenAI (uno por
   * entorno: dorado-dev / dorado-staging / dorado-prod, cada uno con su
   * límite de gasto propio). NUNCA una key personal de un miembro de la
   * organización: muere cuando esa persona se va y no se puede acotar.
   *
   * Vive SOLO en el entorno de este servicio — ningún otro backend ni
   * `app-web` la tienen, así que un bug en otro lado no puede filtrarla.
   *
   * Opcional a propósito hasta la tanda 4: al terminar la tanda 2 el servicio
   * levanta y el dueño puede prender el switch sin que exista ninguna llamada
   * al proveedor. En cuanto haya loop, pasa a requerida.
   *
   * El `@Transform` a `undefined` NO es cosmético: `@IsOptional()` de
   * class-validator solo saltea `undefined` y `null`, y una variable declarada
   * y vacía en el `.env` llega como `''`, que sí entra al `@MinLength` y tira
   * el arranque abajo. Sin esto, copiar `.env.example` tal cual deja un
   * servicio que no levanta hasta tener la key — lo contrario de lo que esta
   * tanda tiene que garantizar. Lo destapó levantar el proceso de verdad:
   * tests, lint y build estaban verdes.
   */
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @MinLength(20, {
    message: 'OPENAI_API_KEY no parece una key válida (muy corta)',
  })
  OPENAI_API_KEY?: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  OPENAI_MODEL?: string;

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
    throw new Error(`Variables de entorno inválidas en ai-service:\n- ${detalles.join('\n- ')}`);
  }

  return instancia;
}
