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
 * Fase 14 · Ítem 24 — Destinatario y vigencia de una Actividad
 * (`fase-14-24-destinatario-y-vigencia.md`).
 *
 * Lo que solo el stack real puede verificar:
 *
 * 1. Que el destinatario nominal **se aplique en todos los caminos a la vez** —
 *    catálogo, `mi-estado-hoy` y registro son lecturas y escrituras distintas
 *    resolviendo la misma regla. Un unit test cubre la función; solo el stack
 *    prueba que los tres la llaman.
 * 2. Que **el castigo automático al cerrar la sesión respete el destinatario**.
 *    Es el punto que no se ve en ninguna pantalla: si falla, el integrante
 *    equivocado termina el día con puntos negativos y nadie se entera hasta el
 *    día siguiente. Se comprueba con el ledger, que es donde el error existiría.
 * 3. Que la **vigencia bloquee de verdad** el registro y que las validaciones de
 *    escritura devuelvan los códigos que la interfaz espera.
 */
const CASTIGO = 10;

interface Escenario {
  org: Organizacion;
  ana: { api: Api; usuarioId: string };
  luis: { api: Api; usuarioId: string };
  seccionId: string;
  sesionId: string;
}

/** Grupo con dos integrantes y una Sección abierta. */
async function montarEscenario(etiqueta: string): Promise<Escenario> {
  const base = await Api.crear();
  const org = await crearOrganizacion(base, etiqueta);

  await configurarGrupoManual(org);

  const ana = await invitarYCanjearUsuario(base, org);
  const luis = await invitarYCanjearUsuario(base, org);
  const seccion = await iniciarSeccion(org);

  return { org, ana, luis, seccionId: seccion.seccionId, sesionId: seccion.sesionId };
}

async function esperarPuntaje(
  escenario: Escenario,
  usuarioId: string,
  esperado: number
): Promise<void> {
  await poll(
    async () => {
      const puntaje = await escenario.org.api.getOk<{ puntajeTotal: number }>(
        `/scoring/usuarios/${usuarioId}/secciones/${escenario.seccionId}/puntaje`
      );

      expect(puntaje.puntajeTotal).toBe(esperado);
    },
    { descripcion: `ledger de ${usuarioId} proyectado a ${esperado}` }
  );
}

async function actividadesVisiblesPara(
  escenario: Escenario,
  actor: { api: Api }
): Promise<string[]> {
  const estado = await actor.api.getOk<{ actividades: Array<{ actividadId: string }> }>(
    `/activity/grupos/${escenario.org.grupoId}/mi-estado-hoy`
  );

  return estado.actividades.map((item) => item.actividadId);
}

/** `"YYYY-MM-DD"` a N días de hoy. La vigencia se compara en fecha civil. */
function fechaRelativa(dias: number): string {
  return new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
}

test.describe('Fase 14 · Ítem 24 — destinatario nominal', () => {
  test('la actividad de Ana no existe para Luis, en ningún camino', async () => {
    test.slow();

    const escenario = await montarEscenario('Destinatario');

    const libre = await escenario.org.api.postOk<{ id: string }>(
      `/activity/grupos/${escenario.org.grupoId}/actividades`,
      {
        nombre: 'Leer 20 minutos',
        tipoPuntaje: 'OPCIONAL',
        valorPuntos: 10,
        tipoLimiteTiempo: 'SIN_LIMITE',
      }
    );

    const dePiano = await escenario.org.api.postOk<{
      id: string;
      usuariosPermitidos: string[];
      rolesPermitidos: string[];
    }>(`/activity/grupos/${escenario.org.grupoId}/actividades`, {
      nombre: 'Practicar piano',
      tipoPuntaje: 'OPCIONAL',
      valorPuntos: 5,
      tipoLimiteTiempo: 'SIN_LIMITE',
      usuariosPermitidos: [escenario.ana.usuarioId],
    });

    expect(dePiano.usuariosPermitidos).toEqual([escenario.ana.usuarioId]);
    expect(dePiano.rolesPermitidos, 'los modos son excluyentes').toEqual([]);

    // 1. `mi-estado-hoy`: Ana ve las dos, Luis solo la libre.
    expect(await actividadesVisiblesPara(escenario, escenario.ana)).toEqual(
      expect.arrayContaining([libre.id, dePiano.id])
    );

    const visiblesLuis = await actividadesVisiblesPara(escenario, escenario.luis);

    expect(visiblesLuis).toContain(libre.id);
    expect(visiblesLuis, 'la de Ana NO aparece para Luis').not.toContain(dePiano.id);

    // 2. El catálogo del integrante aplica la misma regla que su lista de hoy.
    const catalogoLuis = await escenario.luis.api.getOk<Array<{ id: string }>>(
      `/activity/grupos/${escenario.org.grupoId}/actividades`
    );

    expect(catalogoLuis.map((a) => a.id)).not.toContain(dePiano.id);

    // 3. El Tutor las ve todas: necesita gestionarlas.
    const catalogoTutor = await escenario.org.api.getOk<Array<{ id: string }>>(
      `/activity/grupos/${escenario.org.grupoId}/actividades`
    );

    expect(catalogoTutor.map((a) => a.id)).toEqual(
      expect.arrayContaining([libre.id, dePiano.id])
    );

    // 4. El registro: la pantalla ya no la ofrece, pero el servidor es el que
    //    decide — un cliente con la lista vieja en caché no la puede colar.
    const intentoLuis = await escenario.luis.api.post(
      `/activity/actividades/${dePiano.id}/completar`,
      {}
    );

    expect(intentoLuis.status()).toBe(403);

    // 5. Y Ana la completa sin problema.
    await escenario.ana.api.postOk(`/activity/actividades/${dePiano.id}/completar`, {});
    await esperarPuntaje(escenario, escenario.ana.usuarioId, 5);
    await esperarPuntaje(escenario, escenario.luis.usuarioId, 0);
  });

  test('el castigo al cerrar la sesión solo alcanza al destinatario', async () => {
    test.slow();

    // EL test del ítem, el mismo punto ciego que el rol del #19: una obligatoria
    // asignada a Ana no puede restarle puntos a Luis. Sin el filtro en el
    // consumidor de SesionCerrada, Luis termina en −10 sin que ninguna pantalla
    // se lo haya mostrado nunca.
    const escenario = await montarEscenario('DestinatarioCierre');

    await escenario.org.api.postOk(`/activity/grupos/${escenario.org.grupoId}/actividades`, {
      nombre: 'Practicar piano media hora',
      tipoPuntaje: 'OBLIGATORIA',
      valorPuntos: CASTIGO,
      comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
      tipoLimiteTiempo: 'SIN_LIMITE',
      usuariosPermitidos: [escenario.ana.usuarioId],
    });

    await escenario.org.api.postOk(
      `/session/secciones/${escenario.seccionId}/sesiones/${escenario.sesionId}/forzar-cierre`,
      {}
    );

    await esperarPuntaje(escenario, escenario.ana.usuarioId, -CASTIGO);

    // Luis queda intacto. Con poll para no leer «0» simplemente porque el evento
    // todavía no llegó: si el castigo indebido va a aparecer, aparece en el
    // mismo lapso en que apareció el de Ana (ya esperado arriba).
    await esperarPuntaje(escenario, escenario.luis.usuarioId, 0);
  });

  test('los cuatro modos son excluyentes y los ids se validan contra el grupo', async () => {
    const escenario = await montarEscenario('DestinatarioValida');

    const rol = await escenario.org.api.postOk<{ id: string }>(
      `/identity/grupos/${escenario.org.grupoId}/roles`,
      { nombre: 'Cocina', colorHex: '#22C55E' }
    );

    const ambiguo = await escenario.org.api.post(
      `/activity/grupos/${escenario.org.grupoId}/actividades`,
      {
        nombre: 'Ambigua',
        tipoPuntaje: 'OPCIONAL',
        valorPuntos: 5,
        tipoLimiteTiempo: 'SIN_LIMITE',
        usuariosPermitidos: [escenario.ana.usuarioId],
        rolesPermitidos: [rol.id],
      }
    );

    expect(ambiguo.status()).toBe(400);
    expect((await ambiguo.json()).code).toBe('DESTINATARIO_AMBIGUO');

    // Un usuario de OTRA organización no puede colarse como destinatario: el
    // aislamiento se resuelve contra el grupo del JWT, nunca contra el body.
    const otra = await montarEscenario('DestinatarioAjeno');
    const ajeno = await escenario.org.api.post(
      `/activity/grupos/${escenario.org.grupoId}/actividades`,
      {
        nombre: 'De alguien de otra org',
        tipoPuntaje: 'OPCIONAL',
        valorPuntos: 5,
        tipoLimiteTiempo: 'SIN_LIMITE',
        usuariosPermitidos: [otra.ana.usuarioId],
      }
    );

    expect(ajeno.status()).toBe(400);
    expect((await ajeno.json()).code).toBe('USUARIO_FUERA_DEL_GRUPO');

    // Personas sueltas sobre una tarea de equipo: el destinatario tiene que ser
    // del mismo orden que el alcance (decisión 5).
    const equipoConPersonas = await escenario.org.api.post(
      `/activity/grupos/${escenario.org.grupoId}/actividades`,
      {
        nombre: 'Tarea colectiva mal asignada',
        tipoPuntaje: 'OPCIONAL',
        valorPuntos: 5,
        tipoLimiteTiempo: 'SIN_LIMITE',
        alcance: 'EQUIPO',
        usuariosPermitidos: [escenario.ana.usuarioId],
      }
    );

    expect(equipoConPersonas.status()).toBe(400);
    expect((await equipoConPersonas.json()).code).toBe(
      'DESTINATARIO_INCOMPATIBLE_CON_ALCANCE'
    );
  });

  test('cambiar de modo BORRA el anterior: nunca quedan dos destinatarios', async () => {
    const escenario = await montarEscenario('DestinatarioCambio');

    const rol = await escenario.org.api.postOk<{ id: string }>(
      `/identity/grupos/${escenario.org.grupoId}/roles`,
      { nombre: 'Cocina', colorHex: '#22C55E' }
    );

    const actividad = await escenario.org.api.postOk<{ id: string }>(
      `/activity/grupos/${escenario.org.grupoId}/actividades`,
      {
        nombre: 'Lavar los platos',
        tipoPuntaje: 'OPCIONAL',
        valorPuntos: 5,
        tipoLimiteTiempo: 'SIN_LIMITE',
        rolesPermitidos: [rol.id],
      }
    );

    // El PATCH manda los tres arrays, como hace el formulario: el que no es el
    // modo elegido va vacío. Sin eso, la fila quedaría con rol Y personas.
    const editada = await escenario.org.api.patchOk<{
      rolesPermitidos: string[];
      usuariosPermitidos: string[];
    }>(`/activity/actividades/${actividad.id}`, {
      rolesPermitidos: [],
      usuariosPermitidos: [escenario.ana.usuarioId],
      equiposPermitidos: [],
    });

    expect(editada.rolesPermitidos).toEqual([]);
    expect(editada.usuariosPermitidos).toEqual([escenario.ana.usuarioId]);
  });
});

test.describe('Fase 14 · Ítem 24 — vigencia por fechas', () => {
  test('fuera del rango no se registra; dentro sí', async () => {
    test.slow();

    const escenario = await montarEscenario('Vigencia');

    const vencida = await escenario.org.api.postOk<{
      id: string;
      vigenteHasta: string | null;
    }>(`/activity/grupos/${escenario.org.grupoId}/actividades`, {
      nombre: 'Campaña de lectura de la semana pasada',
      tipoPuntaje: 'OPCIONAL',
      valorPuntos: 5,
      tipoLimiteTiempo: 'SIN_LIMITE',
      vigenteHasta: fechaRelativa(-7),
    });

    expect(vencida.vigenteHasta).toBe(fechaRelativa(-7));

    const futura = await escenario.org.api.postOk<{ id: string }>(
      `/activity/grupos/${escenario.org.grupoId}/actividades`,
      {
        nombre: 'Campaña del mes que viene',
        tipoPuntaje: 'OPCIONAL',
        valorPuntos: 5,
        tipoLimiteTiempo: 'SIN_LIMITE',
        vigenteDesde: fechaRelativa(30),
      }
    );

    const vigente = await escenario.org.api.postOk<{ id: string }>(
      `/activity/grupos/${escenario.org.grupoId}/actividades`,
      {
        nombre: 'Campaña en curso',
        tipoPuntaje: 'OPCIONAL',
        valorPuntos: 5,
        tipoLimiteTiempo: 'SIN_LIMITE',
        vigenteDesde: fechaRelativa(-3),
        vigenteHasta: fechaRelativa(3),
      }
    );

    // La que venció y la que todavía no empieza NO aparecen (decisión 10): es
    // distinto del «hoy no toca» del ítem 11, que sí se ve en gris.
    const visibles = await actividadesVisiblesPara(escenario, escenario.ana);

    expect(visibles).toContain(vigente.id);
    expect(visibles, 'la vencida no aparece').not.toContain(vencida.id);
    expect(visibles, 'la que no empezó tampoco').not.toContain(futura.id);

    // Y el servidor rechaza el registro aunque el cliente lo intente igual.
    const intento = await escenario.ana.api.post(
      `/activity/actividades/${vencida.id}/completar`,
      {}
    );

    expect(intento.status()).toBe(409);
    expect((await intento.json()).code).toBe('ACTIVIDAD_FUERA_DE_VIGENCIA');

    await escenario.ana.api.postOk(`/activity/actividades/${vigente.id}/completar`, {});
    await esperarPuntaje(escenario, escenario.ana.usuarioId, 5);
  });

  test('una obligatoria vencida no castiga al cerrar, y queda archivada', async () => {
    test.slow();

    // Los dos efectos del vencimiento en el mismo cierre: no restar puntos por
    // algo que ya no correspondía (mismo bug de puntaje que motivó el ítem 11
    // con los días) y sacar la actividad del catálogo sin que el Tutor la toque.
    const escenario = await montarEscenario('VigenciaCierre');

    const vencida = await escenario.org.api.postOk<{ id: string }>(
      `/activity/grupos/${escenario.org.grupoId}/actividades`,
      {
        nombre: 'Obligatoria que ya venció',
        tipoPuntaje: 'OBLIGATORIA',
        valorPuntos: CASTIGO,
        comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
        tipoLimiteTiempo: 'SIN_LIMITE',
        vigenteHasta: fechaRelativa(-7),
      }
    );

    await escenario.org.api.postOk(
      `/session/secciones/${escenario.seccionId}/sesiones/${escenario.sesionId}/forzar-cierre`,
      {}
    );

    // El archivado corre dentro del mismo consumidor, así que esperar a que la
    // actividad quede ARCHIVADA prueba las dos cosas de una: si el consumidor
    // llegó hasta el archivado, el castigo ya se decidió.
    await poll(
      async () => {
        const detalle = await escenario.org.api.getOk<{ estado: string }>(
          `/activity/actividades/${vencida.id}`
        );

        expect(detalle.estado).toBe('ARCHIVADA');
      },
      { descripcion: 'la actividad vencida quedó archivada al cerrar la sesión' }
    );

    await esperarPuntaje(escenario, escenario.ana.usuarioId, 0);
    await esperarPuntaje(escenario, escenario.luis.usuarioId, 0);
  });

  test('la vigencia se CRUZA con los días de la semana (decisión 8)', async () => {
    const escenario = await montarEscenario('VigenciaCruce');

    // Días de la semana que NO incluyen hoy, dentro de un rango que sí lo
    // incluye: la vigencia se cumple y el día no, así que no se puede registrar.
    const hoy = new Date().getDay();
    const otrosDias = [0, 1, 2, 3, 4, 5, 6].filter((dia) => dia !== hoy);

    const actividad = await escenario.org.api.postOk<{ id: string }>(
      `/activity/grupos/${escenario.org.grupoId}/actividades`,
      {
        nombre: 'Los otros días, durante la campaña',
        tipoPuntaje: 'OPCIONAL',
        valorPuntos: 5,
        tipoLimiteTiempo: 'SIN_LIMITE',
        diasSemana: otrosDias,
        vigenteDesde: fechaRelativa(-3),
        vigenteHasta: fechaRelativa(3),
      }
    );

    const intento = await escenario.ana.api.post(
      `/activity/actividades/${actividad.id}/completar`,
      {}
    );

    expect(intento.status()).toBe(409);
    // Dentro de la vigencia el motivo es el DÍA, no la fecha: son dos códigos
    // distintos porque son dos mensajes distintos para el integrante.
    expect((await intento.json()).code).toBe('ACTIVIDAD_NO_DISPONIBLE_HOY');
  });

  test('rechaza un rango invertido y una fecha que no existe', async () => {
    const escenario = await montarEscenario('VigenciaInvalida');

    const invertido = await escenario.org.api.post(
      `/activity/grupos/${escenario.org.grupoId}/actividades`,
      {
        nombre: 'Rango al revés',
        tipoPuntaje: 'OPCIONAL',
        valorPuntos: 5,
        tipoLimiteTiempo: 'SIN_LIMITE',
        vigenteDesde: '2026-12-25',
        vigenteHasta: '2026-12-24',
      }
    );

    expect(invertido.status()).toBe(400);
    expect((await invertido.json()).code).toBe('VIGENCIA_INVALIDA');

    const inexistente = await escenario.org.api.post(
      `/activity/grupos/${escenario.org.grupoId}/actividades`,
      {
        nombre: 'Treinta de febrero',
        tipoPuntaje: 'OPCIONAL',
        valorPuntos: 5,
        tipoLimiteTiempo: 'SIN_LIMITE',
        vigenteHasta: '2026-02-30',
      }
    );

    expect(inexistente.status()).toBe(400);
    expect((await inexistente.json()).code).toBe('VIGENCIA_INVALIDA');
  });
});
