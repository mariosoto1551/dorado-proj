# scoring-service — despliegue

Motor de puntaje (Fase 7): ledger inmutable `EventoPuntos`, evaluación por
sesión/final contra umbrales de zona, descalificaciones y correcciones. **El
puntaje nunca es un campo mutable** — siempre se deriva sumando el ledger
(regla 1). Base propia `scoring_db`.

## Variables de entorno

| Variable | Secreta | Descripción |
|---|:--:|---|
| `PORT` | no | Puerto HTTP (default 3005). |
| `DATABASE_URL` | **sí** | Postgres de `scoring_db`. |
| `RABBITMQ_URL` | **sí** | Conexión AMQP (consume registros y sesiones; publica zonas). |
| `GATEWAY_INTERNAL_SECRET` | **sí** | Valida `x-internal-secret`. |
| `JWT_PUBLIC_KEY` | no | Clave pública RS256 (base64). |
| `IDENTITY_INTERNAL_URL` | no | REST interno a identity (usuarios del grupo). |
| `SESSION_INTERNAL_URL` | no | REST interno a session (configuración del grupo). |
| `LOG_LEVEL` | no | Nivel de log pino. |

## Build / start / migraciones

```bash
pnpm nx run scoring-service:prisma-migrate    # dev
npx prisma migrate deploy                       # producción (cwd apps/scoring-service)
pnpm nx build scoring-service
node dist/apps/scoring-service/main.js
```

## Healthcheck

`GET /internal/health` → `{ status: 'ok', service: 'scoring-service' }`.

## Dependencias externas

- **Base de datos**: `scoring_db` (Postgres 18).
- **Llama a**: identity-service, session-service (REST interno).
- **Consume colas** (cuórum): `scoring.q.registros-actividad` (los 4 eventos de
  registro de activity) y `scoring.q.sesiones` (`SesionCerrada`,
  `SeccionEntroEvaluacion`). Los mensajes que agotan reintentos caen en
  **`scoring.dlq`** (cuórum, dead-letter — revisión manual).
- **Publica eventos**: `ZonaAlcanzada`, `UsuarioDescalificado`,
  `AccionAdministrativaRegistrada`.
