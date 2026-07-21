import { expect, test } from '@playwright/test';

import { Api } from './support/api';
import {
  Catalogo,
  ESCENARIO,
  Organizacion,
  SeccionAbierta,
  configurarGrupoManual,
  crearCatalogo,
  crearOrganizacion,
  crearUmbrales,
  iniciarSeccion,
  invitarYCanjearUsuario,
  poll,
} from './support/escenario';

/**
 * Fase 12 · Punto 1 — E2E del flujo completo multi-tenant en UNA corrida.
 *
 * Todo pasa por el Gateway (:3000). El puntaje/zona se verifican contra los
 * NÚMEROS CONOCIDOS de `ESCENARIO` (no "que dé algo"): total 27 → Verde.
 *
 * Es un único `test` con pasos ordenados (`test.step`) porque cada paso depende
 * del estado que dejó el anterior — es un flujo, no casos independientes.
 */
test.describe('Flujo completo multi-tenant', () => {
  test('registro → ciclo de sección → recompensa → notificaciones + auditoría', async () => {
    test.slow(); // el flujo cruza 9 servicios y espera consistencia del bus.

    const base = await Api.crear();
    let org: Organizacion;
    let catalogo: Catalogo;
    let recompensaVerdeId: string;
    let usuario: { api: Api; usuarioId: string; username: string };
    let seccion: SeccionAbierta;

    await test.step('1. Registro de Organización + Grupo', async () => {
      org = await crearOrganizacion(base, 'Piloto');
      expect(org.organizacionId).toBeTruthy();
      expect(org.grupoId).toBeTruthy();
    });

    await test.step('2. Configuración de Sesión/Sección (modo MANUAL)', async () => {
      await configurarGrupoManual(org);
      const config = await org.api.getOk<{ modo: string }>(
        `/session/grupos/${org.grupoId}/configuracion`
      );
      expect(config.modo).toBe('MANUAL');
    });

    await test.step('3. Actividades, Conductas, Umbrales, Recompensas', async () => {
      await crearUmbrales(org);
      catalogo = await crearCatalogo(org);

      const umbrales = await org.api.getOk<{ id: string; nombreZona: string }[]>(
        `/scoring/grupos/${org.grupoId}/umbrales`
      );
      const verde = umbrales.find((u) => u.nombreZona === ESCENARIO.zonaEsperada);
      if (!verde) {
        throw new Error('debe existir la zona Verde');
      }

      const recompensa = await org.api.postOk<{ id: string }>(
        `/rewards/grupos/${org.grupoId}/recompensas`,
        {
          umbralZonaId: verde.id,
          nombre: 'Elegir la película del viernes',
          descripcion: 'Recompensa de la zona Verde',
          permiteSeleccion: true,
          permiteAzar: false,
        }
      );
      recompensaVerdeId = recompensa.id;
    });

    await test.step('4. Invitación + canje como Usuario (sesión separada)', async () => {
      usuario = await invitarYCanjearUsuario(base, org);
      expect(usuario.usuarioId).toBeTruthy();

      // El usuario ve su propio perfil por el Gateway con su token.
      const perfil = await usuario.api.getOk<{ id: string; rol?: string }>('/identity/me');
      expect(perfil.id).toBe(usuario.usuarioId);
    });

    await test.step('5. Iniciar Sección + registrar actividades/conductas', async () => {
      seccion = await iniciarSeccion(org);

      // Los registros los hace el ORG_ADMIN apuntando al usuario (usuarioId en body).
      await org.api.postOk(`/activity/actividades/${catalogo.actividadOpcionalId}/completar`, {
        usuarioId: usuario.usuarioId,
      });
      await org.api.postOk(`/activity/actividades/${catalogo.actividadObligatoriaId}/no-hizo`, {
        usuarioId: usuario.usuarioId,
      });
      await org.api.postOk(`/activity/conductas/${catalogo.conductaBuenaId}/registrar`, {
        usuarioId: usuario.usuarioId,
      });
      await org.api.postOk(`/activity/conductas/${catalogo.conductaMalaId}/registrar`, {
        usuarioId: usuario.usuarioId,
      });
    });

    await test.step('6. Puntaje/zona EN VIVO coinciden con el cálculo manual (27 → Verde)', async () => {
      await poll(
        async () => {
          const puntaje = await org.api.getOk<{ puntajeTotal: number; zona: { nombreZona: string } | null }>(
            `/scoring/usuarios/${usuario.usuarioId}/secciones/${seccion.seccionId}/puntaje`
          );
          expect(puntaje.puntajeTotal).toBe(ESCENARIO.puntajeEsperado);
          expect(puntaje.zona?.nombreZona).toBe(ESCENARIO.zonaEsperada);
        },
        { descripcion: 'ledger proyectado a 27/Verde' }
      );
    });

    await test.step('7. Forzar evaluación → snapshot ResultadoSeccion final', async () => {
      await org.api.postOk(`/session/secciones/${seccion.seccionId}/forzar-evaluacion`, {});

      // Tras la evaluación final el puntaje se lee del snapshot (mismo 27/Verde).
      await poll(
        async () => {
          const puntajes = await org.api.getOk<{ usuarioId: string; puntajeTotal: number; zona: { nombreZona: string } | null }[]>(
            `/scoring/grupos/${org.grupoId}/secciones/${seccion.seccionId}/puntajes`
          );
          const mio = puntajes.find((p) => p.usuarioId === usuario.usuarioId);
          expect(mio?.puntajeTotal).toBe(ESCENARIO.puntajeEsperado);
          expect(mio?.zona?.nombreZona).toBe(ESCENARIO.zonaEsperada);
        },
        { descripcion: 'ResultadoSeccion escrito' }
      );
    });

    await test.step('7b. Selección de recompensa elegible (zona Verde)', async () => {
      // Los elegibles derivan del ZonaAlcanzada final que consumió rewards.
      await poll(
        async () => {
          const elegibles = await usuario.api.getOk<{ disponiblesSeleccion: { id: string }[] }>(
            `/rewards/usuarios/${usuario.usuarioId}/secciones/${seccion.seccionId}/elegibles`
          );
          expect(elegibles.disponiblesSeleccion.map((r) => r.id)).toContain(recompensaVerdeId);
        },
        { descripcion: 'recompensa Verde elegible' }
      );

      await usuario.api.postOk(
        `/rewards/usuarios/${usuario.usuarioId}/secciones/${seccion.seccionId}/seleccionar`,
        { recompensaId: recompensaVerdeId }
      );
    });

    await test.step('8. Cerrar Sección + marcar recompensa como entregada', async () => {
      await org.api.postOk(`/session/secciones/${seccion.seccionId}/cerrar`, {});

      const canjes = await org.api.getOk<{ id: string; recompensaId: string }[]>(
        `/rewards/grupos/${org.grupoId}/secciones/${seccion.seccionId}/canjes`
      );
      const canje = canjes.find((c) => c.recompensaId === recompensaVerdeId);
      if (!canje) {
        throw new Error('debe existir el canje seleccionado');
      }

      const entregado = await org.api.patchOk<{ estado?: string; entregadoEn?: string }>(
        `/rewards/canjes/${canje.id}/entregar`
      );
      expect(entregado).toBeTruthy();
    });

    await test.step('9. Notificaciones esperadas llegaron', async () => {
      // El Usuario recibe la notificación de zona alcanzada (evaluación final).
      await poll(
        async () => {
          const notifs = await usuario.api.getOk<{ items: { tipo: string }[] }>(
            '/notification/mis-notificaciones?porPagina=100'
          );
          const tipos = notifs.items.map((n) => n.tipo);
          expect(tipos).toContain('ZONA_ALCANZADA');
        },
        { descripcion: 'notificación ZONA_ALCANZADA del usuario' }
      );
    });

    await test.step('10. Auditoría registró las acciones del flujo', async () => {
      const auditoria = await org.api.getOk<{ items: { accion: string; entidadTipo: string }[]; total: number }>(
        `/audit/grupos/${org.grupoId}?porPagina=100`
      );
      expect(auditoria.total, 'el timeline de auditoría no puede estar vacío').toBeGreaterThan(0);
    });
  });

  /**
   * Smoke opcional de UI: registro desde public-site (:4321) y login en
   * app-web (:4200). Solo se DEFINE si E2E_UI=1 (así no exige tener los
   * browsers de Playwright instalados cuando corre la suite API-first). La
   * verificación de comportamiento ya la cubre el flujo de arriba (decisión de
   * orquestación, ver docs/progreso/fase-12).
   */
  if (process.env['E2E_UI'] === '1') {
    test('smoke UI: registro en public-site + login en app-web', async ({ page }) => {
      const siteUrl = process.env['E2E_SITE_URL'] ?? 'http://localhost:4321';
      const appUrl = process.env['E2E_APP_URL'] ?? 'http://localhost:4200';

      await page.goto(`${siteUrl}/registro`);
      await expect(page.locator('form')).toBeVisible();

      await page.goto(`${appUrl}/login`);
      await expect(page.locator('form')).toBeVisible();
    });
  }
});
