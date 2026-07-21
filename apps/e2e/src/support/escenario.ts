import { expect } from '@playwright/test';

import { Api } from './api';

/**
 * Escenario con NÚMEROS CONOCIDOS DE ANTEMANO (Fase 12, punto 1.6). El total y
 * la zona no se calculan "que dé algo": están fijados acá y el cálculo manual
 * es explícito:
 *
 *   completar A1 (opcional, +10)   = +10
 *   no-hizo   A2 (obligatoria, 5)  =  -5
 *   conducta  C1 (buena,  +25)     = +25
 *   conducta  C2 (mala,    3)      =  -3
 *   ─────────────────────────────────────
 *   TOTAL                          =  27  → zona VERDE (25–49)
 *
 * Tras una corrección post-cierre de +5 el ledger vivo pasa a 32, pero el
 * snapshot ResultadoSeccion sigue siendo 27/Verde (inmutabilidad — Fase 12.3).
 */
export const ESCENARIO = {
  umbrales: [
    { nombreZona: 'Rojo', orden: 1, puntosMin: 0, puntosMax: 9, colorHex: '#EF4444' },
    { nombreZona: 'Amarillo', orden: 2, puntosMin: 10, puntosMax: 24, colorHex: '#F59E0B' },
    { nombreZona: 'Verde', orden: 3, puntosMin: 25, puntosMax: 49, colorHex: '#22C55E' },
    { nombreZona: 'Dorado', orden: 4, puntosMin: 50, puntosMax: null, colorHex: '#EAB308' },
  ],
  actividadOpcional: {
    nombre: 'Leer 20 minutos',
    tipoPuntaje: 'OPCIONAL',
    valorPuntos: 10,
    tipoLimiteTiempo: 'SIN_LIMITE',
    repeticionesMaximasSesion: 1,
  },
  actividadObligatoria: {
    nombre: 'Tender la cama',
    tipoPuntaje: 'OBLIGATORIA',
    valorPuntos: 5,
    tipoLimiteTiempo: 'SIN_LIMITE',
  },
  conductaBuena: { nombre: 'Ayudó sin que se lo pidan', tipo: 'BUENA', valorPuntos: 25 },
  conductaMala: { nombre: 'Contestó mal', tipo: 'MALA', valorPuntos: 3, permiteAutoreporte: false },
  puntajeEsperado: 27,
  zonaEsperada: 'Verde',
  ajusteCorreccion: 5,
  puntajeVivoTrasCorreccion: 32,
} as const;

/** Contexto de una organización recién armada (tutor ORG_ADMIN + grupo). */
export interface Organizacion {
  api: Api;
  token: string;
  organizacionId: string;
  tutorId: string;
  grupoId: string;
  nombre: string;
}

/** Sufijo único por corrida para no chocar entre ejecuciones sobre la misma base. */
export function sufijo(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Registra una organización nueva y devuelve tutor ORG_ADMIN + un grupo.
 *
 * El POST de registro va DIRECTO a identity-service (no al Gateway) porque el
 * Gateway limita `/auth/organizaciones` a 10/min por IP (anti fuerza bruta) —
 * la suite crea muchas orgs y esa mitigación no es lo que se está probando
 * acá. El resto del flujo sí pasa por el Gateway con el token emitido.
 */
export async function crearOrganizacion(base: Api, etiqueta: string): Promise<Organizacion> {
  const nombre = `Org ${etiqueta} ${sufijo()}`;
  const emailContacto = `admin-${sufijo()}@ejemplo.test`;
  const identityUrl = process.env['E2E_IDENTITY_URL'] ?? 'http://localhost:3001';

  const res = await fetch(`${identityUrl}/auth/organizaciones`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nombre, emailContacto, password: 'contrasena-segura-123' }),
  });

  if (!res.ok) {
    throw new Error(`registro directo devolvió ${res.status}: ${await res.text()}`);
  }

  const registro = (await res.json()) as {
    accessToken: string;
    tutor: { id: string; organizacionId: string };
    organizacion: { id: string };
  };

  const api = base.conToken(registro.accessToken);

  const grupo = await api.postOk<{ id: string }>('/identity/grupos', {
    nombre: `Grupo ${etiqueta}`,
    timezone: 'America/Argentina/Buenos_Aires',
  });

  return {
    api,
    token: registro.accessToken,
    organizacionId: registro.tutor.organizacionId,
    tutorId: registro.tutor.id,
    grupoId: grupo.id,
    nombre,
  };
}

/** Configura el grupo en modo MANUAL con evaluación al cierre de sección. */
export async function configurarGrupoManual(org: Organizacion): Promise<void> {
  await org.api.putOk(`/session/grupos/${org.grupoId}/configuracion`, {
    modo: 'MANUAL',
    sesionesPorSeccion: 1,
    evaluarUmbralesEn: 'SOLO_AL_CIERRE_SECCION',
  });
}

/** Crea los 4 umbrales del escenario (contiguos, validados por scoring). */
export async function crearUmbrales(org: Organizacion): Promise<void> {
  for (const umbral of ESCENARIO.umbrales) {
    await org.api.postOk(`/scoring/grupos/${org.grupoId}/umbrales`, umbral);
  }
}

export interface Catalogo {
  actividadOpcionalId: string;
  actividadObligatoriaId: string;
  conductaBuenaId: string;
  conductaMalaId: string;
}

/** Crea las 2 actividades y 2 conductas del escenario. */
export async function crearCatalogo(org: Organizacion): Promise<Catalogo> {
  const a1 = await org.api.postOk<{ id: string }>(
    `/activity/grupos/${org.grupoId}/actividades`,
    ESCENARIO.actividadOpcional
  );
  const a2 = await org.api.postOk<{ id: string }>(
    `/activity/grupos/${org.grupoId}/actividades`,
    ESCENARIO.actividadObligatoria
  );
  const c1 = await org.api.postOk<{ id: string }>(
    `/activity/grupos/${org.grupoId}/conductas`,
    ESCENARIO.conductaBuena
  );
  const c2 = await org.api.postOk<{ id: string }>(
    `/activity/grupos/${org.grupoId}/conductas`,
    ESCENARIO.conductaMala
  );

  return {
    actividadOpcionalId: a1.id,
    actividadObligatoriaId: a2.id,
    conductaBuenaId: c1.id,
    conductaMalaId: c2.id,
  };
}

/** Genera invitación de USUARIO y la canjea en una "sesión de navegador" aparte. */
export async function invitarYCanjearUsuario(
  base: Api,
  org: Organizacion
): Promise<{ api: Api; token: string; usuarioId: string; username: string }> {
  const invitacion = await org.api.postOk<{ codigo: string }>(
    `/identity/grupos/${org.grupoId}/invitaciones`,
    { tipoInvitado: 'USUARIO' }
  );

  const username = `usuario_${sufijo()}`.replace(/-/g, '_').slice(0, 30);

  // Actor separado: context HTTP propio, sin el token del tutor (regla 7).
  const canje = await base.postOk<{ accessToken: string; perfil: { id: string } }>(
    `/auth/invitaciones/${invitacion.codigo}/canjear`,
    { nombre: 'Usuario de Prueba', password: 'contrasena-usuario-123', username }
  );

  return {
    api: base.conToken(canje.accessToken),
    token: canje.accessToken,
    usuarioId: canje.perfil.id,
    username,
  };
}

export interface SeccionAbierta {
  seccionId: string;
  sesionId: string;
}

/** Inicia una Sección (modo MANUAL) y devuelve sección + primera sesión abierta. */
export async function iniciarSeccion(org: Organizacion): Promise<SeccionAbierta> {
  const seccion = await org.api.postOk<{ id: string; sesiones: { id: string }[] }>(
    `/session/grupos/${org.grupoId}/secciones/iniciar`,
    {}
  );

  expect(seccion.sesiones.length, 'iniciar debe abrir la primera sesión').toBeGreaterThan(0);

  return { seccionId: seccion.id, sesionId: seccion.sesiones[0].id };
}

interface OpcionesPoll {
  timeoutMs?: number;
  intervaloMs?: number;
  descripcion?: string;
}

/**
 * Reintenta `accion` hasta que resuelva sin lanzar o se agote el tiempo — para
 * la consistencia eventual del bus (un registro por HTTP tarda unos ms en
 * proyectarse al ledger de scoring vía RabbitMQ). No es un sleep fijo: corta
 * apenas la condición se cumple. Devuelve lo que devolvió `accion` (útil para
 * esperar una fila del ledger). El 2º argumento puede ser una descripción
 * corta o un objeto de opciones.
 */
export async function poll<T>(
  accion: () => Promise<T>,
  opciones: OpcionesPoll | string = {}
): Promise<T> {
  const opts: OpcionesPoll = typeof opciones === 'string' ? { descripcion: opciones } : opciones;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const intervaloMs = opts.intervaloMs ?? 400;
  const limite = Date.now() + timeoutMs;
  let ultimoError: unknown;

  while (Date.now() < limite) {
    try {
      return await accion();
    } catch (error) {
      ultimoError = error;
      await new Promise((resolver) => setTimeout(resolver, intervaloMs));
    }
  }

  throw new Error(
    `poll agotó ${timeoutMs}ms esperando "${opts.descripcion ?? 'condición'}": ${
      ultimoError instanceof Error ? ultimoError.message : String(ultimoError)
    }`
  );
}
