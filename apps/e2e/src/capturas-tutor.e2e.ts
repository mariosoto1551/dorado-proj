import { expect, type Page, test } from '@playwright/test';

import { Api } from './support/api';
import {
  configurarGrupoManual,
  crearCatalogo,
  crearOrganizacion,
  crearUmbrales,
  invitarYCanjearUsuario,
  type Organizacion,
} from './support/escenario';

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
const APP_URL = process.env['E2E_APP_URL'] ?? 'http://localhost:4200';

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

/**
 * Login por formulario (el access token vive en memoria, no hay atajo por
 * storage). `/auth/login` tiene el límite ESTRICTO del Gateway —10 req/min por
 * IP— y el navegador no reintenta, así que un 429 deja la pestaña en /login y
 * las 16 capturas salen de la pantalla de login. Se reintenta esperando la
 * ventana, que es lo que pasa cuando se corre esta herramienta varias veces
 * seguidas mientras se la ajusta.
 */
async function entrarComoTutor(page: Page, org: Organizacion): Promise<void> {
  for (let intento = 1; ; intento += 1) {
    await page.goto(`${APP_URL}/login`);
    await page.fill('#identificador', org.emailContacto);
    await page.fill('#password', org.password);
    await page.click('button[type="submit"]');

    try {
      await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
      return;
    } catch (error) {
      if (intento >= 3) {
        throw error;
      }

      await page.waitForTimeout(62_000);
    }
  }
}

test.describe('Paseo visual del área Tutor', () => {
  test.skip(process.env['E2E_CAPTURAS'] !== '1', 'Herramienta: correr con E2E_CAPTURAS=1');

  test('captura las 16 pantallas con un grupo cargado', async ({ browser }) => {
    test.setTimeout(420_000);

    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'capturas');

    await configurarGrupoManual(org);
    await crearUmbrales(org);
    await crearCatalogo(org);
    await invitarYCanjearUsuario(base, org);
    await invitarYCanjearUsuario(base, org);

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

    // La 16: el modal de actividades, que es la pantalla más cargada del área.
    await page.goto(`${APP_URL}/grupos/${org.grupoId}/actividades`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /Nueva/ }).first().click();
    await page.screenshot({ path: 'capturas/16-modal-actividad.png', fullPage: true });

    await page.close();
  });
});
