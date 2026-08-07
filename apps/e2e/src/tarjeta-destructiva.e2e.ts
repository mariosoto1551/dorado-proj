import { expect, type Page, test } from '@playwright/test';

import { Api } from './support/api';
import { consultar } from './support/db';
import { crearOrganizacion, crearUmbrales, type Organizacion } from './support/escenario';
import { APP_URL, entrarComoTutor } from './support/navegador';
import { StubProveedor } from './support/stub-proveedor';

/**
 * Fase 14 · Ítem 31, tanda 9 — la tarjeta de una propuesta destructiva.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE NAVEGADOR, Y ES EL ÚNICO LUGAR DONDE ESTO SE PUEDE VERIFICAR:
 *
 * la decisión 2 del ítem dice que **una propuesta con una sola operación
 * destructiva se trata entera como destructiva**: encabezado rojo, sin «Aplicar
 * todo», confirmación fila por fila. Eso no es un estado que la API pueda
 * contestar —el DTO es idéntico— sino una decisión de render, y el criterio de
 * aceptación 5 pide explícitamente verificarla acá y «no solo a ojo».
 *
 * Lo que se cuida es una propiedad de seguridad, no una estética: **no existe
 * camino de un clic que borre algo**. El botón que en el resto de las tarjetas
 * significa «esto está bien, dale» acá tendría que significar «borrá las
 * cinco», y por eso no está.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Gated por `E2E_UI=1`: necesita `app-web` servido en :4200.
 */
const PUERTO_STUB = Number(process.env['E2E_STUB_IA_PORT'] ?? '4999');

/** Actividad mínima válida contra el contrato de activity. */
function actividad(nombre: string, valorPuntos: number): Record<string, unknown> {
  return { nombre, tipoPuntaje: 'OPCIONAL', valorPuntos, tipoLimiteTiempo: 'SIN_LIMITE' };
}

test.describe('fase-14-31 T9 — la tarjeta destructiva en el navegador', () => {
  test.skip(process.env['E2E_UI'] !== '1', 'Necesita app-web servido (E2E_UI=1)');

  const stub = new StubProveedor();

  let page: Page;
  let org: Organizacion;
  let sobra: string;
  let tampoco: string;

  test.beforeAll(async ({ browser }) => {
    await stub.iniciar(PUERTO_STUB);

    const base = await Api.crear();

    org = await crearOrganizacion(base, 'destructiva');
    await crearUmbrales(org);
    await consultar(
      'billing_db',
      `update "Suscripcion" set "planId" = (select id from "Plan" where codigo = 'PRO')
       where "organizacionId" = $1`,
      [org.organizacionId]
    );
    await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });

    const primera = await org.api.postOk<{ id: string }>(
      `/activity/grupos/${org.grupoId}/actividades`,
      actividad('La que sobra', 3)
    );
    const segunda = await org.api.postOk<{ id: string }>(
      `/activity/grupos/${org.grupoId}/actividades`,
      actividad('La que tampoco', 4)
    );

    sobra = primera.id;
    tampoco = segunda.id;

    // Un solo login para toda la suite: `/auth/login` limita a 10/min y cada
    // `goto` cuesta varias llamadas (mismo criterio que las otras suites de UI).
    page = await browser.newPage();
    await entrarComoTutor(page, org);
  });

  test.afterAll(async () => {
    await page.close();
    await stub.detener();
  });

  test('una propuesta de archivado no tiene «Aplicar todo» y no aplica nada hasta que se tilde una fila', async () => {
    test.slow();

    stub.olvidarPedidos();
    stub.guionar(
      {
        llamadas: [
          {
            nombre: 'proponer_archivar',
            argumentos: {
              items: [
                { tipo: 'ACTIVIDAD', id: sobra },
                { tipo: 'ACTIVIDAD', id: tampoco },
              ],
              resumen: 'Hace dos meses que no las hace nadie.',
            },
          },
        ],
      },
      { texto: 'Te propuse archivar dos.' }
    );

    await page.goto(`${APP_URL}/grupos/${org.grupoId}/asistente`);
    await page.getByPlaceholder('Escribí acá…').fill('sacá lo que no usa nadie');
    await page.getByRole('button', { name: 'Enviar' }).click();

    // El cartel de la decisión 2: dice cuántas borran y qué hay que hacer.
    await expect(page.getByText('Tildá una por una')).toBeVisible({ timeout: 30_000 });

    // Criterio 5, primera mitad: el botón de un clic NO EXISTE. `toHaveCount(0)`
    // y no `not.toBeVisible()`: un botón oculto que un cambio de CSS revele
    // seguiría siendo un camino de un clic.
    await expect(page.getByRole('button', { name: 'Aplicar todo' })).toHaveCount(0);

    // Criterio 5, segunda mitad: arranca sin nada tildado —el default se
    // invierte— así que el único botón que aplica está deshabilitado.
    const aplicarSeleccionadas = page.getByRole('button', { name: /^Aplicar \d+ seleccionada/ });

    await expect(aplicarSeleccionadas).toBeDisabled();
    await expect(aplicarSeleccionadas).toContainText('Aplicar 0 seleccionadas');

    // La fila dice qué se pierde Y qué no: casi todos los borrados del sistema
    // son soft, y un Tutor que cree que archivar borra los puntos no aprieta
    // nunca.
    await expect(page.getByText('los puntos que dio quedan').first()).toBeVisible();

    // Se tilda UNA sola.
    await page.getByRole('checkbox', { name: /La que sobra/ }).check();
    await expect(aplicarSeleccionadas).toBeEnabled();
    await expect(aplicarSeleccionadas).toContainText('Aplicar 1 seleccionada');

    await aplicarSeleccionadas.click();

    // Y todavía falta confirmar: el diálogo dice «Borrar», no «Aplicar».
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Borrar', exact: true }).click();

    await expect(page.getByText('✓ Listo').first()).toBeVisible({ timeout: 30_000 });

    // Lo que se tildó se archivó; lo que no, sigue vivo. Es la propiedad que la
    // tarjeta promete y la que haría inútil todo lo de arriba si no se
    // cumpliera.
    const activas = await org.api.getOk<Array<{ id: string }>>(
      `/activity/grupos/${org.grupoId}/actividades?estado=ACTIVA`
    );
    const ids = activas.map((fila) => fila.id);

    expect(ids).not.toContain(sobra);
    expect(ids, 'la fila sin tildar no se toca').toContain(tampoco);
  });

  test('una propuesta que solo crea SÍ tiene «Aplicar todo»: la fricción está donde está el daño', async () => {
    test.slow();

    // El contraste es lo que le da sentido al test de arriba: si «Aplicar todo»
    // no existiera en ninguna tarjeta, su ausencia no probaría nada.
    stub.olvidarPedidos();
    stub.guionar(
      {
        llamadas: [
          {
            nombre: 'proponer_crear_conductas',
            argumentos: {
              conductas: [{ nombre: 'Ayudar sin que se lo pidan', tipo: 'BUENA', valorPuntos: 5 }],
            },
          },
        ],
      },
      { texto: 'Te propuse una conducta.' }
    );

    await page.goto(`${APP_URL}/grupos/${org.grupoId}/asistente`);
    await page.getByPlaceholder('Escribí acá…').fill('proponeme una conducta buena');
    await page.getByRole('button', { name: 'Enviar' }).click();

    await expect(page.getByRole('button', { name: 'Aplicar todo' })).toBeVisible({
      timeout: 30_000,
    });
    // Y acá el default es el contrario: todo tildado, porque el caso dominante
    // es «esto está bien, dale».
    await expect(page.getByRole('button', { name: /^Aplicar 1 seleccionada/ })).toBeEnabled();
    await expect(page.getByText('Tildá una por una')).toHaveCount(0);
  });
});
