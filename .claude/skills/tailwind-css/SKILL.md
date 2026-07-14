---
name: tailwind-css
description: Usar siempre que se escriban o editen estilos/clases Tailwind en `apps/app-web` (Angular) o `apps/public-site` (Astro), o al tocar `libs/shared-ui`. Cubre Tailwind CSS v4 (config CSS-first, sin tailwind.config.js), tokens de diseño compartidos y las reglas de color de zona del proyecto.
---

# Tailwind CSS v4 — Proyecto Dorado

## Cambio de modelo respecto a v3 (importante, no asumir lo viejo)

- **No hay `tailwind.config.js`**. La configuración vive en CSS, vía la directiva `@theme` en el entrypoint de estilos de cada app.
- **No hay `content: [...]` que declarar** — Tailwind v4 detecta solo qué archivos escanear.
- Motor nuevo (Oxide, en Rust) — builds hasta 10x más rápidos que v3, no requiere configuración extra para eso.
- Cascade layers nativos (`@layer theme/base/components/utilities`) y container queries nativos (sin plugin).

## `libs/shared-ui`: dónde viven los tokens

```css
/* libs/shared-ui/src/theme.css */
@theme {
  --color-zona-rojo: #EF4444;      /* default de seed, ver CLAUDE.md — el color REAL por Grupo viene de la API, esto es solo el fallback visual */
  --color-zona-amarillo: #F59E0B;
  --color-zona-verde: #22C55E;
  --color-zona-dorado: #EAB308;
  /* tipografía, espaciados, etc. según se necesiten */
}
```

- `app-web` importa este archivo en su entrypoint de estilos.
- `public-site` (Astro) importa el mismo `theme.css` como CSS plano — Astro no consume una lib Angular directamente, pero sí puede importar un archivo `.css` común (ver `fase-01-monorepo.md`).

## Regla de color de zona (repetida a propósito, se rompe fácil)

Los valores de `@theme` de arriba son **el default de seed**, no la fuente de verdad. La UI real de zonas (badges, barras de progreso) siempre lee `UmbralZona.colorHex` desde la API (`GET /api/scoring/grupos/:grupoId/umbrales`) y lo aplica como estilo inline o variable CSS dinámica — nunca asume que un Grupo usa los colores default. Ver `fase-10-frontend-completo.md`, componente `ZonaBadgeComponent`.

## Buenas prácticas v4 para este proyecto

- **Evitar `@apply` como default** para estilos de componente — es válido puntualmente para casos que no se pueden expresar limpio en el markup, pero el patrón principal es componer utilidades directo en el template (Angular) o el `.astro`, y extraer a componente reutilizable (`ZonaBadgeComponent`, etc.) cuando se repite, no a una clase custom vía `@apply`.
- Mobile-first: usar los breakpoints (`sm:`, `md:`, `lg:`) para expandir desde el layout angosto, nunca al revés (ver skill `angular-frontend`).
- Aprovechar container queries nativos (`@container`) para componentes que se reusan en contextos de ancho variable (ej. `ZonaBadgeComponent` dentro de una card angosta vs. una tabla ancha en el panel de evaluación de Fase 10) en vez de duplicar variantes por breakpoint de página.

## Errores comunes a evitar en este proyecto puntual

- Crear un `tailwind.config.js` "porque así se hacía antes" — no existe en v4, la config va en CSS.
- Hardcodear un hex de zona en un componente en vez de usar la variable de `libs/shared-ui` (para el default) o el dato de la API (para el real).

## Dónde mirar antes de codear

`fase-10-frontend-completo.md` (sección "Colores de zona" y "Componentes compartidos"), `fase-11-public-site.md` (sección "Diseño").
