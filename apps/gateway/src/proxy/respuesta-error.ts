import type { IncomingMessage, ServerResponse } from 'node:http';

import type { ApiErrorResponse } from '@dorado/shared-auth';

/**
 * Los errores emitidos por los middlewares del Gateway (401/429/502/503)
 * ocurren ANTES del router de Nest, así que el `HttpExceptionFilter` global no
 * los ve — este helper garantiza el mismo sobre `ApiErrorResponse` (ADR-00 §7)
 * para que el frontend no tenga casos especiales.
 */
export function responderErrorGateway(
  req: IncomingMessage,
  res: ServerResponse,
  statusCode: number,
  code: string,
  message: string
): void {
  const headerCorrelacion = req.headers['x-correlation-id'];
  const correlationId =
    (Array.isArray(headerCorrelacion) ? headerCorrelacion[0] : headerCorrelacion) ?? '';

  const cuerpo: ApiErrorResponse = { statusCode, code, message, correlationId };

  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(cuerpo));
}
