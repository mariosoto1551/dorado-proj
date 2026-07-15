# shared-ui

Design tokens y (a partir de Fase 10) componentes Angular compartidos de UI.

- **`src/theme.css`** — tokens de diseño como CSS custom properties vía
  `@theme` de Tailwind CSS v4 (config CSS-first, sin `tailwind.config.js`).
  Incluye los colores de zona **default de seed** (Rojo/Amarillo/Verde/Dorado).
  - `apps/app-web` lo importa en su entrypoint de estilos.
  - `apps/public-site` (Astro) importa el mismo archivo como CSS plano.
- Regla del proyecto: el color real de zona por Grupo viene siempre de la API
  (`UmbralZona.colorHex`) — estos tokens son solo el fallback visual del seed.

## Tests

`pnpm nx test shared-ui`
