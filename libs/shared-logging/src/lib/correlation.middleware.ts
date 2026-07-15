import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { correlationStorage } from './correlation.storage';

export const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Middleware Express funcional. Se registra con `app.use(correlationMiddleware)`
 * en el `main.ts` de cada servicio, ANTES de que se inicialicen los middlewares
 * de los módulos (así corre primero que el logger HTTP de pino).
 *
 * Lee el header `x-correlation-id` entrante; si no viene (este servicio es el
 * primer punto de entrada), genera un uuid v4 nuevo. Deja el id disponible:
 * - en `req.headers['x-correlation-id']` (para que pino y el filtro de
 *   excepciones lo lean sin depender de este paquete),
 * - en el header de respuesta (para que el cliente pueda reportarlo),
 * - en el AsyncLocalStorage (`getCorrelationId()`) para el resto de la cadena
 *   async del request (eventos RabbitMQ, llamadas REST internas).
 */
export function correlationMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
): void {
  const entrante = req.headers[CORRELATION_HEADER];
  const correlationId =
    typeof entrante === 'string' && entrante.length > 0 ? entrante : randomUUID();

  req.headers[CORRELATION_HEADER] = correlationId;
  res.setHeader(CORRELATION_HEADER, correlationId);

  correlationStorage.run({ correlationId }, next);
}
