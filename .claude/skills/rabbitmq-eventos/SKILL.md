---
name: rabbitmq-eventos
description: Usar siempre que se publique o consuma un evento de dominio en RabbitMQ, se declare un exchange/cola nueva, o se toque la lógica de idempotencia (`EventoProcesado`). Complementa la skill `nestjs-backend` con el detalle específico de mensajería del proyecto.
---

# RabbitMQ y eventos de dominio — Proyecto Dorado

## Versión y topología

- **RabbitMQ 4.3.x**. Usar **colas cuórum** (`quorum queues`), no colas clásicas espejadas — es el default recomendado desde la serie 4.x para durabilidad real (Khepri es el metadata store, ya no hay opción de volver al store viejo).
- Topología completa (exchange único `dorado.events` tipo topic, routing keys `<servicio>.<evento_snake_case>`, DLX `dorado.events.dlx`, colas por consumidor `<servicio-consumidor>.q.<proposito>`): ver `docs/architecture/ADR-00-decisiones-fundacionales.md` sección 5. No inventar una topología distinta ni un exchange nuevo sin actualizar ese documento primero.

## Librería: `@golevelup/nestjs-rabbitmq`

No usar `@nestjs/microservices` con transporte RabbitMQ para esto — ese paquete modela comunicación tipo RPC 1:1 (`@MessagePattern`), y lo que necesita este proyecto es fan-out por topic exchange hacia múltiples consumidores independientes. `@golevelup/nestjs-rabbitmq` da decorators que calzan directo:

```ts
// Publicar (ej. en activity-service, tras crear un RegistroActividad)
await this.amqpConnection.publish('dorado.events', 'activity.actividad_completada', envelope);

// Consumir (ej. en scoring-service)
@RabbitSubscribe({
  exchange: 'dorado.events',
  routingKey: 'activity.actividad_completada',
  queue: 'scoring.q.registros-actividad',
  queueOptions: {
    durable: true,
    deadLetterExchange: 'dorado.events.dlx',
    arguments: { 'x-queue-type': 'quorum' },
  },
})
async onActividadCompletada(envelope: EventEnvelope<ActividadCompletadaPayload>) { /* ... */ }
```

## `EventEnvelope<T>`: siempre, sin excepción

Todo mensaje publicado usa el envelope de `libs/shared-events` (`eventId`, `eventType`, `producedBy`, `organizacionId`, `grupoId?`, `occurredAt`, `correlationId`, `payload`). Nunca publicar el payload "pelado" sin envolver — rompe la idempotencia y la trazabilidad de todos los consumidores.

## Idempotencia: tabla `EventoProcesado` en cada consumidor

Antes de aplicar el efecto de un evento consumido, chequear si `eventId` ya está en la tabla `EventoProcesado` de la base del servicio consumidor; si está, descartar sin error. Después de aplicar el efecto, insertar la fila. Esto es obligatorio desde el primer consumidor que se escriba (Fase 7 en adelante) — RabbitMQ puede reentregar mensajes con ack manual, y sin esto un reintento duplicaría, por ejemplo, un `EventoPuntos`.

## Dead Letter Queue

Cada cola de consumidor declara `deadLetterExchange: 'dorado.events.dlx'`. Un mensaje que falla su procesamiento reiteradamente (configurar reintentos con backoff, no reintento infinito inmediato) termina en la DLQ del servicio, no se descarta silenciosamente ni bloquea la cola principal.

## Errores comunes a evitar en este proyecto puntual

- Declarar una cola clásica (`x-queue-type` ausente o `classic`) — usar siempre `quorum`.
- Consumir un evento y aplicar el efecto sin chequear `EventoProcesado` primero.
- Publicar sin `correlationId` (ver skill `nestjs-backend` sobre logging estructurado — el `correlationId` del evento debe coincidir con el del request HTTP que lo originó).
- Agregar un exchange o routing key nuevo sin reflejarlo antes en `docs/architecture/event-catalog.md`.

## Dónde mirar antes de codear

`docs/architecture/ADR-00-decisiones-fundacionales.md` sección 5, `docs/architecture/event-catalog.md` completo, y la sección "Eventos publicados/consumidos" del archivo `fase-XX-*.md` del servicio en cuestión.
