import { expect, type Page, test } from '@playwright/test';

import { Api } from './support/api';
import {
  configurarGrupoManual,
  crearOrganizacion,
  invitarYCanjearUsuario,
  type Organizacion,
} from './support/escenario';

/**
 * Fase 14 · Ítem 23, tanda 1 — Turnos visibles y guardado único
 * (`fase-14-23-claridad-del-area-del-tutor.md`).
 *
 * Es la primera suite **de navegador** del repo: el resto es API-first porque
 * verifica reglas de negocio, y ahí el navegador solo agrega fragilidad. Acá el
 * objeto de prueba **es la pantalla**. Los cuatro defectos que corrige la T1 son
 * invisibles desde la API —el backend siempre estuvo bien— y solo se manifiestan
 * en la secuencia de clics: cancelar y que igual quede guardado no es un estado
 * ilegal del sistema, es un formulario con dos dueños.
 *
 * Gated por `E2E_UI=1` como el smoke de `flujo-completo.e2e.ts`: necesita
 * `app-web` servido en :4200, que no todas las corridas tienen.
 */
const APP_URL = process.env['E2E_APP_URL'] ?? 'http://localhost:4200';

interface Escenario {
  org: Organizacion;
  /** Los dos integrantes se llaman igual («Usuario de Prueba»): se eligen por id. */
  usuarioIds: string[];
}

/**
 * UN escenario para toda la suite, montado en `beforeAll`. Con una organización
 * por test, el Gateway empezaba a devolver 429 (100 req/min por IP) a mitad de
 * la corrida y la lista del catálogo llegaba vacía al navegador: el cliente de
 * la suite absorbe el 429 reintentando, pero el navegador no. Cada test crea en
 * cambio **su propia actividad** —una request— para no pisarse entre sí.
 */
async function montarEscenario(): Promise<Escenario> {
  const base = await Api.crear();
  const org = await crearOrganizacion(base, 'turnos-visibles');

  await configurarGrupoManual(org);

  const primero = await invitarYCanjearUsuario(base, org);
  const segundo = await invitarYCanjearUsuario(base, org);

  return { org, usuarioIds: [primero.usuarioId, segundo.usuarioId] };
}

async function crearObligatoria(org: Organizacion, nombre: string): Promise<string> {
  const actividad = await org.api.postOk<{ id: string }>(
    `/activity/grupos/${org.grupoId}/actividades`,
    {
      nombre,
      tipoPuntaje: 'OBLIGATORIA',
      valorPuntos: 10,
      puntosPorCumplir: 2,
      comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
      tipoLimiteTiempo: 'SIN_LIMITE',
    }
  );

  return actividad.id;
}

/** Login por formulario: el access token vive en memoria, no hay atajo por storage. */
async function entrarComoTutor(page: Page, org: Organizacion): Promise<void> {
  await page.goto(`${APP_URL}/login`);
  await page.fill('#identificador', org.emailContacto);
  await page.fill('#password', org.password);
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/\/login/);
}

async function irAActividades(page: Page, org: Organizacion, nombre: string): Promise<void> {
  await page.goto(`${APP_URL}/grupos/${org.grupoId}/actividades`);
  await expect(tarjeta(page, nombre)).toBeVisible();
}

/** La tarjeta de la actividad en la lista del catálogo. */
function tarjeta(page: Page, nombre: string) {
  return page.locator('li').filter({ hasText: nombre }).first();
}

const CASILLA_TURNOS = 'Por turnos';

/**
 * La casilla «Por turnos» DEL MODAL. Se acota al `label` a propósito: desde que
 * el chip de la tarjeta dice también «Por turnos», un `getByText` suelto agarra
 * el chip de la lista —que queda detrás del overlay— y el click no llega nunca.
 */
function casillaTurnos(page: Page) {
  return page
    .locator('label')
    .filter({ hasText: CASILLA_TURNOS })
    .locator('input[type="checkbox"]');
}

/** Arma una secuencia con los integrantes indicados dentro del modal abierto. */
async function armarSecuencia(page: Page, usuarioIds: string[]): Promise<void> {
  await casillaTurnos(page).click();

  for (const usuarioId of usuarioIds) {
    await page.selectOption('select[name="agregarTurno"]', usuarioId);
    await page.getByRole('button', { name: /Agregar/ }).click();
  }
}

/**
 * Guarda y espera a que el modal se cierre. La espera es imprescindible, no
 * cosmética: el submit encadena PATCH de la actividad → PUT del turno, y el
 * modal recién se cierra cuando terminan los dos. Sin esto, consultar la API
 * en la línea siguiente la lee antes de que el turno haya viajado.
 */
async function guardarModal(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.locator('input[name="nombre"]')).toBeHidden();
}

/** Lo que el servidor tiene guardado, que es lo único que decide si «quedó». */
async function turnoGuardado(
  org: Organizacion,
  actividadId: string
): Promise<{ activo: boolean; posiciones: unknown[] } | null> {
  const res = await org.api.get(`/activity/actividades/${actividadId}/turno`);

  if (res.status() === 404) {
    return null;
  }

  return (await res.json()) as { activo: boolean; posiciones: unknown[] };
}

test.describe('fase-14-23 T1 — turnos visibles y guardado único', () => {
  test.skip(process.env['E2E_UI'] !== '1', 'Necesita app-web servido (E2E_UI=1)');

  let escenario: Escenario;
  /**
   * Una sola pestaña y un solo login para toda la suite. Con la `page` por test
   * que da el fixture, cinco logins más cinco cargas de pantalla pasaban las 100
   * req/min del Gateway y el último test recibía 429 en medio del guardado.
   */
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    escenario = await montarEscenario();
    page = await browser.newPage();
    await entrarComoTutor(page, escenario.org);
  });

  test.afterAll(async () => {
    await page.close();
  });

  /**
   * Los casos se agrupan por FLUJO y no uno por criterio, con una sola carga de
   * pantalla cada uno: cada `goto` de esta pantalla dispara seis llamadas, y con
   * un test por criterio la suite entera se comía las 100 req/min del Gateway.
   */
  test('la lista dice si la actividad rota y quién la tiene', async () => {
    const sinTurnos = 'Sin rotación';
    const conTurnos = 'Con rotación';
    await crearObligatoria(escenario.org, sinTurnos);
    const actividadId = await crearObligatoria(escenario.org, conTurnos);

    await irAActividades(page, escenario.org, conTurnos);

    // La ausencia del chip es la que dice «es de todos» (decisión 2).
    await expect(tarjeta(page, sinTurnos)).not.toContainText('🔁');

    await tarjeta(page, conTurnos).getByLabel('Editar').click();
    await armarSecuencia(page, escenario.usuarioIds);
    await guardarModal(page);

    // Un solo botón guardó la actividad Y los turnos.
    const guardado = await turnoGuardado(escenario.org, actividadId);
    expect(guardado?.activo).toBe(true);
    expect(guardado?.posiciones).toHaveLength(2);

    // Sin Sesión abierta no hay turno sellado: el chip anuncia la rotación
    // pero no arriesga un nombre (decisión 3).
    await expect(tarjeta(page, conTurnos)).toContainText('Por turnos');
    await expect(tarjeta(page, sinTurnos)).not.toContainText('🔁');
  });

  test('Cancelar descarta de verdad: ni guarda turnos nuevos ni apaga los que había', async () => {
    const nuevo = 'Cancelar lo nuevo';
    const existente = 'Cancelar el apagado';
    const idNuevo = await crearObligatoria(escenario.org, nuevo);
    const idExistente = await crearObligatoria(escenario.org, existente);

    await irAActividades(page, escenario.org, nuevo);

    // 1. Armar una secuencia y cancelar no debe dejar nada en el servidor.
    //    Antes el bloque tenía botón propio y ya había persistido.
    await tarjeta(page, nuevo).getByLabel('Editar').click();
    await armarSecuencia(page, escenario.usuarioIds);
    await page.getByRole('button', { name: 'Cancelar' }).click();

    expect(await turnoGuardado(escenario.org, idNuevo)).toBeNull();
    await expect(tarjeta(page, nuevo)).not.toContainText('🔁');

    // 2. Y destildar «Por turnos» y cancelar no debe apagar la rotación. Antes
    //    el DELETE salía en el mismo `change` del checkbox, sin vuelta atrás.
    await tarjeta(page, existente).getByLabel('Editar').click();
    await armarSecuencia(page, escenario.usuarioIds);
    await guardarModal(page);
    await expect(tarjeta(page, existente)).toContainText('Por turnos');

    await tarjeta(page, existente).getByLabel('Editar').click();
    await casillaTurnos(page).click();
    await page.getByRole('button', { name: 'Cancelar' }).click();

    expect((await turnoGuardado(escenario.org, idExistente))?.activo).toBe(true);
    await expect(tarjeta(page, existente)).toContainText('Por turnos');
  });

  test('el armador de turnos existe al CREAR, no solo al editar', async () => {
    await page.getByRole('button', { name: 'Nueva' }).click();
    await page.fill('input[name="nombre"]', 'Regar las plantas');
    // El bloque solo existe en una obligatoria individual.
    await page.selectOption('select[name="tipoPuntaje"]', { label: 'Obligatoria' });

    await expect(casillaTurnos(page)).toBeVisible();
  });
});
