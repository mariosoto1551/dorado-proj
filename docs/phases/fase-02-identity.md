# Fase 2 — Identity & Access Service

> Objetivo: `apps/identity-service` funcional de punta a punta — auto-registro de organización, login, invitaciones, emisión de JWT. Es el servicio que desbloquea todo lo demás (nada más puede probarse de forma realista sin esto). Basado en `proyecto-dorado-plan-desarrollo-general.md` sección 3 y `proyecto-dorado-arquitectura-base.md` secciones 2 y 5.

## Prerrequisitos
Fase 1 completa: monorepo Nx, `docker-compose` con Postgres/RabbitMQ, `libs/shared-types`, `libs/shared-events`, `libs/shared-auth` scaffoldeados (vacíos).

## Decisión de esta fase: plan hardcodeado a FREE

Billing Service todavía no existe (es Fase 4). Por eso, en esta fase, `plan` en el JWT se hardcodea siempre a `'FREE'` — no hay llamada sincrónica a Billing todavía. Esto es intencional (ver `proyecto-dorado-plan-desarrollo-general.md` sección 0, punto 3: "Billing puede arrancar con entitlements hardcodeados"). En Fase 4 se reemplaza el hardcode por una llamada real a `GET /internal/billing/organizaciones/:id/plan`. Dejar un único punto en el código (ej. `IdentityService.resolvePlan(organizacionId)`) que hoy retorna `'FREE'` fijo, para que Fase 4 solo tenga que cambiar esa función.

## Identificadores de login: únicos a nivel plataforma

`Tutor.email` y `Usuario.username` son **únicos globalmente** (no solo dentro de su Organización/Grupo). Esto permite que el login sea `{ identificador, password }` sin pedir además a qué organización pertenece — el sistema encuentra la cuenta buscando primero en `Tutor.email`, luego en `Usuario.username`. Es una decisión deliberada para simplificar el login familiar (usuarios que son niños no deberían tener que elegir una organización).

## Modelo de datos (`identity-service`, base `identity_db`)

```prisma
enum RolTutor {
  ORG_ADMIN
  TUTOR
}

enum EstadoCuenta {
  ACTIVO
  INACTIVO
}

enum EstadoOrganizacion {
  ACTIVA
  SUSPENDIDA
}

enum TipoInvitado {
  TUTOR
  USUARIO
}

enum EstadoInvitacion {
  PENDIENTE
  CANJEADA
  EXPIRADA
  REVOCADA
}

model Organizacion {
  id            String              @id @default(uuid())
  nombre        String
  emailContacto String              @unique
  estado        EstadoOrganizacion  @default(ACTIVA)
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt
  grupos        Grupo[]
  tutores       Tutor[]
}

model Grupo {
  id             String   @id @default(uuid())
  organizacionId String
  organizacion   Organizacion @relation(fields: [organizacionId], references: [id])
  nombre         String
  timezone       String   // IANA tz, ej "America/La_Paz"
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  tutorGrupos    TutorGrupo[]
  usuarios       Usuario[]
  invitaciones   Invitacion[]

  @@index([organizacionId])
}

model Tutor {
  id             String       @id @default(uuid())
  organizacionId String
  organizacion   Organizacion @relation(fields: [organizacionId], references: [id])
  email          String       @unique
  passwordHash   String
  nombre         String
  rol            RolTutor
  estado         EstadoCuenta @default(ACTIVO)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  tutorGrupos    TutorGrupo[]
  refreshTokens  RefreshToken[]

  @@index([organizacionId])
}

model TutorGrupo {
  id        String   @id @default(uuid())
  tutorId   String
  tutor     Tutor    @relation(fields: [tutorId], references: [id])
  grupoId   String
  grupo     Grupo    @relation(fields: [grupoId], references: [id])
  createdAt DateTime @default(now())

  @@unique([tutorId, grupoId])
}

model Usuario {
  id             String       @id @default(uuid())
  organizacionId String
  grupoId        String
  grupo          Grupo        @relation(fields: [grupoId], references: [id])
  username       String       @unique
  passwordHash   String
  nombre         String
  avatarId       String       // identificador de avatar predefinido, no archivo de imagen
  estado         EstadoCuenta @default(ACTIVO)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  refreshTokens  RefreshToken[]

  @@index([organizacionId])
  @@index([grupoId])
}

model Invitacion {
  id                String           @id @default(uuid())
  organizacionId    String
  grupoId           String
  grupo             Grupo            @relation(fields: [grupoId], references: [id])
  tipoInvitado      TipoInvitado
  codigo            String           @unique // 8 chars, alfanumérico mayúsculas, sin 0/O/1/I
  creadoPorTutorId  String
  estado            EstadoInvitacion @default(PENDIENTE)
  expiraEn          DateTime
  canjeadaPorId     String?          // id del Tutor o Usuario creado al canjear
  canjeadaEn        DateTime?
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  @@index([organizacionId])
  @@index([grupoId])
}

model RefreshToken {
  id             String   @id @default(uuid())
  principalType  String   // 'TUTOR' | 'USUARIO'
  principalId    String
  tutor          Tutor?   @relation(fields: [principalId], references: [id], map: "fk_refresh_tutor")
  usuario        Usuario? @relation(fields: [principalId], references: [id], map: "fk_refresh_usuario")
  tokenHash      String   @unique
  expiraEn       DateTime
  revocado       Boolean  @default(false)
  createdAt      DateTime @default(now())

  @@index([principalId])
}
```

> Nota Prisma: las relaciones opcionales de `RefreshToken` hacia `Tutor`/`Usuario` con el mismo campo `principalId` no son válidas tal cual en Prisma (no se puede tener dos relaciones distintas apuntando al mismo scalar field). Al implementar, resolver con **una de estas dos opciones** (elegir una y documentarla en el código, no dejarlo ambiguo): (a) sin relación Prisma explícita, `principalId` es un string suelto sin `@relation`, la integridad referencial se maneja en código; o (b) dos tablas separadas `RefreshTokenTutor` y `RefreshTokenUsuario`. Se recomienda (a) por simplicidad.

## Contraseñas

- Hash: `argon2id` (paquete `argon2`), no `bcrypt`.
- Validación mínima: 8 caracteres. No se pide complejidad adicional en el MVP (los `Usuario` pueden ser niños; contraseñas simples son aceptables para este caso de uso, ver `arquitectura-base.md` sección 10 sobre menores — esto no es la política de privacidad pendiente, solo UX de password).

## Endpoints

### Públicos (sin JWT)

| Método | Ruta | Body | Descripción |
|---|---|---|---|
| POST | `/auth/organizaciones` | `{ nombre, emailContacto, password }` | Auto-registro. Crea `Organizacion` + `Tutor` con `rol=ORG_ADMIN`. Publica `OrganizacionCreada`. Devuelve `{ accessToken, tutor, organizacion }` + set-cookie `dorado_refresh`. |
| POST | `/auth/login` | `{ identificador, password }` | Busca `Tutor.email` y si no existe, `Usuario.username`. Devuelve `{ accessToken, principalType, perfil }` + set-cookie `dorado_refresh`. 401 si no matchea o password incorrecto (mensaje genérico, no revelar cuál campo falló). |
| POST | `/auth/refresh` | — (usa cookie) | Rota el refresh token, devuelve nuevo `accessToken`. 401 si el refresh está revocado/expirado. |
| POST | `/auth/logout` | — | Revoca el refresh token actual, limpia la cookie. |
| GET | `/auth/invitaciones/:codigo` | — | Preview público de una invitación válida: `{ grupoNombre, organizacionNombre, tipoInvitado, expiraEn, estado }`. 404 si no existe, 410 si expirada/revocada/canjeada. |
| POST | `/auth/invitaciones/:codigo/canjear` | `{ nombre, password, email? (si TUTOR), username? (si USUARIO) }` | Crea `Tutor` (con `rol=TUTOR`, se linkea vía `TutorGrupo` al grupo de la invitación) o `Usuario`. Marca invitación `CANJEADA`. Publica `InvitacionCanjeada`, y si `tipoInvitado=USUARIO` también `UsuarioUnido`. Devuelve igual que login. |

### Autenticados (requieren JWT válido vía `TenantContextGuard`)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/identity/me` | cualquiera | Perfil del principal actual (Tutor o Usuario según `principalType` del JWT). |
| GET | `/identity/grupos` | TUTOR, ORG_ADMIN | `ORG_ADMIN`: todos los grupos de la organización. `TUTOR`: solo los de `TutorGrupo`. |
| POST | `/identity/grupos` | TUTOR, ORG_ADMIN | Crea Grupo. Si es `TUTOR` (no admin), queda auto-asignado vía `TutorGrupo`. Chequeo de límite de plan: placeholder que siempre permite en esta fase (ver nota de Billing arriba). |
| PATCH | `/identity/grupos/:id` | TUTOR asignado a ese grupo, u ORG_ADMIN | Edita `nombre`/`timezone`. |
| POST | `/identity/grupos/:grupoId/invitaciones` | TUTOR asignado, u ORG_ADMIN | `{ tipoInvitado }`. Genera `codigo` único, `expiraEn = now + 72h`. Publica `InvitacionGenerada`. |
| GET | `/identity/grupos/:grupoId/invitaciones` | TUTOR asignado, u ORG_ADMIN | Lista invitaciones del grupo. |
| DELETE | `/identity/invitaciones/:id` | TUTOR asignado, u ORG_ADMIN | Solo si `estado=PENDIENTE`. Pasa a `REVOCADA`. |
| GET | `/identity/grupos/:grupoId/tutores` | TUTOR asignado, u ORG_ADMIN | Lista tutores del grupo. |
| GET | `/identity/grupos/:grupoId/usuarios` | TUTOR asignado, u ORG_ADMIN | Lista usuarios del grupo. |
| PATCH | `/identity/usuarios/:id` | el propio Usuario, o TUTOR de su grupo, u ORG_ADMIN | Edita `nombre`/`avatarId` únicamente (nunca `username` en el MVP). |
| DELETE | `/identity/usuarios/:id` | TUTOR de su grupo, u ORG_ADMIN | Marca `estado=INACTIVO` (no borra fila — se necesita para historial de puntaje en otros servicios). |
| DELETE | `/identity/tutores/:id` | ORG_ADMIN | Marca `estado=INACTIVO` y elimina sus filas `TutorGrupo`. |

## Endpoints internos (protegidos por `x-internal-secret`, no por JWT de usuario)

Usados por otros servicios para resolver referencias sin duplicar datos. Nunca expuestos vía Gateway público.

| Método | Ruta | Consumido por (fase) | Descripción |
|---|---|---|---|
| GET | `/internal/identity/grupos/:grupoId` | Session/Section (Fase 6), cualquiera que necesite `timezone` | Devuelve `GrupoDto` completo. |
| GET | `/internal/identity/grupos/:grupoId/usuarios` | Scoring Engine (Fase 7), Rewards (Fase 8) | Lista `UsuarioDto` `ACTIVO` del grupo. |
| GET | `/internal/identity/usuarios/:id` | Scoring, Rewards, Notification | `UsuarioDto` puntual. |
| GET | `/internal/identity/tutores/:id` | Notification, Audit | `TutorDto` puntual (para armar mensajes/logs legibles). |
| GET | `/internal/health` | Gateway | Health check. |

## Eventos publicados

`OrganizacionCreada`, `InvitacionGenerada`, `InvitacionCanjeada`, `UsuarioUnido` — payloads exactos en `docs/architecture/event-catalog.md`. Identity **no consume** ningún evento en esta fase.

## Reglas de negocio / edge cases obligatorios

- Una invitación vencida (`expiraEn < now`) no se puede canjear aunque siga en estado `PENDIENTE` en la base — el endpoint de canje chequea la fecha en tiempo real y, si venció, la actualiza a `EXPIRADA` en el mismo request antes de devolver 410.
- Un `ORG_ADMIN` tiene acceso implícito a todos los Grupos de su Organización sin fila en `TutorGrupo`. Un `TUTOR` normal solo ve lo que tiene en `TutorGrupo`. Esto se resuelve en el `TenantContextGuard` de `libs/shared-auth`: si `rol=ORG_ADMIN`, `grupoIds` en el JWT queda vacío y el guard lo interpreta como "todos los grupos de `organizacionId`" en vez de una lista explícita.
- `DELETE /identity/usuarios/:id` y `/identity/tutores/:id` son *soft delete* (`estado=INACTIVO`). Ningún endpoint de Identity borra filas físicamente.
- El primer `Tutor` de una Organización (el que hizo el auto-registro) siempre es `rol=ORG_ADMIN`, nunca `TUTOR`. No existe endpoint para crear un segundo `ORG_ADMIN` en el MVP — si hace falta, es un cambio manual en base o una función de Fase 14.

## Criterios de aceptación de esta fase

- [ ] Flujo completo probado manualmente: `POST /auth/organizaciones` → `POST /identity/grupos` → `POST /identity/grupos/:id/invitaciones` → `POST /auth/invitaciones/:codigo/canjear` (como USUARIO) → `POST /auth/login` con ese usuario → `GET /identity/me` devuelve el usuario correcto.
- [ ] `RabbitMQ` management UI (`localhost:15672`) muestra los 4 eventos publicándose en el exchange `dorado.events` durante ese flujo.
- [ ] Un `TUTOR` sin `TutorGrupo` hacia un Grupo recibe 403 al intentar `GET /identity/grupos/:grupoId/usuarios` de ese grupo.
- [ ] Tests unitarios de los guards de `libs/shared-auth` (JWT inválido, expirado, rol insuficiente) y de las reglas de invitación vencida.

## Nota para Claude Code

No implementes todavía nada de Billing real (ni límites de plan reales, ni llamada HTTP a `billing-service` — ese servicio no existe hasta Fase 4). El placeholder de límite de plan debe ser una función que devuelva `{ permitido: true }` siempre, con un comentario `// TODO Fase 4: reemplazar por llamada real a billing-service`.
