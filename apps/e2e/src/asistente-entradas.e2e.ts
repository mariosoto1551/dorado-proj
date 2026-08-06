import { expect, type Page, test } from '@playwright/test';

import { Api } from './support/api';
import { consultar } from './support/db';
import {
  crearOrganizacion,
  crearUmbrales,
  invitarYCanjearUsuario,
  type Organizacion,
} from './support/escenario';
import { APP_URL, entrarComoTutor } from './support/navegador';
import { StubProveedor } from './support/stub-proveedor';

/**
 * Fase 14 · Ítem 30, tanda 9 — las entradas de contexto al asistente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE NAVEGADOR, Y NO POR GUSTO:
 *
 * lo que se verifica acá **solo existe en la pantalla**. Que el atajo no
 * aparezca cuando el asistente no se puede usar no es un estado que la API
 * pueda contestar —eso ya está probado del lado de la API— sino una decisión de
 * render. Y que la pregunta llegue armada del otro lado es un cable entre dos
 * pantallas, exactamente la clase de cosa que este ítem viene encontrando rota:
 * los dos defectos del #29 eran cables, y ninguno se detectó con un test rojo.
 *
 * Cubre el criterio de aceptación 14 por su lado práctico: con el asistente
 * fuera de servicio —plan sin la feature, switch apagado o `ai-service` caído,
 * que para `app-web` son el mismo estado, porque `cargarConfiguracion()` ante un
 * fallo deja el cache como estaba— las pantallas se dibujan enteras y sin atajo.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Gated por `E2E_UI=1`: necesita `app-web` servido en :4200.
 */
const PUERTO_STUB = Number(process.env['E2E_STUB_IA_PORT'] ?? '4999');

/** Las pantallas con entrada propia. La cuarta, Tienda, es una pestaña de Recompensas. */
const PANTALLAS = [
  { ruta: 'conductas', titulo: 'Conductas' },
  { ruta: 'recompensas', titulo: 'Recompensas' },
  { ruta: 'umbrales', titulo: 'Zonas' },
];

test.describe('fase-14-30 T9 — las entradas de contexto al asistente', () => {
  test.skip(process.env['E2E_UI'] !== '1', 'Necesita app-web servido (E2E_UI=1)');

  const stub = new StubProveedor();

  let base: Api;
  /** Un solo login para toda la suite: cada `goto` cuesta varias llamadas y el
   * Gateway corta en 100 req/min (mismo motivo que las otras suites de UI). */
  let page: Page;
  let org: Organizacion;

  test.beforeAll(async ({ browser }) => {
    await stub.iniciar(PUERTO_STUB);

    base = await Api.crear();
    org = await crearOrganizacion(base, 'entradas');

    await crearUmbrales(org);
    await invitarYCanjearUsuario(base, org);

    page = await browser.newPage();
    await entrarComoTutor(page, org);
  });

  test.afterAll(async () => {
    await page.close();
    await stub.detener();
  });

  test('sin el asistente usable, las pantallas se dibujan enteras y sin atajo', async () => {
    // La organización nace FREE: `puedeUsarse` es false. Es el mismo estado en
    // el que queda `app-web` con `ai-service` caído (criterio 14) — y la
    // pantalla tiene que quedar igual que antes de que el ítem existiera.
    for (const pantalla of PANTALLAS) {
      await page.goto(`${APP_URL}/grupos/${org.grupoId}/${pantalla.ruta}`);

      await expect(page.getByRole('heading', { name: pantalla.titulo })).toBeVisible();
      await expect(page.getByText('Pedirle ayuda a la IA'), pantalla.ruta).toHaveCount(0);
      await expect(page.getByText('Preguntale a la IA'), pantalla.ruta).toHaveCount(0);
    }
  });

  test('con el asistente prendido, cada pantalla ofrece la entrada que le toca', async () => {
    test.slow();

    await consultar(
      'billing_db',
      `update "Suscripcion" set "planId" = (select id from "Plan" where codigo = 'PRO')
       where "organizacionId" = $1`,
      [org.organizacionId]
    );
    await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });

    // El estado del asistente se lee UNA vez por sesión (es de la organización,
    // no del grupo), así que hay que recargar para que el cache lo tome. La
    // sesión sobrevive: el refresh silencioso del arranque la reconstruye.
    await page.reload();

    // Conductas y el catálogo de Recompensas están vacíos ⇒ la tarjeta, que ahí
    // ES la acción principal de la pantalla.
    for (const ruta of ['conductas', 'recompensas']) {
      await page.goto(`${APP_URL}/grupos/${org.grupoId}/${ruta}`);
      await expect(page.getByText('Pedirle ayuda a la IA'), ruta).toBeVisible();
    }

    // Zonas ya tiene las cuatro del escenario ⇒ la variante de revisión, que es
    // la única del ítem que le pide al asistente mirar en vez de crear.
    await page.goto(`${APP_URL}/grupos/${org.grupoId}/umbrales`);
    await expect(page.getByText('¿La escala está bien para este grupo?')).toBeVisible();

    // La cuarta: la Tienda, que solo existe en modo TIENDA.
    await org.api.putOk(`/rewards/grupos/${org.grupoId}/configuracion`, {
      modo: 'TIENDA',
      aplicarAhora: true,
    });
    await page.goto(`${APP_URL}/grupos/${org.grupoId}/recompensas`);
    await page.getByRole('tab', { name: 'Tienda' }).click();
    await expect(page.getByText('Pedirle ayuda a la IA')).toBeVisible();
  });

  test('el atajo llega al asistente con la pregunta ya escrita y mandada', async () => {
    test.slow();

    // El cable de la tanda 8: la pregunta viaja como query param y la pantalla
    // del asistente la manda sola. Si el Tutor tuviera que apretar Enter sobre
    // un texto que él no escribió, el atajo no ahorraría nada.
    stub.olvidarPedidos();
    stub.guionar({ texto: 'Miré las zonas y te propongo esto.' });

    await page.goto(`${APP_URL}/grupos/${org.grupoId}/umbrales`);
    await page.getByText('¿La escala está bien para este grupo?').click();

    await expect(page).toHaveURL(new RegExp(`/grupos/${org.grupoId}/asistente`));

    // La burbuja del Tutor con la pregunta armada, sin que nadie tipeara nada…
    await expect(page.getByText('escala de zonas está bien calibrada')).toBeVisible();
    // …y la respuesta del modelo, o sea que el turno salió de verdad.
    await expect(page.getByText('Miré las zonas y te propongo esto.')).toBeVisible({
      timeout: 30_000,
    });

    expect(stub.llamadas, 'el atajo tiene que haber disparado el turno solo').toBeGreaterThan(0);
  });
});
