---
name: astro-landing-uiux
description: >-
  Diseña y construye landing pages / sitios de marketing estáticos de nivel
  premium en Astro con la mejor UI/UX actual (estética SaaS moderna y limpia
  tipo Linear/Vercel/Stripe). Úsala SIEMPRE que el usuario quiera crear,
  rediseñar o mejorar una landing page, sitio de presentación, sitio de
  marketing, página de producto, "web para presentar mi app", hero section,
  pricing, o cualquier sitio estático en Astro — aunque no diga explícitamente
  "UI/UX". Cubre design tokens, tipografía fluida, dark mode, jerarquía visual,
  arquitectura de islas de Astro, content collections, optimización de imágenes,
  accesibilidad WCAG 2.2, Core Web Vitals y SEO. Triggers: "landing", "landing
  page", "sitio estático", "static site", "web de marketing", "presentar mi app",
  "Astro", "hero", "pricing page", "sección de features", "diseño de sitio web".
---
 
# Astro Landing UI/UX — la landing SaaS definitiva
 
Construye landing pages estáticas en **Astro** con la UI/UX que usan hoy los
mejores productos (Linear, Vercel, Stripe, Framer): rápidas, accesibles,
orientadas a conversión y visualmente pulidas sin caer en lo genérico.
 
Esta skill no es un tutorial de Astro. Es un **sistema de decisiones de diseño +
patrones de implementación** para que cada landing salga premium a la primera:
tokens antes que estilos sueltos, jerarquía antes que decoración, y performance
como parte del diseño, no como limpieza posterior.
 
## Cuándo usarla
 
Cualquier petición de landing / sitio de marketing / página de presentación de
producto o app en Astro (o portable a HTML/CSS). También al rediseñar o auditar
una landing existente. Si el usuario pide "una web para presentar mi app de X",
esto es exactamente el caso de uso central.
 
## Principios rectores (no negociables)
 
1. **Performance-first = diseño.** Una landing que carga en >2s pierde al
   usuario antes de ver el producto. En Astro esto es casi gratis: **static por
   defecto, JavaScript solo en las islas que lo necesitan.** Astro puntúa 95-100
   en Lighthouse sin tuning si no lo saboteas con scripts globales.
2. **Claridad antes que creatividad.** El 90% de la conversión está en decir
   *qué es, para quién y por qué importa* en el hero. La creatividad se aplica
   como acento (un "wow moment"), no como ruido en toda la página.
3. **Sistema, no páginas sueltas.** Define **design tokens** (color, tipografía,
   espaciado, motion) una sola vez y deriva todo de ahí. Componentes reutilizables
   para secciones repetidas. Así el sitio escala sin volverse un collage.
4. **Accesibilidad es craft, no checkbox.** Contraste, foco visible, jerarquía de
   headings, `prefers-reduced-motion`. Baja el listón de accesibilidad y bajas la
   conversión de todos.
5. **Muestra producto real.** Screenshots/UI real del producto convierten más que
   ilustraciones abstractas: reducen la duda.
## Flujo de trabajo
 
Sigue estas 4 fases en orden. Cada una tiene su archivo de referencia con el
detalle; léelo cuando entres en esa fase.
 
### Fase 1 — Brief + Design system
 
Antes de escribir una línea de layout, fija el sistema. Pregunta o infiere:
producto, audiencia, propuesta de valor en una frase, acción principal (el CTA),
prueba social disponible (logos, números, testimonios) y personalidad de marca
(un adjetivo: "confiable", "técnico", "vibrante").
 
Luego define los **tokens**. Lee **`references/design-system.md`** para:
color con roles semánticos (surface, on-surface, primary, accent, border) mapeados
a light **y** dark en paralelo; tipografía fluida con `clamp()`; escala de espaciado;
tokens de motion. Usa **`assets/tokens.css`** como punto de partida y adáptalo a la
marca — no partas de cero.
 
Regla de oro del color: **construye el contraste dentro del token**, no lo revises
después. Uno o dos colores dominantes + base neutra. Botones de alto contraste
rinden hasta **+32% CTR** frente a los de bajo contraste (Baymard).
 
### Fase 2 — Anatomía de la landing (estructura de conversión)
 
Decide el orden de secciones y qué va en cada una. Lee
**`references/landing-anatomy.md`** para el patrón sección-por-sección con datos
de conversión reales. Resumen del esqueleto que funciona hoy:
 
1. **Nav** minimal y sticky (logo, 3-5 links, 1 CTA).
2. **Hero** — headline con beneficio concreto (números > adjetivos vagos; un hero
   con un dato grande tipo "127× más rápido" rinde **+18%**), subhead de 1-2 líneas,
   **un** CTA primario, y **producto real** visible (screenshot/mock/loop).
3. **Logo strip / prueba social** inmediata (+8%; "usado por 8 de las Fortune 50"
   rinde +22%).
4. **Bento grid de features** — el patrón que ganó 2026 para mostrar producto
   complejo de forma escaneable (67% del top SaaS lo usa; +47% dwell, +38% CTR).
5. **Cómo funciona** (3 pasos) / demo interactiva o loop de producto.
6. **Social proof profundo** — testimonio con cara y resultado medible (+14% por
   testimonial), métricas, casos.
7. **Pricing** claro (si aplica), con un plan destacado.
8. **FAQ** que responde objeciones reales.
9. **CTA final** de cierre + **CTA sticky** en móvil (+11%).
10. **Footer** con navegación y confianza (legal, contacto).
No metas todas: elige según el producto. Menos secciones bien jerarquizadas
> muchas secciones planas.
 
### Fase 3 — Implementación en Astro
 
Lee **`references/astro-patterns.md`** para los patrones concretos: estructura de
proyecto, **islas solo donde hay interacción** (menú, tabs, carrusel, calculadora),
`<Image>` para optimización automática, **content collections** tipadas para datos
de página (features, testimonios, pricing, SEO), **View Transitions** para
navegación tipo SPA sin bundle, y un `Layout.astro` que centraliza metadata,
Open Graph, canonical y JSON-LD.
 
Reglas que evitan los errores típicos:
 
- No hidrates una sección entera cuando solo un botón es interactivo.
- No cargues fuentes/imagenes pesadas sin reglas de LCP y `loading="lazy"` bajo
  el fold. Toda imagen en WebP/AVIF.
- Scripts de terceros (analytics, chat, consent) son sospechosos por defecto:
  se comen el presupuesto de performance que Astro te regaló. Cárgalos con cuidado.
Usa los componentes de ejemplo en `assets/` (`Hero.astro`, `Section.astro`) como
plantilla de patrón, no como copia literal.
 
### Fase 4 — Verificación (accesibilidad · performance · SEO)
 
Antes de dar por terminada la landing, pásala por el checklist. Lee
**`references/accessibility-performance.md`**. Objetivos duros:
 
- **Core Web Vitals (p75):** LCP < 2.5s · INP < 200ms · CLS < 0.1.
- **WCAG 2.2 AA:** contraste ≥ 4.5:1 (texto normal), foco visible, orden de
  headings correcto, targets táctiles ≥ 24px, todo operable con teclado.
- **SEO técnico:** `<title>`/description únicos, canonical, OG + Twitter card,
  sitemap, JSON-LD (`Organization`/`Product`), imágenes con `alt` real.
- **Motion:** respeta `prefers-reduced-motion`; sin parallax que cause jank en móvil.
Verifica de forma concreta: corre un build de Astro, revisa que no haya JS
innecesario, comprueba contraste de los tokens y navega con Tab. Si puedes, corre
Lighthouse. No declares "listo" sin haber pasado este filtro.
 
## Estética por defecto: "SaaS moderno y limpio"
 
Cuando no haya dirección de arte explícita, aplica este lenguaje visual:
 
- **Espacio en blanco generoso** y ritmo vertical consistente (escala de espaciado).
- **Tipografía como marca:** una variable font (un archivo cubre muchos pesos),
  headlines grandes con `clamp()`, buen tracking, jerarquía clara.
- **Color contenido:** neutros fríos de base + 1 color primario saturado para
  acciones. Gradientes sutiles tipo mesh solo como acento.
- **Dark mode en paralelo** (no como parche): `prefers-color-scheme` + toggle.
- **Bordes suaves, sombras sutiles, profundidad ligera.** Glassmorphism solo en
  nav/modales, con moderación (backdrop-filter es caro).
- **Micro-interacciones como sistema:** hover, focus y validación con timing/easing
  desde tokens, no animaciones sueltas inconsistentes.
- **Bento grid** para features/servicios: bloques asimétricos que crean jerarquía.
Evita el look "plantilla genérica": stock ilustrations sin sentido, tres cards
idénticas, hero con imagen decorativa vacía, y CTAs que compiten entre sí.
 
## Archivos de referencia
 
- `references/design-system.md` — tokens de color/tipografía/espaciado/motion,
  fluid type, dark mode, ejemplos de CSS.
- `references/landing-anatomy.md` — cada sección con su función, patrón y datos de
  conversión; copy y jerarquía.
- `references/astro-patterns.md` — estructura, islas, content collections, imágenes,
  view transitions, layout con SEO.
- `references/accessibility-performance.md` — checklist WCAG 2.2, Core Web Vitals,
  SEO técnico, presupuesto de performance.
## Assets
 
- `assets/tokens.css` — sistema de design tokens listo para adaptar (light + dark).
- `assets/Hero.astro` — hero de referencia (headline + producto real + CTA único).
- `assets/Section.astro` — wrapper de sección con ritmo/espaciado consistente.
 