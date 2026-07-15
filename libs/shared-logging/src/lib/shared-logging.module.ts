import { DynamicModule, Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LoggerModule } from 'nestjs-pino';

import { CORRELATION_HEADER } from './correlation.middleware';

/**
 * Wrapper de `nestjs-pino` (nunca `console.log` — ver skill nestjs-backend).
 * Cada servicio lo importa en su AppModule:
 *
 * ```ts
 * SharedLoggingModule.forService('identity-service')
 * ```
 *
 * y en `main.ts` activa el logger con `app.useLogger(app.get(Logger))`
 * (Logger de `nestjs-pino`). Todo log lleva `service` y `correlationId`.
 */
@Module({})
export class SharedLoggingModule {
  static forService(serviceName: string): DynamicModule {
    return {
      module: SharedLoggingModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: process.env['LOG_LEVEL'] ?? 'info',
            base: { service: serviceName },
            genReqId: (req) => {
              const entrante = req.headers[CORRELATION_HEADER];
              return typeof entrante === 'string' && entrante.length > 0
                ? entrante
                : randomUUID();
            },
            customProps: (req) => ({
              correlationId: req.headers[CORRELATION_HEADER],
            }),
            transport:
              process.env['NODE_ENV'] === 'production'
                ? undefined
                : { target: 'pino-pretty', options: { singleLine: true } },
          },
        }),
      ],
      exports: [LoggerModule],
    };
  }
}
