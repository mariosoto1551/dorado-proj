// Configuración del CLI de Prisma 7 (migrate/generate). En Prisma 7 la URL de
// conexión ya no vive en el schema — va acá para el CLI, y en PrismaService
// (adapter @prisma/adapter-pg) para el runtime.
//
// Correr los comandos de Prisma con cwd en apps/scoring-service, ej.:
//   pnpm nx run scoring-service:prisma-migrate
//
// Sin bloque `migrations.seed`: los UmbralZona los crean los tutores por API
// (los colores default de CLAUDE.md son seed del tenant piloto, Fase 13).
import { defineConfig } from 'prisma/config';

try {
  // Node 24 nativo; el CLI de Prisma 7 no auto-carga .env cuando hay prisma.config.ts.
  process.loadEnvFile('.env');
} catch {
  // Sin .env local (ej. CI): las variables vienen del entorno del proceso.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Solo los comandos de migración/introspección se conectan; `generate` no.
    // El placeholder permite correr `generate` en entornos sin DATABASE_URL
    // (ej. CI) — `migrate` contra el placeholder falla al conectar, como debe.
    url: process.env['DATABASE_URL'] ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
});
