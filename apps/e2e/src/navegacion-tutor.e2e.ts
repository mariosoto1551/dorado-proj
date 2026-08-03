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
import { APP_URL, entrarComoTutor } from './support/navegador';

/**
 * Fase 14 · Ítem 23, tanda 3 — Navegación del área Tutor
 * (`fase-14-23-claridad-del-area-del-tutor.md`).
 *
 * De navegador, por el mismo motivo que la T1: lo que la tanda cambia es DÓNDE
 * está cada cosa. «El interruptor ya no está arriba del catálogo» y «Primeros
 * pasos aparece una sola vez» no son estados del sistema que la API pueda
 * responder — solo existen en la pantalla.
 *
 * Gated por `E2E_UI=1`: necesita `app-web` servido en :4200.
 */
test.describe('fase-14-23 T3 — navegación del área Tutor', () => {
  test.skip(process.env['E2E_UI'] !== '1', 'Necesita app-web servido (E2E_UI=1)');

  let org: Organizacion;
  /** Un escenario y un login para toda la suite: cada `goto` cuesta varias
   * llamadas y el Gateway corta en 100 req/min (mismo motivo que en la T1). */
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const base = await Api.crear();
    org = await crearOrganizacion(base, 'navegacion');

    await configurarGrupoManual(org);
    await crearUmbrales(org);
    await crearCatalogo(org);
    await invitarYCanjearUsuario(base, org);

    page = await browser.newPage();
    await entrarComoTutor(page, org);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('el hub reúne las seis cosas y la ruta vieja sigue funcionando', async () => {
    // La ruta de la config de sesión dejó de existir como pantalla: redirige.
    await page.goto(`${APP_URL}/grupos/${org.grupoId}/configuracion-sesion`);
    await expect(page).toHaveURL(new RegExp(`/grupos/${org.grupoId}/configuracion$`));

    const seccion = page.locator('app-configuracion-grupo');

    // Las seis, visibles sin entrar a ningún lado (criterio 1).
    await expect(seccion).toContainText('Cómo corre la semana');
    await expect(seccion).toContainText('Modo de recompensas');
    await expect(seccion).toContainText('Zonas');
    await expect(seccion).toContainText('Plan del día');
    await expect(seccion).toContainText('Contenido de los integrantes');
    await expect(seccion).toContainText('Roles');

    // Y el estado de las dos que son pantalla propia se lee acá.
    await expect(seccion).toContainText('4 zonas');
    await expect(seccion).toContainText('Sin roles');

    // Un interruptor se edita DESDE el hub y queda guardado (criterio 2).
    await page.getByRole('checkbox').first().check();
    await expect(page.getByText(/Plan del día activado/)).toBeVisible();

    await page.reload();
    await expect(page.getByRole('checkbox').first()).toBeChecked();
  });

  test('el catálogo ya no tiene configuración arriba, pero deja el rastro', async () => {
    await page.goto(`${APP_URL}/grupos/${org.grupoId}/actividades`);

    // Ya no está el bloque, sí la línea de estado que linkea al hub (criterio 4).
    await expect(page.getByRole('checkbox', { name: /Plan del día/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Ajustes/ })).toBeVisible();
    await expect(page.locator('app-actividades')).toContainText('Plan del día: activado');

    await page.getByRole('link', { name: /Ajustes/ }).click();
    await expect(page).toHaveURL(new RegExp('/configuracion$'));

    await page.goto(`${APP_URL}/grupos/${org.grupoId}/recompensas`);
    await expect(page.locator('app-recompensas')).toContainText('Modo: Premio directo');
    await expect(page.getByRole('link', { name: /Ajustes/ })).toBeVisible();
  });

  /**
   * Menú y home en UN caso: los dos necesitan la misma pantalla y **el home es
   * ahora la más cara del área** (siete llamadas, una por bloque). Con un test
   * por criterio, la cuarta carga se pasaba de las 100 req/min del Gateway, el
   * 429 le pegaba al refresh silencioso y la pestaña volvía al login — que es
   * exactamente el modo de falla que la T1 ya había documentado.
   */
  test('el menú tiene cuatro grupos, la guía está una sola vez y el home ofrece UNA acción', async () => {
    await page.goto(`${APP_URL}/grupos/${org.grupoId}`);

    const nav = page.locator('nav').first();

    for (const titulo of ['Día a día', 'Catálogo', 'Gente', 'Ajustes']) {
      await expect(nav.getByText(titulo, { exact: true })).toBeVisible();
    }

    // Las mudanzas que hacen que cada grupo responda una sola pregunta.
    await expect(nav.getByRole('link', { name: 'Entregas' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Configuración del grupo' })).toBeVisible();

    // «Primeros pasos» estaba tres veces en esta misma pantalla (ítem del menú,
    // tarjeta del Resumen y píldora flotante), las tres al mismo destino.
    await expect(page.getByText('Primeros pasos')).toHaveCount(0);
    await expect(page.getByText('Terminá de configurar tu grupo')).toHaveCount(1);

    // Sin Sección activa, antes mostraba una tarjeta vacía con dos botones del
    // mismo peso; ahora dice qué falta y ofrece el siguiente paso (criterio 8).
    await expect(page.getByText('Todavía no arrancó ninguna semana')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Iniciar la primera semana' })).toBeVisible();

    // «Hoy» existe siempre; «te esperan» solo si hay pendientes (criterio 7).
    await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible();
    await expect(page.getByText(/te espera/)).toHaveCount(0);
  });
});
