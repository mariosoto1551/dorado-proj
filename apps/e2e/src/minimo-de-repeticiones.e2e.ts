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
 * Fase 14 · Ítem 25 — Mínimo de repeticiones
 * (`fase-14-25-objetivo-y-minimo-de-repeticiones.md`).
 *
 * Lo que solo el stack real puede verificar: que el castigo **proporcional** que
 * escribe el consumidor de cierre viaje por RabbitMQ y aterrice en el ledger de
 * scoring con el monto correcto. Los unit tests del cierre comprueban la fila
 * que se crea; nada de eso prueba que scoring reste lo que dice la fila.
 *
 * Es el mismo punto ciego que el ítem 24 destapó con la vigencia: la mitad de
 * una regla puede estar cubierta por tests y la otra mitad no existir.
 */
const CASTIGO = 10;

const PREMIO = 2;

interface Escenario {
  org: Organizacion;
  ana: { api: Api; usuarioId: string };
  actividadId: string;
  seccionId: string;
  sesionId: string;
}

/** Obligatoria confirmable de castigo 10, premio 2, hasta 3× y **mínimo 3**. */
async function montarEscenario(etiqueta: string, minimo = 3): Promise<Escenario> {
  const base = await Api.crear();
  const org = await crearOrganizacion(base, etiqueta);

  await configurarGrupoManual(org);

  const actividad = await org.api.postOk<{ id: string }>(
    `/activity/grupos/${org.grupoId}/actividades`,
    {
      nombre: 'Tomar la medicación',
      tipoPuntaje: 'OBLIGATORIA',
      valorPuntos: CASTIGO,
      puntosPorCumplir: PREMIO,
      comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
      tipoLimiteTiempo: 'SIN_LIMITE',
      repeticionesMaximasSesion: 3,
      repeticionesMinimasSesion: minimo,
    }
  );

  const ana = await invitarYCanjearUsuario(base, org);
  const seccion = await iniciarSeccion(org);

  return {
    org,
    ana,
    actividadId: actividad.id,
    seccionId: seccion.seccionId,
    sesionId: seccion.sesionId,
  };
}

async function confirmar(escenario: Escenario, veces: number): Promise<void> {
  for (let i = 0; i < veces; i += 1) {
    await escenario.ana.api.postOk(
      `/activity/actividades/${escenario.actividadId}/completar`,
      {}
    );
  }
}

async function cerrarYLeerPuntaje(escenario: Escenario, esperado: number): Promise<void> {
  await escenario.org.api.postOk(
    `/session/secciones/${escenario.seccionId}/sesiones/${escenario.sesionId}/forzar-cierre`,
    {}
  );

  await poll(
    async () => {
      const puntaje = await escenario.org.api.getOk<{ puntajeTotal: number }>(
        `/scoring/usuarios/${escenario.ana.usuarioId}/secciones/${escenario.seccionId}/puntaje`
      );

      expect(puntaje.puntajeTotal).toBe(esperado);
    },
    { descripcion: `puntaje final ${esperado}` }
  );
}

test.describe('Fase 14 · Ítem 25 — mínimo de repeticiones', () => {
  test('confirmar 1 de 3 castiga las 2 que faltaron, no una sola vez', async () => {
    test.slow();

    const escenario = await montarEscenario('Minimo1de3');

    await confirmar(escenario, 1);

    // +2 por la que hizo, −20 por las dos que faltaron.
    await cerrarYLeerPuntaje(escenario, PREMIO - 2 * CASTIGO);
  });

  test('sin ninguna confirmación se castiga el mínimo entero', async () => {
    test.slow();

    const escenario = await montarEscenario('Minimo0de3');

    await cerrarYLeerPuntaje(escenario, -3 * CASTIGO);
  });

  test('llegar al mínimo no castiga y cobra las tres veces', async () => {
    test.slow();

    const escenario = await montarEscenario('Minimo3de3');

    await confirmar(escenario, 3);

    await cerrarYLeerPuntaje(escenario, 3 * PREMIO);
  });

  test('con el mínimo por default (1), una confirmación sigue alcanzando', async () => {
    test.slow();

    // La retro-compatibilidad del ítem: máximo 3 pero mínimo 1 es exactamente
    // el comportamiento anterior al #25 — una confirmación evita el descuento.
    const escenario = await montarEscenario('MinimoDefault', 1);

    await confirmar(escenario, 1);

    await cerrarYLeerPuntaje(escenario, PREMIO);
  });

  test('un mínimo mayor que el máximo se rechaza al crear la actividad', async () => {
    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'MinimoInvalido');

    const respuesta = await org.api.post(`/activity/grupos/${org.grupoId}/actividades`, {
      nombre: 'Imposible',
      tipoPuntaje: 'OBLIGATORIA',
      valorPuntos: CASTIGO,
      comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
      tipoLimiteTiempo: 'SIN_LIMITE',
      repeticionesMaximasSesion: 2,
      repeticionesMinimasSesion: 3,
    });

    expect(respuesta.status()).toBe(400);
  });
});
