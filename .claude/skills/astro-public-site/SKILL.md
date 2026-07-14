---
name: astro-public-site
description: Usar siempre que se escriba o edite código dentro de `apps/public-site`. Cubre Astro 7 (compilador Rust, más estricto con HTML), SSG, islands, y las reglas específicas del formulario de registro de organización.
---

# Astro 7 — `public-site`, Proyecto Dorado

## Versión y cambios importantes respecto a versiones previas

- **Astro 7.0** (GA junio 2026). Trae un compilador de HTML nuevo escrito en Rust, reemplazando el compilador Go anterior. Es **más estricto**:
  - Tags no cerrados (`<div>` sin `</div>`) ahora son **error de build**, no advertencia silenciosa. Revisar todo el markup con cuidado, sobre todo si se copia/pega de ejemplos de versiones viejas de Astro.
  - El compilador ya no "corrige" HTML semánticamente inválido — lo pasa tal cual al navegador. Escribir HTML válido a propósito, no confiar en que Astro lo arregle.
- Vite 8 por debajo (builds más rápidos). `src/fetch.ts` disponible para manejar requests si hace falta (Advanced Routing, ya estable en 7.0).
- Si algún plugin remark/rehype legado se necesita, puede requerir `@astrojs/markdown-remark` explícito para compatibilidad — no asumir que sigue andando igual que en Astro 6.

## Renderizado: SSG por default

`public-site` es 100% estático (`astro build` genera HTML plano) salvo el island interactivo del formulario de registro. No agregar SSR/adapters de servidor a menos que una página puntual lo necesite explícitamente — no es el caso de ninguna página de este servicio en el MVP (ver `fase-11-public-site.md`).

## El único island interactivo: `/registro`

- Implementarlo en **TypeScript vanilla**, sin traer React/Vue/Svelte a este proyecto por un solo formulario — no se justifica el peso ni la complejidad de build.
- El island hace `fetch()` directo a `POST {GATEWAY_PUBLIC_URL}/api/auth/organizaciones` (a través del Gateway, nunca directo a `identity-service` — ver aclaración en `fase-11-public-site.md`).
- Manejo de estados: loading / éxito (con link a `app-web/login`) / error (mensajes inline, sin perder los datos tipeados) — implementados a mano con DOM APIs estándar, sin un framework de estado.

## `/precios`: contenido estático, sin llamadas a `billing-service`

Los límites de plan Free/Pro se escriben directo en el contenido de la página (Markdown/Astro component), sincronizados a mano con el seed de `Plan` de `billing-service` (Fase 4). No conectar esta página a la API — es contenido editorial, se edita como copy, no como dato.

## SEO

`@astrojs/sitemap` para `sitemap.xml`. Meta tags (`title`, `description`, Open Graph) por página, sin over-engineering — no hace falta schema.org ni blog en el MVP.

## Estilo

Mismo `libs/shared-ui/theme.css` que `app-web` (ver skill `tailwind-css`), importado como CSS plano.

## Errores comunes a evitar en este proyecto puntual

- Dejar un tag sin cerrar asumiendo que "Astro lo arregla" — en 7.0 ya no.
- Traer un framework de UI completo para el formulario de `/registro`.
- Conectar `/precios` a `billing-service` en tiempo real.

## Dónde mirar antes de codear

`fase-11-public-site.md` completo.
