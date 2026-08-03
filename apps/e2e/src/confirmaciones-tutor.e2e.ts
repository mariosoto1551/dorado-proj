import { expect, type Page, test } from '@playwright/test';

import { Api } from './support/api';
import {
  configurarGrupoManual,
  crearOrganizacion,
  crearUmbrales,
  iniciarSeccion,
  invitarYCanjearUsuario,
  type Organizacion,
} from './support/escenario';
import { APP_URL, entrarComoTutor } from './support/navegador';

/**
 * Fase 14 · Ítem 23, tanda 4 (segunda vuelta) — Historial, Equipos y Recompensas
 * (`fase-14-23-claridad-del-area-del-tutor.md`).
 *
 * De navegador porque lo que la vuelta cambia **solo existe en la pantalla**:
 * que una acción pregunte antes de ejecutarse no es un estado del sistema que
 * la API pueda responder —el endpoint es el mismo y hace lo mismo—, y «esto
 * aparece una sola vez» tampoco.
 *
 * Gated por `E2E_UI=1`, como las otras tres suites de navegador.
 */
const TAREA_EQUIPO = 'Limpiar el patio';

interface Escenario {
  org: Organizacion;
  equipoId: string;
  /** El jefe, único que puede completar la tarea del equipo. */
  jefeId: string;
}

/** UN escenario y UN login para toda la suite: el Gateway corta en 100 req/min. */
async function montarEscenario(): Promise<Escenario> {
  const base = await Api.crear();
  const org = await crearOrganizacion(base, 'confirmaciones');

  await configurarGrupoManual(org);
  await crearUmbrales(org);

  const tarea = await org.api.postOk<{ id: string }>(
    `/activity/grupos/${org.grupoId}/actividades`,
    {
      nombre: TAREA_EQUIPO,
      tipoPuntaje: 'OPCIONAL',
      alcance: 'EQUIPO',
      valorPuntos: 8,
      bonoJefePuntos: 3,
      tipoLimiteTiempo: 'SIN_LIMITE',
    }
  );

  const jefe = await invitarYCanjearUsuario(base, org);
  const companero = await invitarYCanjearUsuario(base, org);
  const equipo = await org.api.postOk<{ id: string }>(
    `/identity/grupos/${org.grupoId}/equipos`,
    {
      nombre: 'Equipo Fénix',
      jefeUsuarioId: jefe.usuarioId,
      miembrosIds: [companero.usuarioId],
    }
  );

  await iniciarSeccion(org);
  // La tarea del equipo la completa el jefe: es la única vía, y sin ella la
  // pantalla de Equipos no tiene nada que anular.
  await jefe.api.postOk(`/activity/equipos/${equipo.id}/tareas/${tarea.id}/completar`, {});

  return { org, equipoId: equipo.id, jefeId: jefe.usuarioId };
}

/** Lo que el servidor tiene registrado de la tarea del equipo. */
async function registrosDelEquipo(
  escenario: Escenario
): Promise<{ registros: { eliminado: boolean; motivoTutor: string | null }[] }[]> {
  return await escenario.org.api.getOk(
    `/activity/equipos/${escenario.equipoId}/tareas-de-hoy`
  );
}

function tarjetaDelEquipo(page: Page) {
  return page.locator('li').filter({ hasText: 'Equipo Fénix' }).first();
}

test.describe('fase-14-23 T4·2ª — se confirma lo que no tiene vuelta atrás', () => {
  test.skip(process.env['E2E_UI'] !== '1', 'Necesita app-web servido (E2E_UI=1)');

  let escenario: Escenario;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    escenario = await montarEscenario();
    page = await browser.newPage();
    await entrarComoTutor(page, escenario.org);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('anular una tarea de equipo pregunta antes, y el motivo se escribe ahí', async () => {
    await page.goto(`${APP_URL}/grupos/${escenario.org.grupoId}/equipos`);
    await tarjetaDelEquipo(page).getByRole('button', { name: 'Tareas de hoy' }).click();

    // Criterio 3: ya no hay un campo de motivo permanente en el bloque.
    await expect(
      tarjetaDelEquipo(page).locator('input[placeholder*="Motivo"]')
    ).toHaveCount(0);

    await tarjetaDelEquipo(page).getByRole('button', { name: 'Anular' }).click();

    // Criterio 1: pregunta, y dice qué se lleva puesto.
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toContainText('bono del jefe');
    await dialogo.locator('textarea').fill('No lo terminaron');
    await dialogo.getByRole('button', { name: 'Anular' }).click();

    await expect(tarjetaDelEquipo(page).getByRole('button', { name: 'Deshacer' })).toBeVisible();

    const tareas = await registrosDelEquipo(escenario);
    const anulado = tareas.flatMap((t) => t.registros).find((r) => r.eliminado);

    expect(anulado?.motivoTutor).toBe('No lo terminaron');
  });

  test('cancelar la confirmación no ejecuta nada', async () => {
    await tarjetaDelEquipo(page).getByRole('button', { name: 'Deshacer' }).click();
    await tarjetaDelEquipo(page).getByRole('button', { name: 'Anular' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();

    const tareas = await registrosDelEquipo(escenario);

    expect(tareas.flatMap((t) => t.registros).some((r) => r.eliminado)).toBe(false);
  });

  test('el equipo se edita en UN solo lugar, sin cerrar el modal', async () => {
    // Se recarga en vez de heredar el estado del caso anterior (que deja el
    // bloque de tareas desplegado): así el caso no depende de en qué quedó.
    await page.goto(`${APP_URL}/grupos/${escenario.org.grupoId}/equipos`);

    // Criterio 4: tres botones, y «Sustituir jefe» ya no existe como su propio
    // camino — hacer jefe es un botón en la fila de la persona.
    await expect(
      tarjetaDelEquipo(page).getByRole('button', { name: 'Sustituir jefe' })
    ).toHaveCount(0);

    await tarjetaDelEquipo(page).getByRole('button', { name: 'Quiénes están' }).click();
    // Por nombre y no por rol a secas: al abrir la confirmación hay DOS
    // `role="dialog"` en pantalla —el modal y el diálogo— y el locator suelto
    // se vuelve ambiguo.
    const modal = page.getByRole('dialog', { name: /Quiénes están/ });

    await modal.getByRole('button', { name: 'Hacer jefe' }).first().click();

    // El modal sigue abierto y la corona se movió: armar el equipo no obliga a
    // abrir dos veces, que era el punto de fusionar los dos modales.
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('★ Jefe');

    // Quitar sí pregunta: no hay forma de deshacerlo desde la pantalla.
    await modal.getByRole('button', { name: 'Quitar' }).first().click();
    await expect(page.getByText('Deja de ver las tareas del equipo')).toBeVisible();
  });

  test('archivar una bolsa avisa que no se puede deshacer, y las pestañas son accesibles', async () => {
    // La tienda es la que tiene bolsas y productos: el grupo arranca en DIRECTO
    // y se lo pasa con `aplicarAhora` para no esperar a la Sección siguiente.
    await escenario.org.api.putOk(
      `/rewards/grupos/${escenario.org.grupoId}/configuracion`,
      { modo: 'TIENDA', aplicarAhora: true }
    );
    // Una bolsa sin premios no existe: fallaría recién al comprar, así que el
    // backend la rechaza al crearla.
    const premio = await escenario.org.api.postOk<{ id: string }>(
      `/rewards/grupos/${escenario.org.grupoId}/recompensas`,
      { nombre: 'Elegir la película', tipo: 'PREMIO' }
    );
    await escenario.org.api.postOk(`/rewards/grupos/${escenario.org.grupoId}/bolsas`, {
      nombre: 'Bolsa de los viernes',
      recompensaIds: [premio.id],
    });

    await page.goto(`${APP_URL}/grupos/${escenario.org.grupoId}/recompensas`);

    // Criterio 6: las pestañas declaran `tablist` y `aria-selected` — antes eran
    // subrayadas y no declaraban nada.
    await expect(page.getByRole('tablist')).toBeVisible();
    await page.getByRole('tab', { name: 'Bolsas' }).click();
    await expect(page.getByRole('tab', { name: 'Bolsas' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    // Criterio 1: el tacho preguntaba nada y archivaba para siempre.
    await page.getByRole('button', { name: 'Archivar' }).first().click();
    await expect(page.getByText('No se puede desarchivar')).toBeVisible();

    // Y cancelar no archiva. Se espera a que el diálogo se vaya antes de mirar
    // la lista: mientras está abierto, su mensaje también contiene el nombre.
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByText('No se puede desarchivar')).toHaveCount(0);
    await expect(page.getByText('Bolsa de los viernes', { exact: true })).toBeVisible();
  });

  test('borrar una nota interna pregunta antes', async () => {
    await page.goto(`${APP_URL}/grupos/${escenario.org.grupoId}/secciones/actual`);
    await page.getByRole('tab', { name: /Qué pasó hoy/ }).click();

    // Criterio 5: el segundo «Registrar conducta rápida» ya no está acá.
    await expect(page.getByText('Registrar conducta rápida')).toHaveCount(0);

    await page.getByRole('button', { name: /Notas/ }).first().click();
    const hoja = page.getByRole('dialog');
    await hoja.locator('textarea').fill('Lo hablamos en la cena');
    await hoja.getByRole('button', { name: /Agregar|Guardar/ }).first().click();

    await expect(hoja.getByRole('button', { name: 'Borrar' })).toBeVisible();
    await hoja.getByRole('button', { name: 'Borrar' }).click();

    // Criterio 1: la nota no tiene papelera, así que pregunta.
    await expect(page.getByText('no hay papelera')).toBeVisible();
  });

  test('anular una marca del historial NO pregunta: tiene «Deshacer» al lado', async () => {
    // Criterio 2, que es la mitad interesante de la decisión: la regla no es
    // «todo lo rojo pregunta» sino «lo que no tiene vuelta atrás pregunta».
    // Se recarga para no arrastrar la hoja de notas del caso anterior.
    await page.goto(`${APP_URL}/grupos/${escenario.org.grupoId}/secciones/actual`);
    await page.getByRole('tab', { name: /Qué pasó hoy/ }).click();

    await page.getByRole('button', { name: 'Anular' }).first().click();

    // Sin diálogo de por medio: la marca queda anulada y el «Deshacer» aparece.
    await expect(page.getByRole('button', { name: 'Deshacer' }).first()).toBeVisible();
  });
});
