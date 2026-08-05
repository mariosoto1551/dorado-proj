import { expect, test } from '@playwright/test';

import { Api } from './support/api';
import { consultar, consultarUna } from './support/db';
import { crearOrganizacion, crearUmbrales, invitarYCanjearUsuario, sufijo } from './support/escenario';
import { actividadPropuesta, StubProveedor } from './support/stub-proveedor';

/**
 * Fase 14 · Ítem 29 — el asistente de IA, de punta a punta (tanda 7).
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
    // 8 de lectura + 4 de propuesta.
    expect(nombres).toHaveLength(12);
  });
});
