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
 * topic único `dorado.events` + su DLX, y la DLQ propia de este servicio
 * (`rewards.dlq`, cuórum) donde terminan los mensajes que agotan reintentos —
 * para revisión manual, nunca descarte silencioso.
 *
 * Rewards consume ZonaAlcanzada (handler en el módulo `consumo`) y publica
 * RecompensaCanjeada vía EventosPublisherService.
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
        queues: [
          {
            name: 'rewards.dlq',
            createQueueIfNotExists: true,
            exchange: EXCHANGE_DORADO_EVENTS_DLX,
            // El DLX conserva el routing key original del mensaje muerto;
            // '#' captura todo lo que este servicio deje de procesar.
            routingKey: '#',
            options: { durable: true, arguments: { 'x-queue-type': 'quorum' } },
          },
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
