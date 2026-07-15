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
}

const IDENTITY: ServicioInterno = { nombre: 'identity', envVar: 'IDENTITY_INTERNAL_URL' };
const BILLING: ServicioInterno = { nombre: 'billing', envVar: 'BILLING_INTERNAL_URL' };
const ACTIVITY: ServicioInterno = { nombre: 'activity', envVar: 'ACTIVITY_INTERNAL_URL' };
const SESSION: ServicioInterno = { nombre: 'session', envVar: 'SESSION_INTERNAL_URL' };
const SCORING: ServicioInterno = { nombre: 'scoring', envVar: 'SCORING_INTERNAL_URL' };
const REWARDS: ServicioInterno = { nombre: 'rewards', envVar: 'REWARDS_INTERNAL_URL' };
const NOTIFICATION: ServicioInterno = { nombre: 'notification', envVar: 'NOTIFICATION_INTERNAL_URL' };
const AUDIT: ServicioInterno = { nombre: 'audit', envVar: 'AUDIT_INTERNAL_URL' };

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
];

export const TABLA_RUTEO: readonly RutaProxy[] = [
  { prefijo: '/api/auth', servicio: IDENTITY },
  { prefijo: '/api/identity', servicio: IDENTITY },
  { prefijo: '/api/billing', servicio: BILLING },
  { prefijo: '/api/activity', servicio: ACTIVITY },
  { prefijo: '/api/session', servicio: SESSION },
  { prefijo: '/api/scoring', servicio: SCORING },
  { prefijo: '/api/rewards', servicio: REWARDS },
  { prefijo: '/api/notification', servicio: NOTIFICATION },
  { prefijo: '/api/audit', servicio: AUDIT },
];
