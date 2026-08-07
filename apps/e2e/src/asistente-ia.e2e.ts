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
  type SeccionAbierta,
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
 * Un grupo con el DÍA EN MARCHA (fase-14-31): sesión abierta, una marca viva,
 * saldo en la billetera y una actividad que le toca a uno solo.
 *
 * `GrupoRico` alcanzaba para el #30 porque aquel ítem era sobre configurar; las
 * cuatro familias de éste se rechazan enteras sin Sesión abierta, así que sin
 * esto la suite pasaría verde sin ejercer una sola.
 */
interface GrupoOperativo {
  org: Organizacion;
  seccion: SeccionAbierta;
  /** Los dos participantes. Con uno solo no se puede probar «esa no le toca». */
  ana: string;
  beto: string;
  /** OPCIONAL de 10 puntos que Ana YA hizo: de ahí sale `registroDeAna`. */
  leerId: string;
  nombreLeer: string;
  /** OPCIONAL de 7 puntos que nadie hizo: la que se anota y después se archiva. */
  ordenarId: string;
  /** OPCIONAL dirigida SOLO a Beto (destinatario nominal del #24). */
  soloDeBetoId: string;
  conductaId: string;
  etiquetaId: string;
  /** El `registroId` de la completada viva de Ana. */
  registroDeAna: string;
}

async function montarGrupoOperativo(base: Api, etiqueta: string): Promise<GrupoOperativo> {
  const org = await montarOrganizacion(`Op${etiqueta}`);

  await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });
  await configurarGrupoManual(org);
  // Las monedas —y por lo tanto `listar_billeteras`— son del modo TIENDA.
  // `aplicarAhora` porque el cambio diferido espera a la próxima Sección y acá
  // todavía no hay ninguna en curso que romper (decisión 9 del #22).
  await org.api.putOk(`/rewards/grupos/${org.grupoId}/configuracion`, {
    modo: 'TIENDA',
    aplicarAhora: true,
  });

  const ana = await invitarYCanjearUsuario(base, org);
  const beto = await invitarYCanjearUsuario(base, org);
  const nombreLeer = `Leer un rato ${etiqueta}`;
  const leer = await org.api.postOk<{ id: string }>(
    `/activity/grupos/${org.grupoId}/actividades`,
    {
      nombre: nombreLeer,
      tipoPuntaje: 'OPCIONAL',
      valorPuntos: 10,
      tipoLimiteTiempo: 'SIN_LIMITE',
    }
  );
  const ordenar = await org.api.postOk<{ id: string }>(
    `/activity/grupos/${org.grupoId}/actividades`,
    {
      nombre: `Ordenar la pieza ${etiqueta}`,
      tipoPuntaje: 'OPCIONAL',
      valorPuntos: 7,
      tipoLimiteTiempo: 'SIN_LIMITE',
    }
  );
  const soloDeBeto = await org.api.postOk<{ id: string }>(
    `/activity/grupos/${org.grupoId}/actividades`,
    {
      nombre: `Practicar piano ${etiqueta}`,
      tipoPuntaje: 'OPCIONAL',
      valorPuntos: 5,
      tipoLimiteTiempo: 'SIN_LIMITE',
      usuariosPermitidos: [beto.usuarioId],
    }
  );
  const conducta = await org.api.postOk<{ id: string }>(
    `/activity/grupos/${org.grupoId}/conductas`,
    { nombre: `Ayudar sin que se lo pidan ${etiqueta}`, tipo: 'BUENA', valorPuntos: 5 }
  );
  const etiquetaCatalogo = await org.api.postOk<{ id: string }>(
    `/rewards/grupos/${org.grupoId}/etiquetas`,
    { nombre: `rapido-${etiqueta.toLowerCase()}`, colorHex: '#22C55E' }
  );
  const seccion = await iniciarSeccion(org);
  const registro = await org.api.postOk<{ id: string }>(
    `/activity/actividades/${leer.id}/completar`,
    { usuarioId: ana.usuarioId }
  );

  // Saldo para que un descuento sea posible y otro no (criterio 10). Sin
  // monedas, `listar_billeteras` devuelve ceros y todo descuento se rechaza
  // por el mismo motivo, que probaría la mitad del camino.
  await org.api.postOk(`/rewards/grupos/${org.grupoId}/usuarios/${ana.usuarioId}/ajuste`, {
    monto: 30,
    motivo: `Ahorro de ${etiqueta}`,
  });

  return {
    org,
    seccion,
    ana: ana.usuarioId,
    beto: beto.usuarioId,
    leerId: leer.id,
    nombreLeer,
    ordenarId: ordenar.id,
    soloDeBetoId: soloDeBeto.id,
    conductaId: conducta.id,
    etiquetaId: etiquetaCatalogo.id,
    registroDeAna: registro.id,
  };
}

/**
 * Ejecuta una operación TAL COMO LA EJECUTA EL FRONTEND: el método y la ruta
 * salen del DTO sin traducir un solo campo (decisión 6 del #29). Que este
 * helper sea un `switch` de cuatro líneas y nada más es exactamente el punto.
 *
 * El `DELETE` entró con el fase-14-31 (decisión 1) y no cambió nada más del
 * camino de aplicado: `aplicar-propuesta.ts` sigue siendo un `for`.
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

  if (operacion.metodo === 'DELETE') {
    return api.delete(operacion.ruta);
  }

  return api.post(operacion.ruta, operacion.body);
}

/**
 * Lo que devolvieron las herramientas, ya des-escapado.
 *
 * Cada `function_call_output` lleva su salida como **string JSON**, así que un
 * `JSON.stringify` del pedido entero la muestra con las comillas escapadas y
 * afirmar `"saldo":30` sobre eso no matchea nunca. Juntar los `output` en crudo
 * deja el mismo texto que le llega al modelo, que es sobre lo que hay que
 * afirmar.
 */
function salidasDeHerramientas(entrada: unknown[]): string {
  return (entrada as Array<Record<string, unknown>>)
    .filter((item) => item['type'] === 'function_call_output')
    .map((item) => String(item['output']))
    .join('\n');
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

/** Un uuid v4 válido que no es de nadie: el «lo inventó el modelo». */
const UUID_DE_NADIE = '00000000-0000-4000-8000-000000000000';

/**
 * Las doce lecturas del #30, en el orden en que las declara el catálogo. Vive
 * acá arriba y no dentro de su bloque porque el #31 le suma dos y afirma sobre
 * las CATORCE (su criterio 13): con la lista duplicada, agregar una lectura
 * nueva dejaría un test verde mirando trece.
 */
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

/** Las catorce del fase-14-31: las doce de arriba más las dos operativas. */
const LECTURAS_OPERATIVAS = [...LECTURAS, 'estado_de_hoy', 'listar_billeteras'];

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
    // El catálogo del fase-14-31: 14 de lectura + 18 de propuesta. Arrancó en
    // 8 y 4 con el #29 y pasó por 12 y 14 con el #30 — este número ES el ítem,
    // así que se afirma acá y no en una nota.
    //
    // Y este `toHaveLength` ya se quedó viejo una vez: el #30 lo dejó en 12
    // durante siete tandas sin que nadie se enterara, porque la suite no corre
    // sola. Actualizarlo es lo primero que hace la tanda de E2E de cada ítem.
    expect(nombres).toContain('listar_tienda');
    expect(nombres).toContain('configuracion_del_grupo');
    expect(nombres).toContain('proponer_umbrales_zona');
    expect(nombres).toContain('estado_de_hoy');
    expect(nombres).toContain('proponer_archivar');
    expect(nombres).toHaveLength(32);
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

  // ═══════════════════════════════════════════════════════════════════════════
  // fase-14-31 · tanda 9 — el alcance operativo, de punta a punta.
  //
  // El #29 y el #30 eran sobre CONFIGURAR un grupo; este ítem es sobre
  // ACOMPAÑARLO, y eso cambia qué se puede romper: una propuesta mala aplicada
  // sin mirar ya no deja basura en el catálogo sino una actividad archivada y
  // unos puntos de más. Lo que se verifica acá es lo que la suite unitaria no
  // puede ver:
  //
  //   · que el `registroId` que valida el armador sea el mismo que devuelve la
  //     lectura, y que el endpoint destino lo acepte con el JWT del Tutor;
  //   · que archivar NO mueva el puntaje y quitar una marca SÍ —las dos cosas
  //     que la fila de la tarjeta le promete al Tutor—;
  //   · y que el aviso nuevo apague de verdad al que no lo aceptó.
  //
  // Las tandas 4 a 7 dejaron todas anotado el mismo pendiente: nada se había
  // probado contra el proveedor ni contra los servicios destino. Esto es eso.
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('Ítem 31 — el alcance operativo: borrar, ajustar y anotar', () => {
    let alfa: GrupoOperativo;
    let beta: GrupoOperativo;

    test.beforeAll(async () => {
      const base = await Api.crear();

      // Dos grupos con el DÍA EN MARCHA, no solo con catálogo: sin Sesión
      // abierta las cuatro familias operativas se rechazan enteras y la suite
      // no probaría nada. El segundo existe para los dos cruces de tenant —un
      // `registroId` real ajeno y las dos lecturas nuevas.
      alfa = await montarGrupoOperativo(base, 'ALFA');
      beta = await montarGrupoOperativo(base, 'BETA');
    });

    /** El puntaje derivado de alguien en la Sección abierta de su grupo. */
    async function puntajeDe(grupo: GrupoOperativo, usuarioId: string): Promise<number> {
      const puntaje = await grupo.org.api.getOk<{ puntajeTotal: number }>(
        `/scoring/usuarios/${usuarioId}/secciones/${grupo.seccion.seccionId}/puntaje`
      );

      return puntaje.puntajeTotal;
    }

    /** Espera a que el ledger de scoring haya proyectado el cambio del bus. */
    async function esperarPuntaje(
      grupo: GrupoOperativo,
      usuarioId: string,
      esperado: number
    ): Promise<void> {
      await poll(
        async () => {
          expect(await puntajeDe(grupo, usuarioId)).toBe(esperado);
        },
        { descripcion: `puntaje ${esperado}` }
      );
    }

    test('las catorce lecturas: traen el día en marcha, sin tenant, sin email y sin nada de la otra organización', async () => {
      test.slow();

      // Criterios 12 y 13 juntos, porque son la misma salida mirada de los dos
      // lados: qué llegó y qué NO tenía que llegar. Se afirma sobre lo que
      // devolvieron las herramientas —lo que efectivamente viaja hacia el
      // proveedor— y no sobre sus tipos, que es la única forma en que el #30
      // encontró cuatro lecturas devolviendo el DTO crudo.
      stub.guionar(
        { llamadas: LECTURAS_OPERATIVAS.map((nombre) => ({ nombre, argumentos: {} })) },
        { texto: 'Ya miré todo.' }
      );

      await alfa.org.api.postOk('/ai/conversaciones', {
        grupoId: alfa.org.grupoId,
        primerMensaje: 'contame cómo viene el día',
      });

      const salida = salidasDeHerramientas(stub.pedidos[1].entrada);

      // Las catorce corrieron y ninguna falló: un error también es una salida
      // «limpia», así que sin esto el test pasaría con catorce herramientas
      // rotas.
      expect(salida.toLowerCase()).not.toContain('no existe una herramienta');
      expect(salida.toLowerCase()).not.toContain('no se pudo leer');
      expect(salida.toLowerCase()).not.toContain('no se pudieron leer');

      // Lo propio de las dos nuevas: el estado del día con el id que permite
      // deshacer cada marca, y el saldo que evita proponer un descuento
      // imposible. Sin el `registroId`, `proponer_quitar_marcas` no podría
      // existir sin que el modelo invente ids (decisión 1 del #30).
      expect(salida).toContain('"sesionAbierta":true');
      expect(salida).toContain(alfa.registroDeAna);
      expect(salida).toContain(alfa.nombreLeer);
      expect(salida, 'el saldo de la billetera tiene que viajar').toContain('"saldo":30');

      // Criterio 13, revalidado con las dos nuevas encima.
      for (const prohibido of ['organizacionId', 'grupoId', 'tenant', '@']) {
        expect(salida, `una lectura mandó «${prohibido}»`).not.toContain(prohibido);
      }

      expect(salida).not.toContain(alfa.org.organizacionId);
      expect(salida).not.toContain(alfa.org.grupoId);

      // Criterio 12: aislamiento sobre las dos lecturas nuevas, con ids REALES
      // de la otra organización y no uuids inventados.
      for (const ajeno of [beta.registroDeAna, beta.ana, beta.leerId, beta.nombreLeer]) {
        expect(salida, `se filtró «${ajeno}» de la otra organización`).not.toContain(ajeno);
      }
    });

    test('anotar: lo que hoy no le toca a esa persona no crea propuesta; lo que sí, se aplica y suma', async () => {
      test.slow();

      // Criterio 9. La actividad existe y es del grupo —el modelo no inventó
      // nada—, pero es de Beto: es el caso que la validación de shape deja
      // pasar y que termina en una fila roja con el Tutor mirando.
      stub.olvidarPedidos();
      stub.guionar(
        {
          llamadas: [
            {
              nombre: 'proponer_anotar',
              argumentos: {
                anotaciones: [{ participanteId: alfa.ana, tipo: 'HIZO', id: alfa.soloDeBetoId }],
              },
            },
          ],
        },
        { texto: 'Tenés razón, esa no le toca a ella.' }
      );

      const rechazo = await alfa.org.api.postOk<{ propuestas: unknown[] }>('/ai/conversaciones', {
        grupoId: alfa.org.grupoId,
        primerMensaje: 'marcale piano a Ana',
      });

      expect(rechazo.propuestas).toHaveLength(0);
      expect(JSON.stringify(stub.pedidos.at(-1)?.entrada)).toContain(
        'no está entre las actividades de hoy'
      );

      const antesAna = await puntajeDe(alfa, alfa.ana);
      const antesBeto = await puntajeDe(alfa, alfa.beto);

      stub.olvidarPedidos();
      stub.guionar(
        {
          llamadas: [
            {
              nombre: 'proponer_anotar',
              argumentos: {
                anotaciones: [
                  { participanteId: alfa.ana, tipo: 'HIZO', id: alfa.ordenarId },
                  { participanteId: alfa.beto, tipo: 'CONDUCTA', id: alfa.conductaId },
                ],
              },
            },
          ],
        },
        { texto: 'Anotado lo del día.' }
      );

      const detalle = await alfa.org.api.postOk<{
        propuestas: Array<{
          id: string;
          tipo: string;
          operaciones: Array<{ opId: string; metodo: string; ruta: string; body: unknown; etiqueta: string }>;
        }>;
      }>('/ai/conversaciones', {
        grupoId: alfa.org.grupoId,
        primerMensaje: 'anotá lo de hoy',
      });
      const propuesta = detalle.propuestas[0];

      expect(propuesta.tipo).toBe('ANOTAR_REGISTROS');
      // Anotar NO es destructivo: ninguna de sus operaciones borra nada, y por
      // eso la tarjeta de esta familia no lleva la ceremonia del rojo
      // (decisión 7: lo que agrega y lo que quita nunca comparten tarjeta).
      expect(propuesta.operaciones.map((operacion) => operacion.metodo)).toEqual(['POST', 'POST']);
      // La etiqueta dice cuánto suma cada una: es lo que el Tutor aprueba.
      expect(propuesta.operaciones[0].etiqueta).toContain('le suma 7 puntos');
      expect(propuesta.operaciones[1].etiqueta).toContain('le suma 5 puntos');

      // El armador traduce `participanteId` → `usuarioId` en el body, que es
      // lo que espera el contrato de activity.
      expect(propuesta.operaciones[0].body).toEqual({ usuarioId: alfa.ana });

      for (const operacion of propuesta.operaciones) {
        const respuesta = await aplicarOperacion(alfa.org.api, operacion);

        expect(respuesta.ok(), `${operacion.metodo} ${operacion.ruta}`).toBeTruthy();
      }

      await esperarPuntaje(alfa, alfa.ana, antesAna + 7);
      await esperarPuntaje(alfa, alfa.beto, antesBeto + 5);
    });

    test('ajustes manuales: el descuento que deja el saldo bajo 0 no se propone; el que entra escribe en los dos servicios', async () => {
      test.slow();

      // Criterio 10. Ana tiene 30: el endpoint destino rechazaría el −50 al
      // aplicar, así que la propuesta ni se guarda.
      stub.olvidarPedidos();
      stub.guionar(
        {
          llamadas: [
            {
              nombre: 'proponer_ajustes_manuales',
              argumentos: {
                ajustes: [{ participanteId: alfa.ana, monedas: -50, motivo: 'Rompió un vaso' }],
              },
            },
          ],
        },
        { texto: 'No le alcanza el saldo para eso.' }
      );

      const rechazo = await alfa.org.api.postOk<{ propuestas: unknown[] }>('/ai/conversaciones', {
        grupoId: alfa.org.grupoId,
        primerMensaje: 'sacale 50 monedas a Ana',
      });

      expect(rechazo.propuestas).toHaveLength(0);
      // El error dice cuánto SE PUEDE sacar, no solo que no se puede: es lo que
      // le permite al modelo corregirse en el turno siguiente.
      expect(JSON.stringify(stub.pedidos.at(-1)?.entrada)).toContain('no puede quedar bajo 0');

      const antes = await puntajeDe(alfa, alfa.ana);

      // Un solo acto del Tutor —«ayudó con la mudanza»— que el armador parte en
      // los dos requests que hacen falta, con el mismo motivo en los dos.
      stub.olvidarPedidos();
      stub.guionar(
        {
          llamadas: [
            {
              nombre: 'proponer_ajustes_manuales',
              argumentos: {
                ajustes: [
                  {
                    participanteId: alfa.ana,
                    puntos: 10,
                    monedas: -20,
                    motivo: 'Ayudó con la mudanza y se compró un helado',
                  },
                ],
              },
            },
          ],
        },
        { texto: 'Le puse 10 puntos y le descontué 20.' }
      );

      const detalle = await alfa.org.api.postOk<{
        propuestas: Array<{
          tipo: string;
          operaciones: Array<{ opId: string; metodo: string; ruta: string; body: unknown; etiqueta: string }>;
        }>;
      }>('/ai/conversaciones', {
        grupoId: alfa.org.grupoId,
        primerMensaje: 'ayudó con la mudanza',
      });
      const propuesta = detalle.propuestas[0];

      expect(propuesta.tipo).toBe('AJUSTES_MANUALES');
      // Una fila del modelo, dos endpoints de dos servicios distintos: es la
      // plomería que la tarjeta esconde y que acá sí se verifica.
      expect(propuesta.operaciones.map((operacion) => operacion.ruta)).toEqual([
        `/scoring/grupos/${alfa.org.grupoId}/usuarios/${alfa.ana}/ajuste`,
        `/rewards/grupos/${alfa.org.grupoId}/usuarios/${alfa.ana}/ajuste`,
      ]);
      // Los dos números viajan independientes: ninguno se deriva del otro
      // (decisión 1 del #28), y el nombre del campo cambia porque son cosas
      // distintas.
      expect(propuesta.operaciones[0].body).toMatchObject({ puntos: 10 });
      expect(propuesta.operaciones[1].body).toMatchObject({ monto: -20 });
      // El saldo resultante en la etiqueta: «-20» no dice nada sin él.
      expect(propuesta.operaciones[1].etiqueta).toContain('queda con 10');

      for (const operacion of propuesta.operaciones) {
        const respuesta = await aplicarOperacion(alfa.org.api, operacion);

        expect(respuesta.ok(), `${operacion.metodo} ${operacion.ruta}`).toBeTruthy();
      }

      await esperarPuntaje(alfa, alfa.ana, antes + 10);

      const billeteras = await alfa.org.api.getOk<Array<{ usuarioId: string; saldo: number }>>(
        `/rewards/grupos/${alfa.org.grupoId}/billeteras`
      );

      expect(billeteras.find((fila) => fila.usuarioId === alfa.ana)?.saldo).toBe(10);
    });

    test('quitar una marca: un registroId ajeno o inventado se rechaza, y el que vale BAJA el puntaje', async () => {
      test.slow();

      // Criterio 11 sobre las entidades nuevas. El segundo caso es el que
      // importa: un `registroId` REAL, vivo, de la sesión abierta de la otra
      // organización. La validación de shape lo deja pasar y solo el cruce
      // contra `estado_de_hoy` de ESTE grupo lo frena.
      for (const [caso, registroId] of [
        ['inventado', UUID_DE_NADIE],
        ['de la otra organización', beta.registroDeAna],
      ] as const) {
        stub.olvidarPedidos();
        stub.guionar(
          {
            llamadas: [
              {
                nombre: 'proponer_quitar_marcas',
                argumentos: { marcas: [{ registroId, tipo: 'COMPLETADA' }] },
              },
            ],
          },
          { texto: 'Me equivoqué de id.' }
        );

        const rechazo = await alfa.org.api.postOk<{ propuestas: unknown[] }>('/ai/conversaciones', {
          grupoId: alfa.org.grupoId,
          primerMensaje: `quitá la marca ${caso}`,
        });

        expect(rechazo.propuestas, `el registroId ${caso} no debería armar propuesta`).toHaveLength(
          0
        );
        expect(JSON.stringify(stub.pedidos.at(-1)?.entrada)).toContain('marca viva');
      }

      // Y no quedó ni una fila de los dos rechazos.
      const filas = await consultar(
        'ai_db',
        `select id from "Propuesta" where "grupoId" = $1 and tipo = 'QUITAR_MARCAS'`,
        [alfa.org.grupoId]
      );

      expect(filas).toHaveLength(0);

      // Criterio 8: quitar una completada SÍ baja el puntaje, y la fila lo
      // había dicho. Es la contracara del criterio 7 y por eso los dos tests
      // afirman sobre la etiqueta además del número.
      const antes = await puntajeDe(alfa, alfa.ana);

      stub.olvidarPedidos();
      stub.guionar(
        {
          llamadas: [
            {
              nombre: 'proponer_quitar_marcas',
              argumentos: {
                marcas: [
                  {
                    registroId: alfa.registroDeAna,
                    tipo: 'COMPLETADA',
                    motivo: 'La marqué a la persona equivocada',
                  },
                ],
              },
            },
          ],
        },
        { texto: 'Listo, se la saco.' }
      );

      const detalle = await alfa.org.api.postOk<{
        propuestas: Array<{
          tipo: string;
          operaciones: Array<{ opId: string; metodo: string; ruta: string; body: unknown; etiqueta: string }>;
        }>;
      }>('/ai/conversaciones', {
        grupoId: alfa.org.grupoId,
        primerMensaje: 'quitale la lectura a Ana',
      });
      const operacion = detalle.propuestas[0].operaciones[0];

      expect(detalle.propuestas[0].tipo).toBe('QUITAR_MARCAS');
      expect(operacion.metodo).toBe('DELETE');
      // El motivo va como query param y no en el body: un DELETE con cuerpo
      // pasa por demasiados intermediarios con derecho a descartarlo, y el
      // Gateway es uno (fase-14-12).
      expect(operacion.ruta).toContain('?motivo=');
      expect(operacion.body).toBeNull();
      // La fila dice lo que se pierde, con el número.
      expect(operacion.etiqueta).toContain('pierde 10 puntos');

      const respuesta = await aplicarOperacion(alfa.org.api, operacion);

      expect(respuesta.ok(), `${operacion.metodo} ${operacion.ruta}`).toBeTruthy();

      await esperarPuntaje(alfa, alfa.ana, antes - 10);
    });

    test('archivar tres, falla la segunda: quedan 2, APLICADA_PARCIAL, y el puntaje de nadie se movió', async () => {
      test.slow();

      // Criterios 7 y 15 en la misma propuesta, porque son la misma tarjeta
      // mirada de los dos lados: lo que promete la fila («su historial y los
      // puntos que dio quedan») y lo que pasa cuando una operación falla.
      const antesAna = await puntajeDe(alfa, alfa.ana);
      const antesBeto = await puntajeDe(alfa, alfa.beto);

      stub.olvidarPedidos();
      stub.guionar(
        {
          llamadas: [
            {
              nombre: 'proponer_archivar',
              argumentos: {
                items: [
                  { tipo: 'ACTIVIDAD', id: alfa.ordenarId },
                  { tipo: 'CONDUCTA', id: alfa.conductaId },
                  { tipo: 'ETIQUETA', id: alfa.etiquetaId },
                ],
                resumen: 'Nadie las usa desde que cambió la rutina.',
              },
            },
          ],
        },
        { texto: 'Te propuse archivar tres cosas.' }
      );

      const detalle = await alfa.org.api.postOk<{
        propuestas: Array<{
          id: string;
          tipo: string;
          operaciones: Array<{ opId: string; metodo: string; ruta: string; body: unknown; etiqueta: string }>;
        }>;
      }>('/ai/conversaciones', {
        grupoId: alfa.org.grupoId,
        primerMensaje: 'sacá lo que no usa nadie',
      });
      const propuesta = detalle.propuestas[0];

      expect(propuesta.tipo).toBe('ARCHIVAR_CATALOGO');
      expect(propuesta.operaciones.map((operacion) => operacion.metodo)).toEqual([
        'DELETE',
        'DELETE',
        'DELETE',
      ]);
      // Criterio 7, la mitad que se lee: la fila promete que los puntos que la
      // actividad ya dio quedan. Abajo se verifica que sea verdad.
      expect(propuesta.operaciones[0].etiqueta).toContain('los puntos que dio quedan');

      const resultado = [];

      for (const [indice, operacion] of propuesta.operaciones.entries()) {
        // La segunda se rompe del modo en que se rompe de verdad una propuesta
        // que vale 24 h: la conducta ya no está cuando el Tutor aprieta
        // «Aplicar» —otro tutor la archivó desde la pantalla—, así que la ruta
        // apunta a algo que no existe. En un DELETE no hay body que ensuciar:
        // lo que se rompe es el recurso.
        const ruta =
          indice === 1 ? `/activity/conductas/${UUID_DE_NADIE}` : operacion.ruta;
        const respuesta = await aplicarOperacion(alfa.org.api, { ...operacion, ruta });

        resultado.push(
          respuesta.ok()
            ? { opId: operacion.opId, ok: true }
            : { opId: operacion.opId, ok: false, error: (await respuesta.json()).message }
        );
      }

      const registrada = await alfa.org.api.postOk<{
        estado: string;
        resultado: Array<{ ok: boolean; error?: string }>;
      }>(`/ai/propuestas/${propuesta.id}/aplicada`, { resultado });

      // Criterio 15: dos archivados y una fila roja es mejor que perder las tres.
      expect(registrada.estado).toBe('APLICADA_PARCIAL');
      expect(registrada.resultado).toHaveLength(3);
      expect(registrada.resultado.filter((fila) => fila.ok)).toHaveLength(2);
      expect(registrada.resultado[1].error).toBeTruthy();

      const actividades = await alfa.org.api.getOk<Array<{ id: string }>>(
        `/activity/grupos/${alfa.org.grupoId}/actividades?estado=ACTIVA`
      );
      const conductas = await alfa.org.api.getOk<Array<{ id: string }>>(
        `/activity/grupos/${alfa.org.grupoId}/conductas?estado=ACTIVA`
      );

      expect(actividades.map((fila) => fila.id)).not.toContain(alfa.ordenarId);
      // La que falló NO se archivó: el `for` sigue, no revierte.
      expect(conductas.map((fila) => fila.id)).toContain(alfa.conductaId);

      // Criterio 7, la mitad que importa: archivar es SOFT y el ledger no se
      // toca. Ana había ganado 7 puntos con esa actividad y los conserva.
      expect(await puntajeDe(alfa, alfa.ana)).toBe(antesAna);
      expect(await puntajeDe(alfa, alfa.beto)).toBe(antesBeto);
    });

    test('borrar una zona: la propuesta lleva un DELETE, se aplica en el orden que trae y la escala queda cerrada', async () => {
      test.slow();

      // Criterio 6. La misma herramienta que edita rangos produce acá una
      // propuesta con un borrado adentro: es destructiva **por su operación y
      // no por su tipo**, que es lo que `esPropuestaDestructiva` decide en el
      // frontend y lo que esta propuesta le da para decidir.
      const umbrales = await alfa.org.api.getOk<
        Array<{ id: string; nombreZona: string; orden: number; puntosMin: number; colorHex: string }>
      >(`/scoring/grupos/${alfa.org.grupoId}/umbrales`);
      const dorado = umbrales.find((umbral) => umbral.nombreZona === 'Dorado');
      const verde = umbrales.find((umbral) => umbral.nombreZona === 'Verde');

      expect(dorado && verde, 'el escenario tiene que traer Verde y Dorado').toBeTruthy();

      stub.olvidarPedidos();
      stub.guionar(
        {
          llamadas: [
            {
              nombre: 'proponer_umbrales_zona',
              argumentos: {
                // Lo ÚNICO que se puede acompañar a un borrado: abrirle el
                // techo a la que queda arriba. Correr un límite compartido no
                // tiene orden posible, y la tanda 7 lo descubrió con un test
                // que falló teniendo razón.
                borrar: [dorado?.id],
                editar: [
                  {
                    umbralZonaId: verde?.id,
                    nombreZona: 'Verde',
                    orden: verde?.orden,
                    puntosMin: verde?.puntosMin,
                    puntosMax: null,
                    colorHex: verde?.colorHex,
                  },
                ],
              },
            },
          ],
        },
        { texto: 'Te propuse sacar Dorado y estirar Verde.' }
      );

      const detalle = await alfa.org.api.postOk<{
        propuestas: Array<{
          tipo: string;
          operaciones: Array<{ opId: string; metodo: string; ruta: string; body: unknown; etiqueta: string }>;
        }>;
      }>('/ai/conversaciones', {
        grupoId: alfa.org.grupoId,
        primerMensaje: 'sacá la zona de arriba',
      });
      const propuesta = detalle.propuestas[0];

      expect(propuesta.tipo).toBe('UMBRALES_ZONA');
      // El DELETE primero: con Verde ya sin techo y Dorado todavía vivo habría
      // dos cimas, y scoring rechaza ese paso intermedio. El orden lo resolvió
      // el armador, no el que aplica.
      expect(propuesta.operaciones.map((operacion) => operacion.metodo)).toEqual([
        'DELETE',
        'PATCH',
      ]);
      expect(propuesta.operaciones[0].ruta).toBe(`/scoring/umbrales/${dorado?.id}`);
      // Este es uno de los dos únicos borrados DUROS del monorepo y la fila lo
      // dice con esas palabras: el rojo de la tarjeta no distingue archivar de
      // borrar.
      expect(propuesta.operaciones[0].etiqueta).toContain('no se puede deshacer');

      const alReves = await aplicarOperacion(alfa.org.api, propuesta.operaciones[1]);

      expect(
        alReves.status(),
        'estirar Verde con Dorado vivo deja dos zonas sin techo y scoring lo rechaza'
      ).toBe(400);

      for (const operacion of propuesta.operaciones) {
        const respuesta = await aplicarOperacion(alfa.org.api, operacion);

        expect(respuesta.ok(), `${operacion.metodo} ${operacion.ruta}`).toBeTruthy();
      }

      const despues = await alfa.org.api.getOk<Array<{ nombreZona: string; puntosMax: number | null }>>(
        `/scoring/grupos/${alfa.org.grupoId}/umbrales`
      );

      expect(despues.map((umbral) => umbral.nombreZona)).not.toContain('Dorado');
      expect(despues.find((umbral) => umbral.nombreZona === 'Verde')?.puntosMax).toBeNull();
    });

    test('el aviso que cambió apaga el asistente hasta que un ORG_ADMIN acepte la versión nueva', async () => {
      test.slow();

      // Criterio 14, la única parte del ítem que interrumpe a alguien que ya lo
      // tenía andando. Se simula una organización del #29: switch PRENDIDO,
      // consentimiento dado, y `avisoVersion` en NULL porque la columna no
      // existía cuando aceptó.
      const org = await montarOrganizacion('IaAvisoV2');

      await org.api.putOk('/ai/configuracion', { habilitada: true, aceptaAviso: true });
      await consultar(
        'ai_db',
        'update "ConfiguracionIaOrganizacion" set "avisoVersion" = null where "organizacionId" = $1',
        [org.organizacionId]
      );

      const antes = await org.api.getOk<{
        habilitada: boolean;
        avisoAceptado: boolean;
        avisoVersionAceptada: number | null;
        avisoVersionVigente: number;
        puedeUsarse: boolean;
      }>('/ai/configuracion');

      // La fila vieja NO es una aceptación vacía: vale como versión 1, con su
      // fecha intacta. Decirle al dueño que nunca aceptó nada sería falso.
      expect(antes.habilitada).toBe(true);
      expect(antes.avisoVersionAceptada).toBe(1);
      expect(antes.avisoVersionVigente).toBe(2);
      expect(antes.avisoAceptado).toBe(false);
      expect(antes.puedeUsarse).toBe(false);

      stub.olvidarPedidos();
      stub.guionar({ texto: 'no debería llegar acá' });

      const conversar = await org.api.post('/ai/conversaciones', {
        grupoId: org.grupoId,
        primerMensaje: 'hola',
      });

      expect(conversar.status()).toBe(403);
      // Código propio y no IA_NO_HABILITADA: el switch está prendido, y mandar
      // al Tutor a apretar un interruptor que ya está en sí sería la peor
      // versión de este error.
      expect((await conversar.json()).code).toBe('AVISO_DESACTUALIZADO');
      // El gate corta ANTES del proveedor: no se gasta un token de alguien que
      // no autorizó que sus datos salgan.
      expect(stub.llamadas).toBe(0);

      const reaceptado = await org.api.putOk<{ avisoAceptado: boolean; puedeUsarse: boolean }>(
        '/ai/configuracion',
        { habilitada: true, aceptaAviso: true }
      );

      expect(reaceptado.avisoAceptado).toBe(true);
      expect(reaceptado.puedeUsarse).toBe(true);

      stub.guionar({ texto: 'Ahora sí, hola.' });

      const despues = await org.api.post('/ai/conversaciones', {
        grupoId: org.grupoId,
        primerMensaje: 'hola',
      });

      expect(despues.status()).toBe(201);
      expect(stub.llamadas).toBeGreaterThan(0);
    });
  });
});
