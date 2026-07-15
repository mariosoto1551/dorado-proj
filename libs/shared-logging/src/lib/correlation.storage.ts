import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Almacén por-request del correlationId (ADR-00 §5; fase-01, logging
 * estructurado). Lo inicializa `correlationMiddleware` al inicio de cada
 * request y lo leen el logger y los publishers de eventos para propagar el id
 * sin tener que pasarlo a mano por cada capa.
 */
export interface CorrelationStore {
  correlationId: string;
}

export const correlationStorage = new AsyncLocalStorage<CorrelationStore>();

export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore()?.correlationId;
}
