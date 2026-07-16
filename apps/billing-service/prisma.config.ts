// Configuración del CLI de Prisma 7 (migrate/generate/db seed). En Prisma 7 la
// URL de conexión ya no vive en el schema — va acá para el CLI, y en
// PrismaService (adapter @prisma/adapter-pg) para el runtime.
//
// Correr los comandos de Prisma con cwd en apps/billing-service, ej.:
//   pnpm nx run billing-service:prisma-migrate
import { defineConfig } from 'prisma/config';

try {
  // Node 24 nativo; el CLI de Prisma 7 no auto-carga .env cuando hay prisma.config.ts.
  process.loadEnvFile('.env');
} catch {
  // Sin .env local (ej. CI): las variables vienen del entorno del proceso.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    // `prisma migrate dev` (y `prisma db seed`) corren el seed de Planes.
    // @swc-node/register (devDep del workspace): el type-stripping nativo de
    // Node no resuelve los imports sin extensión del cliente Prisma generado.
    seed: 'node -r @swc-node/register prisma/seed.ts',
  },
  datasource: {
    // Solo los comandos de migración/introspección se conectan; `generate` no.
    // El placeholder permite correr `generate` en entornos sin DATABASE_URL
    // (ej. CI) — `migrate` contra el placeholder falla al conectar, como debe.
    url: process.env['DATABASE_URL'] ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
});
