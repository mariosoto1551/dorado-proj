import { expect, test } from '@playwright/test';

import { Api } from './support/api';
import {
  Organizacion,
  configurarGrupoManual,
  crearOrganizacion,
  iniciarSeccion,
  invitarYCanjearUsuario,
  poll,
} from './support/escenario';

/**
 * Fase 14 · Ítem 20 — Las obligatorias también suman
 * (`fase-14-20-obligatorias-que-suman.md`).
 *
 * Este ítem se verifica con **números**, no con shapes: todo su valor está en
 * que el ledger de scoring termine con el total correcto después de cada paso.
 * Los unit tests comprueban que se publiquen los eventos; solo el stack real
 * comprueba que scoring los proyecte al puntaje que corresponde.
 *
 * Actividad del escenario: **+2 si la cumple, −10 si no** (el caso realista de
 * la spec: el castigo pesa más que el premio).
 */
const PREMIO = 2;

const CASTIGO = 10;

interface Escenario {
  org: Organizacion;
  usuario: { api: Api; usuarioId: string };
  seccionId: string;
  obligatoriaId: string;
}

async function montarEscenario(etiqueta: string, puntosPorCumplir: number): Promise<Escenario> {
  const base = await Api.crear();
  const org = await crearOrganizacion(base, etiqueta);

  await configurarGrupoManual(org);

  const obligatoria = await org.api.postOk<{ id: string; puntosPorCumplir: number }>(
    `/activity/grupos/${org.grupoId}/actividades`,
    {
      nombre: 'Tender la cama',
      tipoPuntaje: 'OBLIGATORIA',
      valorPuntos: CASTIGO,
      puntosPorCumplir,
      comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
      tipoLimiteTiempo: 'SIN_LIMITE',
    }
  );

  expect(obligatoria.puntosPorCumplir, 'el premio se guarda tal como se pidió').toBe(
    puntosPorCumplir
  );

  const usuario = await invitarYCanjearUsuario(base, org);
  const seccion = await iniciarSeccion(org);

  return {
    org,
    usuario,
    seccionId: seccion.seccionId,
    obligatoriaId: obligatoria.id,
  };
}

/** Espera a que el ledger proyecte el total esperado (el bus es asíncrono). */
async function esperarPuntaje(escenario: Escenario, esperado: number): Promise<void> {
  await poll(
    async () => {
      const puntaje = await escenario.org.api.getOk<{ puntajeTotal: number }>(
        `/scoring/usuarios/${escenario.usuario.usuarioId}/secciones/${escenario.seccionId}/puntaje`
      );

      expect(puntaje.puntajeTotal).toBe(esperado);
    },
    { descripcion: `ledger proyectado a ${esperado}` }
  );
}

test.describe('Fase 14 · Ítem 20 — las obligatorias también suman', () => {
  test('confirmar acredita el premio al instante; el tutor lo revierte y lo devuelve', async () => {
    test.slow();

    const escenario = await montarEscenario('OblSuma', PREMIO);

    // 1. Confirma: +2 en el ledger, sin esperar al cierre de la sesión.
    const confirmacion = await escenario.usuario.api.postOk<{
      id: string;
      valorPuntosSnapshot: number;
    }>(`/activity/actividades/${escenario.obligatoriaId}/completar`, {});

    expect(confirmacion.valorPuntosSnapshot).toBe(PREMIO);
    await esperarPuntaje(escenario, PREMIO);

    // 2. El tutor marca «no hizo» sobre esa confirmación. LA verificación del
    //    ítem: sin compensar la confirmación el neto daría −8 en vez de −10.
    await escenario.org.api.postOk(`/activity/actividades/${escenario.obligatoriaId}/no-hizo`, {
      usuarioId: escenario.usuario.usuarioId,
      motivo: 'La cama seguía sin tender',
    });

    await esperarPuntaje(escenario, -CASTIGO);

    // 3. El tutor se arrepiente: deshacer el «no hizo» devuelve el castigo.
    const marcas = await escenario.org.api.getOk<Array<{ registroId: string; tipo: string }>>(
      `/activity/grupos/${escenario.org.grupoId}/usuarios/${escenario.usuario.usuarioId}/marcas`
    );
    const noHizo = marcas.find((marca) => marca.tipo === 'NO_HIZO');

    expect(noHizo, 'el «no hizo» quedó como marca roja viva').toBeDefined();

    await escenario.org.api.postOk(
      `/activity/registros-actividad/${noHizo?.registroId}/revertir`,
      {}
    );

    // Vuelve a 0: se compensó el castigo. El premio NO vuelve solo — su
    // confirmación sigue dada de baja.
    await esperarPuntaje(escenario, 0);

    // 4. Y NO puede volver a confirmarla: el intento se quemó cuando el tutor
    //    marcó «no hizo», exactamente como una repetición quitada del ítem 12
    //    (`completar` cuenta las completadas incluyendo las eliminadas). El neto
    //    de toda la secuencia es 0, no +2: deshacer devuelve el castigo, no el
    //    premio. Queda anotado acá en vez de en un comentario suelto para que,
    //    si alguna vez se decide que revertir tiene que restaurar la
    //    confirmación, este test lo marque en rojo en lugar de cambiar en silencio.
    const reintento = await escenario.usuario.api.post(
      `/activity/actividades/${escenario.obligatoriaId}/completar`,
      {}
    );

    expect(reintento.status()).toBe(409);
    expect((await reintento.json()).code).toBe('LIMITE_REPETICIONES_ALCANZADO');
    await esperarPuntaje(escenario, 0);
  });

  test('con premio 0 el comportamiento es idéntico al de antes del ítem', async () => {
    test.slow();

    const escenario = await montarEscenario('OblSinPremio', 0);

    const confirmacion = await escenario.usuario.api.postOk<{ valorPuntosSnapshot: number }>(
      `/activity/actividades/${escenario.obligatoriaId}/completar`,
      {}
    );

    expect(confirmacion.valorPuntosSnapshot).toBe(0);
    // Sin evento no hay asiento: el puntaje ni se mueve. Es la garantía de
    // retro-compatibilidad de todo el ítem.
    await esperarPuntaje(escenario, 0);

    await escenario.org.api.postOk(`/activity/actividades/${escenario.obligatoriaId}/no-hizo`, {
      usuarioId: escenario.usuario.usuarioId,
    });

    // Solo el castigo, sin compensación de por medio.
    await esperarPuntaje(escenario, -CASTIGO);
  });

  test('el premio se apaga donde nadie podría cobrarlo', async () => {
    test.slow();

    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'OblApagado');

    await configurarGrupoManual(org);

    // Una OPCIONAL ya premia con valorPuntos.
    const opcional = await org.api.postOk<{ puntosPorCumplir: number }>(
      `/activity/grupos/${org.grupoId}/actividades`,
      {
        nombre: 'Leer 20 minutos',
        tipoPuntaje: 'OPCIONAL',
        valorPuntos: 10,
        puntosPorCumplir: 5,
        tipoLimiteTiempo: 'SIN_LIMITE',
      }
    );
    expect(opcional.puntosPorCumplir).toBe(0);

    // Sin confirmación no hay acción del integrante que registrar.
    const sinConfirmacion = await org.api.postOk<{ id: string; puntosPorCumplir: number }>(
      `/activity/grupos/${org.grupoId}/actividades`,
      {
        nombre: 'Tender la cama',
        tipoPuntaje: 'OBLIGATORIA',
        valorPuntos: 10,
        puntosPorCumplir: 5,
        comportamientoAlCierre: 'ASUME_HECHA',
        tipoLimiteTiempo: 'SIN_LIMITE',
      }
    );
    expect(sinConfirmacion.puntosPorCumplir).toBe(0);

    // Y un PATCH que saca la confirmación apaga el premio, aunque no lo mande.
    const conPremio = await org.api.postOk<{ id: string; puntosPorCumplir: number }>(
      `/activity/grupos/${org.grupoId}/actividades`,
      {
        nombre: 'Lavarse los dientes',
        tipoPuntaje: 'OBLIGATORIA',
        valorPuntos: 10,
        puntosPorCumplir: 3,
        comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
        tipoLimiteTiempo: 'SIN_LIMITE',
      }
    );
    expect(conPremio.puntosPorCumplir).toBe(3);

    const apagada = await org.api.patchOk<{ puntosPorCumplir: number }>(
      `/activity/actividades/${conPremio.id}`,
      { comportamientoAlCierre: 'ASUME_HECHA' }
    );
    expect(apagada.puntosPorCumplir).toBe(0);

    // Un premio negativo no existe.
    const resNegativo = await org.api.post(`/activity/grupos/${org.grupoId}/actividades`, {
      nombre: 'Inválida',
      tipoPuntaje: 'OBLIGATORIA',
      valorPuntos: 10,
      puntosPorCumplir: -1,
      comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
      tipoLimiteTiempo: 'SIN_LIMITE',
    });
    expect(resNegativo.status()).toBe(400);
  });
});
