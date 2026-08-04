import { expect, test } from '@playwright/test';

import { Api } from './support/api';
import {
  Organizacion,
  configurarGrupoManual,
  crearOrganizacion,
  crearUmbrales,
  iniciarSeccion,
  invitarYCanjearUsuario,
  poll,
} from './support/escenario';

/**
 * Fase 14 · Ítem 28 — Monedas por cumplir
 * (`fase-14-28-monedas-por-cumplir.md`).
 *
 * Lo que SOLO el stack real puede verificar, y que por eso vive acá:
 *
 * - **Que el evento llegue de activity a rewards por RabbitMQ.** Los unit tests
 *   del consumidor le pasan el envelope a mano; que activity lo PUBLIQUE —y que
 *   lo publique aunque el registro valga 0 puntos, que es el cambio de D.1—
 *   solo se ve con el bus levantado.
 * - **La independencia (decisión 1), de punta a punta**: una actividad de 0
 *   puntos y N monedas tiene que acreditar en rewards y **no** dejar fila en el
 *   ledger de scoring. Ese cruce entre dos bases distintas no existe en ningún
 *   test unitario.
 * - **El piso en 0 contra Postgres real**, con su `pg_advisory_xact_lock`. La
 *   BD en memoria lo simula con un no-op, así que un `$executeRaw` mal escrito
 *   pasa tests, lint, typecheck y build y falla en el 100 % de las corridas
 *   reales (advertencia heredada del #16 y repetida por el #22).
 * - **Que la retro-compatibilidad sea real**: un grupo en DIRECTO no escribe ni
 *   un movimiento, por más rendimientos que tenga cargados.
 */

interface Movimiento {
  id: string;
  tipo: string;
  monto: number;
  motivo: string | null;
}

interface Billetera {
  saldo: number;
  movimientos: Movimiento[];
}

async function activarTienda(org: Organizacion): Promise<void> {
  await org.api.putOk(`/rewards/grupos/${org.grupoId}/configuracion`, {
    modo: 'TIENDA',
    aplicarAhora: true,
  });
}

async function crearActividad(
  org: Organizacion,
  datos: Record<string, unknown>
): Promise<string> {
  const creada = await org.api.postOk<{ id: string }>(
    `/activity/grupos/${org.grupoId}/actividades`,
    { tipoLimiteTiempo: 'SIN_LIMITE', ...datos }
  );

  return creada.id;
}

async function ponerPrecio(
  org: Organizacion,
  rendimientos: Record<string, unknown>[]
): Promise<void> {
  await org.api.putOk(`/rewards/grupos/${org.grupoId}/rendimientos-acciones`, {
    rendimientos,
  });
}

/** El saldo del participante leído por su propio endpoint (regla 1: se suma). */
async function billetera(usuario: { api: Api }, grupoId: string): Promise<Billetera> {
  return await usuario.api.getOk<Billetera>(`/rewards/grupos/${grupoId}/mi-billetera`);
}

async function esperarSaldo(
  usuario: { api: Api },
  grupoId: string,
  esperado: number
): Promise<Billetera> {
  return await poll(async () => {
    const actual = await billetera(usuario, grupoId);

    expect(actual.saldo).toBe(esperado);

    return actual;
  }, `saldo == ${esperado}`);
}

test.describe('Fase 14 · Ítem 28 — monedas por cumplir', () => {
  test('LA INDEPENDENCIA: 0 puntos + 5 monedas acredita monedas y NO escribe puntos', async () => {
    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'monedas-independencia');

    await configurarGrupoManual(org);
    await crearUmbrales(org);
    await activarTienda(org);

    const usuario = await invitarYCanjearUsuario(base, org);

    // El caso exacto de la decisión 1: una obligatoria que se confirma, sin
    // premio en puntos. Antes del ítem, activity ni siquiera publicaba el
    // evento (el guard del #20), así que esto era imposible.
    const soloMonedas = await crearActividad(org, {
      nombre: 'Rezar antes de dormir',
      tipoPuntaje: 'OBLIGATORIA',
      valorPuntos: 5,
      puntosPorCumplir: 0,
      comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
    });

    // Y el espejo: puntos sin monedas.
    const soloPuntos = await crearActividad(org, {
      nombre: 'Leer 20 minutos',
      tipoPuntaje: 'OPCIONAL',
      valorPuntos: 10,
      repeticionesMaximasSesion: 1,
    });

    await ponerPrecio(org, [
      { tipoAccion: 'ACTIVIDAD', origenId: soloMonedas, monedas: 5 },
      { tipoAccion: 'ACTIVIDAD', origenId: soloPuntos, monedas: 0 },
    ]);

    const seccion = await iniciarSeccion(org);

    await usuario.api.postOk(`/activity/actividades/${soloMonedas}/completar`, {});
    await usuario.api.postOk(`/activity/actividades/${soloPuntos}/completar`, {});

    const saldo = await esperarSaldo(usuario, org.grupoId, 5);

    // Un solo movimiento: la de 10 puntos y 0 monedas no ensucia el ledger.
    const porAccion = saldo.movimientos.filter((m) => m.tipo === 'RENDIMIENTO_ACCION');
    expect(porAccion).toHaveLength(1);
    expect(porAccion[0].monto).toBe(5);

    // EL INVARIANTE DE D.2: el ledger de puntos queda como siempre. La de 0
    // puntos no dejó asiento; la de 10 sí. Si esto cambia, el error está en el
    // guard que se mudó a scoring.
    await poll(async () => {
      const puntaje = await org.api.getOk<{ puntajeTotal: number }>(
        `/scoring/usuarios/${usuario.usuarioId}/secciones/${seccion.seccionId}/puntaje`
      );

      expect(puntaje.puntajeTotal).toBe(10);
    }, 'puntaje == 10 (solo la actividad que vale puntos)');
  });

  test('cada repetición paga: tres veces una de 3 monedas deja tres movimientos y +9', async () => {
    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'monedas-repeticiones');

    await configurarGrupoManual(org);
    await crearUmbrales(org);
    await activarTienda(org);

    const usuario = await invitarYCanjearUsuario(base, org);
    const actividadId = await crearActividad(org, {
      nombre: 'Ordenar el escritorio',
      tipoPuntaje: 'OPCIONAL',
      valorPuntos: 1,
      repeticionesMaximasSesion: 3,
    });

    await ponerPrecio(org, [{ tipoAccion: 'ACTIVIDAD', origenId: actividadId, monedas: 3 }]);
    await iniciarSeccion(org);

    for (let i = 0; i < 3; i += 1) {
      await usuario.api.postOk(`/activity/actividades/${actividadId}/completar`, {});
    }

    const saldo = await esperarSaldo(usuario, org.grupoId, 9);

    expect(saldo.movimientos.filter((m) => m.tipo === 'RENDIMIENTO_ACCION')).toHaveLength(3);
  });

  test('PISO EN 0 y RESTITUCIÓN EXACTA contra Postgres real (decisiones 6 y 7)', async () => {
    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'monedas-piso');

    await configurarGrupoManual(org);
    await crearUmbrales(org);
    await activarTienda(org);

    const usuario = await invitarYCanjearUsuario(base, org);
    const actividadId = await crearActividad(org, {
      nombre: 'Sacar la basura',
      tipoPuntaje: 'OPCIONAL',
      valorPuntos: 1,
      repeticionesMaximasSesion: 1,
    });

    await ponerPrecio(org, [{ tipoAccion: 'ACTIVIDAD', origenId: actividadId, monedas: 5 }]);
    await iniciarSeccion(org);

    const registro = await usuario.api.postOk<{ id: string }>(
      `/activity/actividades/${actividadId}/completar`,
      {}
    );

    await esperarSaldo(usuario, org.grupoId, 5);

    // Gasta 3 de las 5: le quedan 2. El ajuste del Tutor es el camino más
    // corto para bajar el saldo sin montar una tienda entera.
    await org.api.postOk(`/rewards/grupos/${org.grupoId}/usuarios/${usuario.usuarioId}/ajuste`, {
      monto: -3,
      motivo: 'Gasto de prueba',
    });

    await esperarSaldo(usuario, org.grupoId, 2);

    // El Tutor quita la marca: se recuperan 2, no 5, y el saldo queda en 0.
    const quita = await org.api.delete(`/activity/registros-actividad/${registro.id}`);
    expect(quita.ok(), 'el tutor tiene que poder quitar la marca').toBeTruthy();

    const trasQuitar = await esperarSaldo(usuario, org.grupoId, 0);
    const reversion = trasQuitar.movimientos.find((m) => m.tipo === 'REVERSION_ACCION');

    expect(reversion?.monto).toBe(-2);
    // La fila EXPLICA lo que no pudo recuperar: es lo que el Tutor va a
    // preguntar al ver que el saldo no bajó lo que debía.
    expect(reversion?.motivo).toContain('3 de 5');

    // Y deshacerla devuelve 2, NO 5: devolver 5 regalaría 3 monedas por el
    // camino de una corrección (decisión 7).
    await org.api.postOk(`/activity/registros-actividad/${registro.id}/revertir`, {});

    await esperarSaldo(usuario, org.grupoId, 2);
  });

  test('RETRO-COMPATIBLE: en DIRECTO no se escribe ni un movimiento', async () => {
    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'monedas-directo');

    await configurarGrupoManual(org);
    await crearUmbrales(org);

    const usuario = await invitarYCanjearUsuario(base, org);
    const actividadId = await crearActividad(org, {
      nombre: 'Leer 20 minutos',
      tipoPuntaje: 'OPCIONAL',
      valorPuntos: 10,
      repeticionesMaximasSesion: 1,
    });

    // La configuración SE PUEDE CARGAR en DIRECTO (decisión 14 + decisión 10
    // del #22): no se pierde al cambiar de modo, simplemente no tiene efecto.
    await ponerPrecio(org, [{ tipoAccion: 'ACTIVIDAD', origenId: actividadId, monedas: 5 }]);

    const seccion = await iniciarSeccion(org);

    await usuario.api.postOk(`/activity/actividades/${actividadId}/completar`, {});

    // Los puntos sí se acreditan: el grupo se comporta EXACTAMENTE como antes.
    await poll(async () => {
      const puntaje = await org.api.getOk<{ puntajeTotal: number }>(
        `/scoring/usuarios/${usuario.usuarioId}/secciones/${seccion.seccionId}/puntaje`
      );

      expect(puntaje.puntajeTotal).toBe(10);
    }, 'puntaje == 10 en modo DIRECTO');

    const saldo = await billetera(usuario, org.grupoId);
    expect(saldo.movimientos).toHaveLength(0);

    // Y al prender la tienda, lo cargado sigue ahí.
    await activarTienda(org);

    const rendimientos = await org.api.getOk<{ actividades: { origenId: string; monedas: number }[] }>(
      `/rewards/grupos/${org.grupoId}/rendimientos-acciones`
    );

    expect(
      rendimientos.actividades.find((fila) => fila.origenId === actividadId)?.monedas
    ).toBe(5);
  });

  test('AISLAMIENTO: un origenId de otra organización da 400 y no escribe nada', async () => {
    const base = await Api.crear();
    const propia = await crearOrganizacion(base, 'monedas-aislamiento-a');
    const ajena = await crearOrganizacion(base, 'monedas-aislamiento-b');

    await activarTienda(propia);

    const actividadAjena = await crearActividad(ajena, {
      nombre: 'Actividad de otro tenant',
      tipoPuntaje: 'OPCIONAL',
      valorPuntos: 10,
      repeticionesMaximasSesion: 1,
    });

    const res = await propia.api.put(
      `/rewards/grupos/${propia.grupoId}/rendimientos-acciones`,
      { rendimientos: [{ tipoAccion: 'ACTIVIDAD', origenId: actividadAjena, monedas: 5 }] }
    );

    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe('ACCION_INEXISTENTE');

    const rendimientos = await propia.api.getOk<{ actividades: unknown[] }>(
      `/rewards/grupos/${propia.grupoId}/rendimientos-acciones`
    );

    expect(rendimientos.actividades).toHaveLength(0);
  });

  test('el participante ve el precio antes de hacerla, y en DIRECTO no', async () => {
    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'monedas-vitrina');

    await configurarGrupoManual(org);

    const usuario = await invitarYCanjearUsuario(base, org);
    const actividadId = await crearActividad(org, {
      nombre: 'Leer 20 minutos',
      tipoPuntaje: 'OPCIONAL',
      valorPuntos: 10,
      repeticionesMaximasSesion: 1,
    });

    await ponerPrecio(org, [{ tipoAccion: 'ACTIVIDAD', origenId: actividadId, monedas: 3 }]);

    // En DIRECTO viene vacío: «no se muestra en DIRECTO» cae por construcción,
    // no por un `if` de la plantilla.
    expect(
      await usuario.api.getOk<unknown[]>(`/rewards/grupos/${org.grupoId}/valores-en-monedas`)
    ).toEqual([]);

    await activarTienda(org);

    const valores = await usuario.api.getOk<{ origenId: string; monedas: number }[]>(
      `/rewards/grupos/${org.grupoId}/valores-en-monedas`
    );

    expect(valores).toEqual([{ origenId: actividadId, monedas: 3, monedasBonoJefe: 0 }]);
  });
});
