# Fase 11 — Sitio público (`public-site`, Astro)

> Objetivo: landing, pricing, y el formulario que da de alta organizaciones nuevas. Basado en `proyecto-dorado-plan-desarrollo-general.md` sección 12.

## Prerrequisitos
Fase 4 completa (para poder mostrar límites reales de Free/Pro en la página de precios) y Fase 2 (endpoint de registro).

## Aclaración sobre "llama directamente al Identity Service"

`arquitectura-base.md` sección 7 dice que el formulario de registro "llama directamente al Identity Service". **Esto no significa exponer `identity-service` fuera de la red interna** (violaría `ADR-00` sección 4, que dice que ningún servicio se expone salvo a través del Gateway). La lectura correcta es: `public-site` reutiliza el mismo endpoint público que usa `app-web` (`POST /api/auth/organizaciones` a través del Gateway) en vez de reimplementar lógica de registro propia. Confirmar esta interpretación si en algún momento se decide que `public-site` y `app-web` corren en dominios completamente distintos con políticas CORS separadas — no debería requerir cambios, el Gateway ya acepta requests públicos en esa ruta.

## Páginas

| Ruta | Contenido | Renderizado |
|---|---|---|
| `/` | Landing: propuesta de valor, cómo funciona (explicación de zonas/actividades en términos genéricos, no específicos de Destino:Dorado), capturas/mockups, CTA a `/registro`. | SSG estático. |
| `/precios` | Comparativa Free vs Pro. **Contenido estático editorial** (no llama a `billing-service` en runtime) — los límites se escriben a mano en el contenido de la página y se mantienen sincronizados manualmente con el seed de `Plan` de Fase 4 (FREE: 2 tutores/5 usuarios/1 grupo/15 actividades; PRO: sin límites + white-label + reportes avanzados). Si los límites reales cambian, hay que actualizar esta página a mano — no hay integración automática en el MVP. | SSG estático. |
| `/registro` | Formulario de alta de organización (`nombre`, `emailContacto`, `password`). | Página estática con un único "island" interactivo (vanilla TypeScript, sin framework de UI — no vale la pena traer React/Angular a `public-site` por un solo formulario) que hace `POST /api/auth/organizaciones` contra el Gateway. |

## Flujo de `/registro`

1. Submit del form → `POST {GATEWAY_PUBLIC_URL}/api/auth/organizaciones`.
2. Si 201: mostrar pantalla de éxito con un botón "Iniciar sesión" que linkea a `{APP_WEB_URL}/login`. **No** se intenta pasar la sesión ya iniciada de `public-site` a `app-web` (son orígenes distintos, evitar la complejidad de un handoff de sesión cross-domain en el MVP) — el usuario simplemente vuelve a loguearse en `app-web` con el email/password que acaba de crear.
3. Si 409 (email ya registrado) u otro error: mostrar el mensaje de error correspondiente inline, sin perder los datos ya tipeados.

## SEO

- Astro SSG/SSR estándar: `<title>`, `<meta description>`, Open Graph tags básicos por página.
- `sitemap.xml` generado con `@astrojs/sitemap`.
- Sin optimizaciones avanzadas de SEO (schema.org, blog, etc.) en el MVP — eso es post-MVP si hace falta.

## Diseño

Usa `libs/shared-ui` (Fase 1) para tokens de color/tipografía compartidos con `app-web`, exportados como CSS plano consumible desde Astro (Astro no importa librerías Angular directamente).

## Criterios de aceptación de esta fase

- [ ] `public-site` compila a estático (`astro build`) y sirve sin necesidad de un runtime Node persistente salvo para el sitemap/build (verificar que no dependa de SSR en runtime si no es necesario).
- [ ] El formulario de registro crea una organización real contra el Gateway y redirige correctamente al éxito/error.
- [ ] `/precios` no hace ninguna llamada de red — es contenido estático.
- [ ] Lighthouse (o similar) en `/` da un puntaje de performance razonable dado que es 100% estático (no hay un umbral numérico exigido por los documentos fuente, pero no debería haber JS bloqueante innecesario).

## Nota para Claude Code

No conectes `/precios` a `billing-service` en tiempo real — quedaría un acoplamiento innecesario entre el sitio de marketing (que se edita seguido, con copy y diseño) y la API. Si en el futuro se automatiza, es una decisión de Fase 14.
