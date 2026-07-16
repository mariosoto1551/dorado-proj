import { Controller, Get } from '@nestjs/common';

/**
 * Health check (GET /internal/health). Sin guard a propósito: no expone datos
 * y así puede usarlo también un healthcheck de Docker/orquestador y el
 * GET /api/health del Gateway sin conocer el secreto interno (mismo criterio
 * que identity, documentado en docs/progreso/fase-02-identity.md).
 */
@Controller('internal')
export class InternalHealthController {
  @Get('health')
  health(): { status: string; service: string } {
    return { status: 'ok', service: 'billing-service' };
  }
}
