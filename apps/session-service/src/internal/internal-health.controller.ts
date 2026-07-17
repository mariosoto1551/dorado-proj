import { Controller, Get } from '@nestjs/common';

/**
 * Health check (GET /internal/health). Sin guard a propósito: no expone datos
 * y así puede usarlo también un healthcheck de Docker/orquestador y el
 * GET /api/health del Gateway sin conocer el secreto interno (mismo criterio
 * que identity, billing y activity, documentado en docs/progreso/fase-02).
 */
@Controller('internal')
export class InternalHealthController {
  @Get('health')
  health(): { status: string; service: string } {
    return { status: 'ok', service: 'session-service' };
  }
}
