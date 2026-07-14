---
name: prisma-orm
description: Usar siempre que se cree o edite un schema Prisma, una migración, o código que use PrismaClient en cualquiera de los 8 servicios backend con base de datos propia. Cubre Prisma ORM 7 (cliente Rust-free, driver adapters), PostgreSQL 18, y las convenciones de modelado de este proyecto (multi-tenancy por fila, ledger inmutable, IDs uuid).
---

# Prisma ORM — Proyecto Dorado

## Versión y setup base

- **Prisma ORM 7.x**. El cliente es **Rust-free por defecto** — hay que declarar explícitamente el driver adapter en el código de inicialización, ya no es automático/implícito como en versiones 5/6.
- Para PostgreSQL: `@prisma/adapter-pg` (paquete `pg` como driver de Node subyacente).

```ts
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });
```

- Ojo con el pool de conexiones: los driver adapters usan la configuración de pool del driver de Node subyacente (`pg`), que **no** tiene el mismo default que Prisma 6 (`pg` no tiene timeout de conexión por defecto, Prisma 6 usaba 5s). Configurar explícitamente `connectionTimeoutMillis` en el adapter si se necesita ese comportamiento — no asumir que "viene igual que antes".
- `$queryRaw`/`$executeRaw`: en Prisma 7 pueden saltar el query compiler/interpreter y hablar directo con el driver adapter — más rápido para casos puntuales, pero se pierde parte de la seguridad de tipos, usar con criterio.

## Convenciones de modelado de este proyecto (no negociables, ver `ADR-00`)

- **IDs**: siempre `id String @id @default(uuid())`, nunca `Int @default(autoincrement())`.
- **Timestamps**: `createdAt DateTime @default(now())` en todo modelo; `updatedAt DateTime @updatedAt` solo en modelos mutables. Los modelos de ledger inmutable (`EventoPuntos`, `RegistroAuditoria`, `RegistroActividad`, `RegistroConducta`) **no llevan `updatedAt`** — si un modelo de este tipo necesita ese campo, es señal de que se está por romper la regla de inmutabilidad.
- **Multi-tenancy**: toda tabla de negocio lleva `organizacionId String` (y `grupoId String` cuando aplica), indexado (`@@index([organizacionId])`). Nunca-nunca un modelo de negocio sin esas columnas.
- **Puntos**: siempre `Int`, nunca `Float`/`Decimal`.
- Un schema Prisma por servicio (`apps/<servicio>/prisma/schema.prisma`), una base de datos por servicio (ver tabla de bases en `fase-01-monorepo.md`). Nunca un `schema.prisma` compartido entre dos servicios.

## `PrismaTenantMiddleware` (obligatorio en todo servicio con datos de tenant)

Cada `PrismaService` (extiende `PrismaClient`) registra el middleware de `libs/shared-auth` que inyecta el filtro `organizacionId`/`grupoId` automáticamente a partir del contexto de tenant del request — ver `ADR-00` sección 2. No hay excepción "por ahora lo hago manual en el `where`" — si un query se escribe sin pasar por ese middleware, es un bug de aislamiento entre tenants, no un detalle menor.

## Migraciones

- `prisma migrate dev` en desarrollo, `prisma migrate deploy` en CI/CD — nunca `db push` contra una base que ya tiene datos reales (solo para prototipado rapidísimo local, si acaso).
- Cada migración generada se comitea al repo (`prisma/migrations/`), nunca se edita a mano una migración ya aplicada en otro ambiente.

## Seed

Cada servicio que lo necesite tiene `prisma/seed.ts` (ver contenido genérico en `fase-00-especificacion.md`, sección "Seed data genérica"). Ejecutar vía el hook `prisma.seed` de `package.json`, no un script suelto sin registrar.

## Errores comunes a evitar en este proyecto puntual

- Instanciar `PrismaClient` sin adapter (Prisma 7 lo permite en algunos casos de compatibilidad, pero este proyecto usa el modo explícito con adapter siempre — consistencia entre servicios).
- Un `UPDATE`/`DELETE` sobre `EventoPuntos` o `RegistroAuditoria` — no debería existir ni un método de servicio que lo permita, ni hablar de exponerlo en un controller.
- Olvidar `@@index` en `organizacionId`/`grupoId` — con 9 servicios y queries filtradas por tenant en cada request, es la diferencia entre una tabla que escala y una que no.

## Dónde mirar antes de codear

El bloque `prisma` completo del archivo `docs/phases/fase-XX-*.md` correspondiente al servicio — están ya escritos con el modelo esperado, no rediseñar el schema desde cero.
