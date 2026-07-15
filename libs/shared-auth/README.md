# shared-auth

Librería NestJS compartida de autenticación/autorización multi-tenant.

**Fase 1**: solo scaffold (proyecto vacío, según `docs/phases/fase-01-monorepo.md`).
La implementación real llega en **Fase 2**, y va a contener (ver `ADR-00` secciones 2–4):

- `TenantContextGuard` — valida el JWT (RS256 con `jose`, clave pública vía `JWT_PUBLIC_KEY`) y adjunta `req.tenant = { organizacionId, grupoIds, rol, principalId, principalType }`.
- `PrismaTenantMiddleware` — filtro automático `where.organizacionId` (y `grupoId` cuando aplica) para modelos tenant-scoped.
- Decorators `@CurrentTenant()` y `@Roles(...)`.
- Guard separado para rutas `/internal/*` que valida `x-internal-secret` (nunca el mismo guard que valida JWT de usuario).

No reimplementar nada de esto por servicio — se importa desde acá.

## Build

`pnpm nx build shared-auth`
