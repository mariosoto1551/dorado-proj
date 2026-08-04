import { Controller, Get } from '@nestjs/common';

/**
 * Health check (GET /internal/health). Sin guard a propósito: no expone datos
 * y así puede usarlo también un healthcheck de Docker/orquestador y el
 * GET /api/health del Gateway sin conocer el secreto interno (mismo criterio
 * que el resto de los servicios, documentado en docs/progreso/fase-02-identity.md).
 *
 * **Faltaba desde la tanda 2** y no se notó hasta levantar el stack entero: el
 * Gateway pingea esta ruta, no la puerta pública, así que `/api/health`
 * reportaba `ai: "down"` con el servicio arriba y contestando. Eso además
 * volvía imposible de verificar el criterio de aceptación 9 de la spec —"con
 * ai-service apagado, el health lo reporta caído"— porque lo reportaba caído
 * siempre, prendido o apagado.
 *
 * Es el mismo modo de falla que la Fase 14 ya vio cinco veces: la pieza estaba
 * bien y lo que faltaba era el cable.
 */
@Controller('internal')
export class InternalHealthController {
  @Get('health')
  health(): { status: string; service: string } {
    return { status: 'ok', service: 'ai-service' };
  }
}
