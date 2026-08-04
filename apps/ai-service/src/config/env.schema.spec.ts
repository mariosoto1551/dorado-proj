import { describe, expect, it } from 'vitest';

import { validarEnv } from './env.schema';

// PEM público de juguete: `validarEnv` solo mira que empiece con -----BEGIN.
const JWT_PUBLIC_KEY = Buffer.from(
  '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----\n'
).toString('base64');

function envBase(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    DATABASE_URL: 'postgresql://dorado:dorado@localhost:5432/ai_db',
    JWT_PUBLIC_KEY,
    GATEWAY_INTERNAL_SECRET: 'secreto-interno-de-al-menos-16',
    BILLING_INTERNAL_URL: 'http://localhost:3002',
    ...extra,
  };
}

describe('validarEnv — ai-service', () => {
  it('arranca sin OPENAI_API_KEY: hasta la tanda 4 no hay a quién preguntarle', () => {
    expect(() => validarEnv(envBase())).not.toThrow();
  });

  /**
   * El caso real: `.env.example` declara `OPENAI_API_KEY=` y quien lo copia tal
   * cual llega con `''`, no con `undefined`. `@IsOptional()` no saltea el
   * string vacío, así que sin el `@Transform` el proceso no levantaba.
   * Lo encontró levantar el servicio de verdad — tests, lint y build estaban
   * verdes.
   */
  it('una OPENAI_API_KEY declarada y vacía NO impide el arranque', () => {
    expect(() => validarEnv(envBase({ OPENAI_API_KEY: '', OPENAI_MODEL: '' }))).not.toThrow();
  });

  it('una OPENAI_API_KEY presente pero obviamente inválida sí frena el arranque', () => {
    expect(() => validarEnv(envBase({ OPENAI_API_KEY: 'sk-corta' }))).toThrow(/OPENAI_API_KEY/);
  });

  it('acepta una key con forma de service account de un project', () => {
    const env = validarEnv(envBase({ OPENAI_API_KEY: `sk-proj-${'x'.repeat(40)}` }));

    expect(env.OPENAI_API_KEY).toMatch(/^sk-proj-/);
  });

  it('no arranca sin BILLING_INTERNAL_URL: sin billing no se puede saber si la feature está en el plan', () => {
    const { BILLING_INTERNAL_URL: _omitida, ...sinBilling } = envBase();

    expect(() => validarEnv(sinBilling)).toThrow(/BILLING_INTERNAL_URL/);
  });

  it('no arranca sin DATABASE_URL', () => {
    const { DATABASE_URL: _omitida, ...sinBase } = envBase();

    expect(() => validarEnv(sinBase)).toThrow(/DATABASE_URL/);
  });
});
