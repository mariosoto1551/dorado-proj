import { expect, test } from '@playwright/test';

import { Api } from './support/api';
import { consultar } from './support/db';
import {
  configurarGrupoManual,
  crearOrganizacion,
  crearUmbrales,
  iniciarSeccion,
  invitarYCanjearUsuario,
  poll,
  type Organizacion,
  type SeccionAbierta,
} from './support/escenario';

/**
 * Fase 14 · Ítem 31, tanda 9 — el ajuste manual de puntos (Parte A).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO NO ES DEL ASISTENTE, Y POR ESO ESTÁ EN UN ARCHIVO APARTE.
 *
 * El ítem 31 encontró que **al Tutor le faltaba ajustar puntos a mano desde la
 * Fase 7**: para monedas hay ajuste manual desde el #22 y para los puntos —el
 * número que decide la zona y la recompensa— no había nada, porque `corregir`
 * exige el id de un asiento previo. La tanda 1 cerró ese hueco del producto sin
 * escribir una línea de `ai-service`, así que su verificación de punta a punta
 * tampoco pasa por ahí.
 *
 * Los tres criterios de aceptación que cubre (1, 2 y 3) son los tres que solo
 * el stack real puede contestar: que el puntaje **se derive** 10 más alto sin
 * que ninguna fila anterior haya cambiado, que sin Sesión abierta no se escriba
 * nada, y que el rastro llegue a `audit-service` por el bus.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Lo que se afirma fila por fila del ledger. `createdAt` como texto para comparar exacto. */
interface FilaLedger {
  id: string;
  tipoOrigen: string;
  puntosSnapshot: number;
  origenId: string | null;
  motivoCorreccion: string | null;
  corregidoDeId: string | null;
  createdAt: string;
}

const MOTIVO = 'Ayudó con la mudanza de la abuela';

async function ledgerDe(usuarioId: string): Promise<FilaLedger[]> {
  return await consultar<FilaLedger>(
    'scoring_db',
    `select id, "tipoOrigen", "puntosSnapshot", "origenId", "motivoCorreccion", "corregidoDeId",
            "createdAt"::text as "createdAt"
     from "EventoPuntos" where "usuarioId" = $1 order by "createdAt", id`,
    [usuarioId]
  );
}

test.describe('fase-14-31 · Parte A — ajuste manual de puntos', () => {
  let org: Organizacion;
  let usuarioId: string;
  let conductaId: string;
  let seccion: SeccionAbierta;

  test.beforeAll(async () => {
    const base = await Api.crear();

    org = await crearOrganizacion(base, 'AjustePuntos');
    await configurarGrupoManual(org);
    await crearUmbrales(org);

    const persona = await invitarYCanjearUsuario(base, org);

    usuarioId = persona.usuarioId;

    const conducta = await org.api.postOk<{ id: string }>(
      `/activity/grupos/${org.grupoId}/conductas`,
      { nombre: 'Semana ordenada', tipo: 'BUENA', valorPuntos: 25 }
    );

    conductaId = conducta.id;
  });

  // El orden importa y es el del producto: este test corre ANTES de que exista
  // ninguna Sección, que es el único momento en que el 409 se puede provocar
  // sin cerrar nada a mano.
  test('sin sesión abierta devuelve 409 y no escribe ninguna fila (criterio 2)', async () => {
    const respuesta = await org.api.post(`/scoring/grupos/${org.grupoId}/usuarios/${usuarioId}/ajuste`, {
      puntos: 10,
      motivo: MOTIVO,
    });

    expect(respuesta.status()).toBe(409);
    // El mensaje tiene que decir QUÉ hacer: sin esto el Tutor ve «409» y no
    // sabe que lo que falta es abrir la sesión del día.
    expect((await respuesta.json()).message).toContain('sesión');

    // Falla cerrado de verdad: ni una fila, ni con seccionId en null.
    expect(await ledgerDe(usuarioId)).toHaveLength(0);
  });

  test('+10 puntos: fila nueva AJUSTE_MANUAL, el puntaje sube 10 y nada anterior cambia (criterios 1 y 3)', async () => {
    test.slow();

    seccion = await iniciarSeccion(org);

    // Un asiento previo, para tener un «antes» que comparar. El puntaje no se
    // guarda en ningún lado: se deriva sumando el ledger al leer (regla 1).
    await org.api.postOk(`/activity/conductas/${conductaId}/registrar`, { usuarioId });

    const puntajeDe = async (): Promise<{ puntajeTotal: number }> =>
      await org.api.getOk(`/scoring/usuarios/${usuarioId}/secciones/${seccion.seccionId}/puntaje`);

    await poll(
      async () => {
        expect((await puntajeDe()).puntajeTotal).toBe(25);
      },
      { descripcion: 'la conducta proyectada al ledger' }
    );

    const antes = await ledgerDe(usuarioId);

    expect(antes).toHaveLength(1);

    const evento = await org.api.postOk<{
      id: string;
      tipoOrigen: string;
      origenId: string | null;
      puntosSnapshot: number;
      seccionId: string;
      sesionId: string;
      registradoPorId: string;
    }>(`/scoring/grupos/${org.grupoId}/usuarios/${usuarioId}/ajuste`, {
      puntos: 10,
      motivo: MOTIVO,
    });

    expect(evento.tipoOrigen).toBe('AJUSTE_MANUAL');
    // Sin fila de origen, y es la razón por la que `origenId` pasó a nullable:
    // un ajuste manual no tiene a qué apuntar y un id prestado sería mentira en
    // el único ledger del sistema.
    expect(evento.origenId).toBeNull();
    expect(evento.puntosSnapshot).toBe(10);
    // Cae en la Sesión abierta, no en una inventada (decisión 5).
    expect(evento.seccionId).toBe(seccion.seccionId);
    expect(evento.sesionId).toBe(seccion.sesionId);
    // Quién lo hizo sale del JWT, nunca del body (regla 3 del proyecto).
    expect(evento.registradoPorId).toBe(org.tutorId);

    // Criterio 1: el puntaje sube 10 al DERIVARLO, sin que nadie haya tocado un
    // acumulado —no existe ninguno.
    await poll(
      async () => {
        expect((await puntajeDe()).puntajeTotal).toBe(35);
      },
      { descripcion: 'el ajuste sumado al puntaje derivado' }
    );

    const despues = await ledgerDe(usuarioId);

    // Una fila más, y **las anteriores idénticas**: es la regla 6 del proyecto
    // sobre el ledger, verificada campo por campo y no de palabra.
    expect(despues).toHaveLength(2);
    expect(despues.slice(0, 1)).toEqual(antes);

    const nueva = despues[1];

    expect(nueva.id).toBe(evento.id);
    expect(nueva.tipoOrigen).toBe('AJUSTE_MANUAL');
    expect(nueva.origenId).toBeNull();
    expect(nueva.puntosSnapshot).toBe(10);
    // El motivo va en `motivoCorreccion`, que ya significa «por qué un humano
    // tocó el ledger a mano». Es obligatorio: un movimiento manual sin
    // explicación es inauditable.
    expect(nueva.motivoCorreccion).toBe(MOTIVO);
    // No es una corrección: no hay asiento anterior que esté enmendando.
    expect(nueva.corregidoDeId).toBeNull();

    // Criterio 3: el rastro llega a auditoría por el bus, consultable POR
    // ENTIDAD — que es como se contesta «por qué el puntaje de Juan cambió sin
    // que hiciera nada».
    await poll(
      async () => {
        const timeline = await org.api.getOk<
          Array<{ accion: string; entidadTipo: string; entidadId: string; detalle: Record<string, unknown> }>
        >(`/audit/entidades/EventoPuntos/${evento.id}`);
        const fila = timeline.find((item) => item.accion === 'PUNTOS_AJUSTADOS');

        expect(fila, 'el ajuste tiene que estar en el timeline de la entidad').toBeTruthy();
        expect(fila?.detalle['motivo']).toBe(MOTIVO);
        expect(fila?.detalle['puntos']).toBe(10);
      },
      { descripcion: 'PUNTOS_AJUSTADOS en audit-service' }
    );
  });

  test('el motivo es obligatorio y el 0 se rechaza: un ajuste sin explicación es inauditable', async () => {
    const sinMotivo = await org.api.post(
      `/scoring/grupos/${org.grupoId}/usuarios/${usuarioId}/ajuste`,
      { puntos: 5 }
    );

    expect(sinMotivo.status()).toBe(400);

    // Cero no es un error de tipeo que convenga normalizar: es una fila que no
    // ajusta nada y ensucia el ledger.
    const cero = await org.api.post(`/scoring/grupos/${org.grupoId}/usuarios/${usuarioId}/ajuste`, {
      puntos: 0,
      motivo: 'no cambia nada',
    });

    expect(cero.status()).toBe(400);

    // Y ninguno de los dos escribió: siguen siendo las dos filas del test anterior.
    expect(await ledgerDe(usuarioId)).toHaveLength(2);
  });

  test('un ajuste negativo puede dejar el puntaje bajo cero — no hay piso, al revés que en monedas', async () => {
    test.slow();

    await org.api.postOk(`/scoring/grupos/${org.grupoId}/usuarios/${usuarioId}/ajuste`, {
      puntos: -50,
      motivo: 'Rompió el vidrio de la cocina',
    });

    // 25 + 10 − 50 = −15. Un puntaje negativo es un estado legítimo del
    // producto (la zona más baja existe y `puntosMin` puede ser negativo); un
    // saldo de monedas negativo sería una deuda que nadie puede pagar, y por
    // eso ese endpoint sí tiene piso y este no.
    await poll(
      async () => {
        const puntaje = await org.api.getOk<{ puntajeTotal: number }>(
          `/scoring/usuarios/${usuarioId}/secciones/${seccion.seccionId}/puntaje`
        );

        expect(puntaje.puntajeTotal).toBe(-15);
      },
      { descripcion: 'el puntaje derivado en negativo' }
    );
  });

  test('el ajuste sobre un integrante de otra organización no existe (404)', async () => {
    const base = await Api.crear();
    const ajena = await crearOrganizacion(base, 'AjusteAjena');
    const suPersona = await invitarYCanjearUsuario(base, ajena);

    // 404 y no 403: no se confirma la existencia de alguien que no le
    // corresponde, mismo criterio que el resto de scoring.
    const respuesta = await org.api.post(
      `/scoring/grupos/${org.grupoId}/usuarios/${suPersona.usuarioId}/ajuste`,
      { puntos: 10, motivo: 'no debería poder' }
    );

    expect(respuesta.status()).toBe(404);
    expect(await ledgerDe(suPersona.usuarioId)).toHaveLength(0);
  });
});
