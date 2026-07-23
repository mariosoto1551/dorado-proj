# Fase 14 · Ítem 5 — Panel de `PLATFORM_ADMIN`

> Sub-spec detallada del ítem 5 de `fase-14-post-mvp.md`. **No ejecutar hasta que Fase 13 esté estable** (regla de Fase 14). Especificación decidida con José (2026-07-22); las desviaciones de implementación se registran en `docs/progreso/`, no acá.

## Prerrequisitos

- Fase 2 (identity: `Organizacion`, `Tutor`, `Usuario`, `RefreshToken`, `TokensService`, emisión RS256).
- Fase 4 (billing: `Plan`, `Suscripcion`, internos de plan/entitlements).
- Fase 9 (audit: `AccionAdministrativaRegistrada` + timeline por entidad) — para el historial del detalle de org.
- Fase 3 (gateway: tabla de ruteo, rutas públicas, inyector de headers de tenant).

## Alcance de ESTE corte (decidido con José)

**Incluye:** cuenta de plataforma + login propio + emisión de JWT `PLATFORM_ADMIN`; panel (app Angular separada) con: (1) listar/buscar organizaciones, (2) cambiar plan FREE↔PRO, (3) suspender/reactivar organización, (4) detalle de una organización.

**Pospuesto explícitamente a otros ítems de Fase 14:** white-label (#1), reportes/analíticas avanzadas (#2), pasarela de pagos real (#3 — el cambio de plan de acá es **asignación manual por admin**, no checkout), cumplimiento de privacidad (#4). No mezclar nada de eso en este corte.

## Decisiones de diseño (cerradas)

1. **Tabla separada `PlatformAdmin` en `identity-service`**, no se reutiliza `Tutor` (una cuenta de plataforma no pertenece a ninguna Organización — ADR-00 §1, y la nota de `fase-04-billing.md`).
2. **Frontend en app nueva `apps/admin-web`** (no una sección de `app-web`). El JWT de plataforma no lleva `organizacionId`/`grupoIds` reales; meterlo en `app-web` obligaría a ramificar guards/interceptores/tenant en toda la app tenant. App aparte = aislamiento total del bundle y de la superficie de auth. Decisión de José: "lo más óptimo y recomendado".
3. **Bootstrap por variables de entorno**: al arrancar identity, si `PLATFORM_ADMIN_EMAIL`/`PLATFORM_ADMIN_PASSWORD` están seteadas y la cuenta no existe, se crea (hash argon2id, idempotente). Sin registro público para este rol, nunca.
4. **El cambio de plan es una operación de plataforma, no de tenant**: lo ejecuta identity llamando al interno de billing. Reemplaza el `UPDATE` manual en `billing_db` de la nota de Fase 4 — pero **no** es la pasarela de pagos (ítem #3).
5. **Una organización `SUSPENDIDA` no puede operar**: el login/refresh de sus Tutores y Usuarios se bloquea. Es la única razón por la que este ítem toca el flujo de auth existente (ver Parte C — cambio de comportamiento de Fase 2, documentado acá).

---

## Parte A — `shared-types`: contrato

### `PrincipalType` — nuevo valor

```ts
export enum PrincipalType { TUTOR = 'TUTOR', USUARIO = 'USUARIO', PLATFORM_ADMIN = 'PLATFORM_ADMIN' }
```

### `JwtPayload` — convención para el admin

El shape **no cambia** (no romper validación del gateway ni de los servicios). Para un `PLATFORM_ADMIN`:
- `principalType = 'PLATFORM_ADMIN'`, `rol = 'PLATFORM_ADMIN'`, `sub = <platformAdminId>`.
- `organizacionId = ''` (string vacío — el admin no pertenece a ninguna org), `grupoIds = []`.
- `plan` no aplica; se emite `'FREE'` como valor de relleno (nunca se lee para un admin).

> **Seguridad:** un token `PLATFORM_ADMIN` es válido para el gateway (firma RS256 OK), pero **solo** las rutas `/api/admin/*` y `/api/auth/admin/*` lo aceptan. Todo endpoint tenant (activity, scoring, etc.) ya exige por guard `ORG_ADMIN`/`TUTOR`/`USUARIO`, así que un token de plataforma que pegue ahí recibe 403. No se relaja ningún guard existente. Inversamente, `/api/admin/*` exige `rol === PLATFORM_ADMIN` (403 para cualquier token tenant).

### DTOs nuevos (regla de prefijo Request/Response compartido — CLAUDE.md §Convenciones)

```ts
// ---------- Platform Admin ----------
export interface PlatformAdminDto { id: string; email: string; nombre: string; estado: 'ACTIVO' | 'INACTIVO'; createdAt: string; }

export interface AdminLoginRequest { email: string; password: string; }
export interface AdminLoginResponse { accessToken: string; perfil: PlatformAdminDto; }

// Fila del listado de organizaciones (agrega conteos + plan/estado)
export interface AdminOrganizacionResumenDto {
  id: string;
  nombre: string;
  emailContacto: string;
  estado: EstadoOrganizacion;          // ACTIVA | SUSPENDIDA
  plan: CodigoPlan;                    // FREE | PRO (resuelto vía billing)
  cantidadGrupos: number;
  cantidadTutores: number;
  cantidadUsuarios: number;
  createdAt: string;
}

export interface AdminListarOrganizacionesResponse {
  items: AdminOrganizacionResumenDto[];
  total: number;
  page: number;
  pageSize: number;
}

// Detalle de una organización
export interface AdminOrganizacionDetalleDto {
  organizacion: OrganizacionDto;
  plan: CodigoPlan;
  suscripcion: SuscripcionDto;
  grupos: GrupoDto[];
  cantidadTutores: number;
  cantidadUsuarios: number;
  historialAdministrativo: RegistroAuditoriaDto[];  // acciones PLATFORM_ADMIN sobre esta org (audit-service)
}

export interface AdminCambiarPlanRequest { plan: CodigoPlan; }        // FREE | PRO
export interface AdminCambiarPlanResponse { suscripcion: SuscripcionDto; }

export interface AdminCambiarEstadoOrgRequest { estado: EstadoOrganizacion; } // ACTIVA | SUSPENDIDA
export interface AdminCambiarEstadoOrgResponse { organizacion: OrganizacionDto; }
```

> Nota: `SuscripcionDto.fuente` en `shared-types.md` dice `'MANUAL' | 'FLAG'` pero el enum Prisma de billing es `AUTOMATICA | MANUAL`. Ya es una inconsistencia preexistente (Fase 4); este ítem **usa `'AUTOMATICA' | 'MANUAL'`** (la realidad del schema) y corrige el tipo en `shared-types`. Documentar como desviación.

---

## Parte B — `identity-service`: modelo, bootstrap y auth de plataforma

### B.1 — Modelo `PlatformAdmin` (schema Prisma, `identity_db`)

```prisma
model PlatformAdmin {
  id           String       @id @default(uuid())
  email        String       @unique
  passwordHash String
  nombre       String
  estado       EstadoCuenta @default(ACTIVO)   // reutiliza el enum existente
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
}
```

- **No** tiene `organizacionId` (a propósito — no es tenant-scoped). Es la única tabla de negocio de identity sin `organizacionId`; documentar la excepción explícita a la regla 3 de CLAUDE.md (el `PLATFORM_ADMIN` es, por definición, la entidad que vive por encima del tenant).
- `RefreshToken.principalType` ya es un string suelto (ver nota Prisma de Fase 2, sin `@relation`), así que **no requiere cambio de schema** — solo se empieza a emitir con valor `PLATFORM_ADMIN`.
- Migración retro-compatible: solo agrega una tabla nueva, no toca las existentes.

### B.2 — Bootstrap por env (nuevo, en `identity-service`)

- Variables nuevas en `env.schema.ts` (opcionales, pero si viene una viene la otra):
  - `PLATFORM_ADMIN_EMAIL` (email válido)
  - `PLATFORM_ADMIN_PASSWORD`
  - `PLATFORM_ADMIN_NOMBRE` (opcional, default `'Administrador de plataforma'`)
- Al `onModuleInit` de un `PlatformAdminBootstrapService`: si ambas están seteadas y **no** existe `PlatformAdmin` con ese email → crearlo (`argon2.hash`, mismos params del proyecto). Idempotente: si ya existe, no-op (no re-hashea ni pisa el password — cambiar password es fuera de alcance de este corte). Loguear (structured) que se creó / que ya existía. Si las envs faltan, no hace nada (entorno sin admin, ej. tests).

### B.3 — Endpoints de auth de plataforma (nuevo `AdminAuthController`, prefijo `auth/admin`)

Separado del `AuthController` tenant — no se mezcla el espacio de identificadores (un `PlatformAdmin.email` puede coincidir con un `Tutor.email` sin colisión, porque el lookup es en tablas distintas y por endpoints distintos).

| Método | Ruta pública (gateway) | Auth | Descripción |
|---|---|---|---|
| POST | `/api/auth/admin/login` | pública | `AdminLoginRequest` → `AdminLoginResponse` + set-cookie refresh httpOnly. Busca `PlatformAdmin` por email, verifica argon2 + `estado ACTIVO` (mensaje único de credenciales inválidas, como el tenant). |
| POST | `/api/auth/admin/refresh` | pública (usa cookie) | Rota el refresh (mismo `TokensService`), reemite access de plataforma. Rechaza si `principalType !== PLATFORM_ADMIN` o el admin dejó de estar `ACTIVO`. |
| POST | `/api/auth/admin/logout` | JWT admin | Revoca el refresh (reusa `tokens.revocarRefreshToken`). |

Emisión del access de plataforma (`TokensService.emitirAccessToken` con los valores de Parte A):
`principalType='PLATFORM_ADMIN'`, `organizacionId=''`, `grupoIds=[]`, `rol='PLATFORM_ADMIN'`, `plan='FREE'`, `sub=admin.id`.
`AuthService.refrescar` gana una tercera rama (`PrincipalType.PLATFORM_ADMIN` → busca `PlatformAdmin`, valida `estado`, reemite). Cookies: mismo helper `cookies.ts` (misma config httpOnly/SameSite que el tenant).

### B.4 — Endpoints de datos del panel (nuevo `AdminModule` + `AdminController`, prefijo `admin`)

Todos exigen JWT con `rol === PLATFORM_ADMIN` vía un `PlatformAdminGuard` nuevo (lee `x-rol` inyectado por el gateway; 403 `SOLO_PLATFORM_ADMIN` si no). **Cross-tenant por diseño**: este módulo NO usa el filtro automático de tenant (ALS) — consulta todas las organizaciones explícitamente (mismo patrón "sin contexto de tenant" que los consumidores/internos; verificar que la extensión de Prisma de identity no bloquee lecturas sin `organizacionId` en contexto, o usar el escape de sistema).

| Método | Ruta | Request → Response | Notas |
|---|---|---|---|
| GET | `/api/admin/organizaciones` | query `q?, plan?, estado?, page=1, pageSize=20` → `AdminListarOrganizacionesResponse` | `q` filtra por `nombre`/`emailContacto` (contains, case-insensitive). Conteos de grupos/tutores/usuarios por org (agregación en identity). `plan` de cada org resuelto vía billing interno **en batch** (ver B.5) — no N+1 de HTTP por fila. |
| GET | `/api/admin/organizaciones/:id` | → `AdminOrganizacionDetalleDto` | 404 `ORGANIZACION_NO_ENCONTRADA` si no existe. `grupos` + conteos de identity; `plan`/`suscripcion` de billing interno; `historialAdministrativo` de audit interno (timeline por `entidadTipo='Organizacion'`, `entidadId=:id`). El historial puede diferirse si audit interno no expone el filtro necesario — ver criterio de aceptación (marcado opcional). |
| POST | `/api/admin/organizaciones/:id/plan` | `AdminCambiarPlanRequest` → `AdminCambiarPlanResponse` | Valida que la org exista y que `plan ∈ {FREE, PRO}`. Llama al **nuevo interno de billing** (B.5). Publica `AccionAdministrativaRegistrada` (`accion='PLAN_CAMBIADO'`, `actorTipo='PLATFORM_ADMIN'`, `detalle={ de, a }`). |
| POST | `/api/admin/organizaciones/:id/estado` | `AdminCambiarEstadoOrgRequest` → `AdminCambiarEstadoOrgResponse` | `UPDATE Organizacion.estado`. Publica `AccionAdministrativaRegistrada` (`accion='ORG_SUSPENDIDA'`/`'ORG_REACTIVADA'`). No cierra sesiones activas de esa org retroactivamente (los access tokens vigentes expiran solos en ≤2h; el refresh queda bloqueado — ver C). Documentar esa ventana. |

`actorId` de los eventos de auditoría = `sub` del admin (viaja en `x-principal-id`).

### B.5 — `billing-service`: interno de cambio de plan (nuevo)

`billing` no tenía endpoint de cambio de plan (nota de Fase 4). Se agrega **solo interno** (`x-internal-secret`, nunca público), consumido por el `AdminController` de identity:

| Método | Ruta interna | Descripción |
|---|---|---|
| POST | `/internal/billing/organizaciones/:organizacionId/plan` | Body `{ codigo: 'FREE' \| 'PRO' }`. Busca el `Plan` de ese `codigo`; hace `upsert` de la `Suscripcion` de la org (`planId` nuevo, `fuente='MANUAL'`, `estado='ACTIVA'`). Devuelve `SuscripcionDto`. Idempotente (poner el mismo plan dos veces no rompe). |
| GET | `/internal/billing/organizaciones/planes?ids=a,b,c` | (opcional, para el listado batch) Devuelve `{ organizacionId, plan }[]` de varias orgs en un request, para evitar N+1. Si no se implementa, el listado resuelve plan org-por-org con el interno existente `/internal/billing/organizaciones/:id/plan` (aceptable para el volumen piloto). |

El cambio de plan **no** publica evento de dominio propio en billing (el `plan` en JWTs vigentes se actualiza recién en el próximo login/refresh, vía `resolvePlan` — igual que hoy; la latencia de ≤2h es aceptable y se documenta). La auditoría la publica identity (B.4), que es quien origina la acción.

---

## Parte C — Enforcement de organización suspendida (cambio de comportamiento de Fase 2)

Hoy `AuthService.login`/`refrescar`/`emitirSesionTutor`/`emitirSesionUsuario` solo validan `EstadoCuenta` del principal, **no** el estado de su Organización. Este ítem agrega:

- En `login` (tutor y usuario) y en `refrescar`: tras encontrar el principal, verificar `Organizacion.estado`. Si `SUSPENDIDA` → 403 `ORGANIZACION_SUSPENDIDA` (excepción nueva). A diferencia del mensaje único de credenciales, acá **sí** se informa el motivo (es una acción administrativa legítima, no una fuga de información sobre credenciales).
- No se tocan los tokens ya emitidos (siguen válidos hasta `exp`, ≤2h). La suspensión corta el **re-login y el refresh**, no las sesiones en vuelo. Documentado como ventana conocida.

> Es la única desviación de comportamiento respecto de `fase-02-identity.md`. Se registra en `docs/progreso/fase-14-post-mvp.md` (no se edita la spec de Fase 2).

---

## Parte D — Gateway

- **Tabla de ruteo** (`tabla-ruteo.ts`): agregar `{ prefijo: '/api/admin', servicio: IDENTITY }`. (identity ya atiende `/api/auth` e `/api/identity`; suma un tercer prefijo, como está previsto en la nota de la tabla.)
- **Rutas públicas** (`jwt-validation.middleware.ts` → `RUTAS_PUBLICAS`): agregar
  - `POST /api/auth/admin/login`
  - `POST /api/auth/admin/refresh`
  (login/refresh de plataforma no llevan bearer, igual que sus equivalentes tenant). `logout` **no** es pública (necesita el JWT admin), consistente con el `/api/auth/logout` actual.
- El inyector de headers de tenant (`tenant-header-injector.middleware.ts`) funciona sin cambios: para un token de plataforma setea `x-organizacion-id=''`, `x-grupo-ids=''`, `x-rol='PLATFORM_ADMIN'`, `x-principal-id=<adminId>`, `x-principal-type='PLATFORM_ADMIN'`. El `PlatformAdminGuard` de identity solo mira `x-rol`.
- No hace falta autorización por rol en el gateway (sigue el patrón del proyecto: el gateway valida firma/expiración, cada servicio hace la authz de rol).

---

## Parte E — Frontend `apps/admin-web` (Angular 22, app nueva)

Generada con el generador `@nx/angular` (ver skill `nx-monorepo` + `angular-frontend`): zoneless, signal-first, standalone, `OnPush`/eager. Reutiliza `libs/shared-types` y `libs/shared-ui` (ZonaBadge no aplica; sí botones/inputs/ConfirmDialog/paginación si existen). Estilos con Tailwind 4 + tokens compartidos (skill `tailwind-css`).

- **Puerto de dev**: `4300` (nuevo). Agregar la fila a la tabla de puertos de `CLAUDE.md` (project + global) — es referencia, no spec inmutable.
- **Auth** (mismas reglas no negociables que `app-web`, regla 7 de CLAUDE.md): access token **en memoria** (signal), refresh en cookie httpOnly. Interceptor que agrega `Authorization: Bearer` y hace refresh silencioso contra `/api/auth/admin/refresh` ante 401. Nada de `localStorage`.
- **Pantallas** (mínimo):
  1. **Login** (`/login`) — email + password contra `/api/auth/admin/login`.
  2. **Organizaciones** (`/organizaciones`) — tabla paginada con buscador (`q`), filtros por `plan` y `estado`, columnas nombre/plan/estado/#grupos/#tutores/#usuarios/alta. Fila → detalle.
  3. **Detalle de organización** (`/organizaciones/:id`) — datos, grupos, conteos, plan/suscripción; acciones **Cambiar plan** (FREE↔PRO, con `ConfirmDialog`) y **Suspender/Reactivar** (con `ConfirmDialog`); historial administrativo (audit) si está disponible.
- **Guard de ruta**: sin sesión de plataforma → redirige a `/login`. Un login tenant no sirve acá (el backend responde 403 en `/api/admin/*`).
- **UI/UX**: José quiere UI final moderna con transiciones/animaciones (preferencia registrada). **Mostrarle una propuesta visual del panel antes de construir las pantallas** — no dar el diseño por sentado.
- **Deploy** (cuando aplique, no en este corte de código si Fase 13 aún no se ejecutó con datos reales): otro target Vercel (como `app-web`/`public-site`) apuntando al mismo Gateway. Agregar `environment.prod.ts`/`fileReplacements` análogo. Fuera de alcance inmediato; se anota para el runbook.

---

## Eventos

- **Ningún evento nuevo de dominio.** Se reutiliza `AccionAdministrativaRegistrada` (Fase 9) con `actorTipo='PLATFORM_ADMIN'` para auditar cambio de plan y suspensión/reactivación.
- El cambio de plan no emite evento de billing (el `plan` del JWT se refresca en el próximo login/refresh).

## Variables de entorno nuevas

- `identity-service`: `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`, `PLATFORM_ADMIN_NOMBRE?`. Agregar a `.env.production.example` y a los READMEs de despliegue (Fase 12/13).
- `admin-web`: `API_BASE_URL` (Gateway), análogo a `app-web`.

## Criterios de aceptación

- [ ] Con `PLATFORM_ADMIN_EMAIL`/`PASSWORD` seteadas, al arrancar identity se crea la cuenta (una vez); reiniciar no la duplica ni re-hashea.
- [ ] `POST /api/auth/admin/login` con credenciales correctas → 200 con access token cuyo `rol='PLATFORM_ADMIN'` y `organizacionId=''`; credenciales malas o admin inactivo → 401 con mensaje genérico.
- [ ] Un token `PLATFORM_ADMIN` pegando a un endpoint tenant (ej. `GET /api/activity/...`) → 403. Un token tenant pegando a `/api/admin/organizaciones` → 403 `SOLO_PLATFORM_ADMIN`.
- [ ] `GET /api/admin/organizaciones` lista **todas** las orgs de la plataforma (cross-tenant) con plan/estado/conteos correctos; `q`/`plan`/`estado`/paginación filtran bien; el aislamiento de tenant de los servicios tenant sigue intacto (un ORG_ADMIN sigue viendo solo lo suyo).
- [ ] `POST /api/admin/organizaciones/:id/plan {plan:'PRO'}` → la `Suscripcion` de esa org pasa a PRO (`fuente='MANUAL'`); un nuevo login de un tutor de esa org trae `plan='PRO'` en el JWT; se registró `AccionAdministrativaRegistrada` (PLAN_CAMBIADO, actorTipo PLATFORM_ADMIN). Repetir el mismo plan es idempotente.
- [ ] `POST /api/admin/organizaciones/:id/estado {estado:'SUSPENDIDA'}` → un login/refresh de un tutor/usuario de esa org da 403 `ORGANIZACION_SUSPENDIDA`; reactivar la deja operar de nuevo; se auditó.
- [ ] El panel (`admin-web`) permite hacer todo lo anterior desde el navegador; access token solo en memoria (no aparece en `localStorage`/`sessionStorage`); refresh silencioso funciona.
- [ ] (Opcional) El detalle de org muestra el historial de acciones administrativas de esa org.

## Nota para Claude Code

Orden de implementación sugerido: **shared-types → identity (modelo + bootstrap + auth admin + AdminModule) → billing (interno de plan) → identity (enforcement suspensión) → gateway (ruteo + rutas públicas) → verificación backend E2E (REST) → scaffold `admin-web` → UI (mostrar propuesta a José antes)**. No scaffoldear `admin-web` sin mostrar antes el árbol de la app a José (preferencia registrada). No implementar nada de white-label/reportes/pasarela/privacidad acá. Regla de Fase 14: no ejecutar hasta que Fase 13 esté estable — José confirmó (2026-07-22) que ya avanzó Fase 13, así que este corte queda habilitado.
