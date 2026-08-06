import { expect, test, type APIResponse } from '@playwright/test';

import { Api } from './support/api';
import { consultar, consultarUna } from './support/db';
import {
  configurarGrupoManual,
  crearOrganizacion,
  crearUmbrales,
  iniciarSeccion,
  invitarYCanjearUsuario,
  poll,
  sufijo,
  type Organizacion,
} from './support/escenario';
import { actividadPropuesta, StubProveedor } from './support/stub-proveedor';

/**
 * Fase 14 · Ítems 29 y 30 — el asistente de IA, de punta a punta.
 *
 * El ítem 29 dejó el archivo (su tanda 7) y el 30 lo amplía (su tanda 9) con el
 * bloque del final: las herramientas que agregó, la validación de referencias
 * cruzadas y el orden de aplicado. Va acá y no en un archivo aparte porque
 * comparte lo caro —el stub del proveedor y el lector de SSE— y porque las dos
 * mitades son el mismo sistema.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ SE TESTEA ACÁ Y QUÉ NO:
 *
 * el proveedor está **stubbeado** (`support/stub-proveedor.ts`, apuntado con
 * `OPENAI_BASE_URL`), así que **no se testea que el modelo proponga cosas
 * buenas** — eso no es determinista y no es lo que se rompe en un deploy. Se
 * testea el sistema: el ruteo por el Gateway, el gate de plan/switch/cuota, el
 * aislamiento entre organizaciones, la validación de lo que propone, el ciclo
 * de vida de la propuesta y el aplicado parcial.
 *
 * Los dos cables que la tanda 6 ejerció a mano contra el sistema real quedan
 * fijados acá: **el SSE a través del proxy** y **«aplicar es un `for`»**.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const PUERTO_STUB = Number(process.env['E2E_STUB_IA_PORT'] ?? '4999');

const GATEWAY = process.env['E2E_GATEWAY_URL'] ?? 'http://localhost:3000';

/** Organización PRO con el asistente prendido y un grupo con zonas. */
async function montarOrganizacion(etiqueta: string) {
  const base = await Api.crear();
  const org = await crearOrganizacion(base, etiqueta);

  await ponerPlan(org.organizacionId, 'PRO');
  await crearUmbrales(org);

  return org;
}

/**
 * Cambia el plan por SQL. El alta pública siempre nace FREE y el panel
 * `PLATFORM_ADMIN` del #5 no es lo que se verifica en esta suite.
 */
async function ponerPlan(organizacionId: string, codigo: 'FREE' | 'PRO'): Promise<void> {
  await consultar(
    'billing_db',
    `update "Suscripcion" set "planId" = (select id from "Plan" where codigo = $1)
     where "organizacionId" = $2`,
    [codigo, organizacionId]
  );
}

/**
 * Un grupo con TODO cargado: es lo que las lecturas de la tanda 3 necesitan
 * para devolver algo, y lo que hace que el test de aislamiento pueda buscar un
 * nombre concreto en vez de afirmar sobre listas vacías.
 */
interface GrupoRico {
  org: Organizacion;
  actividadId: string;
  conductaId: string;
  participanteId: string;
  recompensaId: string;
  etiquetaId: string;
  bolsaId: string;
  productoId: string;
}

async function montarGrupoRico(base: Api, etiqueta: string): Promise<GrupoRico> {
  const org = await montarOrganizacion(`Ia${etiqueta}`);

  await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });
  // La tienda solo existe en modo TIENDA. `aplicarAhora` porque el cambio
  // diferido (decisión 9 del #22) espera a la próxima Sección y acá no hay
  // ninguna en curso que romper.
  await org.api.putOk(`/rewards/grupos/${org.grupoId}/configuracion`, {
    modo: 'TIENDA',
    aplicarAhora: true,
  });

  const actividad = await org.api.postOk<{ id: string }>(
    `/activity/grupos/${org.grupoId}/actividades`,
    {
      nombre: `Sacar la basura ${etiqueta}`,
      tipoPuntaje: 'OBLIGATORIA',
      valorPuntos: 3,
      tipoLimiteTiempo: 'SIN_LIMITE',
    }
  );
  const conducta = await org.api.postOk<{ id: string }>(
    `/activity/grupos/${org.grupoId}/conductas`,
    { nombre: `Ayudar ${etiqueta}`, tipo: 'BUENA', valorPuntos: 5 }
  );
  const persona = await invitarYCanjearUsuario(base, org);
  const premio = await org.api.postOk<{ id: string }>(
    `/rewards/grupos/${org.grupoId}/recompensas`,
    { tipo: 'PREMIO', nombre: `Helado de ${etiqueta}` }
  );
  const etiquetaCatalogo = await org.api.postOk<{ id: string }>(
    `/rewards/grupos/${org.grupoId}/etiquetas`,
    { nombre: `chico-${etiqueta.toLowerCase()}`, colorHex: '#22C55E' }
  );
  const bolsa = await org.api.postOk<{ id: string }>(`/rewards/grupos/${org.grupoId}/bolsas`, {
    nombre: `Bolsa de ${etiqueta}`,
    recompensaIds: [premio.id],
  });
  const producto = await org.api.postOk<{ id: string }>(
    `/rewards/grupos/${org.grupoId}/productos`,
    { nombre: `Producto de ${etiqueta}`, precio: 10, fuente: 'ITEM', recompensaId: premio.id }
  );

  await org.api.putOk(`/activity/actividades/${actividad.id}/turno`, {
    modo: 'ORDEN_FIJO',
    frecuencia: 'SESION',
    posiciones: [{ usuarioId: persona.usuarioId }],
  });

  return {
    org,
    actividadId: actividad.id,
    conductaId: conducta.id,
    participanteId: persona.usuarioId,
    recompensaId: premio.id,
    etiquetaId: etiquetaCatalogo.id,
    bolsaId: bolsa.id,
    productoId: producto.id,
  };
}

/**
 * Ejecuta una operación TAL COMO LA EJECUTA EL FRONTEND: el método y la ruta
 * salen del DTO sin traducir un solo campo (decisión 6 del #29). Que este
 * helper sea un `switch` de tres líneas y nada más es exactamente el punto.
 */
function aplicarOperacion(
  api: Api,
  operacion: { metodo: string; ruta: string; body: unknown }
): Promise<APIResponse> {
  if (operacion.metodo === 'PATCH') {
    return api.patch(operacion.ruta, operacion.body);
  }

  if (operacion.metodo === 'PUT') {
    return api.put(operacion.ruta, operacion.body);
  }

  return api.post(operacion.ruta, operacion.body);
}

/**
 * Lee el stream SSE con `fetch` — igual que `app-web`, y a propósito: es el
 * mismo camino que usa el navegador, así que si el proxy bufferea o rompe el
 * `content-type`, esto lo ve.
 */
async function conversarPorSse(
  token: string,
  ruta: string,
  cuerpo: unknown
): Promise<{ status: number; contentType: string | null; eventos: Array<Record<string, unknown>> }> {
  const respuesta = await fetch(`${GATEWAY}/api${ruta}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'text/event-stream',
    },
    body: JSON.stringify(cuerpo),
  });

  const contentType = respuesta.headers.get('content-type');

  if (!respuesta.ok || !respuesta.body) {
    return { status: respuesta.status, contentType, eventos: [] };
  }

  const decodificador = new TextDecoder();
  const eventos: Array<Record<string, unknown>> = [];
  let buffer = '';

  for await (const trozo of respuesta.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decodificador.decode(trozo, { stream: true });

    let corte = buffer.indexOf('\n\n');

    while (corte !== -1) {
      const bloque = buffer.slice(0, corte);

      buffer = buffer.slice(corte + 2);
      corte = buffer.indexOf('\n\n');

      const datos = bloque
        .split('\n')
        .filter((linea) => linea.startsWith('data:'))
        .map((linea) => linea.slice(5).trim())
        .join('');

      if (datos) {
        eventos.push(JSON.parse(datos) as Record<string, unknown>);
      }
    }
  }

  return { status: respuesta.status, contentType, eventos };
}

test.describe('Fase 14 · Ítem 29 — asistente de IA', () => {
  const stub = new StubProveedor();

  test.beforeAll(async () => {
    await stub.iniciar(PUERTO_STUB);
  });

  test.afterAll(async () => {
    await stub.detener();
  });

  test.beforeEach(() => {
    stub.olvidarPedidos();
  });

  // ── Gate: plan, switch y consentimiento ───────────────────────────────────

  test('una organización FREE recibe 402 al habilitar Y al conversar', async () => {
    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'IaFree');

    const habilitar = await org.api.put('/ai/configuracion', {
      habilitada: true,
      aceptaAviso: true,
    });

    expect(habilitar.status()).toBe(402);
    expect((await habilitar.json()).code).toBe('FEATURE_NO_DISPONIBLE');

    // Criterio 1: 402 también al conversar, aunque la fila de configuración ya
    // exista por el GET de arriba.
    const conversar = await org.api.post('/ai/conversaciones', {
      grupoId: org.grupoId,
      primerMensaje: 'hola',
    });

    expect(conversar.status()).toBe(402);
    expect(stub.llamadas).toBe(0);
  });

  test('habilitar sin aceptar el aviso da 400, y con él queda el consentimiento', async () => {
    const org = await montarOrganizacion('IaAviso');

    const sinAceptar = await org.api.put('/ai/configuracion', { habilitada: true });

    expect(sinAceptar.status()).toBe(400);
    expect((await sinAceptar.json()).code).toBe('AVISO_NO_ACEPTADO');

    const conAviso = await org.api.putOk<{ avisoAceptado: boolean; aceptoAvisoEn: string }>(
      '/ai/configuracion',
      { habilitada: true, aceptaAviso: true }
    );

    expect(conAviso.avisoAceptado).toBe(true);
    expect(conAviso.aceptoAvisoEn).not.toBeNull();

    // Criterio 2: el consentimiento se guarda con FECHA y con QUIÉN.
    const fila = await consultarUna<{ aceptoAvisoPorUsuarioId: string }>(
      'ai_db',
      'select "aceptoAvisoPorUsuarioId" from "ConfiguracionIaOrganizacion" where "organizacionId" = $1',
      [org.organizacionId]
    );

    expect(fila?.aceptoAvisoPorUsuarioId).toBe(org.tutorId);
  });

  test('un TUTOR conversa pero NO habilita; un USUARIO no llega a ningún endpoint', async () => {
    const base = await Api.crear();
    const org = await montarOrganizacion('IaRoles');

    await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });

    // El TUTOR de esta organización (no el ORG_ADMIN que la registró).
    const invitacion = await org.api.postOk<{ codigo: string }>(
      `/identity/grupos/${org.grupoId}/invitaciones`,
      { tipoInvitado: 'TUTOR' }
    );
    const tutor = await base.postOk<{ accessToken: string }>(
      `/auth/invitaciones/${invitacion.codigo}/canjear`,
      { nombre: 'Tutor IA', email: `tutor-${sufijo()}@ejemplo.test`, password: 'contrasena-segura-123' }
    );
    const apiTutor = base.conToken(tutor.accessToken);

    // Prender el asistente saca datos hacia un tercero: es decisión del dueño.
    const intento = await apiTutor.put('/ai/configuracion', {
      habilitada: false,
      aceptaAviso: true,
    });

    expect(intento.status()).toBe(403);

    // Pero conversar sí es de cualquier Tutor: la decisión de exponer los datos
    // ya la tomó el ORG_ADMIN al habilitar.
    stub.guionar({ texto: 'Hola, soy el asistente.' });
    const conversacion = await apiTutor.post('/ai/conversaciones', {
      grupoId: org.grupoId,
      primerMensaje: 'hola',
    });

    expect(conversacion.status()).toBe(201);

    // Criterio 3: el participante no sabe que esto existe.
    const ana = await invitarYCanjearUsuario(base, org);

    for (const ruta of ['/ai/configuracion', `/ai/conversaciones?grupoId=${org.grupoId}`]) {
      expect((await ana.api.get(ruta)).status(), ruta).toBe(403);
    }

    expect(
      (await ana.api.post('/ai/conversaciones', { grupoId: org.grupoId, primerMensaje: 'x' })).status()
    ).toBe(403);
  });

  // ── El stream por el proxy ────────────────────────────────────────────────

  test('el turno viaja por SSE a través del Gateway, con el progreso antes que el texto', async () => {
    const org = await montarOrganizacion('IaSse');

    await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });
    stub.guionar(
      { llamadas: [{ nombre: 'listar_actividades', argumentos: {} }] },
      { texto: 'Miré el catálogo y está vacío.' }
    );

    const { status, contentType, eventos } = await conversarPorSse(org.token, '/ai/conversaciones', {
      grupoId: org.grupoId,
      primerMensaje: 'mirá el catálogo',
    });
    const tipos = eventos.map((evento) => evento['tipo']);

    // 201 igual que el camino sin stream: negociar por `Accept` cambia CÓMO
    // llega la respuesta, no qué pasó — y crear una conversación es crear algo.
    expect(status).toBe(201);
    // El proxy conserva el content-type del stream: si lo cambiara o lo
    // bufferizara, el navegador recibiría un cuerpo entero al final.
    expect(contentType).toContain('text/event-stream');

    expect(tipos).toEqual([
      'conversacion',
      'mensaje',
      'herramienta',
      'herramienta',
      'texto',
      'fin',
    ]);
    // El rastro llega ANTES que la respuesta: es todo el punto del stream.
    expect(tipos.indexOf('herramienta')).toBeLessThan(tipos.indexOf('texto'));
    expect(eventos.find((e) => e['tipo'] === 'texto')?.['texto']).toBe(
      'Miré el catálogo y está vacío.'
    );
    expect(Number(eventos.at(-1)?.['tokensConsumidosMes'])).toBeGreaterThan(0);
  });

  test('sin Accept: text/event-stream contesta el JSON de siempre', async () => {
    const org = await montarOrganizacion('IaJson');

    await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });
    stub.guionar({ texto: 'Respuesta completa.' });

    const detalle = await org.api.postOk<{ id: string; mensajes: Array<{ contenido: string }> }>(
      '/ai/conversaciones',
      { grupoId: org.grupoId, primerMensaje: 'hola' }
    );

    // Dos clientes legítimos con necesidades opuestas: el navegador necesita
    // ver el progreso, esta suite quiere un cuerpo que se afirme de una.
    expect(detalle.mensajes.map((m) => m.contenido)).toContain('Respuesta completa.');
  });

  // ── Cuota ─────────────────────────────────────────────────────────────────

  test('con la cuota agotada devuelve 402 y NO se llama al proveedor', async () => {
    const org = await montarOrganizacion('IaCuota');

    await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });
    await consultar(
      'billing_db',
      `update "Plan" set "cuotaTokensIaMensual" = 0 where codigo = 'PRO'`
    );

    try {
      const conversar = await org.api.post('/ai/conversaciones', {
        grupoId: org.grupoId,
        primerMensaje: 'hola',
      });

      expect(conversar.status()).toBe(402);
      expect((await conversar.json()).code).toBe('CUOTA_IA_AGOTADA');
      // Criterio 5: el pre-flight corta ANTES de gastar, no después.
      expect(stub.llamadas).toBe(0);
    } finally {
      await consultar(
        'billing_db',
        `update "Plan" set "cuotaTokensIaMensual" = 2000000 where codigo = 'PRO'`
      );
    }
  });

  test('el consumo del mes es la suma del ledger, y no hay ningún campo contador', async () => {
    const org = await montarOrganizacion('IaLedger');

    await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });
    stub.guionar({ texto: 'Uno.', tokensEntrada: 300, tokensSalida: 200 });
    await org.api.postOk('/ai/conversaciones', { grupoId: org.grupoId, primerMensaje: 'hola' });

    const estado = await org.api.getOk<{ tokensConsumidosMes: number }>('/ai/configuracion');
    const suma = await consultarUna<{ total: string }>(
      'ai_db',
      'select coalesce(sum("tokensEntrada" + "tokensSalida"), 0)::text as total from "Mensaje" where "organizacionId" = $1',
      [org.organizacionId]
    );

    expect(estado.tokensConsumidosMes).toBe(500);
    expect(Number(suma?.total)).toBe(500);

    // Criterio 10: el consumo se DERIVA. Un contador mutable sería justo el
    // campo que este proyecto no usa en ninguna parte, y acá además el que
    // decide si se le cobra a la plataforma.
    const contadores = await consultar<{ column_name: string }>(
      'ai_db',
      `select column_name from information_schema.columns
       where table_schema = 'public' and column_name ilike '%tokensusados%'`
    );

    expect(contadores).toHaveLength(0);
  });

  test('los tokens quedan registrados aunque el proveedor falle a mitad de camino', async () => {
    const org = await montarOrganizacion('IaFalla');

    await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });
    // Primer turno bien (y ya gastó), el segundo revienta.
    stub.guionar(
      { llamadas: [{ nombre: 'listar_actividades', argumentos: {} }], tokensEntrada: 400, tokensSalida: 100 },
      { fallaCon: 500 }
    );

    const conversar = await org.api.post('/ai/conversaciones', {
      grupoId: org.grupoId,
      primerMensaje: 'hola',
    });

    expect(conversar.status()).toBe(503);
    expect((await conversar.json()).code).toBe('PROVEEDOR_NO_DISPONIBLE');

    // Parte E punto 6: los tokens de entrada se pagan igual. Contabilizar solo
    // los turnos que terminan bien deja abierta la puerta a consumir gratis.
    const estado = await org.api.getOk<{ tokensConsumidosMes: number }>('/ai/configuracion');

    expect(estado.tokensConsumidosMes).toBe(500);
  });

  // ── Aislamiento ───────────────────────────────────────────────────────────

  test('un Tutor de otra organización no lee la conversación ajena (404, no 403)', async () => {
    const alfa = await montarOrganizacion('IaAlfa');
    const beta = await montarOrganizacion('IaBeta');

    for (const org of [alfa, beta]) {
      await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });
    }

    stub.guionar({ texto: 'Hola.' });
    const deAlfa = await alfa.api.postOk<{ id: string }>('/ai/conversaciones', {
      grupoId: alfa.grupoId,
      primerMensaje: 'secreto de alfa',
    });

    // 404 y no 403: no se confirma la existencia de algo que no le corresponde.
    expect((await beta.api.get(`/ai/conversaciones/${deAlfa.id}`)).status()).toBe(404);
    // Y tampoco puede listar sobre el grupo de la otra. También 404: el
    // `AccesoGrupoService` valida la pertenencia contra identity y un grupo que
    // no es suyo no existe para él — no se confirma que exista y sea ajeno.
    expect((await beta.api.get(`/ai/conversaciones?grupoId=${alfa.grupoId}`)).status()).toBe(404);
  });

  test('una herramienta ejecutada en el contexto de A nunca devuelve una fila de B', async () => {
    const base = await Api.crear();
    const alfa = await montarOrganizacion('IaDatosA');
    const beta = await montarOrganizacion('IaDatosB');

    await alfa.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });
    await alfa.api.postOk(`/activity/grupos/${alfa.grupoId}/actividades`, {
      ...actividadPropuesta('Actividad de ALFA'),
    });
    await beta.api.postOk(`/activity/grupos/${beta.grupoId}/actividades`, {
      ...actividadPropuesta('Actividad de BETA'),
    });

    stub.guionar(
      { llamadas: [{ nombre: 'listar_actividades', argumentos: {} }] },
      { texto: 'Listo.' }
    );
    await alfa.api.postOk('/ai/conversaciones', {
      grupoId: alfa.grupoId,
      primerMensaje: 'listá las actividades',
    });

    // Lo que el servicio le mandó al proveedor en el segundo turno lleva la
    // salida de la herramienta: ahí se ve qué datos salieron de verdad.
    const segundoPedido = JSON.stringify(stub.pedidos[1].entrada);

    expect(segundoPedido).toContain('Actividad de ALFA');
    expect(segundoPedido, 'no puede haber una fila de la otra organización').not.toContain(
      'Actividad de BETA'
    );

    // Y nada de datos personales hacia el proveedor (Parte E, punto 7).
    expect(segundoPedido).not.toContain('@');

    void base;
  });

  // ── Propuestas: validación y ciclo de vida ────────────────────────────────

  test('una operación inválida NO crea propuesta: el error vuelve al modelo', async () => {
    const org = await montarOrganizacion('IaInvalida');

    await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });
    stub.guionar(
      {
        llamadas: [
          {
            nombre: 'proponer_crear_actividades',
            // `valorPuntos` como texto: Zod lo rechaza y el servicio devuelve
            // el error con la ruta del campo.
            argumentos: { actividades: [{ ...actividadPropuesta('Mala'), valorPuntos: 'diez' }] },
          },
        ],
      },
      { texto: 'Perdón, no pude armarla.' }
    );

    const detalle = await org.api.postOk<{ id: string; propuestas: unknown[] }>(
      '/ai/conversaciones',
      { grupoId: org.grupoId, primerMensaje: 'proponé algo' }
    );

    // Criterio 6: la conversación termina en texto, sin propuesta.
    expect(detalle.propuestas).toHaveLength(0);

    // Y el modelo recibió el detalle del campo, no un «error» genérico.
    const respuestaHerramienta = JSON.stringify(stub.pedidos[1].entrada);

    expect(respuestaHerramienta).toContain('valorPuntos');

    const filas = await consultar('ai_db', 'select id from "Propuesta" where "grupoId" = $1', [
      org.grupoId,
    ]);

    expect(filas).toHaveLength(0);
  });

  test('la propuesta se guarda sin tocar el catálogo, y aplicarla es un `for`', async () => {
    const org = await montarOrganizacion('IaAplicar');

    await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });
    stub.guionar(
      {
        llamadas: [
          {
            nombre: 'proponer_crear_actividades',
            argumentos: {
              actividades: [
                actividadPropuesta('Tender la cama', 3),
                actividadPropuesta('Lavar los platos', 5),
              ],
            },
          },
        ],
      },
      { texto: 'Te propuse dos.' }
    );

    const detalle = await org.api.postOk<{
      propuestas: Array<{
        id: string;
        estado: string;
        operaciones: Array<{ opId: string; metodo: string; ruta: string; body: unknown }>;
      }>;
    }>('/ai/conversaciones', { grupoId: org.grupoId, primerMensaje: 'armame el catálogo' });

    const propuesta = detalle.propuestas[0];

    expect(propuesta.estado).toBe('BORRADOR');
    expect(propuesta.operaciones).toHaveLength(2);

    // NADA se escribió: el catálogo sigue vacío con la propuesta ya guardada.
    const antes = await org.api.getOk<unknown[]>(`/activity/grupos/${org.grupoId}/actividades`);

    expect(antes).toHaveLength(0);

    // Aplicar es un `for` sobre las operaciones, con el JWT del Tutor y contra
    // los endpoints públicos de siempre — sin traducir un solo campo.
    const resultado = [];

    for (const operacion of propuesta.operaciones) {
      const respuesta = await org.api.post(operacion.ruta, operacion.body);

      expect(respuesta.status(), operacion.ruta).toBe(201);
      resultado.push({ opId: operacion.opId, ok: true, entidadId: (await respuesta.json()).id });
    }

    const registrada = await org.api.postOk<{ estado: string; resultado: unknown[] }>(
      `/ai/propuestas/${propuesta.id}/aplicada`,
      { resultado }
    );

    expect(registrada.estado).toBe('APLICADA');
    expect(registrada.resultado).toHaveLength(2);

    const despues = await org.api.getOk<Array<{ nombre: string }>>(
      `/activity/grupos/${org.grupoId}/actividades`
    );

    expect(despues.map((a) => a.nombre).sort()).toEqual(['Lavar los platos', 'Tender la cama']);
  });

  test('aplicado parcial: 3 operaciones, falla la segunda, quedan 2 y APLICADA_PARCIAL', async () => {
    const org = await montarOrganizacion('IaParcial');

    await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });
    stub.guionar(
      {
        llamadas: [
          {
            nombre: 'proponer_crear_actividades',
            argumentos: {
              actividades: [
                actividadPropuesta('Primera'),
                actividadPropuesta('Segunda'),
                actividadPropuesta('Tercera'),
              ],
            },
          },
        ],
      },
      { texto: 'Tres.' }
    );

    const detalle = await org.api.postOk<{
      propuestas: Array<{ id: string; operaciones: Array<{ opId: string; ruta: string; body: unknown }> }>;
    }>('/ai/conversaciones', { grupoId: org.grupoId, primerMensaje: 'tres actividades' });
    const propuesta = detalle.propuestas[0];
    const resultado = [];

    for (const [indice, operacion] of propuesta.operaciones.entries()) {
      // La segunda se rompe a propósito, del modo en que se rompería de verdad:
      // un body que el endpoint destino rechaza.
      const body = indice === 1 ? { ...(operacion.body as object), valorPuntos: -5 } : operacion.body;
      const respuesta = await org.api.post(operacion.ruta, body);

      resultado.push(
        respuesta.ok()
          ? { opId: operacion.opId, ok: true, entidadId: (await respuesta.json()).id }
          : { opId: operacion.opId, ok: false, error: (await respuesta.json()).message }
      );
    }

    const registrada = await org.api.postOk<{
      estado: string;
      resultado: Array<{ ok: boolean; error?: string }>;
    }>(`/ai/propuestas/${propuesta.id}/aplicada`, { resultado });

    // Criterio 7: una que falla no aborta el resto. Dos actividades buenas y
    // una fila roja es mejor que perder las tres.
    expect(registrada.estado).toBe('APLICADA_PARCIAL');
    expect(registrada.resultado).toHaveLength(3);
    expect(registrada.resultado.filter((fila) => fila.ok)).toHaveLength(2);
    expect(registrada.resultado[1].error).toBeTruthy();

    const catalogo = await org.api.getOk<unknown[]>(`/activity/grupos/${org.grupoId}/actividades`);

    expect(catalogo).toHaveLength(2);
  });

  test('una propuesta vencida se lee pero no se aplica (409)', async () => {
    const org = await montarOrganizacion('IaVencida');

    await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });
    stub.guionar(
      {
        llamadas: [
          {
            nombre: 'proponer_crear_actividades',
            argumentos: { actividades: [actividadPropuesta('Vieja')] },
          },
        ],
      },
      { texto: 'Una.' }
    );

    const detalle = await org.api.postOk<{ propuestas: Array<{ id: string }> }>(
      '/ai/conversaciones',
      { grupoId: org.grupoId, primerMensaje: 'proponé' }
    );
    const propuestaId = detalle.propuestas[0].id;

    await consultar('ai_db', `update "Propuesta" set "venceEn" = now() - interval '1 hour' where id = $1`, [
      propuestaId,
    ]);

    // Criterio 8: legible…
    const leida = await org.api.getOk<{ estado: string; operaciones: unknown[] }>(
      `/ai/propuestas/${propuestaId}`
    );

    expect(leida.estado).toBe('VENCIDA');
    expect(leida.operaciones).toHaveLength(1);

    // …pero no aplicable.
    const aplicar = await org.api.post(`/ai/propuestas/${propuestaId}/aplicada`, {
      resultado: [{ opId: 'op-1', ok: true }],
    });

    expect(aplicar.status()).toBe(409);
    expect((await aplicar.json()).code).toBe('PROPUESTA_VENCIDA');
  });

  test('descartar una propuesta la cierra y no se puede reabrir', async () => {
    const org = await montarOrganizacion('IaDescartar');

    await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });
    stub.guionar(
      {
        llamadas: [
          {
            nombre: 'proponer_crear_actividades',
            argumentos: { actividades: [actividadPropuesta('No va')] },
          },
        ],
      },
      { texto: 'Una.' }
    );

    const detalle = await org.api.postOk<{ propuestas: Array<{ id: string }> }>(
      '/ai/conversaciones',
      { grupoId: org.grupoId, primerMensaje: 'proponé' }
    );
    const propuestaId = detalle.propuestas[0].id;

    const descartada = await org.api.postOk<{ estado: string }>(
      `/ai/propuestas/${propuestaId}/descartar`
    );

    expect(descartada.estado).toBe('DESCARTADA');

    const reaplicar = await org.api.post(`/ai/propuestas/${propuestaId}/aplicada`, {
      resultado: [{ opId: 'op-1', ok: true }],
    });

    expect(reaplicar.status()).toBe(409);

    // Descartar no escribió nada en el grupo: la propuesta nunca tocó una base.
    const catalogo = await org.api.getOk<unknown[]>(`/activity/grupos/${org.grupoId}/actividades`);

    expect(catalogo).toHaveLength(0);
  });

  // ── Lo que sale hacia el proveedor ────────────────────────────────────────

  test('hacia el proveedor no viaja ni la organización en claro ni un email', async () => {
    const org = await montarOrganizacion('IaPrivacidad');

    await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });
    stub.guionar(
      { llamadas: [{ nombre: 'listar_participantes', argumentos: {} }] },
      { texto: 'Listo.' }
    );
    await org.api.postOk('/ai/conversaciones', {
      grupoId: org.grupoId,
      primerMensaje: '¿quiénes están?',
    });

    const todo = JSON.stringify(stub.pedidos);

    // Parte E punto 7: los dos identificadores son hashes, no ids en claro.
    expect(todo).not.toContain(org.organizacionId);
    expect(todo).not.toContain(org.grupoId);
    expect(stub.pedidos[0].safetyIdentifier).toHaveLength(64);
    expect(stub.pedidos[0].promptCacheKey).toHaveLength(64);
    expect(todo).not.toContain(org.emailContacto);

    // Y el system prompt dice que los datos del grupo NO son instrucciones.
    expect(stub.pedidos[0].instrucciones.toLowerCase()).toContain('datos_del_grupo');
  });

  test('el modelo recibe las herramientas de lectura y las de propuesta, sin ningún parámetro de tenant', async () => {
    const org = await montarOrganizacion('IaHerramientas');

    await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });
    stub.guionar({ texto: 'Hola.' });
    await org.api.postOk('/ai/conversaciones', { grupoId: org.grupoId, primerMensaje: 'hola' });

    const nombres = stub.pedidos[0].herramientas;

    expect(nombres).toContain('listar_actividades');
    expect(nombres).toContain('proponer_crear_actividades');
    // El catálogo cerrado del fase-14-30: 12 de lectura + 14 de propuesta.
    // Arrancó en 8 y 4 con el #29 — este número ES el ítem, así que se afirma
    // acá y no en una nota.
    expect(nombres).toContain('listar_tienda');
    expect(nombres).toContain('configuracion_del_grupo');
    expect(nombres).toContain('proponer_umbrales_zona');
    expect(nombres).toHaveLength(26);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // fase-14-30 · tanda 9 — el alcance total, de punta a punta.
  //
  // Lo mismo que arriba y por lo mismo: el proveedor está stubbeado, así que no
  // se testea que el modelo proponga cosas buenas. Se testean los CABLES que la
  // suite unitaria no puede ver — que el id que valida el armador sea el mismo
  // que devuelve la lectura, que lo que sale hacia el proveedor no lleve el
  // tenant, y que el orden en que se guardan las operaciones sea el orden en
  // que se pueden aplicar. Los dos defectos que este ítem encontró leyendo
  // código eran cables, y ninguno de los dos tenía un test rojo.
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('Ítem 30 — el alcance total del asistente', () => {
    /** Un uuid v4 válido que no es de nadie: el «lo inventó el modelo». */
    const UUID_DE_NADIE = '00000000-0000-4000-8000-000000000000';

    /** Las doce lecturas, en el orden en que las declara el catálogo. */
    const LECTURAS = [
      'listar_actividades',
      'listar_conductas',
      'listar_participantes',
      'listar_umbrales_zona',
      'resumen_puntajes',
      'listar_recompensas',
      'listar_rendimientos_monedas',
      'resumen_cumplimiento',
      'listar_tienda',
      'listar_etiquetas',
      'listar_turnos',
      'configuracion_del_grupo',
    ];

    let alfa: GrupoRico;
    let beta: GrupoRico;
    let umbralDeBeta: string;

    test.beforeAll(async () => {
      const base = await Api.crear();

      // Dos grupos con TODO cargado, una sola vez: los tests de este bloque que
      // los usan solo leen o son rechazos, así que ninguno le deja estado al
      // siguiente. Montar uno por test costaría ~15 requests de más cada vez, y
      // el Gateway corta en 100/min.
      alfa = await montarGrupoRico(base, 'ALFA');
      beta = await montarGrupoRico(base, 'BETA');

      const umbrales = await beta.org.api.getOk<Array<{ id: string }>>(
        `/scoring/grupos/${beta.org.grupoId}/umbrales`
      );

      umbralDeBeta = umbrales[0].id;
    });

    test('las cuatro lecturas nuevas traen lo del grupo y nada de la otra organización', async () => {
      // Criterio 7. Las ocho viejas ya tenían su test de aislamiento; estas
      // cuatro son superficie nueva sobre tres servicios distintos.
      stub.guionar(
        {
          llamadas: [
            { nombre: 'listar_tienda', argumentos: {} },
            { nombre: 'listar_etiquetas', argumentos: {} },
            { nombre: 'listar_turnos', argumentos: {} },
            { nombre: 'configuracion_del_grupo', argumentos: {} },
          ],
        },
        { texto: 'Miré la tienda y la configuración.' }
      );

      await alfa.org.api.postOk('/ai/conversaciones', {
        grupoId: alfa.org.grupoId,
        primerMensaje: '¿cómo está armada la tienda?',
      });

      const salida = JSON.stringify(stub.pedidos[1].entrada);

      // Lo suyo llegó…
      expect(salida).toContain('Producto de ALFA');
      expect(salida).toContain('Bolsa de ALFA');
      expect(salida).toContain('chico-alfa');
      expect(salida).toContain(alfa.actividadId);

      // …y lo de la otra organización no, en ninguna de las cuatro.
      for (const ajeno of [
        'Producto de BETA',
        'Bolsa de BETA',
        'chico-beta',
        beta.actividadId,
        beta.productoId,
        beta.etiquetaId,
      ]) {
        expect(salida, `se filtró «${ajeno}» de la otra organización`).not.toContain(ajeno);
      }
    });

    test('ninguna de las doce lecturas manda el tenant en claro ni un email', async () => {
      // Criterio 11, y es el test que convierte la medida 7 de la Parte E en
      // algo ejecutable: se afirma sobre la RESPUESTA REAL de cada herramienta
      // —lo que efectivamente viaja hacia el proveedor— y no sobre su tipo.
      // Cuatro lecturas devolvían el DTO crudo con `organizacionId` adentro y
      // ningún test lo veía, porque ninguno miraba acá.
      stub.guionar(
        { llamadas: LECTURAS.map((nombre) => ({ nombre, argumentos: {} })) },
        { texto: 'Ya miré todo.' }
      );

      await alfa.org.api.postOk('/ai/conversaciones', {
        grupoId: alfa.org.grupoId,
        primerMensaje: 'contame todo del grupo',
      });

      const salida = JSON.stringify(stub.pedidos[1].entrada);

      // Las doce corrieron y ninguna falló: un error también es una salida
      // «limpia», así que sin esto el test pasaría con doce herramientas rotas.
      expect(salida.toLowerCase()).not.toContain('no existe una herramienta');
      expect(salida.toLowerCase()).not.toContain('no se pudo leer');
      expect(salida.toLowerCase()).not.toContain('no se pudieron leer');
      expect(salida).toContain('Producto de ALFA');
      expect(salida).toContain('planDelDiaActivo');

      for (const prohibido of ['organizacionId', 'grupoId', 'tenant', '@']) {
        expect(salida, `una lectura mandó «${prohibido}»`).not.toContain(prohibido);
      }

      expect(salida).not.toContain(alfa.org.organizacionId);
      expect(salida).not.toContain(alfa.org.grupoId);
    });

    test('un id que no es de este grupo NO crea propuesta, y el error nombra el campo', async () => {
      test.slow();

      // Criterio 2, la decisión 2 del ítem entera. Los ids son REALES y de la
      // otra organización, no uuids inventados: es el caso que la validación de
      // shape deja pasar sin despeinarse y que termina en una fila roja cuando
      // el Tutor ya apretó «Aplicar».
      const casos: Array<{ herramienta: string; argumentos: unknown; espera: string }> = [
        {
          herramienta: 'proponer_editar_productos',
          argumentos: { ediciones: [{ productoId: beta.productoId, precio: 5 }] },
          espera: 'productoId',
        },
        {
          herramienta: 'proponer_crear_productos',
          argumentos: {
            productos: [
              { nombre: 'Ajeno', precio: 5, fuente: 'ITEM', recompensaId: beta.recompensaId },
            ],
          },
          espera: 'recompensaId',
        },
        {
          herramienta: 'proponer_etiquetas',
          argumentos: {
            asignar: [{ recompensaId: alfa.recompensaId, etiquetaIds: [beta.etiquetaId] }],
          },
          espera: 'etiquetaIds',
        },
        {
          herramienta: 'proponer_editar_conductas',
          argumentos: { ediciones: [{ conductaId: beta.conductaId, valorPuntos: 9 }] },
          espera: 'conductaId',
        },
        {
          herramienta: 'proponer_configurar_turnos',
          argumentos: {
            turnos: [
              {
                actividadId: beta.actividadId,
                modo: 'ORDEN_FIJO',
                frecuencia: 'SESION',
                activo: true,
                posiciones: [alfa.participanteId],
              },
            ],
          },
          espera: 'actividadId',
        },
        {
          herramienta: 'proponer_crear_recompensas',
          argumentos: {
            recompensas: [{ tipo: 'PREMIO', nombre: 'De otra escala', umbralZonaId: umbralDeBeta }],
          },
          espera: 'umbralZonaId',
        },
        {
          herramienta: 'proponer_roles_grupo',
          argumentos: { editar: [{ rolId: UUID_DE_NADIE, nombre: 'cocina' }] },
          espera: 'rolId',
        },
        {
          herramienta: 'proponer_equipos',
          argumentos: {
            crear: [
              { nombre: 'Equipo ajeno', jefeParticipanteId: beta.participanteId, participantesIds: [] },
            ],
          },
          espera: 'no es un participante de este grupo',
        },
      ];

      for (const caso of casos) {
        stub.olvidarPedidos();
        stub.guionar(
          { llamadas: [{ nombre: caso.herramienta, argumentos: caso.argumentos }] },
          { texto: 'Perdón, me equivoqué de id.' }
        );

        const detalle = await alfa.org.api.postOk<{ propuestas: unknown[] }>(
          '/ai/conversaciones',
          { grupoId: alfa.org.grupoId, primerMensaje: `probá ${caso.herramienta}` }
        );

        expect(detalle.propuestas, `${caso.herramienta} no debería armar propuesta`).toHaveLength(0);
        // El error VUELVE AL MODELO con el campo adentro: es lo que le permite
        // corregirse solo en el turno siguiente en vez de repetir el mismo id.
        expect(
          JSON.stringify(stub.pedidos.at(-1)?.entrada),
          `${caso.herramienta} tiene que nombrar «${caso.espera}»`
        ).toContain(caso.espera);
      }

      const filas = await consultar('ai_db', 'select id from "Propuesta" where "grupoId" = $1', [
        alfa.org.grupoId,
      ]);

      expect(filas, 'ninguno de los ocho rechazos dejó una fila').toHaveLength(0);
    });

    test('una escala con un hueco no se guarda: el error trae el rango en conflicto', async () => {
      // Viene detrás del test de las ocho referencias, que se come el
      // presupuesto del rate limiter del Gateway (100/min): la espera de
      // `conReintento429` no es flakiness, es la ventana que hay que dejar
      // pasar, y por eso el timeout ×3 (mismo criterio que `support/api.ts`).
      test.slow();

      // Criterio 5. Es la única familia que se valida como CONJUNTO, y el
      // conjunto se juzga sobre el estado resultante, no sobre lo que la
      // propuesta trae.
      const umbrales = await alfa.org.api.getOk<
        Array<{ id: string; nombreZona: string; orden: number; puntosMin: number; colorHex: string }>
      >(`/scoring/grupos/${alfa.org.grupoId}/umbrales`);
      const verde = umbrales.find((umbral) => umbral.nombreZona === 'Verde');

      expect(verde, 'el escenario tiene que traer la zona Verde').toBeTruthy();

      stub.guionar(
        {
          llamadas: [
            {
              nombre: 'proponer_umbrales_zona',
              argumentos: {
                editar: [
                  {
                    umbralZonaId: verde?.id,
                    nombreZona: 'Verde',
                    orden: verde?.orden,
                    puntosMin: verde?.puntosMin,
                    // Verde terminaba en 49 y Dorado arranca en 50: bajarle el
                    // techo a 40 deja 41–49 sin ninguna zona.
                    puntosMax: 40,
                    colorHex: verde?.colorHex,
                  },
                ],
              },
            },
          ],
        },
        { texto: 'Tenés razón, no cierra.' }
      );

      const detalle = await alfa.org.api.postOk<{ propuestas: unknown[] }>('/ai/conversaciones', {
        grupoId: alfa.org.grupoId,
        primerMensaje: 'bajá el techo de Verde',
      });

      expect(detalle.propuestas).toHaveLength(0);

      const error = JSON.stringify(stub.pedidos.at(-1)?.entrada);

      expect(error).toContain('no cierra');
      // El mensaje dice DÓNDE está el hueco, no solo que lo hay.
      expect(error).toContain('arrancar en 41');
    });

    test('un producto que apunta a una bolsa de la misma propuesta se rechaza explicando el orden', async () => {
      test.slow();

      // Criterio 6. El límite es real y no arbitrario: la bolsa recién existe
      // cuando el Tutor aplica, así que su id no puede estar en la propuesta
      // que la crea.
      stub.guionar(
        {
          llamadas: [
            {
              nombre: 'proponer_crear_productos',
              argumentos: {
                bolsas: [{ nombre: 'Bolsa nueva', recompensaIds: [alfa.recompensaId] }],
                productos: [
                  {
                    nombre: 'Sobre sorpresa',
                    precio: 20,
                    fuente: 'BOLSA',
                    mecanica: 'AZAR',
                    bolsaId: UUID_DE_NADIE,
                  },
                ],
              },
            },
          ],
        },
        { texto: 'Va en dos pasos entonces.' }
      );

      const detalle = await alfa.org.api.postOk<{ propuestas: unknown[] }>('/ai/conversaciones', {
        grupoId: alfa.org.grupoId,
        primerMensaje: 'armá una bolsa y vendela',
      });

      expect(detalle.propuestas).toHaveLength(0);

      const error = JSON.stringify(stub.pedidos.at(-1)?.entrada);

      // No alcanza con rechazar: el error tiene que decir qué hacer, porque el
      // modelo no puede deducir el orden mirando el esquema.
      expect(error).toContain('todavía no existe');
      expect(error).toContain('dos tandas');
    });

    test('tres conductas, falla la segunda: quedan 2 y la propuesta queda APLICADA_PARCIAL', async () => {
      // Criterio 9: la decisión 13 del #29 sigue valiendo para las familias
      // nuevas. Se prueba sobre conductas y no sobre actividades a propósito —
      // el aplicado parcial es del ciclo de vida de la propuesta, pero lo que
      // se verifica acá es que una familia de la tanda 4 lo herede sin haber
      // escrito una línea para eso.
      const org = await montarOrganizacion('IaParcialConductas');

      await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });
      stub.guionar(
        {
          llamadas: [
            {
              nombre: 'proponer_crear_conductas',
              argumentos: {
                conductas: [
                  { nombre: 'Ayudar sin que se lo pidan', tipo: 'BUENA', valorPuntos: 10 },
                  { nombre: 'Contestar mal', tipo: 'MALA', valorPuntos: 5 },
                  { nombre: 'Dejar la mesa lista', tipo: 'BUENA', valorPuntos: 4 },
                ],
              },
            },
          ],
        },
        { texto: 'Te propuse tres.' }
      );

      const detalle = await org.api.postOk<{
        propuestas: Array<{
          id: string;
          tipo: string;
          operaciones: Array<{ opId: string; metodo: string; ruta: string; body: unknown }>;
        }>;
      }>('/ai/conversaciones', { grupoId: org.grupoId, primerMensaje: 'proponeme conductas' });
      const propuesta = detalle.propuestas[0];

      expect(propuesta.tipo).toBe('CREAR_CONDUCTAS');
      expect(propuesta.operaciones).toHaveLength(3);

      const resultado = [];

      for (const [indice, operacion] of propuesta.operaciones.entries()) {
        // La segunda se rompe como se rompería de verdad: un body que el
        // endpoint destino rechaza.
        const body =
          indice === 1 ? { ...(operacion.body as object), valorPuntos: -5 } : operacion.body;
        const respuesta = await aplicarOperacion(org.api, { ...operacion, body });

        resultado.push(
          respuesta.ok()
            ? { opId: operacion.opId, ok: true, entidadId: (await respuesta.json()).id }
            : { opId: operacion.opId, ok: false, error: (await respuesta.json()).message }
        );
      }

      const registrada = await org.api.postOk<{
        estado: string;
        resultado: Array<{ ok: boolean }>;
      }>(`/ai/propuestas/${propuesta.id}/aplicada`, { resultado });

      expect(registrada.estado).toBe('APLICADA_PARCIAL');
      expect(registrada.resultado).toHaveLength(3);
      expect(registrada.resultado.filter((fila) => fila.ok)).toHaveLength(2);

      const conductas = await org.api.getOk<unknown[]>(
        `/activity/grupos/${org.grupoId}/conductas?estado=ACTIVA`
      );

      expect(conductas).toHaveLength(2);
    });

    test('la escala: el aviso cuenta a quién le cambia la zona, y el orden de aplicado no es decorativo', async () => {
      test.slow();

      // Criterio 10 + el pendiente 15 de la tanda 6, juntos porque son la misma
      // propuesta mirada de los dos lados: lo que el Tutor lee antes de aplicar
      // y lo que pasa cuando aplica.
      const base = await Api.crear();
      const org = await montarOrganizacion('IaEscala');

      await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });
      await configurarGrupoManual(org);

      const persona = await invitarYCanjearUsuario(base, org);
      const conducta = await org.api.postOk<{ id: string }>(
        `/activity/grupos/${org.grupoId}/conductas`,
        { nombre: 'Semana impecable', tipo: 'BUENA', valorPuntos: 60 }
      );
      const seccion = await iniciarSeccion(org);

      await org.api.postOk(`/activity/conductas/${conducta.id}/registrar`, {
        usuarioId: persona.usuarioId,
      });

      const puntajeDe = async (): Promise<{ puntajeTotal: number; zona: { nombreZona: string } | null }> =>
        await org.api.getOk(
          `/scoring/usuarios/${persona.usuarioId}/secciones/${seccion.seccionId}/puntaje`
        );

      await poll(
        async () => {
          const puntaje = await puntajeDe();

          expect(puntaje.puntajeTotal).toBe(60);
          expect(puntaje.zona?.nombreZona).toBe('Dorado');
        },
        { descripcion: '60 puntos proyectados a Dorado' }
      );

      const umbrales = await org.api.getOk<
        Array<{
          id: string;
          nombreZona: string;
          orden: number;
          puntosMin: number;
          colorHex: string;
        }>
      >(`/scoring/grupos/${org.grupoId}/umbrales`);
      const dorado = umbrales.find((umbral) => umbral.nombreZona === 'Dorado');

      expect(dorado).toBeTruthy();

      stub.guionar(
        {
          llamadas: [
            {
              nombre: 'proponer_umbrales_zona',
              argumentos: {
                // Ponerle techo a la cima y agregar una zona arriba: el único
                // cambio de escala que TIENE un orden de aplicado posible.
                editar: [
                  {
                    umbralZonaId: dorado?.id,
                    nombreZona: 'Dorado',
                    orden: dorado?.orden,
                    puntosMin: dorado?.puntosMin,
                    puntosMax: 55,
                    colorHex: dorado?.colorHex,
                  },
                ],
                crear: [
                  {
                    nombreZona: 'Platino',
                    orden: (dorado?.orden ?? 4) + 1,
                    puntosMin: 56,
                    puntosMax: null,
                    colorHex: '#A78BFA',
                  },
                ],
              },
            },
          ],
        },
        { texto: 'Te propuse una zona nueva arriba.' }
      );

      const detalle = await org.api.postOk<{
        propuestas: Array<{
          id: string;
          aviso: string | null;
          operaciones: Array<{ opId: string; metodo: string; ruta: string; body: unknown }>;
        }>;
      }>('/ai/conversaciones', { grupoId: org.grupoId, primerMensaje: 'agregá una zona arriba' });
      const propuesta = detalle.propuestas[0];

      // Criterio 10: el aviso dice que cambia el pasado y CUÁNTOS cambian.
      expect(propuesta.aviso).toContain('cambia el pasado');
      expect(propuesta.aviso).toContain('1 de 1 participante cambia de zona');

      // Pendiente 15: el orden lo resolvió el armador y no es cosmético.
      expect(propuesta.operaciones.map((operacion) => operacion.metodo)).toEqual(['PATCH', 'POST']);

      const alReves = await aplicarOperacion(org.api, propuesta.operaciones[1]);

      expect(
        alReves.status(),
        'la zona nueva antes del techo dejaría dos zonas sin techo y scoring la rechaza'
      ).toBe(400);

      for (const operacion of propuesta.operaciones) {
        const respuesta = await aplicarOperacion(org.api, operacion);

        expect(respuesta.ok(), `${operacion.metodo} ${operacion.ruta}`).toBeTruthy();
      }

      // Y el número del aviso era verdad: el participante que estaba en Dorado
      // ahora está en Platino, sin haber sumado un solo punto.
      const despues = await puntajeDe();

      expect(despues.puntajeTotal).toBe(60);
      expect(despues.zona?.nombreZona).toBe('Platino');
    });

    test('sumar a alguien al equipo y ascenderlo a jefe: el orden lo garantiza la propuesta', async () => {
      test.slow();

      // Pendiente 18. identity exige que el jefe YA sea miembro, así que las dos
      // operaciones solo funcionan en un orden — y ese orden lo fija el armador,
      // no el que aplica.
      const base = await Api.crear();
      const org = await montarOrganizacion('IaEquipos');

      await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });

      const ana = await invitarYCanjearUsuario(base, org);
      const beto = await invitarYCanjearUsuario(base, org);
      const equipo = await org.api.postOk<{ id: string }>(
        `/identity/grupos/${org.grupoId}/equipos`,
        { nombre: 'Cocina', jefeUsuarioId: ana.usuarioId, miembrosIds: [] }
      );

      stub.guionar(
        {
          llamadas: [
            {
              nombre: 'proponer_equipos',
              argumentos: {
                editar: [
                  {
                    equipoId: equipo.id,
                    sumarParticipantesIds: [beto.usuarioId],
                    nuevoJefeParticipanteId: beto.usuarioId,
                  },
                ],
              },
            },
          ],
        },
        { texto: 'Listo, se suma y queda de jefe.' }
      );

      const detalle = await org.api.postOk<{
        propuestas: Array<{
          operaciones: Array<{ opId: string; metodo: string; ruta: string; body: unknown }>;
        }>;
      }>('/ai/conversaciones', {
        grupoId: org.grupoId,
        primerMensaje: 'sumá a Beto a Cocina y ponelo de jefe',
      });
      const operaciones = detalle.propuestas[0].operaciones;

      expect(operaciones.map((operacion) => operacion.ruta)).toEqual([
        `/identity/equipos/${equipo.id}/miembros`,
        `/identity/equipos/${equipo.id}/jefe`,
      ]);

      for (const operacion of operaciones) {
        const respuesta = await aplicarOperacion(org.api, operacion);

        expect(respuesta.ok(), `${operacion.metodo} ${operacion.ruta}`).toBeTruthy();
      }

      const equipos = await org.api.getOk<
        Array<{ id: string; jefeUsuarioId: string; miembros: Array<{ usuarioId: string }> }>
      >(`/identity/grupos/${org.grupoId}/equipos`);
      const cocina = equipos.find((fila) => fila.id === equipo.id);

      expect(cocina?.jefeUsuarioId).toBe(beto.usuarioId);
      expect(cocina?.miembros.map((miembro) => miembro.usuarioId).sort()).toEqual(
        [ana.usuarioId, beto.usuarioId].sort()
      );
    });
  });
});
