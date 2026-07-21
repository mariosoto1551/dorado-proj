# Registro de ejecución — Fase 11: Sitio público (`public-site`)

- **Estado**: COMPLETADA_CON_DESVIACIONES
- **Fecha de finalización**: 2026-07-21
- **Commit/rama**: `master` — commit `fase-11: sitio público (landing + precios + registro)`
- **Resumen de lo implementado**:
  - `public-site` en Astro 7 (SSG puro, salvo el island de `/registro`), con Tailwind CSS 4
    vía `@tailwindcss/vite` reutilizando los tokens compartidos (`libs/shared-ui/src/theme.css`:
    marca índigo + colores de zona + animaciones). Sitemap con `@astrojs/sitemap`.
  - **Diseño** (decisión de José, vía AskUserQuestion): tono "índigo + zonas vibrantes",
    producto mostrado con **mock UI en CSS/SVG** (no capturas reales). SaaS moderno y limpio,
    dark mode por `prefers-color-scheme`, reveals on-scroll con `IntersectionObserver` y
    progressive enhancement (`html.js`: sin JS el contenido queda visible).
  - **3 páginas**:
    - `/` — Hero (headline + mock de tarjeta de usuario con zona Verde → Dorado + CTA único),
      showcase de las 4 zonas (genérico, no atado a Destino:Dorado), bento de features,
      "Cómo funciona" (3 pasos), CTA final. Nav sticky glass + menú móvil `<details>` (cero JS).
    - `/precios` — Free vs Pro **estático** (contenido editorial, sin red), tarjetas + comparativa.
      Límites sincronizados a mano con el seed de `Plan` (`billing-service/src/prisma/seed-planes.ts`):
      FREE 1 grupo / 2 tutores / 5 usuarios / 15 actividades; PRO ilimitado + white-label + reportes.
    - `/registro` — form (`nombre`, `emailContacto`, `password`) + island de **TS vanilla**
      (`src/scripts/registro.ts`) que hace `POST {PUBLIC_GATEWAY_URL}/api/auth/organizaciones`
      a través del Gateway. Estados: loading / éxito (link a `{PUBLIC_APP_WEB_URL}/login`) /
      error inline sin perder datos. Sin handoff de sesión cross-domain (spec).
  - SEO por página: `<title>`/description únicos, canonical + Open Graph + Twitter card
    absolutos (via `site` en `astro.config.mjs`), `theme-color`, favicon SVG, `og.svg`.
  - Variables de build documentadas en `apps/public-site/.env.example`
    (`PUBLIC_GATEWAY_URL`, `PUBLIC_APP_WEB_URL`, `SITE_URL`).

- **Desviaciones del plan documentado** (y por qué):
  1. **No se agregó un archivo `Reveal.astro` ni componentes de sección separados** que se
     habían bocetado en la propuesta de árbol. Las secciones viven inline en cada página y el
     reveal es una clase CSS (`.reveal`) + un script global en `Layout.astro`. Menos archivos,
     mismo resultado; la reutilización real entre páginas era baja.
  2. **Dark mode por `prefers-color-scheme` únicamente, sin toggle manual.** La skill sugería
     "media query + toggle"; se optó por solo la media query para mantener el sitio 100%
     estático y sin estado persistido (un toggle sin `localStorage` se resetea en cada
     navegación, y usar storage roza el espíritu de la regla 7). Deuda menor si se quiere toggle.
  3. **Progressive enhancement de los reveals (`html.js`)**: agregado no previsto en la spec,
     para que el contenido no quede invisible si el JS falla o no está (SEO/accesibilidad).
  4. **`SITE_URL` default `https://proyectodorado.app`** (placeholder de dominio de producción)
     — a confirmar/ajustar en Fase 13 (deploy/piloto) junto con el dominio real.
  5. Astro **inlinea** los scripts de módulo (reveal + island) en el HTML en vez de emitir
     archivos `.js` externos — comportamiento por defecto para scripts chicos; mejor para
     performance (una request menos). No hay ningún `_astro/*.js` en `dist/`, es esperado.

- **Verificación de criterios de aceptación** (copiado de `docs/phases/fase-11-public-site.md`):
  - [x] `public-site` compila a estático (`astro build`) sin depender de SSR en runtime.
        → `output: "static"`, 3 páginas + `sitemap-index.xml` generados en `dist/`.
  - [x] El formulario de registro crea una organización real contra el Gateway y redirige al
        éxito/error. → **E2E real**: `POST /api/auth/organizaciones` vía Gateway devolvió 201
        creando org+tutor `ORG_ADMIN` reales; email duplicado → 409. Además, submit **real desde
        el navegador** en origen `http://localhost:4321` (preflight CORS real, el Gateway ya
        whitelistea `PUBLIC_SITE_URL=4321`) → vista de éxito. Máquina de estados del island
        cubierta con 9/9 checks (éxito, body correcto, 409 con datos preservados, sin conexión,
        validación cliente que no llama al backend).
  - [x] `/precios` no hace ninguna llamada de red. → Verificado: el HTML compilado no contiene
        `fetch`/`XMLHttpRequest`/`api/`.
  - [x] Performance razonable (100% estático). → SSG, CSS único, scripts inline mínimos, sin
        framework de UI, imágenes SVG. Sin JS bloqueante innecesario.

- **Deuda técnica / pendientes conocidos**:
  - Toggle de dark mode manual (opcional) — hoy solo sigue al SO.
  - `SITE_URL` y textos de contacto ("escribinos", upgrade a Pro) son placeholders hasta Fase 13.
  - `og.svg` es una imagen social simple hecha a mano; si se quiere OG rasterizado (algunas
    plataformas no previsualizan SVG), generar un PNG en Fase 13.
  - Los límites de `/precios` se mantienen **a mano** sincronizados con el seed de billing
    (decisión de spec, no es integración automática). Si cambia el seed, actualizar la página.

- **Qué debería verificar la próxima sesión antes de construir sobre esta fase**:
  - `npx astro build --root apps/public-site` compila sin errores y deja `dist/` estático.
  - Para probar el registro end-to-end hace falta el Gateway + identity-service arriba
    (postgres/rabbit vía docker-compose) y el preview servido en `http://localhost:4321`
    (el origen que el Gateway acepta por CORS). Desde 4200/otros orígenes el POST lo bloquea CORS.
  - `import.meta.env.PUBLIC_GATEWAY_URL` / `PUBLIC_APP_WEB_URL` se inyectan en build: si el
    dominio de despliegue cambia, rebuild con esas env vars (ver `.env.example`).
