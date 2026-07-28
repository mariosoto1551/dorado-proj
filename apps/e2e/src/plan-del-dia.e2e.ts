import { expect, test } from '@playwright/test';

import { Api } from './support/api';
import { consultar } from './support/db';
import {
  Organizacion,
  configurarGrupoManual,
  crearOrganizacion,
  iniciarSeccion,
  invitarYCanjearUsuario,
} from './support/escenario';

/**
 * Fase 14 · Ítem 17 — El plan del día (spec `fase-14-17-plan-del-dia.md`).
 *
 * Verifica contra el stack real las dos mitades del ítem: que con el modo
 * APAGADO nada cambie (la garantía de retro-compatibilidad, que es el riesgo
 * principal del ítem) y que con el modo ACTIVO la lista se arme por selección.
 *
 * API-first sobre el Gateway como el resto de la suite: lo que la home pinta
 * sale entero de `mi-estado-hoy` (`requiereSeleccion` + `enPlan`), así que
 * verificar ese contrato es verificar la pantalla. El único chequeo por SQL es
 * el de la decisión 8 de la spec: `SeleccionPlanDia` **no** es ledger y sus
 * filas se borran de verdad al sacar algo del plan.
 *
 * **Cuatro escenarios, no siete**: cada `montarEscenario` cuesta ~10 requests
 * contra un Gateway que limita a 100/min por IP, así que los casos que comparten
 * setup viajan juntos en un test. Sin umbrales de zona a propósito: acá no se
 * asserta ni un punto, y eran 4 POST por escenario tirados a la basura.
 */
interface ItemEstadoHoy {
  actividadId: string;
  requiereSeleccion: boolean;
  enPlan: boolean;
  vecesHechas: number;
}

interface EstadoHoy {
  sesionId: string | null;
  planDelDiaActivo: boolean;
  actividades: ItemEstadoHoy[];
}

interface Escenario {
  org: Organizacion;
  usuario: { api: Api; usuarioId: string };
  seccionId: string;
  opcionalId: string;
  otraOpcionalId: string;
  obligatoriaId: string;
  fijaId: string;
}

/**
 * Org + grupo + sección abierta + un catálogo con las 4 familias del ítem
 * (opcional del tutor, otra opcional, obligatoria y opcional `siempreVisible`).
 */
async function montarEscenario(etiqueta: string, sesionesPorSeccion = 1): Promise<Escenario> {
  const base = await Api.crear();
  const org = await crearOrganizacion(base, etiqueta);

  if (sesionesPorSeccion === 1) {
    await configurarGrupoManual(org);
  } else {
    // El caso del "día siguiente" necesita poder abrir una Sesión más.
    await org.api.putOk(`/session/grupos/${org.grupoId}/configuracion`, {
      modo: 'MANUAL',
      sesionesPorSeccion,
      evaluarUmbralesEn: 'SOLO_AL_CIERRE_SECCION',
    });
  }

  const opcional = await crearActividad(org, {
    nombre: 'Leer 20 minutos',
    tipoPuntaje: 'OPCIONAL',
    valorPuntos: 10,
  });
  const otraOpcional = await crearActividad(org, {
    nombre: 'Ordenar el escritorio',
    tipoPuntaje: 'OPCIONAL',
    valorPuntos: 4,
  });
  const obligatoria = await crearActividad(org, {
    nombre: 'Tender la cama',
    tipoPuntaje: 'OBLIGATORIA',
    valorPuntos: 5,
  });
  // fase-14-17: la que el Tutor fija — se ve sin elegirla.
  const fija = await crearActividad(org, {
    nombre: 'Tomar agua',
    tipoPuntaje: 'OPCIONAL',
    valorPuntos: 2,
    siempreVisible: true,
  });

  const usuario = await invitarYCanjearUsuario(base, org);
  const seccion = await iniciarSeccion(org);

  return {
    org,
    usuario,
    seccionId: seccion.seccionId,
    opcionalId: opcional.id,
    otraOpcionalId: otraOpcional.id,
    obligatoriaId: obligatoria.id,
    fijaId: fija.id,
  };
}

async function crearActividad(
  org: Organizacion,
  datos: Record<string, unknown>
): Promise<{ id: string; siempreVisible: boolean }> {
  return await org.api.postOk<{ id: string; siempreVisible: boolean }>(
    `/activity/grupos/${org.grupoId}/actividades`,
    { tipoLimiteTiempo: 'SIN_LIMITE', repeticionesMaximasSesion: 1, ...datos }
  );
}

async function encenderPlanDelDia(org: Organizacion, activo: boolean): Promise<void> {
  await org.api.putOk(`/activity/grupos/${org.grupoId}/configuracion-contenido`, {
    planDelDiaActivo: activo,
  });
}

async function leerEstado(escenario: Escenario): Promise<EstadoHoy> {
  return await escenario.usuario.api.getOk<EstadoHoy>(
    `/activity/grupos/${escenario.org.grupoId}/mi-estado-hoy`
  );
}

async function estadoPorActividad(escenario: Escenario): Promise<Map<string, ItemEstadoHoy>> {
  const estado = await leerEstado(escenario);

  return new Map(estado.actividades.map((item) => [item.actividadId, item]));
}

test.describe('Fase 14 · Ítem 17 — plan del día', () => {
  test('el interruptor del Grupo: apagado no cambia nada, encendido esconde, apagar no borra el plan', async () => {
    test.slow();

    const escenario = await montarEscenario('PlanToggle');
    const rutaPlan = `/activity/grupos/${escenario.org.grupoId}/plan-dia`;

    // --- Apagado (default de un grupo nuevo): la lista se ve como siempre ---
    const inicial = await leerEstado(escenario);

    expect(inicial.planDelDiaActivo, 'un grupo nuevo NO tiene el plan del día').toBe(false);
    expect(inicial.actividades).toHaveLength(4);
    expect(inicial.actividades.every((item) => !item.requiereSeleccion)).toBe(true);
    // `enPlan` viaja true para todas: es lo que hace que el cliente tenga una
    // regla única y no esconda nada por olvido (decisión 12 de la spec).
    expect(inicial.actividades.every((item) => item.enPlan)).toBe(true);

    const resInactivo = await escenario.usuario.api.post(rutaPlan, {
      actividadId: escenario.opcionalId,
    });
    expect(resInactivo.status()).toBe(400);
    expect((await resInactivo.json()).code).toBe('PLAN_DEL_DIA_INACTIVO');

    // --- Encendido: se esconden las opcionales del tutor y el integrante elige ---
    await encenderPlanDelDia(escenario.org, true);
    await escenario.usuario.api.postOk(rutaPlan, { actividadId: escenario.opcionalId });

    const conPlan = await estadoPorActividad(escenario);
    expect(conPlan.get(escenario.opcionalId)?.enPlan).toBe(true);
    expect(conPlan.get(escenario.otraOpcionalId)?.enPlan).toBe(false);

    // --- Apagarlo devuelve la lista completa, sin borrar lo ya elegido ---
    await encenderPlanDelDia(escenario.org, false);

    const apagado = await estadoPorActividad(escenario);
    expect(apagado.size).toBe(4);
    expect([...apagado.values()].every((item) => item.enPlan && !item.requiereSeleccion)).toBe(
      true
    );

    // Volver a encenderlo el mismo día recupera el plan ya armado.
    await encenderPlanDelDia(escenario.org, true);

    const reencendido = await estadoPorActividad(escenario);
    expect(reencendido.get(escenario.opcionalId)?.enPlan).toBe(true);
    expect(reencendido.get(escenario.otraOpcionalId)?.enPlan).toBe(false);
  });

  test('solo se elige lo que el plan esconde: obligatoria y fija dan 400, elegir es idempotente', async () => {
    test.slow();

    const escenario = await montarEscenario('PlanElegir');
    await encenderPlanDelDia(escenario.org, true);
    const rutaPlan = `/activity/grupos/${escenario.org.grupoId}/plan-dia`;

    const inicial = await estadoPorActividad(escenario);

    // Obligatoria y fija: siempre a la vista, sin elegirlas.
    expect(inicial.get(escenario.obligatoriaId)).toMatchObject({
      requiereSeleccion: false,
      enPlan: true,
    });
    expect(inicial.get(escenario.fijaId)).toMatchObject({
      requiereSeleccion: false,
      enPlan: true,
    });
    // Las dos opcionales del tutor: escondidas hasta que las elija.
    expect(inicial.get(escenario.opcionalId)).toMatchObject({
      requiereSeleccion: true,
      enPlan: false,
    });
    expect(inicial.get(escenario.otraOpcionalId)).toMatchObject({
      requiereSeleccion: true,
      enPlan: false,
    });

    // Ninguna de las dos que siempre se ven se puede meter al plan.
    for (const actividadId of [escenario.obligatoriaId, escenario.fijaId]) {
      const res = await escenario.usuario.api.post(rutaPlan, { actividadId });

      expect(res.status()).toBe(400);
      expect((await res.json()).code).toBe('ACTIVIDAD_NO_ELEGIBLE_PARA_EL_PLAN');
    }

    // El POST devuelve el plan completo ya actualizado, y repetirlo no duplica.
    const plan = await escenario.usuario.api.postOk<{ sesionId: string; actividadIds: string[] }>(
      rutaPlan,
      { actividadId: escenario.opcionalId }
    );
    expect(plan.actividadIds).toEqual([escenario.opcionalId]);

    const repetido = await escenario.usuario.api.postOk<{ actividadIds: string[] }>(rutaPlan, {
      actividadId: escenario.opcionalId,
    });
    expect(repetido.actividadIds).toEqual([escenario.opcionalId]);
  });

  test('se saca lo no empezado (y la fila se borra); completarla la fija en el plan, también si la marca el Tutor', async () => {
    test.slow();

    const escenario = await montarEscenario('PlanQuitar');
    await encenderPlanDelDia(escenario.org, true);
    const rutaPlan = `/activity/grupos/${escenario.org.grupoId}/plan-dia`;

    await escenario.usuario.api.postOk(rutaPlan, { actividadId: escenario.opcionalId });
    await escenario.usuario.api.postOk(rutaPlan, { actividadId: escenario.otraOpcionalId });

    // La que no empezó se saca sin problema.
    const resQuitar = await escenario.usuario.api.delete(`${rutaPlan}/${escenario.otraOpcionalId}`);
    expect(resQuitar.status()).toBe(200);
    expect((await resQuitar.json()).actividadIds).toEqual([escenario.opcionalId]);

    // Decisión 8: NO es ledger — la fila se borra de verdad, no queda marcada.
    const filas = await consultar<{ n: string }>(
      'activity_db',
      'SELECT count(*)::text AS n FROM "SeleccionPlanDia" WHERE "usuarioId" = $1 AND "actividadId" = $2',
      [escenario.usuario.usuarioId, escenario.otraOpcionalId]
    );
    expect(filas[0].n).toBe('0');

    // La otra sí la completa: pasa a ser "empezada" y ya no se puede sacar.
    await escenario.usuario.api.postOk(
      `/activity/actividades/${escenario.opcionalId}/completar`,
      {}
    );

    const resEmpezada = await escenario.usuario.api.delete(`${rutaPlan}/${escenario.opcionalId}`);
    expect(resEmpezada.status()).toBe(409);
    expect((await resEmpezada.json()).code).toBe('ACTIVIDAD_YA_EMPEZADA');

    // El Tutor marca la que el integrante había sacado del plan: el alta
    // automática la devuelve a la lista (decisión 9 — no puede quedar invisible
    // algo que ya le sumó puntos).
    await escenario.org.api.postOk(
      `/activity/actividades/${escenario.otraOpcionalId}/completar`,
      { usuarioId: escenario.usuario.usuarioId }
    );

    const estado = await estadoPorActividad(escenario);
    expect(estado.get(escenario.opcionalId)).toMatchObject({ enPlan: true, vecesHechas: 1 });
    expect(estado.get(escenario.otraOpcionalId)).toMatchObject({ enPlan: true, vecesHechas: 1 });
  });

  test('el plan dura un día: la Sesión siguiente arranca vacía', async () => {
    test.slow();

    const escenario = await montarEscenario('PlanDia2', 2);
    await encenderPlanDelDia(escenario.org, true);

    await escenario.usuario.api.postOk(
      `/activity/grupos/${escenario.org.grupoId}/plan-dia`,
      { actividadId: escenario.opcionalId }
    );
    expect((await estadoPorActividad(escenario)).get(escenario.opcionalId)?.enPlan).toBe(true);

    // `abrir-siguiente` cierra la Sesión abierta y abre la próxima en un paso.
    await escenario.org.api.postOk(
      `/session/secciones/${escenario.seccionId}/sesiones/abrir-siguiente`,
      {}
    );

    const estado = await estadoPorActividad(escenario);

    expect(
      estado.get(escenario.opcionalId),
      'el plan es del día: en la Sesión nueva arranca de cero'
    ).toMatchObject({ requiereSeleccion: true, enPlan: false });
    // Lo que siempre se ve, se sigue viendo.
    expect(estado.get(escenario.obligatoriaId)?.enPlan).toBe(true);
    expect(estado.get(escenario.fijaId)?.enPlan).toBe(true);
  });
});
