# Registro de ejecución — Fase 1: Fundaciones del monorepo

- **Estado**: COMPLETADA_CON_DESVIACIONES
- **Fecha de finalización**: 2026-07-14
- **Commit/rama**: `master`, commit `fase-01: fundaciones del monorepo`
- **Resumen de lo implementado**:
  - Workspace Nx **23.1.0** (setup "integrado" clásico: `tsconfig.base.json` con `paths`, deps en el `package.json` raíz, sin pnpm workspaces) con pnpm 11.13.0 y Node 24 LTS (`.nvmrc` = 24, `engines` en package.json).
  - 12 proyectos en `apps/`: `gateway` + 8 servicios NestJS 11.1.28 (hello world, puertos default 3000–3008 según CLAUDE.md), `app-web` (Angular 22.0.6, zoneless, esbuild, Vitest vía builder oficial `@angular/build:unit-test`), `public-site` (Astro 7.0.9, proyecto Nx manual con `project.json` → `astro dev/build/preview`, puerto 4321).
  - 5 libs en `libs/`: `shared-types` y `shared-events` (contratos transcriptos 1:1 de `docs/architecture/`), `shared-auth` y `shared-logging` (scaffold vacío, implementación en Fase 2), `shared-ui` (tokens en `src/theme.css` con `@theme` de Tailwind v4, colores de zona default de seed). Convención de import: `@dorado/<lib>`.
  - `infra/docker-compose.yml`: postgres:18 + rabbitmq:4.3-management + adminer; `infra/docker/init-databases.sh` crea las 8 bases.
  - ESLint flat config raíz con `curly: ['error','all']` y `max-params: ['error', 7]`; Prettier compartido.
  - CI (`.github/workflows/ci.yml`): pnpm + `nx affected -t lint,test,build` con `nrwl/nx-set-shas` y cache de `.nx/cache`.
- **Desviaciones del plan documentado** (y por qué):
  1. **Nx 23.1.0** en vez de 22.x — política de CLAUDE.md: última estable al instalar. Sin breaking changes que afecten esta fase.
  2. **Workspace creado desde la plantilla `nrwl/angular-template`**, no con `--preset=ts`: en Nx 23, los presets `ts`/`apps` mapean a una plantilla con TypeScript *project references*, que el generador `@nx/angular` **no soporta** (limitación de Angular, error explícito). La plantilla angular trae el setup integrado compatible con Angular + Nest. Se eliminó la demo que traía (apps `shop`/`api`, packages de ejemplo) y el scaffolding para otros agentes de IA (`.codex`, `.cursor`, `.gemini`, `.opencode`, `.agents`, `CLAUDE.md` generado, `.claude/settings.json` con marketplace de plugins). Se conservaron `.github/` (incluye los "Nx agent skills" propios de Nx — no confundir con `.claude/skills/`), `.vscode/` y `AGENTS.md`.
  3. **Imágenes Docker**: `postgres:18` y `rabbitmq:4.3-management` (el snippet de la spec traía 16/3; la tabla de versiones de CLAUDE.md gana). Con postgres 18 el mount de persistencia es `/var/lib/postgresql` (no `.../data`) por el cambio de layout de PGDATA de la imagen oficial.
  4. **Ruta del init script corregida**: la spec montaba `./infra/docker/init-databases.sh` en un compose que ya vive en `infra/` (resolvería a `infra/infra/`). Quedó `./docker/init-databases.sh`. Se agregó `.gitattributes` (`*.sh eol=lf`) para que el script no se rompa por CRLF en checkouts Windows.
  5. **Servicios Nest generados con `--unitTestRunner=none`**: el generador de `@nx/nest` solo ofrece Jest, y el proyecto usa Vitest. No hay tests de servicios en esta fase; el target de Vitest por servicio se configura con `@nx/vite` cuando cada servicio escriba su primer test (Fase 2+). `app-web` y `shared-ui` ya corren Vitest (runner `vitest-angular`).
  6. **`zone.js` quedó como devDependency SOLO para el runner de tests**: el bootstrap virtual de `@angular/build:unit-test` (22.0.6) referencia `zone.js/testing` incluso en proyectos zoneless y Vite lo resuelve estáticamente → sin el paquete instalado, los tests no arrancan. Las apps siguen zoneless (`polyfills: []` explícito en `app-web`; el guard de runtime nunca carga Zone en los tests de app-web).
  7. **Lib extra `shared-logging`** (la spec dejaba elegir entre `shared-auth` o una lib nueva): decisión documentada en su README — logging separado de auth. Solo scaffold; middleware de correlación + nestjs-pino llegan en Fase 2 con el primer servicio real.
  8. **e2e runners en `none` por ahora** — Playwright llega en Fases 10/12; los defaults de generadores en `nx.json` ya apuntan a playwright para apps futuras.
  9. Se eliminó un `index.html` vacío (0 bytes) que había quedado en la raíz del repo.
- **Verificación de criterios de aceptación**:
  - [x] `docker compose -f infra/docker-compose.yml up` levanta Postgres (verificadas las 8 bases con `psql \l`), RabbitMQ (UI :15672 → 200) y Adminer (:8081 → 200) sin errores.
  - [x] `pnpm nx run-many -t build` compila los 16 proyectos (12 apps + 4 libs buildables + shared-ui) sin errores.
  - [x] `libs/shared-types` y `libs/shared-events` transcriptos exactamente de `shared-types.md` y `event-catalog.md` (mismos campos, sin agregados; enums distribuidos por archivo de dominio, re-exportados desde `index.ts`).
  - [ ] CI corre en un PR de prueba y pasa en verde — **pendiente: el repo no tiene remote de GitHub todavía**. Verificar en el primer push (el workflow ya está escrito).
  - [x] Ningún servicio tiene lógica de negocio ni conexión Prisma real.
  - [x] `pnpm nx run-many -t lint` en verde (16/16); reglas verificadas activas con archivo de prueba (falló con `curly` en `if` sin llaves y `max-params` con 8 parámetros; revertido).
- **Deuda técnica / pendientes conocidos**:
  - Verificar CI en GitHub al crear el remote (criterio pendiente de arriba).
  - `@angular-devkit/build-angular` (deprecated, era de la plantilla) sigue en package.json — evaluar quitarlo en Fase 3 si nada lo usa.
  - `nx-welcome.ts` de `app-web` excede el budget de CSS por componente (warning de build) — desaparece al reemplazar el placeholder en Fase 3.
  - Considerar `ASTRO_TELEMETRY_DISABLED=1` en CI (Astro recolecta telemetría anónima).
- **Qué debería verificar la próxima sesión antes de construir sobre esta fase**:
  1. `docker compose -f infra/docker-compose.yml up -d` y que las 8 bases existan (`docker exec infra-postgres-1 psql -U dorado -c '\l'`).
  2. `pnpm install` y `pnpm nx run-many -t lint,test,build` en verde.
  3. Si ya hay remote GitHub: que el workflow de CI haya corrido en verde en algún PR; si no, crearlo y verificarlo.
