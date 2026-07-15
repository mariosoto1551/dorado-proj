import { Controller, Get } from '@nestjs/common';

/**
 * Health check (GET /internal/health). Sin guard a propósito: no expone datos
 * y así puede usarlo también un healthcheck de Docker/orquestador sin conocer
 * el secreto interno. Decisión documentada en docs/progreso/fase-02-identity.md.
 */
@Controller('internal')
export class InternalHealthController {
  @Get('health')
  health(): { status: string; service: string } {
    return { status: 'ok', service: 'identity-service' };
  }
}
