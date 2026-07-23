import { HttpErrorResponse } from '@angular/common/http';

import type { ApiError } from '../auth/auth.types';

/** Extrae el mensaje legible del sobre ApiErrorResponse (ADR-00 §7). */
export function mensajeDeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const api = error.error as Partial<ApiError> | null;

    if (api && typeof api.message === 'string' && api.message.length > 0) {
      return api.message;
    }

    if (error.status === 0) {
      return 'No se pudo conectar con el servidor. Revisá tu conexión.';
    }
  }

  return 'Ocurrió un error inesperado. Intentá de nuevo.';
}

export function codigoDeError(error: unknown): string | null {
  if (error instanceof HttpErrorResponse) {
    const api = error.error as Partial<ApiError> | null;

    return api?.code ?? null;
  }

  return null;
}
