import { APIResponse, expect, test } from '@playwright/test';

import { Api } from './support/api';
import {
  configurarGrupoManual,
  crearOrganizacion,
  crearUmbrales,
  iniciarSeccion,
  sufijo,
} from './support/escenario';

/**
 * Fase 12 · Punto 2 — TEST DE SEGURIDAD: aislamiento entre tenants.
 *
 * NO es un test funcional: verifica explícitamente que un JWT de la
 * Organización A jamás puede leer ni escribir datos de la Organización B, en
 * cada servicio, tanto por lista (la data de B nunca aparece) como por acceso
 * directo a un UUID de B adivinado en la URL (404/403, nunca 200 con datos).
 *
 * Comportamiento esperado según ADR-00 §2/§4 y las reglas 2 y 3 de CLAUDE.md:
 * - Escritura sobre un grupo ajeno (ORG_ADMIN): 404 (no revelar existencia).
 * - Lectura de lista sobre un grupo ajeno: 200 pero SIN la data de B (el filtro
 *   automático de tenant de Prisma la excluye) — se asalta que B no aparece.
 * - Un TUTOR con `grupoIds` acotado: 403 al adivinar el grupo de otra org.
 * - Headers de tenant forjados a través del Gateway: ignorados (anti-spoofing).
 */
test.describe('Seguridad · aislamiento entre organizaciones', () => {
  test('un tenant no puede leer ni escribir datos de otro', async () => {
    test.slow();

    const base = await Api.crear();

    // Dos organizaciones independientes, cada una con su grupo, umbrales y una
    // Sección abierta (para tener UUIDs reales de B que A intentará adivinar).
    const orgA = await crearOrganizacion(base, 'A');
    const orgB = await crearOrganizacion(base, 'B');

    await configurarGrupoManual(orgB);
    await crearUmbrales(orgB);
    const seccionB = await iniciarSeccion(orgB);
    const actividadB = await orgB.api.postOk<{ id: string }>(
      `/activity/grupos/${orgB.grupoId}/actividades`,
      { nombre: 'Solo de B', tipoPuntaje: 'OPCIONAL', valorPuntos: 3, tipoLimiteTiempo: 'SIN_LIMITE' }
    );

    await test.step('identity: A no ve el Grupo de B en su listado', async () => {
      const grupos = await orgA.api.getOk<{ id: string }[]>('/identity/grupos');
      expect(grupos.map((g) => g.id)).not.toContain(orgB.grupoId);
    });

    await test.step('session: A no puede leer la Sección de B por su UUID (404)', async () => {
      const res = await orgA.api.get(`/session/secciones/${seccionB.seccionId}`);
      expect(res.status(), 'sección ajena por UUID directo').toBe(404);
    });

    await test.step('session: A no puede iniciar una Sección en el Grupo de B (404 escritura)', async () => {
      const res = await orgA.api.post(`/session/grupos/${orgB.grupoId}/secciones/iniciar`, {});
      expect(res.status()).toBe(404);
    });

    await test.step('scoring: A no puede leer los puntajes del Grupo de B (404)', async () => {
      const res = await orgA.api.get(
        `/scoring/grupos/${orgB.grupoId}/secciones/${seccionB.seccionId}/puntajes`
      );
      expect(res.status()).toBe(404);
    });

    await test.step('scoring: A no puede crear umbrales en el Grupo de B (404 escritura)', async () => {
      const res = await orgA.api.post(`/scoring/grupos/${orgB.grupoId}/umbrales`, {
        nombreZona: 'Intruso',
        orden: 1,
        puntosMin: 0,
        puntosMax: 10,
        colorHex: '#000000',
      });
      expect(res.status()).toBe(404);
    });

    await test.step('activity: la lista del Grupo de B nunca trae la Actividad de B para A', async () => {
      // Lectura de lista: el filtro de tenant devuelve vacío, no 404 — lo
      // importante es que la Actividad de B jamás aparezca.
      const res = await orgA.api.get(`/activity/grupos/${orgB.grupoId}/actividades`);

      if (res.ok()) {
        const actividades = (await res.json()) as { id: string }[];
        expect(actividades.map((a) => a.id)).not.toContain(actividadB.id);
      } else {
        expect([403, 404]).toContain(res.status());
      }
    });

    await test.step('audit: A no puede leer el timeline del Grupo de B', async () => {
      const res = await orgA.api.get(`/audit/grupos/${orgB.grupoId}`);

      if (res.ok()) {
        const timeline = (await res.json()) as { items: { grupoId: string | null }[] };
        for (const item of timeline.items) {
          expect(item.grupoId).not.toBe(orgB.grupoId);
        }
      } else {
        expect([403, 404]).toContain(res.status());
      }
    });
  });

  test('un TUTOR no accede al Grupo de otra organización aunque adivine el UUID', async () => {
    const base = await Api.crear();

    const orgA = await crearOrganizacion(base, 'A-tutor');
    const orgB = await crearOrganizacion(base, 'B-tutor');
    await configurarGrupoManual(orgB);
    const seccionB = await iniciarSeccion(orgB);

    // TUTOR real (no ORG_ADMIN) dentro del grupo de A: su JWT trae grupoIds=[A].
    const invitacion = await orgA.api.postOk<{ codigo: string }>(
      `/identity/grupos/${orgA.grupoId}/invitaciones`,
      { tipoInvitado: 'TUTOR' }
    );
    const canje = await base.postOk<{ accessToken: string }>(
      `/auth/invitaciones/${invitacion.codigo}/canjear`,
      {
        nombre: 'Tutor de Prueba',
        password: 'contrasena-tutor-123',
        email: `tutor-${sufijo()}@ejemplo.test`,
      }
    );
    const tutorA = base.conToken(canje.accessToken);

    // Adivina el grupo de B por URL: 403 (grupoIds no lo incluye), nunca 200.
    const lectura = await tutorA.get(`/session/grupos/${orgB.grupoId}/secciones/actual`);
    expect(lectura.status(), 'TUTOR de A leyendo grupo de B').toBe(403);

    const seccionAjena = await tutorA.get(`/session/secciones/${seccionB.seccionId}`);
    expect(seccionAjena.status(), 'TUTOR de A leyendo sección de B por UUID').toBe(404);
  });

  test('el Gateway ignora headers de tenant forjados por el cliente', async () => {
    const base = await Api.crear();
    const orgA = await crearOrganizacion(base, 'A-spoof');
    const orgB = await crearOrganizacion(base, 'B-spoof');

    // A manda su token válido PERO forja los headers de tenant apuntando a B
    // (incluido el secreto interno). El Gateway los borra y reinyecta desde el
    // JWT — el resultado sigue siendo el mundo de A.
    const forjados: Record<string, string> = {
      'x-organizacion-id': orgB.organizacionId,
      'x-grupo-ids': orgB.grupoId,
      'x-rol': 'ORG_ADMIN',
      'x-principal-id': orgB.tutorId,
      'x-principal-type': 'TUTOR',
      'x-internal-secret': 'secreto-interno-dev-cambiar-en-prod',
    };

    const res: APIResponse = await orgA.api.get('/identity/grupos', forjados);
    expect(res.ok()).toBeTruthy();
    const grupos = (await res.json()) as { id: string }[];

    expect(grupos.map((g) => g.id), 'solo el grupo de A pese a los headers forjados').toContain(
      orgA.grupoId
    );
    expect(grupos.map((g) => g.id)).not.toContain(orgB.grupoId);
  });
});
