import { DomainException } from '@dorado/shared-auth';

// Excepciones tipadas de activity-service (ADR-00 §7): cada una lleva su
// `code` estable; HttpExceptionFilter las traduce al sobre ApiErrorResponse.
// Los 403/404 sin code de negocio propio usan las excepciones estándar de
// NestJS (el filtro las mapea a PROHIBIDO/NO_ENCONTRADO).

export class LimitePlanAlcanzadoException extends DomainException {
  constructor() {
    // La spec fase-05 pide `recurso: 'actividades'` en el body del 403.
    super(
      'LIMITE_PLAN_ALCANZADO',
      'El plan actual no permite crear más actividades en este grupo',
      403,
      { recurso: 'actividades' }
    );
  }
}
