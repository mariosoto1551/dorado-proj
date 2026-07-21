/**
 * Cliente mínimo de la HTTP Management API de RabbitMQ (:15672) — se usa en el
 * test de carga/DLQ (Fase 12 punto 4) para leer la profundidad de la Dead
 * Letter Queue sin abrir una conexión AMQP. Credenciales por defecto de la
 * imagen `rabbitmq:4.3-management` (guest/guest, solo accesible desde
 * localhost, que es exactamente donde corre la suite).
 */
const BASE = process.env['E2E_RABBIT_MGMT_URL'] ?? 'http://localhost:15672';
const USER = process.env['E2E_RABBIT_USER'] ?? 'guest';
const PASS = process.env['E2E_RABBIT_PASS'] ?? 'guest';
const VHOST = encodeURIComponent(process.env['E2E_RABBIT_VHOST'] ?? '/');

interface ColaInfo {
  name: string;
  messages: number;
  messages_ready: number;
}

function auth(): string {
  return 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
}

/** Lista de colas del vhost con su profundidad. */
export async function listarColas(): Promise<ColaInfo[]> {
  const res = await fetch(`${BASE}/api/queues/${VHOST}`, {
    headers: { authorization: auth() },
  });

  if (!res.ok) {
    throw new Error(`RabbitMQ management devolvió ${res.status} listando colas`);
  }

  return (await res.json()) as ColaInfo[];
}

/** Mensajes totales en una cola (0 si no existe todavía). */
export async function mensajesEnCola(nombre: string): Promise<number> {
  const colas = await listarColas();
  const cola = colas.find((c) => c.name === nombre);

  return cola?.messages ?? 0;
}

/** Nombres de todas las colas que parecen dead-letter (heurística por nombre). */
export async function colasDlq(): Promise<ColaInfo[]> {
  const colas = await listarColas();

  return colas.filter((c) => /dlq|dead|\.dl$|-dl$/i.test(c.name));
}

/** true si existe una cola con ese nombre exacto en el vhost. */
export async function existeCola(nombre: string): Promise<boolean> {
  const colas = await listarColas();

  return colas.some((c) => c.name === nombre);
}

/**
 * Publica un mensaje crudo a un exchange vía la Management API (endpoint
 * `/exchanges/{vhost}/{name}/publish`). Se usa para inyectar un mensaje
 * "veneno" en el bus sin abrir una conexión AMQP — el consumidor real lo toma,
 * falla, reintenta y lo manda a su DLQ (Fase 12.4). Devuelve `routed`.
 */
export async function publicarRaw(
  exchange: string,
  routingKey: string,
  payload: unknown
): Promise<boolean> {
  const res = await fetch(`${BASE}/api/exchanges/${VHOST}/${encodeURIComponent(exchange)}/publish`, {
    method: 'POST',
    headers: { authorization: auth(), 'content-type': 'application/json' },
    body: JSON.stringify({
      properties: { content_type: 'application/json', delivery_mode: 2 },
      routing_key: routingKey,
      payload: JSON.stringify(payload),
      payload_encoding: 'string',
    }),
  });

  if (!res.ok) {
    throw new Error(`RabbitMQ management devolvió ${res.status} publicando a ${exchange}`);
  }

  const cuerpo = (await res.json()) as { routed: boolean };

  return cuerpo.routed;
}
