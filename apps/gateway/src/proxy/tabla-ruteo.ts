/**
 * Tabla de ruteo del Gateway (spec fase-03): cada prefijo público bajo /api
 * mapea 1:1 a un servicio interno. Se define COMPLETA desde la Fase 3
 * (incluyendo servicios que todavía no existen) para no retocar el Gateway en
 * cada fase — un prefijo cuyo servicio no tiene `<SERVICIO>_INTERNAL_URL`
 * configurada responde 503 hasta que su fase lo levante.
 */
export interface ServicioInterno {
  /** Nombre corto usado como clave en GET /api/health. */
  nombre: string;
  /** Variable de entorno con la URL interna del servicio (ADR-00 §4). */
  envVar: string;
}

export interface RutaProxy {
  /** Prefijo público, ej. '/api/auth'. */
  prefijo: string;
  servicio: ServicioInterno;
  /**
   * Timeout del proxy en ms. Omitido = `TIMEOUT_PROXY_DEFAULT_MS`, que es el
   * valor de la spec de Fase 3 para todo el resto del stack (fase-14-29).
   */
  timeoutMs?: number;
}

/**
 * Timeout por defecto (spec fase-03). Todos los servicios del monorepo
 * responden en milisegundos, así que 30 s ya es holgadísimo: si uno tarda más,
 * está roto.
 */
export const TIMEOUT_PROXY_DEFAULT_MS = 30_000;

/**
 * Timeout de `/api/ai` (fase-14-29).
 *
 * **Es la única ruta con un perfil de latencia distinto**, y no por un problema
 * de performance: un turno del asistente puede encadenar varias llamadas a un
 * proveedor externo que piensa durante segundos, y la spec ya le da 60 s a cada
 * una. Lo destapó una verificación real que tardó 30,0 s y se comió un 502
 * mientras `ai-service` seguía trabajando y **gastando tokens** del otro lado:
 * el Tutor veía un error y la plataforma pagaba igual.
 *
 * No es «subamos el timeout global»: el 30 s del resto es una propiedad
 * deseable —un servicio interno que tarda más está roto— y se conserva.
 */
export const TIMEOUT_PROXY_AI_MS = 120_000;

const IDENTITY: ServicioInterno = { nombre: 'identity', envVar: 'IDENTITY_INTERNAL_URL' };
const BILLING: ServicioInterno = { nombre: 'billing', envVar: 'BILLING_INTERNAL_URL' };
const ACTIVITY: ServicioInterno = { nombre: 'activity', envVar: 'ACTIVITY_INTERNAL_URL' };
const SESSION: ServicioInterno = { nombre: 'session', envVar: 'SESSION_INTERNAL_URL' };
const SCORING: ServicioInterno = { nombre: 'scoring', envVar: 'SCORING_INTERNAL_URL' };
const REWARDS: ServicioInterno = { nombre: 'rewards', envVar: 'REWARDS_INTERNAL_URL' };
const NOTIFICATION: ServicioInterno = { nombre: 'notification', envVar: 'NOTIFICATION_INTERNAL_URL' };
const AUDIT: ServicioInterno = { nombre: 'audit', envVar: 'AUDIT_INTERNAL_URL' };
// fase-14-29: asistente de IA del área del Tutor. Décimo servicio del stack.
const AI: ServicioInterno = { nombre: 'ai', envVar: 'AI_INTERNAL_URL' };

/** Servicios únicos (identity atiende dos prefijos) — para GET /api/health. */
export const SERVICIOS_INTERNOS: readonly ServicioInterno[] = [
  IDENTITY,
  BILLING,
  ACTIVITY,
  SESSION,
  SCORING,
  REWARDS,
  NOTIFICATION,
  AUDIT,
  AI,
];

export const TABLA_RUTEO: readonly RutaProxy[] = [
  { prefijo: '/api/auth', servicio: IDENTITY },
  { prefijo: '/api/identity', servicio: IDENTITY },
  // Panel de PLATFORM_ADMIN (fase-14-05): identity atiende un tercer prefijo.
  { prefijo: '/api/admin', servicio: IDENTITY },
  { prefijo: '/api/billing', servicio: BILLING },
  { prefijo: '/api/activity', servicio: ACTIVITY },
  { prefijo: '/api/session', servicio: SESSION },
  { prefijo: '/api/scoring', servicio: SCORING },
  { prefijo: '/api/rewards', servicio: REWARDS },
  { prefijo: '/api/notification', servicio: NOTIFICATION },
  { prefijo: '/api/audit', servicio: AUDIT },
  { prefijo: '/api/ai', servicio: AI, timeoutMs: TIMEOUT_PROXY_AI_MS },
];
