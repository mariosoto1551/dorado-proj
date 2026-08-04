import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getCorrelationId } from '@dorado/shared-logging';

/**
 * Timeout de las llamadas síncronas internas (mismo criterio que fase-04: 2s).
 * Es holgado para un GET dentro de la misma red y corto frente a los segundos
 * que tarda el proveedor: una herramienta lenta no puede ser la que hace
 * esperar al Tutor.
 */
const TIMEOUT_MS = 2000;

/**
 * Base de los clientes REST internos de ai-service (ADR-00 §4).
 *
 * **Acá vive, en forma ejecutable, la decisión 6 del ítem: la IA no tiene
 * manos.** Esta clase expone UN solo método de red, `get`, y no hay ninguna
 * otra forma de que este servicio hable con otro. No es una convención que
 * haya que recordar: no existe el método que escribiría.
 *
 * Si alguna vez hace falta que ai-service escriba en otro servicio, esto no se
 * amplía — se vuelve a la spec. Aplicar una propuesta lo hace el frontend con
 * el JWT del Tutor contra los endpoints públicos que ya existen, y ese diseño
 * es el ítem entero, no un detalle de implementación.
 *
 * `clientes-solo-lectura.spec.ts` lo verifica sobre el código fuente.
 */
export abstract class ClienteInternoBase {
  protected readonly logger: Logger;

  private readonly baseUrl: string;

  private readonly secreto: string;

  protected constructor(config: ConfigService, variableUrl: string, nombre: string) {
    this.logger = new Logger(nombre);
    this.baseUrl = config.getOrThrow<string>(variableUrl).replace(/\/+$/, '');
    this.secreto = config.getOrThrow<string>('GATEWAY_INTERNAL_SECRET');
  }

  /**
   * GET interno. Devuelve `null` ante cualquier problema (servicio caído,
   * timeout, 404, 500) en vez de lanzar.
   *
   * El llamador es una herramienta de lectura en medio de una conversación: si
   * el catálogo no se puede leer ahora, lo correcto es decírselo al modelo para
   * que lo diga en castellano, no tirar abajo el turno entero con un 503. La
   * diferencia con el `BillingClientService` es deliberada — allá el `null`
   * apaga el asistente porque decide si se gasta plata; acá solo falta un dato.
   */
  protected async get<T>(ruta: string): Promise<T | null> {
    const correlationId = getCorrelationId();

    try {
      const respuesta = await fetch(`${this.baseUrl}${ruta}`, {
        method: 'GET',
        headers: {
          'x-internal-secret': this.secreto,
          ...(correlationId && { 'x-correlation-id': correlationId }),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!respuesta.ok) {
        this.logger.warn(`GET ${ruta} respondió ${respuesta.status}`);

        return null;
      }

      return (await respuesta.json()) as T;
    } catch (error) {
      this.logger.warn(
        `GET ${ruta} falló (${error instanceof Error ? error.message : String(error)})`
      );

      return null;
    }
  }
}
