# Fase 4 — Billing/Subscription (versión mínima)

> Objetivo: entitlements reales por plan Free/Pro, sin pasarela de pago. Basado en `proyecto-dorado-plan-desarrollo-general.md` sección 5.

## Prerrequisitos
Fase 3 completa (Gateway ruteando a Identity, `app-web` con flujo de auth).

## Nota sobre `PLATFORM_ADMIN`

El enum `Rol.PLATFORM_ADMIN` existe en `libs/shared-types` desde Fase 0, pero **no hay ninguna tabla ni flujo que produzca un JWT con ese rol hasta Fase 14** (panel de plataforma, post-MVP). `identity-service` (Fase 2) modela `Tutor.rol` solo como `ORG_ADMIN | TUTOR`. Esto es intencional: no construir infraestructura de plataforma antes de necesitarla.

Consecuencia directa: en el MVP, **cambiar el plan de una organización a `PRO` es una operación manual directa en la base de datos** (`billing_db`, tabla `Suscripcion`, vía Prisma Studio o SQL), no un endpoint HTTP. No implementar un endpoint de cambio de plan en esta fase.

## Modelo de datos (`billing-service`, base `billing_db`)

```prisma
enum CodigoPlan {
  FREE
  PRO
}

enum EstadoSuscripcion {
  ACTIVA
  CANCELADA
}

enum FuenteSuscripcion {
  AUTOMATICA   // asignada al crear la organización (siempre FREE)
  MANUAL       // cambiada a mano en base (ej. a PRO)
}

model Plan {
  id                          String   @id @default(uuid())
  codigo                      CodigoPlan @unique
  nombre                      String
  limiteTutores               Int?     // null = sin límite
  limiteUsuarios              Int?
  limiteGrupos                Int?
  limiteActividadesPorGrupo   Int?
  whiteLabel                  Boolean  @default(false)
  reportesAvanzados           Boolean  @default(false)
  createdAt                   DateTime @default(now())
  updatedAt                   DateTime @updatedAt
  suscripciones                Suscripcion[]
}

model Suscripcion {
  id             String            @id @default(uuid())
  organizacionId String            @unique // una suscripción activa por organización en el MVP
  planId         String
  plan           Plan              @relation(fields: [planId], references: [id])
  estado         EstadoSuscripcion @default(ACTIVA)
  fuente         FuenteSuscripcion @default(AUTOMATICA)
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
}

model EventoProcesado {
  eventId     String   @id
  consumidor  String
  procesadoEn DateTime @default(now())
}
```

### Seed de Planes (obligatorio, corre en `prisma/seed.ts` al levantar el servicio la primera vez)

```
FREE: limiteTutores=2, limiteUsuarios=5, limiteGrupos=1, limiteActividadesPorGrupo=15, whiteLabel=false, reportesAvanzados=false
PRO:  limiteTutores=null, limiteUsuarios=null, limiteGrupos=null, limiteActividadesPorGrupo=null, whiteLabel=true, reportesAvanzados=true
```

> Estos números de límite Free no están en los documentos fuente (no estaban definidos). Son un default razonable para no bloquear el desarrollo — **confirmalos o ajustalos antes de Fase 13** (alta del piloto real), no hace falta ahora.

## Evento consumido

- `OrganizacionCreada` (de Identity) → crea `Suscripcion { organizacionId, planId: <id del Plan FREE>, fuente: AUTOMATICA }`. Idempotente vía tabla `EventoProcesado`.

## Endpoints internos (protegidos por `x-internal-secret`, no por JWT de usuario — ver `ADR-00` sección 4)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/internal/billing/organizaciones/:organizacionId/plan` | Devuelve `{ codigo: 'FREE' \| 'PRO' }`. Usado por Identity en login para embeber `plan` en el JWT (reemplaza el hardcode de Fase 2). |
| GET | `/internal/billing/organizaciones/:organizacionId/entitlements` | Devuelve `EntitlementsDto` completo (límites + features). Usado por Identity (antes de crear Grupo/Tutor/Usuario) y, desde Fase 5, por Activity Catalog (antes de crear Actividad). |
| GET | `/internal/health` | Health check para el Gateway. |

## Endpoint autenticado (a través del Gateway)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/billing/mi-organizacion` | ORG_ADMIN | Devuelve `SuscripcionDto` + `PlanDto` de la organización del JWT. Es de solo lectura — no hay upgrade/downgrade en el MVP. |

## Cambios que esta fase introduce en Identity (`identity-service`)

Reemplazar el placeholder de Fase 2 (`resolvePlan` y el chequeo de límites que siempre devolvía `permitido: true`) por llamadas reales:

- `resolvePlan(organizacionId)` → `GET /internal/billing/organizaciones/:id/plan` (llamada síncrona, timeout 2s; si Billing no responde, **fallback a `'FREE'`** para no romper el login — logueado como warning, no como error fatal).
- Antes de `POST /identity/grupos`: contar grupos actuales de la organización, compararlo contra `entitlements.limites.grupos`; si se alcanzó el límite, `403` con body `{ code: 'LIMITE_PLAN_ALCANZADO', recurso: 'grupos' }`.
- Antes de crear un `Tutor`/`Usuario` en `POST /auth/invitaciones/:codigo/canjear`: mismo patrón contra `limites.tutores`/`limites.usuarios`.

## Criterios de aceptación de esta fase

- [ ] Al registrar una organización nueva, en menos de unos segundos aparece su fila en `Suscripcion` (billing_db) con plan FREE, vía consumo del evento (no polling).
- [ ] Crear un 3er Grupo en una organización FREE (límite 1) devuelve 403 con el código de error documentado.
- [ ] Cambiar manualmente la fila `Suscripcion.planId` a PRO en base, sin reiniciar servicios, hace que el próximo login de esa organización traiga `plan: 'PRO'` en el JWT y los límites se levanten en el siguiente intento de creación.
- [ ] Si se detiene el contenedor de `billing-service` y se intenta loguear, el login igual funciona (fallback a FREE), no devuelve 500.

## Nota para Claude Code

No construyas ninguna integración de pagos real ni un endpoint público de upgrade de plan. Eso es explícitamente Fase 14. Si te piden "agregar Stripe" en esta fase, es un error de secuencia — avisar en vez de implementar.
