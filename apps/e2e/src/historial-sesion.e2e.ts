import { expect, test } from '@playwright/test';

import { Api } from './support/api';
import { consultar } from './support/db';
import {
  ESCENARIO,
  Organizacion,
  configurarGrupoManual,
  crearCatalogo,
  crearOrganizacion,
  iniciarSeccion,
  invitarYCanjearUsuario,
} from './support/escenario';

/**
 * Fase 14 · Ítem 18 — Historial de la sesión (`fase-14-18-historial-de-la-sesion.md`).
 *
 * Lo que SOLO se puede verificar contra el stack real y no contra el fake de
 * Vitest: que las tres tablas se unan de verdad en una consulta a Postgres, que
 * el cursor `(createdAt, id)` pagine sin repetir con filas del mismo instante,
 * y que las notas internas **nunca** aparezcan en la app del integrante.
 *
 * API-first sobre el Gateway, como el resto de la suite: la pestaña «Qué pasó
 * hoy» pinta exactamente lo que devuelve `GET .../historial`, así que verificar
 * ese contrato es verificar la pantalla.
 *
 * Tres escenarios, no seis: cada montaje cuesta ~10 requests contra un Gateway
 * que limita a 100/min por IP, así que los casos que comparten setup viajan
 * juntos (mismo criterio que la suite del ítem 17).
 */
interface EventoHistorial {
  id: string;
  tipo: 'ACTIVIDAD_COMPLETADA' | 'ACTIVIDAD_NO_HIZO' | 'CONDUCTA' | 'TAREA_EQUIPO';
  ocurridoEn: string;
  usuarioId: string | null;
  usuarioNombre: string | null;
  equipoNombre: string | null;
  itemNombre: string;
  puntos: number;
  bonoJefe: number | null;
  cantidadMiembros: number | null;
  registradoPorTipo: 'TUTOR' | 'USUARIO' | 'SYSTEM';
  registradoPorNombre: string;
  anulado: boolean;
  anuladoPorNombre: string | null;
  motivoTutor: string | null;
  notas: Array<{ id: string; texto: string; autorNombre: string; esPropia: boolean }>;
}

interface Historial {
  sesionId: string | null;
  sesionEstado: 'ABIERTA' | 'CERRADA' | null;
  timezoneGrupo: string;
  eventos: EventoHistorial[];
  cursorSiguiente: string | null;
}

interface Escenario {
  org: Organizacion;
  usuario: { api: Api; usuarioId: string };
  opcionalId: string;
  obligatoriaId: string;
  conductaBuenaId: string;
  conductaMalaId: string;
}

async function montarEscenario(etiqueta: string, repeticiones = 1): Promise<Escenario> {
  const base = await Api.crear();
  const org = await crearOrganizacion(base, etiqueta);

  await configurarGrupoManual(org);

  const catalogo = await crearCatalogo(org);

  // Para el test de paginación hace falta poder completar la misma varias veces.
  if (repeticiones > 1) {
    await org.api.patchOk(`/activity/actividades/${catalogo.actividadOpcionalId}`, {
      repeticionesMaximasSesion: repeticiones,
    });
  }

  const usuario = await invitarYCanjearUsuario(base, org);
  await iniciarSeccion(org);

  return {
    org,
    usuario,
    opcionalId: catalogo.actividadOpcionalId,
    obligatoriaId: catalogo.actividadObligatoriaId,
    conductaBuenaId: catalogo.conductaBuenaId,
    conductaMalaId: catalogo.conductaMalaId,
  };
}

async function leerHistorial(escenario: Escenario, query = ''): Promise<Historial> {
  return await escenario.org.api.getOk<Historial>(
    `/activity/grupos/${escenario.org.grupoId}/historial${query}`
  );
}

test.describe('Fase 14 · Ítem 18 — historial de la sesión', () => {
  test('une actividades y conductas en un timeline con nombres resueltos, y filtra', async () => {
    test.slow();

    const escenario = await montarEscenario('HistTimeline');

    // El integrante completa la opcional; el tutor le marca la obligatoria y le
    // registra las dos conductas. Cuatro filas de dos tablas distintas.
    await escenario.usuario.api.postOk(`/activity/actividades/${escenario.opcionalId}/completar`, {});
    await escenario.org.api.postOk(`/activity/actividades/${escenario.obligatoriaId}/no-hizo`, {
      usuarioId: escenario.usuario.usuarioId,
      motivo: 'No la hizo en todo el día',
    });
    await escenario.org.api.postOk(`/activity/conductas/${escenario.conductaBuenaId}/registrar`, {
      usuarioId: escenario.usuario.usuarioId,
    });
    await escenario.org.api.postOk(`/activity/conductas/${escenario.conductaMalaId}/registrar`, {
      usuarioId: escenario.usuario.usuarioId,
    });

    const historial = await leerHistorial(escenario);

    expect(historial.sesionEstado).toBe('ABIERTA');
    expect(historial.timezoneGrupo).toBe('America/Argentina/Buenos_Aires');
    expect(historial.eventos, 'las 4 filas de las dos tablas, juntas').toHaveLength(4);

    // Orden: más reciente primero (la conducta mala fue lo último que se cargó).
    const tipos = historial.eventos.map((evento) => evento.tipo);
    expect(tipos[0]).toBe('CONDUCTA');
    expect(tipos.at(-1)).toBe('ACTIVIDAD_COMPLETADA');

    // Nombres resueltos por REST interno: nunca un uuid crudo.
    for (const evento of historial.eventos) {
      expect(evento.usuarioNombre).toBe('Usuario de Prueba');
      expect(evento.registradoPorNombre).not.toMatch(/^[0-9a-f-]{36}$/);
      expect(evento.itemNombre.length).toBeGreaterThan(0);
    }

    const completada = historial.eventos.find((e) => e.tipo === 'ACTIVIDAD_COMPLETADA');
    expect(completada).toMatchObject({
      puntos: ESCENARIO.actividadOpcional.valorPuntos,
      registradoPorTipo: 'USUARIO',
      registradoPorNombre: 'Usuario de Prueba',
    });

    const noHizo = historial.eventos.find((e) => e.tipo === 'ACTIVIDAD_NO_HIZO');
    expect(noHizo).toMatchObject({
      puntos: -ESCENARIO.actividadObligatoria.valorPuntos,
      registradoPorTipo: 'TUTOR',
      motivoTutor: 'No la hizo en todo el día',
    });

    // Filtro por tipo de registro.
    const soloConductas = await leerHistorial(escenario, '?tipo=CONDUCTA');
    expect(soloConductas.eventos).toHaveLength(2);
    expect(soloConductas.eventos.every((e) => e.tipo === 'CONDUCTA')).toBe(true);

    // Filtro por participante: el único que hay.
    const delUsuario = await leerHistorial(
      escenario,
      `?usuarioId=${escenario.usuario.usuarioId}`
    );
    expect(delUsuario.eventos).toHaveLength(4);
  });

  test('la tarea de equipo entra al timeline y el filtro por participante la encuentra por snapshot', async () => {
    test.slow();

    // El filtro de tareas de equipo por participante es la ÚNICA consulta del
    // ítem que el fake de Vitest no puede validar de verdad: usa
    // `array_contains` sobre el jsonb `miembrosSnapshot` (el `@>` de Postgres).
    // Por eso este escenario existe y por eso no se puede resolver con un unit.
    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'HistEquipo');

    await configurarGrupoManual(org);

    const tarea = await org.api.postOk<{ id: string }>(
      `/activity/grupos/${org.grupoId}/actividades`,
      {
        nombre: 'Limpiar el patio',
        tipoPuntaje: 'OPCIONAL',
        valorPuntos: 8,
        tipoLimiteTiempo: 'SIN_LIMITE',
        alcance: 'EQUIPO',
        bonoJefePuntos: 3,
      }
    );

    const jefe = await invitarYCanjearUsuario(base, org);
    const miembro = await invitarYCanjearUsuario(base, org);
    const ajeno = await invitarYCanjearUsuario(base, org);

    const equipo = await org.api.postOk<{ id: string; nombre: string }>(
      `/identity/grupos/${org.grupoId}/equipos`,
      { nombre: 'Los Rojos', jefeUsuarioId: jefe.usuarioId, miembrosIds: [miembro.usuarioId] }
    );

    await iniciarSeccion(org);

    // La completa el jefe: una fila de RegistroTareaEquipo con su snapshot.
    await jefe.api.postOk(`/activity/equipos/${equipo.id}/tareas/${tarea.id}/completar`, {});

    const historial = await org.api.getOk<Historial>(
      `/activity/grupos/${org.grupoId}/historial`
    );

    expect(historial.eventos).toHaveLength(1);
    expect(historial.eventos[0]).toMatchObject({
      tipo: 'TAREA_EQUIPO',
      usuarioId: null,
      itemNombre: 'Limpiar el patio',
      puntos: 8,
      registradoPorTipo: 'USUARIO',
      registradoPorNombre: 'Usuario de Prueba',
    });
    // El nombre del equipo sale del interno nuevo de identity (fase-14-18).
    expect(historial.eventos[0].equipoNombre).toBe('Los Rojos');
    expect(historial.eventos[0].bonoJefe).toBe(3);
    expect(historial.eventos[0].cantidadMiembros).toBe(2);

    // El corazón del test: array_contains contra el jsonb real.
    const delMiembro = await org.api.getOk<Historial>(
      `/activity/grupos/${org.grupoId}/historial?usuarioId=${miembro.usuarioId}`
    );
    expect(delMiembro.eventos, 'el miembro del snapshot la ve').toHaveLength(1);

    const delAjeno = await org.api.getOk<Historial>(
      `/activity/grupos/${org.grupoId}/historial?usuarioId=${ajeno.usuarioId}`
    );
    expect(delAjeno.eventos, 'quien no estaba en el equipo, no').toHaveLength(0);
  });

  test('lo anulado se muestra tachado con su rastro, y se esconde solo si se lo piden', async () => {
    test.slow();

    const escenario = await montarEscenario('HistAnulada');

    await escenario.usuario.api.postOk(`/activity/actividades/${escenario.opcionalId}/completar`, {});

    const antes = await leerHistorial(escenario);
    const registroId = antes.eventos[0].id;

    // El tutor la anula con motivo (endpoint del ítem 12, reusado tal cual).
    await escenario.org.api.delete(
      `/activity/registros-actividad/${registroId}?motivo=La%20marc%C3%B3%20de%20m%C3%A1s`
    );

    const conAnulada = await leerHistorial(escenario);
    expect(conAnulada.eventos, 'anular NO borra la fila del historial').toHaveLength(1);
    expect(conAnulada.eventos[0]).toMatchObject({
      id: registroId,
      anulado: true,
      motivoTutor: 'La marcó de más',
    });
    expect(conAnulada.eventos[0].anuladoPorNombre).not.toBeNull();

    // Con el filtro explícito sí desaparece.
    const sinAnuladas = await leerHistorial(escenario, '?incluirAnulados=false');
    expect(sinAnuladas.eventos).toHaveLength(0);

    // Deshacer desde el historial: misma fila, ya sin la marca roja.
    await escenario.org.api.postOk(`/activity/registros-actividad/${registroId}/revertir`, {});

    const revertida = await leerHistorial(escenario);
    expect(revertida.eventos[0]).toMatchObject({ id: registroId, anulado: false });
  });

  test('pagina por cursor sin repetir, y las notas internas nunca llegan al integrante', async () => {
    test.slow();

    const escenario = await montarEscenario('HistCursor', 3);

    // Tres completadas seguidas: en Postgres pueden caer en el mismo
    // milisegundo, que es justo el caso que el desempate por id protege.
    for (let i = 0; i < 3; i++) {
      await escenario.usuario.api.postOk(
        `/activity/actividades/${escenario.opcionalId}/completar`,
        {}
      );
    }

    const primera = await leerHistorial(escenario, '?limite=2');
    expect(primera.eventos).toHaveLength(2);
    expect(primera.cursorSiguiente).not.toBeNull();

    const segunda = await leerHistorial(
      escenario,
      `?limite=2&cursor=${encodeURIComponent(primera.cursorSiguiente as string)}`
    );
    expect(segunda.eventos).toHaveLength(1);
    expect(segunda.cursorSiguiente).toBeNull();

    const ids = [...primera.eventos, ...segunda.eventos].map((evento) => evento.id);
    expect(new Set(ids).size, 'ninguna fila se repite entre páginas').toBe(3);

    // Un cursor corrupto es 400, no un 500 ni una lista vacía silenciosa.
    const resCursor = await escenario.org.api.get(
      `/activity/grupos/${escenario.org.grupoId}/historial?cursor=chirimbolo`
    );
    expect(resCursor.status()).toBe(400);

    // --- Notas internas ---
    const registroId = primera.eventos[0].id;
    const nota = await escenario.org.api.postOk<{ id: string; esPropia: boolean }>(
      `/activity/historial/ACTIVIDAD/${registroId}/notas`,
      { texto: 'Lo hablamos con el otro tutor' }
    );

    expect(nota.esPropia).toBe(true);

    const conNota = await leerHistorial(escenario, '?limite=2');
    const anotado = conNota.eventos.find((evento) => evento.id === registroId);
    expect(anotado?.notas).toHaveLength(1);
    expect(anotado?.notas[0]).toMatchObject({
      texto: 'Lo hablamos con el otro tutor',
      esPropia: true,
    });

    // LA garantía del ítem: la app del integrante no ve nada de esto.
    const estadoHoy = await escenario.usuario.api.getOk<unknown>(
      `/activity/grupos/${escenario.org.grupoId}/mi-estado-hoy`
    );
    expect(
      JSON.stringify(estadoHoy),
      'una nota interna NUNCA viaja a la app del integrante'
    ).not.toContain('Lo hablamos');

    // Y el integrante tampoco puede pedir el historial: es del tutor.
    const resIntegrante = await escenario.usuario.api.get(
      `/activity/grupos/${escenario.org.grupoId}/historial`
    );
    expect(resIntegrante.status()).toBe(403);

    // Borrado físico: la nota no es ledger (spec, Parte A).
    const resBorrar = await escenario.org.api.delete(`/activity/notas/${nota.id}`);
    expect(resBorrar.status()).toBe(204);

    const filas = await consultar<{ n: string }>(
      'activity_db',
      'SELECT count(*)::text AS n FROM "NotaRegistro" WHERE id = $1',
      [nota.id]
    );
    expect(filas[0].n).toBe('0');
  });
});
