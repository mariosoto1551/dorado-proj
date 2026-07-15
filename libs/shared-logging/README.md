# shared-logging

Librería NestJS compartida de logging estructurado con correlación.

**Decisión de implementación** (la que `docs/phases/fase-01-monorepo.md` pide
documentar acá): el logging vive en esta lib dedicada **`shared-logging`**, no
dentro de `shared-auth` — auth y logging son incumbencias distintas y los
servicios pueden necesitar logging sin arrastrar guards de auth.

**Fase 1**: solo scaffold. La implementación llega en **Fase 2** junto con el
primer servicio real, y va a contener:

- Wrapper de `nestjs-pino` como provider inyectable (nunca `console.log`).
- Middleware de correlación: lee el header `x-correlation-id` entrante; si no
  viene (primer punto de entrada = Gateway), genera un `uuid v4` nuevo.
- Propagación del `correlationId` en: llamadas REST salientes a otros
  servicios (header `x-correlation-id`), eventos RabbitMQ (campo
  `correlationId` del `EventEnvelope`, ver `libs/shared-events`), y todo log
  estructurado (campo `correlationId` en cada línea).

No reimplementar por servicio — se importa desde acá.

## Build

`pnpm nx build shared-logging`
