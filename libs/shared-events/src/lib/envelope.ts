/**
 * Envelope estándar de todo evento de dominio publicado a RabbitMQ.
 * Fuente de verdad: docs/architecture/ADR-00-decisiones-fundacionales.md, sección 5.
 */
export interface EventEnvelope<T> {
  /** uuid v4, para idempotencia en el consumidor */
  eventId: string;
  /** ej. 'ActividadCompletada' */
  eventType: string;
  /** nombre del servicio productor */
  producedBy: string;
  organizacionId: string;
  grupoId?: string;
  /** ISO 8601 */
  occurredAt: string;
  /**
   * Propagado desde el header x-correlation-id del request HTTP que lo originó.
   * Si lo dispara un job interno sin request asociado, se genera uno nuevo al
   * inicio del job.
   */
  correlationId: string;
  payload: T;
}
