import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';

import type { ApiErrorResponse } from './api-error';
import { DomainException } from './excepciones';

/**
 * Códigos de fallback para excepciones HTTP estándar de NestJS que no traen
 * un `code` de negocio propio (las de negocio usan `DomainException`).
 */
const CODES_POR_STATUS: Record<number, string> = {
  400: 'VALIDACION',
  401: 'NO_AUTENTICADO',
  403: 'PROHIBIDO',
  404: 'NO_ENCONTRADO',
  409: 'CONFLICTO',
  410: 'RECURSO_EXPIRADO',
  503: 'SERVICIO_NO_DISPONIBLE',
};

interface ResponseLike {
  status(codigo: number): { json(body: unknown): void };
}

interface RequestLike {
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
  method?: string;
}

/**
 * Filtro global de excepciones (ADR-00 §7): traduce TODA excepción al sobre
 * `ApiErrorResponse`. Se registra en el `main.ts` de cada servicio:
 * `app.useGlobalFilters(new HttpExceptionFilter())`.
 *
 * Una excepción no anticipada cae a `ERROR_INTERNO` / 500 y NO expone el
 * mensaje real al cliente (solo al log).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<ResponseLike>();
    const req = ctx.getRequest<RequestLike>();

    const headerCorrelacion = req.headers?.['x-correlation-id'];
    const correlationId =
      (Array.isArray(headerCorrelacion) ? headerCorrelacion[0] : headerCorrelacion) ?? '';

    const cuerpo = this.traducir(exception, correlationId);

    if (cuerpo.statusCode >= 500) {
      const detalle = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(
        `${req.method ?? ''} ${req.url ?? ''} -> ${cuerpo.statusCode} [${correlationId}]: ${detalle}`
      );
    }

    res.status(cuerpo.statusCode).json(cuerpo);
  }

  private traducir(exception: unknown, correlationId: string): ApiErrorResponse {
    if (exception instanceof DomainException) {
      return {
        // Los extras van primero: no pueden pisar los 4 campos del sobre.
        ...exception.extras,
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        correlationId,
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      return {
        statusCode,
        code: CODES_POR_STATUS[statusCode] ?? 'ERROR_HTTP',
        message: this.extraerMensaje(exception),
        correlationId,
      };
    }

    return {
      statusCode: 500,
      code: 'ERROR_INTERNO',
      message: 'Error interno del servidor',
      correlationId,
    };
  }

  private extraerMensaje(exception: HttpException): string {
    const respuesta = exception.getResponse();

    // ValidationPipe entrega { message: string[] } — se aplanan en un solo texto.
    if (typeof respuesta === 'object' && respuesta !== null) {
      const mensaje = (respuesta as { message?: unknown }).message;

      if (Array.isArray(mensaje)) {
        return mensaje.join('; ');
      }

      if (typeof mensaje === 'string') {
        return mensaje;
      }
    }

    return exception.message;
  }
}
