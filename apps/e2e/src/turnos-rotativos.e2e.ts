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
 * Fase 14 · Ítem 21 — Turnos rotativos (`fase-14-21-turnos-rotativos.md`).
 *
 * Lo que solo el stack real puede verificar:
 *
 * 1. Que el turno se **selle consumiendo `SesionAbierta`**. Los unit tests
 *    llaman al service directo; acá el evento tiene que viajar por RabbitMQ y
 *    volver, que es como funciona en producción.
 * 2. Que la secuencia `[José, Luciana, José, Alejandra]` reparta **2 de cada 4
 *    turnos a José**. Es el criterio del ítem y se comprueba día por día.
 * 3. Que el castigo del cierre alcance **solo al del turno**, contra el ledger.
 */
const CASTIGO = 10;

interface Escenario {
  org: Organizacion;
  jose: { api: Api; usuarioId: string };
  luciana: { api: Api; usuarioId: string };
  alejandra: { api: Api; usuarioId: string };
  actividadId: string;
  seccionId: string;
  sesionId: string;
}

/**
 * `sesionesPorSeccion` alto para poder recorrer varios días dentro de la misma
 * Sección: con el default de 1, forzar el cierre manda la Sección a EVALUACION
 * y no hay "día siguiente" que observar.
 */
async function montarEscenario(etiqueta: string, sesionesPorSeccion = 1): Promise<Escenario> {
  const base = await Api.crear();
  const org = await crearOrganizacion(base, etiqueta);

  if (sesionesPorSeccion === 1) {
    await configurarGrupoManual(org);
  } else {
    await org.api.putOk(`/session/grupos/${org.grupoId}/configuracion`, {
      modo: 'MANUAL',
      sesionesPorSeccion,
      evaluarUmbralesEn: 'SOLO_AL_CIERRE_SECCION',
    });
  }

  const actividad = await org.api.postOk<{ id: string }>(
    `/activity/grupos/${org.grupoId}/actividades`,
    {
      nombre: 'Sacar la basura',
      tipoPuntaje: 'OBLIGATORIA',
      valorPuntos: CASTIGO,
      puntosPorCumplir: 2,
      comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
      tipoLimiteTiempo: 'SIN_LIMITE',
    }
  );

  const jose = await invitarYCanjearUsuario(base, org);
  const luciana = await invitarYCanjearUsuario(base, org);
  const alejandra = await invitarYCanjearUsuario(base, org);

  // El patrón dinámico: José aparece DOS veces, así que le toca el doble.
  await org.api.putOk(`/activity/actividades/${actividad.id}/turno`, {
    modo: 'ORDEN_FIJO',
    frecuencia: 'SESION',
    posiciones: [
      { usuarioId: jose.usuarioId },
      { usuarioId: luciana.usuarioId },
      { usuarioId: jose.usuarioId },
      { usuarioId: alejandra.usuarioId },
    ],
  });

  const seccion = await iniciarSeccion(org);

  return {
    org,
    jose,
    luciana,
    alejandra,
    actividadId: actividad.id,
    seccionId: seccion.seccionId,
    sesionId: seccion.sesionId,
  };
}

/** A quién le toca hoy, según el panel del Tutor. El bus tarda unos ms. */
async function esperarTurnoDeHoy(escenario: Escenario, usuarioIdEsperado: string): Promise<void> {
  await poll(
    async () => {
      const turnos = await escenario.org.api.getOk<
        Array<{ actividadId: string; asignacion: { usuarioId: string } | null }>
      >(`/activity/grupos/${escenario.org.grupoId}/turnos-de-hoy`);

      const fila = turnos.find((turno) => turno.actividadId === escenario.actividadId);

      expect(fila?.asignacion?.usuarioId).toBe(usuarioIdEsperado);
    },
    { descripcion: `turno sellado para ${usuarioIdEsperado}` }
  );
}

/**
 * Cierra la sesión abierta y abre la siguiente, devolviendo su id. En modo
 * MANUAL son dos pasos: `forzar-cierre` solo cierra (publica `SesionCerrada`),
 * y `abrir-siguiente` es el que publica el `SesionAbierta` que sella el turno.
 */
async function siguienteDia(escenario: Escenario, sesionId: string): Promise<string> {
  await escenario.org.api.postOk(
    `/session/secciones/${escenario.seccionId}/sesiones/${sesionId}/forzar-cierre`,
    {}
  );

  const nueva = await escenario.org.api.postOk<{ id: string }>(
    `/session/secciones/${escenario.seccionId}/sesiones/abrir-siguiente`,
    {}
  );

  return nueva.id;
}

test.describe('Fase 14 · Ítem 21 — turnos rotativos', () => {
  test('la secuencia se recorre literal: José, Luciana, José — 2 de cada 4 para José', async () => {
    test.slow();

    // EL criterio del ítem. Si el modelo fuera "un pozo que rota uno por uno",
    // el tercer día le tocaría a Alejandra y este test lo marcaría en rojo.
    const escenario = await montarEscenario('Turnos', 5);

    await esperarTurnoDeHoy(escenario, escenario.jose.usuarioId);

    const dia2 = await siguienteDia(escenario, escenario.sesionId);
    await esperarTurnoDeHoy(escenario, escenario.luciana.usuarioId);

    const dia3 = await siguienteDia(escenario, dia2);
    await esperarTurnoDeHoy(escenario, escenario.jose.usuarioId);

    await siguienteDia(escenario, dia3);
    await esperarTurnoDeHoy(escenario, escenario.alejandra.usuarioId);
  });

  test('quien no tiene el turno la ve sin poder confirmarla', async () => {
    test.slow();

    const escenario = await montarEscenario('TurnosVista');

    await esperarTurnoDeHoy(escenario, escenario.jose.usuarioId);

    // Luciana la VE (decisión 5: el reparto tiene que quedar a la vista)…
    const estadoLuciana = await escenario.luciana.api.getOk<{
      actividades: Array<{
        actividadId: string;
        turno: { usuarioIdAsignado: string; nombreAsignado: string; esMio: boolean } | null;
      }>;
    }>(`/activity/grupos/${escenario.org.grupoId}/mi-estado-hoy`);

    const suya = estadoLuciana.actividades.find(
      (item) => item.actividadId === escenario.actividadId
    );

    expect(suya, 'la actividad rotativa se ve igual').toBeDefined();
    expect(suya?.turno).toMatchObject({
      usuarioIdAsignado: escenario.jose.usuarioId,
      esMio: false,
    });
    expect(suya?.turno?.nombreAsignado, 'el nombre viene resuelto, no un uuid').toBeTruthy();

    // …pero no la puede confirmar.
    const intento = await escenario.luciana.api.post(
      `/activity/actividades/${escenario.actividadId}/completar`,
      {}
    );

    expect(intento.status()).toBe(403);
    expect((await intento.json()).code).toBe('NO_ES_TU_TURNO');

    // José sí, y cobra el premio del #20.
    const confirmacion = await escenario.jose.api.postOk<{ valorPuntosSnapshot: number }>(
      `/activity/actividades/${escenario.actividadId}/completar`,
      {}
    );

    expect(confirmacion.valorPuntosSnapshot).toBe(2);
  });

  test('el castigo al cerrar alcanza SOLO al del turno', async () => {
    test.slow();

    // Sin el filtro en el consumidor de cierre, Luciana y Alejandra terminan el
    // día en −10 por una tarea que su pantalla les mostró sin botón.
    const escenario = await montarEscenario('TurnosCierre');

    await esperarTurnoDeHoy(escenario, escenario.jose.usuarioId);

    // Nadie confirma nada y se cierra el día.
    await escenario.org.api.postOk(
      `/session/secciones/${escenario.seccionId}/sesiones/${escenario.sesionId}/forzar-cierre`,
      {}
    );

    const puntajeDe = async (usuarioId: string) => {
      const puntaje = await escenario.org.api.getOk<{ puntajeTotal: number }>(
        `/scoring/usuarios/${usuarioId}/secciones/${escenario.seccionId}/puntaje`
      );

      return puntaje.puntajeTotal;
    };

    await poll(
      async () => expect(await puntajeDe(escenario.jose.usuarioId)).toBe(-CASTIGO),
      { descripcion: 'castigo aplicado a José' }
    );

    expect(await puntajeDe(escenario.luciana.usuarioId)).toBe(0);
    expect(await puntajeDe(escenario.alejandra.usuarioId)).toBe(0);
  });

  test('el Tutor reasigna el turno del día y queda el rastro', async () => {
    test.slow();

    const escenario = await montarEscenario('TurnosReasignar');

    await esperarTurnoDeHoy(escenario, escenario.jose.usuarioId);

    const reasignada = await escenario.org.api.postOk<{
      usuarioId: string;
      usuarioOriginalId: string | null;
      motivoReasignacion: string | null;
    }>(`/activity/actividades/${escenario.actividadId}/turno/reasignar`, {
      usuarioId: escenario.alejandra.usuarioId,
      motivo: 'José está enfermo',
    });

    expect(reasignada.usuarioId).toBe(escenario.alejandra.usuarioId);
    expect(reasignada.usuarioOriginalId, 'queda quién tenía el turno').toBe(
      escenario.jose.usuarioId
    );
    expect(reasignada.motivoReasignacion).toBe('José está enfermo');

    // Y ahora la confirma la reasignada, no José.
    const intentoJose = await escenario.jose.api.post(
      `/activity/actividades/${escenario.actividadId}/completar`,
      {}
    );

    expect(intentoJose.status()).toBe(403);

    await escenario.alejandra.api.postOk(
      `/activity/actividades/${escenario.actividadId}/completar`,
      {}
    );
  });

  test('la configuración se valida y se puede apagar', async () => {
    test.slow();

    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'TurnosConfig');

    await configurarGrupoManual(org);

    const usuario = await invitarYCanjearUsuario(base, org);

    // Una OPCIONAL no rota: sin castigo, la rotación no significa nada.
    const opcional = await org.api.postOk<{ id: string }>(
      `/activity/grupos/${org.grupoId}/actividades`,
      {
        nombre: 'Leer 20 minutos',
        tipoPuntaje: 'OPCIONAL',
        valorPuntos: 10,
        tipoLimiteTiempo: 'SIN_LIMITE',
      }
    );

    const resOpcional = await org.api.put(`/activity/actividades/${opcional.id}/turno`, {
      modo: 'ORDEN_FIJO',
      frecuencia: 'SESION',
      posiciones: [{ usuarioId: usuario.usuarioId }],
    });

    expect(resOpcional.status()).toBe(400);
    expect((await resOpcional.json()).code).toBe('TURNO_SOLO_OBLIGATORIA');

    const obligatoria = await org.api.postOk<{ id: string }>(
      `/activity/grupos/${org.grupoId}/actividades`,
      {
        nombre: 'Sacar la basura',
        tipoPuntaje: 'OBLIGATORIA',
        valorPuntos: CASTIGO,
        comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
        tipoLimiteTiempo: 'SIN_LIMITE',
      }
    );

    // La secuencia vacía no es una rotación.
    const resVacia = await org.api.put(`/activity/actividades/${obligatoria.id}/turno`, {
      modo: 'ORDEN_FIJO',
      frecuencia: 'SESION',
      posiciones: [],
    });

    expect(resVacia.status()).toBe(400);

    // Un integrante de otra organización tampoco entra en la secuencia.
    const otra = await crearOrganizacion(base, 'TurnosVecina');
    const ajeno = await invitarYCanjearUsuario(base, otra);

    const resAjeno = await org.api.put(`/activity/actividades/${obligatoria.id}/turno`, {
      modo: 'ORDEN_FIJO',
      frecuencia: 'SESION',
      posiciones: [{ usuarioId: ajeno.usuarioId }],
    });

    expect(resAjeno.status()).toBe(400);
    expect((await resAjeno.json()).code).toBe('USUARIO_NO_ES_DEL_GRUPO');

    // Guardar bien, y después apagar: vuelve a ser «de todos».
    await org.api.putOk(`/activity/actividades/${obligatoria.id}/turno`, {
      modo: 'ORDEN_FIJO',
      frecuencia: 'SESION',
      posiciones: [{ usuarioId: usuario.usuarioId }],
    });

    const apagado = await org.api.delete(`/activity/actividades/${obligatoria.id}/turno`);

    expect(apagado.status()).toBe(204);

    const tras = await org.api.getOk<{ activo: boolean }>(
      `/activity/actividades/${obligatoria.id}/turno`
    );

    expect(tras.activo).toBe(false);
  });
});
