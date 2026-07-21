import { expect, request, test } from '@playwright/test';

import { Api } from './support/api';
import { consultarUna } from './support/db';
import { configurarGrupoManual, crearOrganizacion, iniciarSeccion, poll, sufijo } from './support/escenario';
import { existeCola, mensajesEnCola, publicarRaw } from './support/rabbit';

/**
 * Fase 12 · Punto 4 — Carga/performance básica del bus de eventos.
 *
 * NO es un benchmark: es una señal de humo. Publica ~500 registros de actividad
 * y confirma que scoring los proyecta TODOS al ledger, sin pérdidas ni
 * duplicados (conteo exacto de `EventoPuntos`), en un tiempo razonable. Además
 * confirma que la DLQ recibe un mensaje que agota reintentos.
 *
 * La ráfaga NO pasa por el Gateway (rate limit 100 req/min por IP): le pega
 * DIRECTO a activity-service (:3003) con los headers de tenant + secreto
 * interno que normalmente inyecta el Gateway — exactamente "contra
 * activity-service" como dice la spec.
 */
const CANTIDAD = Number(process.env['E2E_CARGA'] ?? '500');
const UMBRAL_MS = Number(process.env['E2E_CARGA_UMBRAL_MS'] ?? '60000');
const ACTIVITY_URL = process.env['E2E_ACTIVITY_URL'] ?? 'http://localhost:3003';
const LOTE = 25;

test.describe('Carga y DLQ del bus de eventos', () => {
  test(`${CANTIDAD} registros en ráfaga → scoring los proyecta sin pérdidas ni duplicados`, async () => {
    test.setTimeout(UMBRAL_MS + 60_000);

    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'Carga');
    await configurarGrupoManual(org);

    const actividad = await org.api.postOk<{ id: string }>(
      `/activity/grupos/${org.grupoId}/actividades`,
      {
        nombre: 'Registro de carga',
        tipoPuntaje: 'OPCIONAL',
        valorPuntos: 1,
        tipoLimiteTiempo: 'SIN_LIMITE',
        repeticionesMaximasSesion: CANTIDAD + 10,
      }
    );

    // Usuario destino.
    const invitacion = await org.api.postOk<{ codigo: string }>(
      `/identity/grupos/${org.grupoId}/invitaciones`,
      { tipoInvitado: 'USUARIO' }
    );
    const canje = await base.postOk<{ perfil: { id: string } }>(
      `/auth/invitaciones/${invitacion.codigo}/canjear`,
      {
        nombre: 'Usuario de Carga',
        password: 'contrasena-usuario-123',
        username: `carga_${sufijo()}`.replace(/-/g, '_').slice(0, 30),
      }
    );
    const usuarioId = canje.perfil.id;

    const seccion = await iniciarSeccion(org);

    // Cliente directo a activity-service (evita el rate limit del Gateway). Los
    // servicios revalidan el JWT y derivan el tenant de él (TenantContextGuard),
    // así que basta con el mismo Bearer del ORG_ADMIN — no hacen falta headers
    // internos de tenant.
    const directo = await request.newContext({
      baseURL: ACTIVITY_URL,
      extraHTTPHeaders: {
        'content-type': 'application/json',
        authorization: `Bearer ${org.token}`,
      },
    });

    const inicio = Date.now();

    // Ráfaga en lotes para no abrir 500 sockets de una.
    for (let desde = 0; desde < CANTIDAD; desde += LOTE) {
      const lote = Array.from({ length: Math.min(LOTE, CANTIDAD - desde) }, () =>
        directo.post(`/activity/actividades/${actividad.id}/completar`, {
          data: { usuarioId },
        })
      );
      const respuestas = await Promise.all(lote);
      for (const res of respuestas) {
        expect(res.ok(), `completar directo devolvió ${res.status()}`).toBeTruthy();
      }
    }

    const msPublicacion = Date.now() - inicio;
    await directo.dispose();

    // Esperar la proyección completa: COUNT exacto = CANTIDAD (sin pérdidas ni
    // duplicados — el eventId único hace imposible el doble asiento).
    await poll(
      async () => {
        const fila = await consultarUna<{ n: string }>(
          'scoring_db',
          `SELECT COUNT(*)::text AS n FROM "EventoPuntos" WHERE "seccionId" = $1 AND "usuarioId" = $2 AND "tipoOrigen" = 'ACTIVIDAD_COMPLETADA'`,
          [seccion.seccionId, usuarioId]
        );
        expect(Number(fila?.n)).toBe(CANTIDAD);
      },
      { timeoutMs: UMBRAL_MS, intervaloMs: 500, descripcion: `${CANTIDAD} asientos proyectados` }
    );

    const msTotal = Date.now() - inicio;
    console.log(
      `[carga] ${CANTIDAD} registros: publicación ${msPublicacion}ms, proyección total ${msTotal}ms (umbral ${UMBRAL_MS}ms)`
    );
    expect(msTotal, 'la proyección completa debe entrar en el umbral').toBeLessThanOrEqual(UMBRAL_MS);
  });

  test('la Dead Letter Queue recibe un mensaje que agota reintentos', async () => {
    // Topología: la DLQ de scoring existe y está declarada (ADR-00 §5).
    expect(await existeCola('scoring.dlq'), 'scoring.dlq debe existir').toBeTruthy();

    const antes = await mensajesEnCola('scoring.dlq');

    // Mensaje veneno: un ActividadCompletada SIN grupoId. El consumidor de
    // scoring falla determinísticamente en `grupoDelEnvelope` (antes de tocar
    // la base, así que no deja efecto), reintenta una vez y termina en la DLQ.
    const routed = await publicarRaw('dorado.events', 'activity.actividad_completada', {
      eventId: crypto.randomUUID(),
      eventType: 'ActividadCompletada',
      producedBy: 'e2e-carga',
      organizacionId: crypto.randomUUID(),
      // grupoId ausente a propósito.
      occurredAt: new Date().toISOString(),
      correlationId: crypto.randomUUID(),
      payload: {
        registroId: crypto.randomUUID(),
        usuarioId: crypto.randomUUID(),
        actividadId: crypto.randomUUID(),
        sesionId: crypto.randomUUID(),
        seccionId: crypto.randomUUID(),
        valorPuntosSnapshot: 1,
        registradoPorId: crypto.randomUUID(),
        registradoPorTipo: 'TUTOR',
      },
    });
    expect(routed, 'el mensaje veneno debe rutearse a la cola de scoring').toBeTruthy();

    await poll(
      async () => {
        const ahora = await mensajesEnCola('scoring.dlq');
        expect(ahora, 'la DLQ debe recibir el mensaje veneno').toBeGreaterThan(antes);
      },
      { timeoutMs: 25_000, intervaloMs: 500, descripcion: 'mensaje en scoring.dlq' }
    );
  });
});
