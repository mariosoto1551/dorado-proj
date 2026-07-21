# Progreso de ejecución — Proyecto Dorado

> Esta carpeta es el registro de lo que **realmente se hizo**, sesión a sesión de Claude Code — a diferencia de `docs/phases/`, que es la especificación (no cambia una vez escrita). Un archivo por fase, mismo nombre que su spec en `docs/phases/`, en `docs/progreso/`.

## Protocolo (leer esto antes de tocar código en cualquier sesión nueva)

### Al empezar una sesión

1. Leer esta tabla para saber qué fase está en curso o cuál sigue.
2. Abrir `docs/progreso/fase-XX-*.md` de la última fase marcada `COMPLETADA` (o `COMPLETADA_CON_DESVIACIONES`) y leer su "Registro de ejecución" completo — ahí están las desviaciones del plan original y qué hay que verificar antes de confiar en que esa fase sigue funcionando.
3. **No asumir que el código de una fase anterior anda solo porque el archivo dice `COMPLETADA`.** Correr los comandos de verificación que esa fase dejó anotados (tests, `docker compose up`, etc.) antes de construir encima.
4. Si la fase que vas a ejecutar ya tiene un archivo en `docs/progreso/` con estado `EN_PROGRESO`, retomar desde ahí — no volver a empezar de cero ni asumir que no se hizo nada.

### Al terminar una fase (o un corte de trabajo significativo dentro de una fase larga)

1. Completar (o actualizar) `docs/progreso/fase-XX-*.md` con el template de abajo — no dejarlo a medio llenar "para después".
2. Actualizar la fila correspondiente en la tabla de este README.
3. Un commit de git por fase (o por corte), con mensaje `fase-XX: <resumen corto>` — el historial de git es parte de este mismo sistema de trazabilidad, no algo aparte.
4. Si te desviaste de lo que dice `docs/phases/fase-XX-*.md` (agregaste un campo, cambiaste un endpoint, etc.), **documentar la desviación acá, no editar el archivo de spec original** — el spec queda como quedó decidido; el registro de ejecución es donde se anota la realidad.

## Tabla de estado

| Fase | Estado | Última actualización | Resumen |
|---|---|---|---|
| Fase 0 — Especificación | COMPLETADA | 2026-07-14 | Docs de arquitectura y las 15 fases generados. |
| Fase 1 — Monorepo | COMPLETADA_CON_DESVIACIONES | 2026-07-14 | Workspace Nx 23 + 12 apps + 5 libs + Docker + CI. Ver desviaciones (Nx 23, plantilla angular, zone.js devDep, shared-logging) y pendiente de CI en su archivo. |
| Fase 2 — Identity & Access | COMPLETADA_CON_DESVIACIONES | 2026-07-15 | identity-service completo (auth, invitaciones, grupos, internos, 4 eventos) + shared-auth/shared-logging reales. Flujo E2E y eventos verificados. Ver desviaciones (Prisma 7 config/extension, huecos de spec señalados) en su archivo. |
| Fase 3 — Gateway + auth frontend | COMPLETADA_CON_DESVIACIONES | 2026-07-15 | Gateway completo (proxy 9 prefijos, CORS, 429, JWT, headers tenant, health) + auth de app-web (sesión en memoria, refresh silencioso, 5 pantallas). Flujo E2E verificado en navegador. Ver desviaciones (express-rate-limit, pathFilter, tipos locales) en su archivo. |
| Fase 4 — Billing | COMPLETADA_CON_DESVIACIONES | 2026-07-16 | billing-service completo (suscripción FREE vía evento, entitlements, mi-organizacion) + límites reales en identity (grupos/tutores/usuarios) + plan real en el JWT con fallback FREE. 4 criterios verificados E2E. Ver desviaciones (seed dual, extras en sobre de error, fail-open de entitlements) en su archivo. |
| Fase 5 — Activity Catalog | COMPLETADA_CON_DESVIACIONES | 2026-07-16 | activity-service completo (CRUD actividades/conductas, límite de plan real, visibilidad por rol, validación condicional de tiempo). Incluye fix transversal de seguridad: el filtro automático de tenant (ALS) estaba inactivo desde Fase 2 — ver su archivo. |
| Fase 6 — Session/Section | COMPLETADA_CON_DESVIACIONES | 2026-07-16 | session-service completo (config por grupo, máquina de estados Sección/Sesión, scheduler automático con cron+timezone, 5 eventos, endpoints internos para Fase 7). Ambos modos verificados E2E. Ver desviaciones (mapeo DTO/columnas, autocierrePospuestoHasta, bootstrap automático) en su archivo. |
| Fase 7 — Scoring Engine | COMPLETADA_CON_DESVIACIONES | 2026-07-18 | scoring-service completo (ledger EventoPuntos, 2 colas cuórum consumidoras, evaluación por sesión/final, umbrales, descalificaciones, correcciones, internos para Fase 8) + endpoints de registro en activity-service (completar/no-hizo/conductas/cronómetro, 4 eventos). 6 criterios verificados E2E (43/43 checks). Ver desviaciones (origenId=registroId, ORG_ADMIN en completar, huecos de spec señalados) en su archivo. |
| Fase 8 — Rewards | COMPLETADA_CON_DESVIACIONES | 2026-07-18 | rewards-service completo (CRUD recompensas con snapshot de zona, elegibles derivados del ResultadoSeccion de scoring, selección/sorteo con canje único por sección, entrega, consumidor de ZonaAlcanzada). 4 criterios verificados E2E (29/29 checks). Ver desviaciones (shape de elegibles, codes de estado, ORG_ADMIN en canjes) en su archivo. |
| Fase 9 — Notification & Audit | COMPLETADA_CON_DESVIACIONES | 2026-07-18 | notification-service (campana in-app, 9 eventos notificables con plantillas y nombres resueltos por REST) + audit-service (ledger inmutable de solo lectura, timeline por entidad) + retrofit de AccionAdministrativaRegistrada en identity/activity/scoring/rewards. 5 criterios verificados E2E (18/18 checks). Ver desviaciones (shape de paginación, interno de tutores, fallback de nombres, SYSTEM en ciclo de vida) en su archivo. |
| Fase 10 — Frontend completo | COMPLETADA_CON_DESVIACIONES | 2026-07-21 | app-web completo (diseño híbrido tutor/usuario, shared-ui con ZonaBadge/EstadoSeccionBadge/ConfirmDialog, 6 clientes API, shell con nav por rol + campana con polling, 11 pantallas tutor + 4 usuario). Ciclo E2E completo verificado en navegador (17 pasos, tutor+usuario, scoring real). Ver desviaciones (fix CORS PUT en gateway, tipos de retorno de mutaciones de sección, huecos de API de estado propio) en su archivo. |
| Fase 11 — Public site | COMPLETADA_CON_DESVIACIONES | 2026-07-21 | public-site en Astro 7 (SSG + Tailwind 4 con tokens compartidos): landing premium (hero con mock de producto, showcase de zonas, bento de features, cómo funciona, CTA), /precios estático (Free vs Pro sincronizado con seed de billing) y /registro con island de TS vanilla contra el Gateway. Registro verificado E2E real (201/409 + submit desde navegador en origen 4321). Ver desviaciones (sin componentes de sección separados, dark mode solo por SO, progressive enhancement de reveals, scripts inline) en su archivo. |
| Fase 12 — QA/hardening | PENDIENTE | — | — |
| Fase 13 — Piloto/deploy | PENDIENTE | — | — |
| Fase 14 — Post-MVP | PENDIENTE | — | — |

Estados posibles: `PENDIENTE` · `EN_PROGRESO` · `COMPLETADA` · `COMPLETADA_CON_DESVIACIONES` (completada pero con algo documentado que se apartó del plan o quedó como deuda técnica — ver su archivo en esta carpeta).

## Por qué está separado de `docs/phases/`

Mismo principio que la regla de puntaje del proyecto: lo ya escrito no se edita silenciosamente. `docs/phases/` es la decisión tomada de antemano; `docs/progreso/` es el hecho consumado. Si en algún momento la realidad obliga a cambiar la spec misma (no solo registrar una desviación puntual), eso se hace a mano, a propósito, y se nota en el historial de git — no se pisa silenciosamente vía una sesión de Claude Code ejecutando código.
