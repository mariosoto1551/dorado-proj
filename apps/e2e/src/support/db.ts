import { Client } from 'pg';

/**
 * Acceso SQL directo a las bases de los servicios. Se usa SOLO en los tests de
 * verificación de la Fase 12 (inmutabilidad del ledger, conteo exacto de
 * `EventoProcesado`, intento deliberado de UPDATE/DELETE) — nunca en el flujo
 * de negocio, que va siempre por el Gateway. Cada servicio tiene su propia
 * base (regla 2: ningún join cruzado); acá abrimos conexiones separadas.
 *
 * Credenciales = las del docker-compose de dev (dorado/dorado_dev@:5432).
 */
const HOST = process.env['E2E_PG_HOST'] ?? 'localhost';
const PORT = Number(process.env['E2E_PG_PORT'] ?? '5432');
const USER = process.env['E2E_PG_USER'] ?? 'dorado';
const PASSWORD = process.env['E2E_PG_PASSWORD'] ?? 'dorado_dev';

export type NombreBase =
  | 'identity_db'
  | 'billing_db'
  | 'activity_db'
  | 'session_db'
  | 'scoring_db'
  | 'rewards_db'
  | 'notification_db'
  | 'audit_db'
  /** fase-14-29: el ledger de mensajes y las propuestas del asistente. */
  | 'ai_db';

/** Ejecuta una query contra una base puntual y cierra la conexión. */
export async function consultar<T = Record<string, unknown>>(
  base: NombreBase,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const cliente = new Client({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: base });
  await cliente.connect();

  try {
    const resultado = await cliente.query(sql, params);

    return resultado.rows as T[];
  } finally {
    await cliente.end();
  }
}

/** Igual que `consultar` pero devuelve la primera fila (o null). */
export async function consultarUna<T = Record<string, unknown>>(
  base: NombreBase,
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const filas = await consultar<T>(base, sql, params);

  return filas[0] ?? null;
}

/**
 * Intenta ejecutar SQL que se ESPERA que falle (p. ej. no debería haber
 * permisos, o queremos verificar que una restricción lo bloquea). Devuelve el
 * error si lo hubo, o null si —inesperadamente— pasó.
 */
export async function intentarQueFalle(
  base: NombreBase,
  sql: string,
  params: unknown[] = []
): Promise<Error | null> {
  try {
    await consultar(base, sql, params);

    return null;
  } catch (error) {
    return error as Error;
  }
}
