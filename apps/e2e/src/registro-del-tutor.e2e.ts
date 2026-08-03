import { expect, type Page, test } from '@playwright/test';

import { Api } from './support/api';
import {
  configurarGrupoManual,
  crearOrganizacion,
  iniciarSeccion,
  invitarYCanjearUsuario,
  poll,
  type Organizacion,
} from './support/escenario';
import { APP_URL, entrarComoTutor } from './support/navegador';

/**
 * Fase 14 · Ítem 23, tanda 4 — Las dos pantallas más cargadas
 * (`fase-14-23-claridad-del-area-del-tutor.md`).
 *
 * Tercera suite de navegador del repo, por la misma razón que la de la T1: el
 * objeto de prueba **es la pantalla**. Que el Tutor pueda marcar «completó»
 * existía en la API desde el #8 —el endpoint acepta `usuarioId` y declara el rol
 * de Tutor— y **ninguna pantalla lo llamaba**; verificar eso desde la API no
 * prueba nada que no estuviera pasando ya antes de esta tanda.
 *
 * Gated por `E2E_UI=1` como `turnos-visibles.e2e.ts`: necesita `app-web` en
 * :4200, que no todas las corridas tienen.
 */
const OBLIGATORIA = 'Tender la cama';
const OPCIONAL = 'Leer 20 minutos';

interface Escenario {
  org: Organizacion;
  /** Los dos integrantes se llaman igual: se distinguen por id. */
  ana: string;
  luis: string;
}

/**
 * UN escenario para toda la suite, montado en `beforeAll` — con una
 * organización por test el Gateway devuelve 429 (100 req/min por IP) a mitad de
 * la corrida, y el navegador, a diferencia del cliente de la suite, no
 * reintenta. Mismo aprendizaje que dejó anotado la T1.
 */
async function montarEscenario(): Promise<Escenario> {
  const base = await Api.crear();
  const org = await crearOrganizacion(base, 'registro-tutor');

  await configurarGrupoManual(org);

  await org.api.postOk(`/activity/grupos/${org.grupoId}/actividades`, {
    nombre: OBLIGATORIA,
    tipoPuntaje: 'OBLIGATORIA',
    valorPuntos: 10,
    puntosPorCumplir: 2,
    comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
    tipoLimiteTiempo: 'SIN_LIMITE',
  });
  await org.api.postOk(`/activity/grupos/${org.grupoId}/actividades`, {
    nombre: OPCIONAL,
    tipoPuntaje: 'OPCIONAL',
    valorPuntos: 5,
    repeticionesMaximasSesion: 2,
    tipoLimiteTiempo: 'SIN_LIMITE',
  });

  const ana = await invitarYCanjearUsuario(base, org);
  const luis = await invitarYCanjearUsuario(base, org);
  await iniciarSeccion(org);

  return { org, ana: ana.usuarioId, luis: luis.usuarioId };
}

/** La fila de una actividad dentro de la lista del integrante elegido. */
function fila(page: Page, nombre: string) {
  return page.locator('li').filter({ hasText: nombre }).first();
}

/** Lo justo del `EventoHistorialDto` que mira esta suite (tipos inline, como el resto de e2e). */
interface EventoHistorial {
  tipo: string;
  itemNombre: string;
  usuarioId: string | null;
  registradoPorTipo: string;
  motivoTutor: string | null;
}

/**
 * Busca en lo que el servidor tiene registrado, que es lo único que decide si
 * «quedó». Lanza si todavía no está, para que `poll` reintente: el registro
 * viaja por HTTP y el historial se arma leyendo las tres tablas.
 */
async function buscarEnHistorial(
  escenario: Escenario,
  condicion: (evento: EventoHistorial) => boolean
): Promise<EventoHistorial> {
  const historial = await escenario.org.api.getOk<{ eventos: EventoHistorial[] }>(
    `/activity/grupos/${escenario.org.grupoId}/historial`
  );
  const hallado = historial.eventos.find(condicion);

  if (!hallado) {
    throw new Error('todavía no está en el historial');
  }

  return hallado;
}

test.describe('fase-14-23 T4 — el Tutor registra desde el panel', () => {
  test.skip(process.env['E2E_UI'] !== '1', 'Necesita app-web servido (E2E_UI=1)');

  let escenario: Escenario;
  /** Una sola pestaña y un solo login para toda la suite (ver nota de arriba). */
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    escenario = await montarEscenario();
    page = await browser.newPage();
    await entrarComoTutor(page, escenario.org);
    await page.goto(`${APP_URL}/grupos/${escenario.org.grupoId}/secciones/actual`);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('elige al integrante UNA vez y marca «hizo» con un clic', async () => {
    // Criterio 1: el usuario se elige una sola vez y vale para todo lo de abajo.
    await page.getByRole('button', { name: /Usuario de Prueba/ }).first().click();

    // Criterio 2: la lista que ve el Tutor es la del integrante, no el catálogo
    // crudo — las dos actividades están porque él las ve.
    await expect(fila(page, OBLIGATORIA)).toBeVisible();
    await expect(fila(page, OPCIONAL)).toBeVisible();

    await fila(page, OPCIONAL).getByRole('button', { name: /hizo/ }).click();

    // Criterio 3: queda registrado, y con el TUTOR como quien lo marcó. Es lo
    // que el backend ya auditaba y ninguna pantalla ejercía.
    const marca = await poll(
      async () => buscarEnHistorial(escenario, (e) => e.itemNombre === OPCIONAL),
      'el «hizo» del tutor llegó al historial'
    );

    expect(marca.registradoPorTipo).toBe('TUTOR');
    // Los dos integrantes se llaman igual, así que el botón elegido es «uno de
    // los dos»: lo que este criterio verifica es QUIÉN lo registró, no a quién.
    expect([escenario.ana, escenario.luis]).toContain(marca.usuarioId);
  });

  test('lo ya completado se corrige en la misma lista, sin formulario aparte', async () => {
    // Criterio 4: el contador vive en la fila y el «quitar» también. Antes esto
    // era un tercer formulario («Corregir completadas de un usuario»).
    await expect(fila(page, OPCIONAL)).toContainText('1 de 2');

    await fila(page, OPCIONAL).getByRole('button', { name: 'Quitar una' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Quitar una' }).click();

    await expect(fila(page, OPCIONAL)).not.toContainText('1 de 2');
  });

  test('el «no hizo» pide el motivo en la confirmación, no en un campo suelto', async () => {
    // Criterio 5: la regla del #12 no cambia; lo que cambia es dónde se escribe
    // el motivo — antes quedaba pegado de una marca a la siguiente.
    await fila(page, OBLIGATORIA).getByRole('button', { name: /no hizo/ }).click();

    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toBeVisible();
    await dialogo.locator('textarea').fill('Se levantó tarde');
    await dialogo.getByRole('button', { name: 'Marcar no hecha' }).click();

    const marca = await poll(
      async () =>
        buscarEnHistorial(
          escenario,
          (e) => e.itemNombre === OBLIGATORIA && e.tipo === 'ACTIVIDAD_NO_HIZO'
        ),
      'el «no hizo» del tutor llegó al historial'
    );

    // El motivo viajó desde la confirmación, que es donde ahora se escribe.
    expect(marca.motivoTutor).toBe('Se levantó tarde');

    // Y la fila queda bloqueada diciendo POR QUÉ: el intento se quemó (regla
    // del #12, sin cambios). Se afirma sobre el texto del bloqueo y no sobre
    // «no hizo» a secas, que también lo dice el botón y sería trivial.
    await expect(fila(page, OBLIGATORIA)).toContainText('Ya la marcaste');
  });

  test('el modal de actividades abre con tres campos y el resto plegado', async () => {
    await page.goto(`${APP_URL}/grupos/${escenario.org.grupoId}/actividades`);
    await page.getByRole('button', { name: /Nueva/ }).first().click();

    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toBeVisible();

    // Criterio 7: tres campos a la vista y tres secciones cerradas que igual
    // dicen su estado — plegado no es escondido.
    await expect(dialogo.locator('input[name="nombre"]')).toBeVisible();
    await expect(dialogo.locator('select[name="tipoPuntaje"]')).toBeVisible();
    await expect(dialogo.locator('input[name="valorPuntos"]')).toBeVisible();

    // Las tres son las de la implementación, no las de la tabla de la spec: el
    // «Límite de tiempo» terminó adentro de «Cuándo se puede hacer» —es una
    // pregunta sobre cuándo— y en su lugar quedó «Cómo se cumple». La
    // desviación está anotada en `docs/progreso/fase-14-post-mvp.md`.
    for (const seccion of ['Cómo se cumple', 'Cuándo se puede hacer', 'Quién la hace']) {
      await expect(
        dialogo.getByRole('button', { name: new RegExp(seccion) })
      ).toHaveAttribute('aria-expanded', 'false');
    }

    await expect(dialogo.getByRole('button', { name: /Quién la hace/ })).toContainText('todos');
  });

  test('una sección se abre sola si la actividad que se edita ya tiene algo puesto', async () => {
    // Criterio 8. La opcional del escenario tiene repeticiones ≠ 1, que es lo
    // que agrupa «Cuándo se puede hacer». Se recarga la pantalla en vez de
    // cancelar el modal del test anterior: así el caso no depende de en qué
    // estado lo haya dejado.
    await page.goto(`${APP_URL}/grupos/${escenario.org.grupoId}/actividades`);
    await page.locator('li').filter({ hasText: OPCIONAL }).first().getByLabel('Editar').click();

    await expect(
      page.getByRole('dialog').getByRole('button', { name: /Cuándo se puede hacer/ })
    ).toHaveAttribute('aria-expanded', 'true');
  });
});
