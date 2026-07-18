import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import {
  EXCHANGE_DORADO_EVENTS,
  EXCHANGE_DORADO_EVENTS_DLX,
} from '@dorado/shared-events';

import { EventosPublisherService } from './eventos-publisher.service';

/**
 * Conexión a RabbitMQ y declaración de la topología (ADR-00 §5): exchange
 * topic único `dorado.events` + su DLX. Activity solo PUBLICA (los 4 eventos
 * de registro de la fase 7 — no consume nada), por eso no declara colas.
 */
@Global()
@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('RABBITMQ_URL'),
        exchanges: [
          { name: EXCHANGE_DORADO_EVENTS, type: 'topic', options: { durable: true } },
          { name: EXCHANGE_DORADO_EVENTS_DLX, type: 'topic', options: { durable: true } },
        ],
        // Fail-fast coherente con ADR-00 §8: si el broker no está, no arrancar a medias.
        connectionInitOptions: { wait: true, timeout: 20000 },
      }),
    }),
  ],
  providers: [EventosPublisherService],
  exports: [EventosPublisherService],
})
export class EventosModule {}
