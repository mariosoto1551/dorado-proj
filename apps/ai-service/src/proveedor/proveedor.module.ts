import { Module } from '@nestjs/common';

import { OpenAiService } from './openai.service';

/**
 * El único módulo que habla con la API externa de pago (fase-14-29 decisión 7).
 *
 * Está aislado a propósito: es lo que permite apagar el asistente entero sin
 * tocar el camino caliente de la app, y lo que hace que la key tenga un solo
 * archivo donde vivir.
 */
@Module({
  providers: [OpenAiService],
  exports: [OpenAiService],
})
export class ProveedorModule {}
