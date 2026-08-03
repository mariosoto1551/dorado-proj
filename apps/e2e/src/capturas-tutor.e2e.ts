import { expect, test } from '@playwright/test';

import { Api } from './support/api';
import {
  configurarGrupoManual,
  crearCatalogo,
  crearOrganizacion,
  crearUmbrales,
  iniciarSeccion,
  invitarYCanjearUsuario,
  poll,
} from './support/escenario';
import { APP_URL, entrarComoTutor } from './support/navegador';

/**
 * Paseo visual del área Tutor — herramienta de trabajo, NO un criterio.
 *
 * Recorre las 16 pantallas del Tutor con un grupo cargado y deja una captura de
 * cada una en `capturas/`. No afirma nada: existe para poder MIRAR el área
 * completa de una sentada, que es lo que el ítem 23 necesita para decidir sobre
 * navegación y sobrecarga (tandas 3 y 4) y para revisar cómo quedó la T2.
 *
 * Gated por `E2E_CAPTURAS=1` para que no corra en la suite normal: tarda, no
 * verifica nada y deja archivos.
 */

/** Cada pantalla del área Tutor, en el orden en que las lista el menú. */
const PANTALLAS: { archivo: string; sufijoRuta: string; espera?: string }[] = [
  { archivo: '01-resumen', sufijoRuta: '' },
  { archivo: '02-semana-actual', sufijoRuta: '/secciones/actual' },
  { archivo: '03-guia', sufijoRuta: '/guia' },
  { archivo: '04-zonas', sufijoRuta: '/umbrales' },
  { archivo: '05-actividades', sufijoRuta: '/actividades' },
  { archivo: '06-conductas', sufijoRuta: '/conductas' },
  { archivo: '07-recompensas', sufijoRuta: '/recompensas' },
  { archivo: '08-entregas', sufijoRuta: '/entregas' },
  { archivo: '09-configuracion', sufijoRuta: '/configuracion' },
  { archivo: '10-usuarios', sufijoRuta: '/usuarios' },
  { archivo: '11-equipos', sufijoRuta: '/equipos' },
  { archivo: '12-roles', sufijoRuta: '/roles' },
  { archivo: '13-reportes', sufijoRuta: '/reportes' },
  { archivo: '14-tutores', sufijoRuta: '/tutores' },
  { archivo: '15-invitaciones', sufijoRuta: '/invitaciones' },
];

test.describe('Paseo visual del área Tutor', () => {
  test.skip(process.env['E2E_CAPTURAS'] !== '1', 'Herramienta: correr con E2E_CAPTURAS=1');

  test('captura las 16 pantallas con un grupo cargado', async ({ browser }) => {
    test.setTimeout(420_000);

    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'capturas');

    await configurarGrupoManual(org);
    await crearUmbrales(org);
    const catalogo = await crearCatalogo(org);
    const ana = await invitarYCanjearUsuario(base, org);
    await invitarYCanjearUsuario(base, org);

    // Con Sección abierta y algo registrado: las pantallas operativas vacías no
    // sirven para juzgar si están sobrecargadas (T4).
    const { seccionId } = await iniciarSeccion(org);
    await org.api.postOk(`/activity/actividades/${catalogo.actividadOpcionalId}/completar`, {
      usuarioId: ana.usuarioId,
    });
    await org.api.postOk(`/activity/conductas/${catalogo.conductaBuenaId}/registrar`, {
      usuarioId: ana.usuarioId,
    });
    // El ledger de scoring se proyecta por el bus: sin esto el ranking sale en 0.
    await poll(async () => {
      const puntajes = await org.api.getOk<{ puntajeTotal: number }[]>(
        `/scoring/grupos/${org.grupoId}/secciones/${seccionId}/puntajes`
      );

      expect(puntajes.some((p) => p.puntajeTotal !== 0)).toBe(true);
    }, 'el ledger proyectó lo registrado');

    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    await entrarComoTutor(page, org);

    // Cada pantalla cuesta ~6 llamadas y el Gateway corta en 100 req/min por IP
    // (`LIMITE_GLOBAL`). Recorrer las 15 de un tirón se pasa: el 429 le pega al
    // refresh silencioso, la app rebota al login y las capturas siguientes salen
    // todas de la pantalla de login. Se pausa una ventana cada 6 pantallas.
    const PANTALLAS_POR_VENTANA = 6;
    let vistas = 0;

    for (const pantalla of PANTALLAS) {
      if (vistas > 0 && vistas % PANTALLAS_POR_VENTANA === 0) {
        await page.waitForTimeout(62_000);
      }

      vistas += 1;

      await page.goto(`${APP_URL}/grupos/${org.grupoId}${pantalla.sufijoRuta}`);

      // Recorrer 15 pantallas seguidas a veces cruza un refresh silencioso y la
      // app rebota al login: se vuelve a entrar y se repite esa pantalla, en vez
      // de guardar una captura de la pantalla de login.
      if (/\/login/.test(page.url())) {
        await entrarComoTutor(page, org);
        await page.goto(`${APP_URL}/grupos/${org.grupoId}${pantalla.sufijoRuta}`);
      }

      // El título de la pantalla es lo primero que existe cuando ya montó algo;
      // `networkidle` después espera a que terminen las llamadas de la pantalla.
      await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 20_000 });
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('Cargando…')).toHaveCount(0, { timeout: 20_000 });
      await page.screenshot({
        path: `capturas/${pantalla.archivo}.png`,
        fullPage: true,
      });
    }

    // Extra 1: el panel operativo CON un integrante elegido — sin eso no se ve
    // la lista, que es lo que la T4 rediseñó.
    await page.goto(`${APP_URL}/grupos/${org.grupoId}/secciones/actual`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /Usuario de Prueba/ }).first().click();
    await expect(page.getByRole('button', { name: /hizo/ }).first()).toBeVisible();
    await page.screenshot({ path: 'capturas/17-registrar-persona.png', fullPage: true });

    // Extra 2: el modal de actividades, que es la pantalla más cargada del área.
    await page.goto(`${APP_URL}/grupos/${org.grupoId}/actividades`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /Nueva/ }).first().click();
    // Sin esta espera la captura sale a mitad del `animate-fade-in`.
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'capturas/16-modal-actividad.png', fullPage: true });

    await page.close();
  });
});
