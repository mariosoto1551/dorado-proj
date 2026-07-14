---
name: nx-monorepo
description: Usar siempre que se toque configuración de workspace (nx.json, project.json, tsconfig.base.json, generadores, CI), se agregue un proyecto nuevo (app o lib), o se configuren tareas/caché de Nx. No es para código de negocio de un servicio puntual — es para la infraestructura del monorepo en sí.
---

# Nx monorepo — Proyecto Dorado

## Versión y generadores

- **Nx 22.x**, package manager **pnpm 11.x** (fijado en `nx.json`/`package.json`, no mezclar con npm/yarn en ningún `apps/*`).
- Generadores a usar: `@nx/nest` (servicios backend), `@nx/angular` (`app-web`), `@nx/node` (libs TS puras como `shared-types`/`shared-events`). `public-site` (Astro) no tiene generador oficial de Nx — se agrega como proyecto Nx "manual" (`project.json` a mano) apuntando a los comandos nativos de Astro (`astro dev`/`astro build`), registrado igual en el grafo de dependencias para que `nx affected` lo detecte.
- Nx 22 incluye "Nx agent skills" propios (portable capabilities para agentes de IA dentro del workspace) — **no confundir con los archivos de `ai-skills/` de este repo**. Son mecanismos distintos de proveedores distintos; no hace falta integrarlos entre sí para este proyecto.

## Estructura (ver `fase-01-monorepo.md` para el árbol completo)

`apps/` para todo lo desplegable (9 servicios + gateway + 2 frontends), `libs/` para código compartido (`shared-types`, `shared-events`, `shared-auth`, `shared-ui`). Nunca lógica de negocio de un servicio puntual dentro de `libs/` — eso rompe el límite de independencia entre microservicios que pide `ADR-00`.

## `nx affected`, no `run-many` a ciegas en CI

El pipeline de CI (`fase-01-monorepo.md`) usa `nx affected -t lint,test,build` comparando contra `origin/main`, para no reconstruir los 9 servicios en cada PR que solo toca uno. Mantener el grafo de dependencias limpio (imports explícitos entre `libs/`) es lo que hace que `affected` calcule bien qué se rompió.

## Caché

Cache local de Nx (`.nx/cache`) + cache en CI vía `actions/cache` sobre esa carpeta (o Nx Cloud si en algún momento se decide sumarlo — no está decidido para el MVP, no asumirlo). No commitear `.nx/cache` al repo.

## Testing por defecto: Vitest, no Jest

Al generar proyectos nuevos, configurar el executor de test en Vitest (`@nx/vite`) para todos los `apps/*` y `libs/*` de este workspace — es la decisión de stack de testing del proyecto (ver `CLAUDE.md`), no el default histórico de los generadores de Nx/Nest, que suele venir con Jest — hay que cambiarlo explícitamente al scaffoldear.

## Errores comunes a evitar en este proyecto puntual

- Crear un servicio nuevo copiando/pegando otro a mano en vez de usar el generador — se pierde el registro correcto en el grafo de Nx y `affected` deja de detectarlo bien.
- Poner una dependencia de negocio de un servicio (ej. Prisma Client de `identity-service`) como import de otro servicio — los servicios no se importan entre sí, solo consumen `libs/shared-*`.

## Dónde mirar antes de codear

`fase-01-monorepo.md` completo.
