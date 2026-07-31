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
 * Fase 14 · Ítem 19 — Roles del participante dentro del Grupo
 * (`fase-14-19-roles-del-participante.md`).
 *
 * Lo que solo el stack real puede verificar:
 *
 * 1. Que la restricción **se aplique en todos los caminos a la vez** — lista,
 *    registro y plan del día son tres services distintos resolviendo el mismo
 *    rol contra identity por REST interno. Un mock no prueba que la llamada
 *    interna exista de verdad.
 * 2. Que **el castigo automático al cerrar la sesión respete el rol**. Es el
 *    punto que no se ve en ninguna pantalla: si falla, el integrante equivocado
 *    termina el día con puntos negativos. Se comprueba con el ledger, que es
 *    donde el error sería visible.
 */
const CASTIGO = 10;

interface Escenario {
  org: Organizacion;
  ana: { api: Api; usuarioId: string };
  luis: { api: Api; usuarioId: string };
  rolCocinaId: string;
  seccionId: string;
  sesionId: string;
}

/** Grupo con dos integrantes: Ana con rol «Cocina», Luis sin rol. */
async function montarEscenario(etiqueta: string): Promise<Escenario> {
  const base = await Api.crear();
  const org = await crearOrganizacion(base, etiqueta);

  await configurarGrupoManual(org);

  const rolCocina = await org.api.postOk<{ id: string; nombre: string; colorHex: string }>(
    `/identity/grupos/${org.grupoId}/roles`,
    { nombre: 'Cocina', colorHex: '#22C55E' }
  );

  expect(rolCocina.colorHex, 'el color se normaliza a mayúsculas').toBe('#22C55E');

  const ana = await invitarYCanjearUsuario(base, org);
  const luis = await invitarYCanjearUsuario(base, org);

  await org.api.putOk(`/identity/grupos/${org.grupoId}/usuarios/${ana.usuarioId}/rol`, {
    rolGrupoId: rolCocina.id,
  });

  const seccion = await iniciarSeccion(org);

  return {
    org,
    ana,
    luis,
    rolCocinaId: rolCocina.id,
    seccionId: seccion.seccionId,
    sesionId: seccion.sesionId,
  };
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

interface ItemEstadoHoy {
  actividadId: string;
}

async function actividadesVisiblesPara(
  escenario: Escenario,
  actor: { api: Api }
): Promise<string[]> {
  const estado = await actor.api.getOk<{ actividades: ItemEstadoHoy[] }>(
    `/activity/grupos/${escenario.org.grupoId}/mi-estado-hoy`
  );

  return estado.actividades.map((item) => item.actividadId);
}

test.describe('Fase 14 · Ítem 19 — roles del participante', () => {
  test('la actividad restringida solo existe para quien tiene el rol', async () => {
    test.slow();

    const escenario = await montarEscenario('Roles');

    const libre = await escenario.org.api.postOk<{ id: string }>(
      `/activity/grupos/${escenario.org.grupoId}/actividades`,
      {
        nombre: 'Leer 20 minutos',
        tipoPuntaje: 'OPCIONAL',
        valorPuntos: 10,
        tipoLimiteTiempo: 'SIN_LIMITE',
      }
    );

    const deCocina = await escenario.org.api.postOk<{ id: string; rolesPermitidos: string[] }>(
      `/activity/grupos/${escenario.org.grupoId}/actividades`,
      {
        nombre: 'Lavar los platos',
        tipoPuntaje: 'OPCIONAL',
        valorPuntos: 5,
        tipoLimiteTiempo: 'SIN_LIMITE',
        rolesPermitidos: [escenario.rolCocinaId],
      }
    );

    expect(deCocina.rolesPermitidos).toEqual([escenario.rolCocinaId]);

    // 1. La lista: Ana ve las dos, Luis (sin rol) solo la libre.
    expect(await actividadesVisiblesPara(escenario, escenario.ana)).toEqual(
      expect.arrayContaining([libre.id, deCocina.id])
    );

    const visiblesLuis = await actividadesVisiblesPara(escenario, escenario.luis);

    expect(visiblesLuis).toContain(libre.id);
    expect(visiblesLuis, 'la restringida NO aparece para quien no tiene el rol').not.toContain(
      deCocina.id
    );

    // 2. El catálogo del Tutor las muestra todas: necesita gestionarlas.
    const catalogoTutor = await escenario.org.api.getOk<Array<{ id: string }>>(
      `/activity/grupos/${escenario.org.grupoId}/actividades`
    );

    expect(catalogoTutor.map((a) => a.id)).toEqual(
      expect.arrayContaining([libre.id, deCocina.id])
    );

    // 3. El registro: la pantalla ya no la ofrece, pero el servidor es el que
    //    decide — un cliente con la lista vieja en caché no la puede colar.
    const intentoLuis = await escenario.luis.api.post(
      `/activity/actividades/${deCocina.id}/completar`,
      {}
    );

    expect(intentoLuis.status()).toBe(403);
    expect((await intentoLuis.json()).code).toBe('ACTIVIDAD_NO_ES_DE_TU_ROL');

    // 4. Y Ana la completa sin problema.
    await escenario.ana.api.postOk(`/activity/actividades/${deCocina.id}/completar`, {});
    await esperarPuntaje(escenario, escenario.ana.usuarioId, 5);
    await esperarPuntaje(escenario, escenario.luis.usuarioId, 0);
  });

  test('el castigo al cerrar la sesión solo alcanza a quien tiene el rol', async () => {
    test.slow();

    // EL test del ítem: una obligatoria de cocina no puede restar puntos a quien
    // nunca tuvo ese rol. Sin el filtro en el consumidor de SesionCerrada, Luis
    // terminaría en −10 sin que ninguna pantalla lo hubiera avisado.
    const escenario = await montarEscenario('RolesCierre');

    await escenario.org.api.postOk(`/activity/grupos/${escenario.org.grupoId}/actividades`, {
      nombre: 'Dejar la cocina limpia',
      tipoPuntaje: 'OBLIGATORIA',
      valorPuntos: CASTIGO,
      comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
      tipoLimiteTiempo: 'SIN_LIMITE',
      rolesPermitidos: [escenario.rolCocinaId],
    });

    // Nadie confirma nada y se fuerza el cierre de la sesión: es el evento
    // `SesionCerrada` el que dispara el castigo automático del ítem 8.
    await escenario.org.api.postOk(
      `/session/secciones/${escenario.seccionId}/sesiones/${escenario.sesionId}/forzar-cierre`,
      {}
    );

    await esperarPuntaje(escenario, escenario.ana.usuarioId, -CASTIGO);

    // Luis queda intacto. Se comprueba con poll para no leer "0" simplemente
    // porque el evento todavía no llegó: si el castigo indebido va a aparecer,
    // aparece en el mismo lapso en que aparece el de Ana (ya esperado arriba).
    await esperarPuntaje(escenario, escenario.luis.usuarioId, 0);
  });

  test('archivar el rol lo desasigna y esconde sus actividades', async () => {
    test.slow();

    const escenario = await montarEscenario('RolesArchivo');

    const deCocina = await escenario.org.api.postOk<{ id: string }>(
      `/activity/grupos/${escenario.org.grupoId}/actividades`,
      {
        nombre: 'Lavar los platos',
        tipoPuntaje: 'OPCIONAL',
        valorPuntos: 5,
        tipoLimiteTiempo: 'SIN_LIMITE',
        rolesPermitidos: [escenario.rolCocinaId],
      }
    );

    expect(await actividadesVisiblesPara(escenario, escenario.ana)).toContain(deCocina.id);

    const conAsignados = await escenario.org.api.getOk<
      Array<{ id: string; cantidadAsignados: number }>
    >(`/identity/grupos/${escenario.org.grupoId}/roles`);

    expect(conAsignados.find((rol) => rol.id === escenario.rolCocinaId)?.cantidadAsignados).toBe(
      1
    );

    // Archivar desasigna a Ana (decisión 12): la actividad queda pedida por un
    // rol que ya no tiene nadie, así que deja de verse para TODO el grupo. El
    // Tutor la sigue viendo en su catálogo — por eso su pantalla lo avisa.
    await escenario.org.api.patchOk(`/identity/roles/${escenario.rolCocinaId}`, {
      estado: 'INACTIVO',
    });

    expect(await actividadesVisiblesPara(escenario, escenario.ana)).not.toContain(deCocina.id);

    const activos = await escenario.org.api.getOk<Array<{ id: string }>>(
      `/identity/grupos/${escenario.org.grupoId}/roles`
    );

    expect(activos.map((rol) => rol.id)).not.toContain(escenario.rolCocinaId);

    // Y no se puede volver a asignar un rol archivado.
    const reasignar = await escenario.org.api.put(
      `/identity/grupos/${escenario.org.grupoId}/usuarios/${escenario.ana.usuarioId}/rol`,
      { rolGrupoId: escenario.rolCocinaId }
    );

    expect(reasignar.status()).toBe(400);
    expect((await reasignar.json()).code).toBe('ROL_GRUPO_INEXISTENTE');
  });

  test('el catálogo de roles es por grupo y no cruza organizaciones', async () => {
    test.slow();

    const escenario = await montarEscenario('RolesAislado');
    const otra = await montarEscenario('RolesVecina');

    // Un rol de OTRA organización no se puede asignar acá: el service lo busca
    // filtrando por grupoId, así que ni siquiera existe desde este lado.
    const cruzado = await escenario.org.api.put(
      `/identity/grupos/${escenario.org.grupoId}/usuarios/${escenario.ana.usuarioId}/rol`,
      { rolGrupoId: otra.rolCocinaId }
    );

    expect(cruzado.status()).toBe(400);
    expect((await cruzado.json()).code).toBe('ROL_GRUPO_INEXISTENTE');

    // Y una actividad tampoco se puede restringir a un rol ajeno.
    const actividadCruzada = await escenario.org.api.post(
      `/activity/grupos/${escenario.org.grupoId}/actividades`,
      {
        nombre: 'Actividad con rol ajeno',
        tipoPuntaje: 'OPCIONAL',
        valorPuntos: 5,
        tipoLimiteTiempo: 'SIN_LIMITE',
        rolesPermitidos: [otra.rolCocinaId],
      }
    );

    expect(actividadCruzada.status()).toBe(400);
    expect((await actividadCruzada.json()).code).toBe('ROL_GRUPO_INEXISTENTE');

    // El nombre duplicado se rechaza normalizado ("cocina" vs "Cocina").
    const duplicado = await escenario.org.api.post(
      `/identity/grupos/${escenario.org.grupoId}/roles`,
      { nombre: ' cocina ', colorHex: '#EF4444' }
    );

    expect(duplicado.status()).toBe(409);
    expect((await duplicado.json()).code).toBe('ROL_GRUPO_DUPLICADO');

    // Pero el MISMO nombre en el otro grupo es perfectamente válido: el
    // catálogo es por grupo, no por organización (decisión 1).
    const enOtroGrupo = await otra.org.api.post(`/identity/grupos/${otra.org.grupoId}/roles`, {
      nombre: 'Limpieza',
      colorHex: '#3B82F6',
    });

    expect(enOtroGrupo.status()).toBe(201);
  });
});
