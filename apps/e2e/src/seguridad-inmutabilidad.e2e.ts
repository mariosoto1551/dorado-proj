import { expect, test } from '@playwright/test';

import { Api } from './support/api';
import { consultar, consultarUna } from './support/db';
import {
  Organizacion,
  configurarGrupoManual,
  crearOrganizacion,
  crearUmbrales,
  iniciarSeccion,
  poll,
} from './support/escenario';

/**
 * Fase 12 · Punto 3 — TEST DE SEGURIDAD: puntaje inmutable y Secciones cerradas.
 *
 * Verifica las reglas 1 y 6 de CLAUDE.md contra el ledger real de scoring
 * (consulta SQL directa a `scoring_db` para no confiar solo en lo que devuelve
 * la API): editar el catálogo no reescribe asientos pasados; las correcciones
 * son filas nuevas con `corregidoDeId`; el snapshot histórico no se toca; y no
 * se registra contra una Sesión que no está ABIERTA.
 */
interface FilaEventoPuntos {
  id: string;
  puntosSnapshot: number;
  tipoOrigen: string;
  corregidoDeId: string | null;
}

test.describe('Seguridad · inmutabilidad del ledger y Secciones cerradas', () => {
  test('editar valorPuntos NO altera los EventoPuntos ya registrados', async () => {
    test.slow();

    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'Inmut');
    await configurarGrupoManual(org);
    await crearUmbrales(org);

    const actividad = await org.api.postOk<{ id: string }>(
      `/activity/grupos/${org.grupoId}/actividades`,
      { nombre: 'Opcional 10', tipoPuntaje: 'OPCIONAL', valorPuntos: 10, tipoLimiteTiempo: 'SIN_LIMITE', repeticionesMaximasSesion: 1 }
    );
    const usuario = await crearUsuario(base, org);
    const seccion = await iniciarSeccion(org);

    await org.api.postOk(`/activity/actividades/${actividad.id}/completar`, {
      usuarioId: usuario.usuarioId,
    });

    // Esperar la proyección al ledger: un asiento de +10.
    const asientoOriginal = await poll<FilaEventoPuntos>(
      () => leerAsiento(usuario.usuarioId, seccion.seccionId, 'ACTIVIDAD_COMPLETADA'),
      'asiento +10 proyectado'
    );
    expect(asientoOriginal.puntosSnapshot).toBe(10);

    // Editar el catálogo: la Actividad ahora vale 999.
    await org.api.patchOk(`/activity/actividades/${actividad.id}`, { valorPuntos: 999 });

    // El asiento ya escrito sigue valiendo 10 (snapshot con signo, regla 1).
    const asientoTrasEdicion = await consultarUna<FilaEventoPuntos>(
      'scoring_db',
      'SELECT "id", "puntosSnapshot", "tipoOrigen", "corregidoDeId" FROM "EventoPuntos" WHERE "id" = $1',
      [asientoOriginal.id]
    );
    expect(asientoTrasEdicion?.puntosSnapshot, 'el asiento pasado no puede cambiar').toBe(10);

    // Y la lectura por API tampoco cambia.
    const puntaje = await org.api.getOk<{ puntajeTotal: number }>(
      `/scoring/usuarios/${usuario.usuarioId}/secciones/${seccion.seccionId}/puntaje`
    );
    expect(puntaje.puntajeTotal).toBe(10);
  });

  test('corrección post-cierre: fila nueva con corregidoDeId, ResultadoSeccion intacto', async () => {
    test.slow();

    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'Correc');
    await configurarGrupoManual(org);
    await crearUmbrales(org);

    const actividad = await org.api.postOk<{ id: string }>(
      `/activity/grupos/${org.grupoId}/actividades`,
      { nombre: 'Opcional 10', tipoPuntaje: 'OPCIONAL', valorPuntos: 10, tipoLimiteTiempo: 'SIN_LIMITE', repeticionesMaximasSesion: 1 }
    );
    const usuario = await crearUsuario(base, org);
    const seccion = await iniciarSeccion(org);

    await org.api.postOk(`/activity/actividades/${actividad.id}/completar`, {
      usuarioId: usuario.usuarioId,
    });
    const original = await poll<FilaEventoPuntos>(
      () => leerAsiento(usuario.usuarioId, seccion.seccionId, 'ACTIVIDAD_COMPLETADA'),
      'asiento original'
    );

    // Evaluar y cerrar: se escribe el snapshot ResultadoSeccion = 10.
    await org.api.postOk(`/session/secciones/${seccion.seccionId}/forzar-evaluacion`, {});
    await poll(async () => {
      const resultado = await leerResultadoSeccion(usuario.usuarioId, seccion.seccionId);
      expect(resultado?.puntajeTotal).toBe(10);
    }, 'ResultadoSeccion=10');
    await org.api.postOk(`/session/secciones/${seccion.seccionId}/cerrar`, {});

    // Corrección sobre la Sección CERRADA: +5.
    const correccion = await org.api.postOk<{ id: string; corregidoDeId: string | null }>(
      `/scoring/eventos-puntos/${original.id}/corregir`,
      { motivo: 'Ajuste de prueba E2E', puntosAjuste: 5 }
    );

    // Es una fila NUEVA con corregidoDeId apuntando a la original.
    expect(correccion.id).not.toBe(original.id);
    expect(correccion.corregidoDeId).toBe(original.id);

    const filas = await consultar<FilaEventoPuntos>(
      'scoring_db',
      'SELECT "id", "puntosSnapshot", "tipoOrigen", "corregidoDeId" FROM "EventoPuntos" WHERE "seccionId" = $1 AND "usuarioId" = $2 ORDER BY "createdAt" ASC',
      [seccion.seccionId, usuario.usuarioId]
    );
    expect(filas.length, 'la corrección agrega una fila, no reemplaza').toBe(2);
    const nueva = filas.find((f) => f.corregidoDeId === original.id);
    expect(nueva?.puntosSnapshot).toBe(5);
    expect(nueva?.tipoOrigen).toBe('CORRECCION');

    // La original quedó idéntica.
    const originalTrasCorreccion = filas.find((f) => f.id === original.id);
    expect(originalTrasCorreccion?.puntosSnapshot).toBe(10);
    expect(originalTrasCorreccion?.corregidoDeId).toBeNull();

    // El snapshot histórico NO se movió (sigue 10 aunque el ledger vivo sea 15).
    const resultado = await leerResultadoSeccion(usuario.usuarioId, seccion.seccionId);
    expect(resultado?.puntajeTotal, 'ResultadoSeccion es inmutable').toBe(10);
  });

  test('no existe endpoint que haga UPDATE/DELETE de un EventoPuntos', async () => {
    // Revisión de código (documentada en docs/progreso/fase-12): el único
    // controller sobre /scoring/eventos-puntos es POST :id/corregir (append).
    // Acá lo confirmamos por comportamiento: PUT/PATCH/DELETE no existen como
    // ruta → el stack responde 404 (nunca 200), sin tocar el ledger.
    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'NoMut');
    const fakeId = '00000000-0000-4000-8000-000000000000';

    const del = await org.api.delete(`/scoring/eventos-puntos/${fakeId}`);
    expect(del.status(), 'DELETE de EventoPuntos no debe existir').toBe(404);

    const put = await org.api.put(`/scoring/eventos-puntos/${fakeId}`, { puntosSnapshot: 1 });
    expect(put.status(), 'PUT de EventoPuntos no debe existir').toBe(404);
  });

  test('no se puede registrar actividad contra una Sesión que no está ABIERTA', async () => {
    test.slow();

    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'Cerrada');
    await configurarGrupoManual(org);
    await crearUmbrales(org);

    const actividad = await org.api.postOk<{ id: string }>(
      `/activity/grupos/${org.grupoId}/actividades`,
      { nombre: 'Opcional', tipoPuntaje: 'OPCIONAL', valorPuntos: 10, tipoLimiteTiempo: 'SIN_LIMITE', repeticionesMaximasSesion: 5 }
    );
    const usuario = await crearUsuario(base, org);
    const seccion = await iniciarSeccion(org);

    // Cerrar la sección: su sesión pasa a CERRADA.
    await org.api.postOk(`/session/secciones/${seccion.seccionId}/forzar-evaluacion`, {});
    await org.api.postOk(`/session/secciones/${seccion.seccionId}/cerrar`, {});

    const res = await org.api.post(`/activity/actividades/${actividad.id}/completar`, {
      usuarioId: usuario.usuarioId,
    });
    expect(res.status(), 'registrar sin sesión ABIERTA debe fallar (409)').toBe(409);
  });
});

/** Lee un asiento del ledger; lanza si todavía no llegó (para usar con poll). */
async function leerAsiento(
  usuarioId: string,
  seccionId: string,
  tipoOrigen: string
): Promise<FilaEventoPuntos> {
  const fila = await consultarUna<FilaEventoPuntos>(
    'scoring_db',
    'SELECT "id", "puntosSnapshot", "tipoOrigen", "corregidoDeId" FROM "EventoPuntos" WHERE "usuarioId" = $1 AND "seccionId" = $2 AND "tipoOrigen" = $3',
    [usuarioId, seccionId, tipoOrigen]
  );

  if (!fila) {
    throw new Error(`Asiento ${tipoOrigen} aún no proyectado`);
  }

  return fila;
}

async function leerResultadoSeccion(
  usuarioId: string,
  seccionId: string
): Promise<{ puntajeTotal: number; nombreZona: string | null } | null> {
  return await consultarUna(
    'scoring_db',
    'SELECT "puntajeTotal", "nombreZona" FROM "ResultadoSeccion" WHERE "usuarioId" = $1 AND "seccionId" = $2',
    [usuarioId, seccionId]
  );
}

/** Invita y canjea un USUARIO nuevo (helper local, distinto perfil por test). */
async function crearUsuario(
  base: Api,
  org: Organizacion
): Promise<{ api: Api; usuarioId: string }> {
  const invitacion = await org.api.postOk<{ codigo: string }>(
    `/identity/grupos/${org.grupoId}/invitaciones`,
    { tipoInvitado: 'USUARIO' }
  );
  const username = `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const canje = await base.postOk<{ accessToken: string; perfil: { id: string } }>(
    `/auth/invitaciones/${invitacion.codigo}/canjear`,
    { nombre: 'Usuario de Prueba', password: 'contrasena-usuario-123', username }
  );

  return { api: base.conToken(canje.accessToken), usuarioId: canje.perfil.id };
}
