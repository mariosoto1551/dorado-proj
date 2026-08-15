import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getCorrelationId } from '@dorado/shared-logging';
import { AjusteHistorialInternoDto } from '@dorado/shared-types';

const TIMEOUT_MS = 2000;

/** Lo que el timeline necesita saber para pedir una página de ajustes. */
export interface PedidoAjustesSesion {
  organizacionId: string;
  grupoId: string;
  sesionId: string;
  usuarioId?: string;
  cursor?: { createdAt: Date; id: string };
  limite: number;
}

/**
 * El resultado **con su propia veracidad adentro** (fase-14-34, segunda vuelta).
 *
 * Una lista vacía sola es ambigua de la peor forma posible acá: significa «no
 * hubo ajustes» y también «no pude preguntar». El ítem entero nació de un Tutor
 * que no sabía si lo que hizo se había guardado — devolver un `[]` mudo cuando
 * scoring no contesta le reconstruye esa duda exacta, y encima con la respuesta
 * equivocada. `disponible` es lo que deja que la pantalla diga cuál de las dos
 * cosas está mirando.
 */
export interface AjustesDeLaSesion {
  ajustes: AjusteHistorialInternoDto[];
  /** `false` = scoring no contestó. La lista está vacía por eso, no por vacía. */
  disponible: boolean;
}

/**
 * Cliente REST interno hacia scoring-service (ADR-00 §4).
 *
 * Uso único (fase-14-34): traer los ajustes manuales de puntos de una Sesión
 * para el historial. Es la primera fila del timeline que no sale de una tabla
 * propia — y va por REST y no por un join porque las bases son de dos
 * servicios distintos (regla 2 de CLAUDE.md).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **Falla blando, al revés que `SessionClientService`.** Ahí un 503 es correcto:
 * sin Sesión resuelta no hay registro válido posible. Acá no — el historial es
 * una pantalla de lectura que ya tiene tres fuentes andando, y devolver la
 * página entera en error porque scoring hipó sería cambiar una fila faltante
 * por una pantalla vacía.
 *
 * Pero **blando no es mudo**: el fallo viaja en `disponible: false` hasta la
 * pantalla, que lo dice. Un `[]` silencioso sería peor que el 503, porque el
 * Tutor leería «hoy no hubo ningún ajuste» — una afirmación falsa — en vez de
 * «no se pudo traer esto». El warn del log queda igual, para el que mira acá.
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Injectable()
export class ScoringClientService {
  private readonly logger = new Logger(ScoringClientService.name);

  private readonly baseUrl: string;

  private readonly secreto: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('SCORING_INTERNAL_URL').replace(/\/+$/, '');
    this.secreto = config.getOrThrow<string>('GATEWAY_INTERNAL_SECRET');
  }

  /** Ajustes manuales de la Sesión, del más nuevo al más viejo. */
  async ajustesDeLaSesion(pedido: PedidoAjustesSesion): Promise<AjustesDeLaSesion> {
    const parametros = new URLSearchParams({
      organizacionId: pedido.organizacionId,
      limite: String(pedido.limite),
    });

    if (pedido.usuarioId) {
      parametros.set('usuarioId', pedido.usuarioId);
    }

    if (pedido.cursor) {
      parametros.set('cursorCreatedAt', pedido.cursor.createdAt.toISOString());
      parametros.set('cursorId', pedido.cursor.id);
    }

    const ruta =
      `/internal/scoring/grupos/${pedido.grupoId}/sesiones/${pedido.sesionId}/ajustes` +
      `?${parametros.toString()}`;
    const correlationId = getCorrelationId();

    try {
      const respuesta = await fetch(`${this.baseUrl}${ruta}`, {
        headers: {
          'x-internal-secret': this.secreto,
          ...(correlationId && { 'x-correlation-id': correlationId }),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!respuesta.ok) {
        this.logger.warn(
          `GET ${ruta} respondió ${respuesta.status}: el historial va sin los ajustes manuales`
        );

        return { ajustes: [], disponible: false };
      }

      return { ajustes: (await respuesta.json()) as AjusteHistorialInternoDto[], disponible: true };
    } catch (error) {
      this.logger.warn(
        `GET ${ruta} falló (${error instanceof Error ? error.message : String(error)}): ` +
          'el historial va sin los ajustes manuales'
      );

      return { ajustes: [], disponible: false };
    }
  }
}
