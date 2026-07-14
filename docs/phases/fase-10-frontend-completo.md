# Fase 10 — Frontend `app-web` completo

> Objetivo: dashboard tutor completo, dashboard usuario, panel de evaluación de Sección, notificaciones in-app. Todos los servicios backend (Fases 2–9) ya existen — esta fase es 100% consumo de esa API vía el Gateway. Basado en `proyecto-dorado-plan-desarrollo-general.md` sección 11.

## Prerrequisitos
Fases 2–9 completas. Fase 3 ya dejó auth, shell y `libs/shared-ui` scaffoldeados.

## Diseño mobile-first (obligatorio, no opcional)

Todas las pantallas se maquetan primero para viewport angosto (< 480px) y se expanden hacia arriba con breakpoints Tailwind (`sm:`, `md:`, `lg:`). La base de usuarios son familias usando el celular, no desktop. Navegación de `Usuario` en mobile: barra inferior fija (bottom nav), no sidebar. Navegación de `Tutor`: sidebar colapsable en mobile (drawer), fija en desktop.

## Colores de zona

`UmbralZona.colorHex` (Scoring, Fase 7) ya es el dato de color por Grupo — el frontend nunca hardcodea colores de zona, siempre los lee de `GET /api/scoring/grupos/:grupoId/umbrales`. El seed genérico de Fase 0 usa valores neutros de ejemplo (Rojo `#EF4444`, Amarillo `#F59E0B`, Verde `#22C55E`, Dorado `#EAB308`) definidos ahí — son un default, no una constante de frontend.

## Enrutamiento por rol tras login

- `rol ∈ {ORG_ADMIN, TUTOR}` → redirige a `/grupos/:grupoId` (si administra un solo Grupo) o a un selector de Grupo si administra varios (`grupoIds.length > 1`, léase del JWT).
- `rol = USUARIO` → redirige a `/` (home de actividades de la Sesión actual).

## Área Tutor/ORG_ADMIN

| Ruta | Página | Llamadas principales | Notas |
|---|---|---|---|
| `/grupos/:grupoId` | Resumen del grupo | `GET /api/session/grupos/:id/secciones/actual`, `GET /api/scoring/grupos/:id/secciones/:seccionId/puntajes` | Estado de la Sección actual, ranking en vivo (preview si `ABIERTA`, definitivo si `EVALUACION`/`CERRADA`). |
| `/grupos/:grupoId/actividades` | CRUD Actividades | `/api/activity/grupos/:id/actividades` (todos los métodos) | Form con campos condicionales según `tipoLimiteTiempo` (mostrar `deadlineHora` o `duracionCronometroMinutos` según selección). |
| `/grupos/:grupoId/conductas` | CRUD Conductas | `/api/activity/grupos/:id/conductas` | Toggle `permiteAutoreporte` deshabilitado si `tipo=BUENA` (regla de negocio de Fase 5). |
| `/grupos/:grupoId/umbrales` | CRUD Umbrales de zona | `/api/scoring/grupos/:id/umbrales` | Validación en el form de rangos contiguos sin solapamiento (espejo de la validación del backend, para feedback inmediato). |
| `/grupos/:grupoId/recompensas` | CRUD Recompensas | `/api/rewards/grupos/:id/recompensas`, selector de `umbralZonaId` poblado desde umbrales | Toggle `permiteSeleccion`/`permiteAzar`. |
| `/grupos/:grupoId/invitaciones` | Generar/listar/revocar invitaciones | `/api/identity/grupos/:id/invitaciones` | Al generar, mostrar el link completo (`/invitacion/:codigo`) con botón "copiar" — no hay envío de email/WhatsApp automático en el MVP, se comparte manualmente. |
| `/grupos/:grupoId/usuarios` | Lista de usuarios del grupo | `/api/identity/grupos/:id/usuarios` | Edición de `nombre`/`avatarId`, desactivar usuario. |
| `/grupos/:grupoId/tutores` | Lista de tutores | `/api/identity/grupos/:id/tutores` | Solo visible/editable por `ORG_ADMIN`. |
| `/grupos/:grupoId/configuracion-sesion` | Config de Sesión/Sección | `/api/session/grupos/:id/configuracion` | Form modo Manual/Automático; si Automático, inputs de cron (usar un selector amigable tipo "todos los días de lunes a sábado a las 00:00" que internamente arma el string cron — no exponer cron crudo al tutor). |
| `/grupos/:grupoId/secciones/actual` | Panel operativo del día a día | `/api/session/...`, `/api/activity/actividades/:id/no-hizo`, `/api/activity/conductas/:id/registrar` | Acciones rápidas del Tutor: registrar "no hizo" de un usuario, registrar conducta, forzar cierre/evaluación/extender Sesión (botones con confirmación). |
| `/grupos/:grupoId/secciones/:seccionId/evaluacion` | **Panel de evaluación (vista admin, "domingo")** | `GET /api/scoring/grupos/:id/secciones/:seccionId/puntajes`, `GET /api/rewards/grupos/:id/secciones/:seccionId/canjes`, `POST /api/scoring/secciones/:seccionId/usuarios/:usuarioId/descalificar`, `PATCH /api/rewards/canjes/:id/entregar` | Ranking final con zona de cada usuario, botón descalificar (con motivo obligatorio), lista de canjes con botón "marcar entregada". Esta es la pantalla descrita en la arquitectura como "revisión de zonas, reparto de recompensas". |

## Área Usuario

| Ruta | Página | Llamadas principales | Notas |
|---|---|---|---|
| `/` | Home — actividades de la Sesión actual | `GET /api/session/grupos/:grupoId/secciones/actual`, `GET /api/activity/grupos/:grupoId/actividades` | Lista de actividades activas con estado (pendiente/completada/no-hizo), botón "completar" (o "iniciar cronómetro" → "completar" si `tipoLimiteTiempo=CRONOMETRO`), deadline visible con cuenta regresiva si `DEADLINE`. |
| `/mi-conducta` | Autoreporte de mala conducta | `GET /api/activity/grupos/:grupoId/conductas` (filtradas `tipo=MALA && permiteAutoreporte`), `POST /api/activity/conductas/:id/registrar` | Solo muestra conductas autoreportables; historial propio de conducta debajo. |
| `/mi-progreso` | Puntaje y zona actuales + historial | `GET /api/scoring/usuarios/:id/secciones/:seccionId/puntaje` (actual), lista de Secciones pasadas vía `GET /api/session/grupos/:grupoId/secciones?estado=CERRADA` + puntaje de cada una | Barra visual de progreso hacia la siguiente zona, con el color de `UmbralZona`. |
| `/mis-recompensas` | Elegir/sortear recompensa | `GET /api/rewards/usuarios/:id/secciones/:seccionId/elegibles`, `POST .../seleccionar`, `POST .../sortear` | Solo habilitado si la Sección está en `EVALUACION`/`CERRADA` y el usuario no está descalificado; mostrar estado del canje si ya existe. |

## Notificaciones in-app (compartido, ambos roles)

- Ícono de campana en el shell (topbar), badge con `GET /api/notification/no-leidas/count` (poll cada 30s — no hay push, ver `arquitectura-base.md` — WebSockets quedan fuera del MVP).
- Dropdown/panel con `GET /api/notification/mis-notificaciones`, click marca leída (`PATCH /api/notification/:id/leer`), botón "marcar todas como leídas".

## Componentes compartidos (`libs/shared-ui` + componentes locales de `app-web`)

- `ZonaBadgeComponent`: recibe un `UmbralZonaDto` y renderiza el badge de color/nombre — único componente que debe usarse en cualquier lugar que muestre una zona (evita reimplementar el estilo en cada página).
- `EstadoSeccionBadgeComponent`: badge visual para `ABIERTA`/`EVALUACION`/`CERRADA`.
- `ConfirmDialogComponent`: usado en toda acción destructiva o irreversible (descalificar, revocar invitación, archivar).

## Criterios de aceptación de esta fase

- [ ] Un Tutor puede completar el ciclo completo desde la UI, sin usar Postman: crear actividades/conductas/umbrales/recompensas → configurar Sesión/Sección → iniciar Sección (modo manual) → durante la semana registrar no-hizo/conducta → forzar evaluación → ver el panel de evaluación → descalificar a alguien de prueba → marcar una recompensa como entregada.
- [ ] Un Usuario puede completar actividades (las 3 variantes de límite de tiempo), autoreportar mala conducta, ver su progreso y elegir/sortear una recompensa una vez evaluada la Sección.
- [ ] Toda pantalla probada en un viewport de 375px de ancho sin scroll horizontal y sin elementos cortados.
- [ ] Las notificaciones se actualizan (polling) sin necesidad de recargar la página.

## Nota para Claude Code

No agregues WebSockets ni push notifications — quedó explícitamente descartado (`arquitectura-base.md`: "Notificaciones in-app (bell icon) — no push notifications"). El polling de 30s alcanza para el MVP.
