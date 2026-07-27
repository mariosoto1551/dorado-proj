# Registro de ejecución — Fase 14: Post-MVP / roadmap

> A diferencia de las fases 0–13, esta no tiene una única "finalización" — cada ítem de `docs/phases/fase-14-post-mvp.md` se ejecuta como su propia mini-fase, en el momento en que se decida abordarla. Agregar una entrada acá por cada ítem que se ejecute, no esperar a completarlos todos para actualizar este archivo.

## Ítem: White-label real
- **Estado**: PENDIENTE
- **Fecha**: — / **Commit**: — / **Resumen**: — / **Desviaciones**: —

## Ítem: Reportes/analíticas avanzadas
- **Estado**: PENDIENTE
- **Fecha**: — / **Commit**: — / **Resumen**: — / **Desviaciones**: —

## Ítem: Integración de pasarela de pagos real
- **Estado**: PENDIENTE
- **Fecha**: — / **Commit**: — / **Resumen**: — / **Desviaciones**: —

## Ítem: Cumplimiento de privacidad/consentimiento de menores
- **Estado**: PENDIENTE
- **Fecha**: — / **Commit**: — / **Resumen**: — / **Desviaciones**: —

## Ítem: Panel de `PLATFORM_ADMIN`
- **Estado**: COMPLETADA_CON_DESVIACIONES (backend + frontend hechos y verificados en build/lint/test; falta verificación contra DB/stack real — no había Postgres en la sesión)
- **Fecha**: 2026-07-22 / **Spec**: `docs/phases/fase-14-05-panel-platform-admin.md` / **Commit**: — (pendiente de que José pida commitear; se está sobre `main`, conviene branch)

### Alcance de este corte (decidido con José 2026-07-22)
Solo el ítem #5. Pospuestos explícitamente: white-label (#1), reportes (#2), pasarela de pagos (#3), privacidad (#4). Frontend en app nueva `apps/admin-web` (no sección de app-web), bootstrap por env vars, 4 operaciones (listar, cambiar plan, suspender/reactivar, detalle).

### Backend ejecutado (verificado: identity 34 tests / billing 9 / gateway 26, tsc+lint limpios)
- **shared-types**: `PrincipalType.PLATFORM_ADMIN`; nuevo `lib/platform-admin.ts` (DTOs del panel); `SuscripcionDto.fuente` corregido a `'AUTOMATICA' | 'MANUAL'` (era `'MANUAL' | 'FLAG'`, desajuste heredado de Fase 4).
- **identity**: modelo `PlatformAdmin` (tabla SIN organizacionId — excepción documentada a la regla 3) + migración a mano `20260722100000_platform_admin_fase14`; bootstrap por env (`PLATFORM_ADMIN_EMAIL/PASSWORD/NOMBRE?`); módulo `platform-admin` (guard `PlatformAdminGuard` que NO setea tenant → queries cross-tenant; `AdminAuthController` prefijo `auth/admin` login/refresh/logout; `AdminController` prefijo `admin` listar/detalle/plan/estado); enforcement de org `SUSPENDIDA` en `emitirSesionTutor/Usuario` (punto único de login/refresh/registro).
- **billing**: internos nuevos `GET .../suscripcion` y `POST .../plan` (upsert `Suscripcion` `fuente=MANUAL`, idempotente). `BillingClientService` de identity extendido (`obtenerSuscripcion`/`cambiarPlan` obligatorios → 503 `BILLING_NO_DISPONIBLE` si billing cae, sin fallback).
- **gateway**: prefijo `/api/admin` → identity; rutas públicas `POST /api/auth/admin/login` y `.../refresh`.

### Desviaciones / decisiones de implementación
- **Migración escrita a mano** (no había Postgres levantado, mismo criterio que ítem 8): replica lo que generaría el CLI. Falta aplicarla contra DB real (`prisma migrate deploy`/`dev`) antes de correr el servicio.
- **`historialAdministrativo` del detalle diferido** (devuelve `[]`): el timeline de audit es tenant-scoped y no hay interno cross-tenant. Es criterio de aceptación **opcional**; queda como deuda.
- **Enforcement de suspensión**: cambio de comportamiento respecto de Fase 2 (login/refresh ahora chequean estado de la org). Los access tokens ya emitidos siguen válidos hasta `exp` (≤2h): la suspensión corta re-login/refresh, no las sesiones en vuelo.
- **Filtro por plan en el listado**: se resuelve el plan de todas las orgs vía billing y se filtra/pagina en memoria (volumen piloto). A escala mayor, replicar plan en identity o filtrar en billing.

### Frontend ejecutado (`apps/admin-web`, verificado: build 78 kB inicial, lint limpio)
App Angular 22 nueva (zoneless, standalone, signal-first), aislada de app-web. Estética dashboard **dark tipo Linear/Vercel** — mockup mostrado y **aprobado por José** antes de scaffoldear (preferencia registrada de mostrar propuesta de UI). Puerto dev 4300, todo el tráfico por el Gateway.
- **Config**: `project.json` (manual, registrado en el grafo Nx), tsconfigs, `eslint.config.mjs` (prefix `admin`), `.postcssrc.json` (Tailwind 4), `environments/` (dev deriva del host, prod con fileReplacements), `vercel.json`.
- **Core**: `SesionAdminService` (access token en memoria/signal — nunca localStorage, regla 7; refresh silencioso contra `/api/auth/admin/refresh`), `adminInterceptor` (Bearer + retry 401), `adminGuard` (exige sesión + rol PLATFORM_ADMIN), `AdminApiService`, `jwt.util`/`errores` (mismo patrón que app-web).
- **Componentes**: toast service+host, `ConfirmDialogComponent` (dark), chips de plan/estado.
- **Páginas**: login, shell (topbar), organizaciones (KPIs + buscador + filtros + tabla; fetch completo del piloto y filtrado en cliente), organizacion-detalle (datos + grupos + suscripción + acciones cambiar-plan y suspender/reactivar con confirm + toast; banner de suspendida).
- Diseño del sistema visual en `styles.css` (design system dark propio, portado 1:1 del mockup aprobado). `historialAdministrativo` se muestra si viene (hoy `[]` desde backend).

### Desviaciones del frontend
- **Filtrado en cliente** en el listado (fetch `pageSize=100`): snappy para el volumen piloto; los params server-side `q/plan/estado` existen y quedan para escalar.
- **Sin tests unitarios de componentes admin-web** todavía (build + lint cubren typecheck de plantillas). Deuda: agregar specs de `SesionAdminService`/`adminGuard` y de las páginas.
- **`project.json` escrito a mano** (no generador `@nx/angular`): registrado igual en el grafo (`nx show projects` lo lista), mismo criterio que `public-site`.

### Verificación contra DB/stack real (2026-07-24) — panel de plataforma OPERATIVO
Encendido y verificado end-to-end contra la infra local (Postgres/RabbitMQ en docker, servicios vía nx serve):
1. **Migración aplicada** (`20260722100000_platform_admin_fase14` presente en `_prisma_migrations`, tabla `PlatformAdmin` existe) y **bootstrap OK**: cuenta `jose@plataforma.dorado` ("José (plataforma)") creada desde env (`apps/identity-service/.env`, password `dorado-admin-2026`).
2. **Flujo E2E real (curl vía Gateway :3000)**: login admin ✅ (JWT `rol=PLATFORM_ADMIN`); `GET /api/admin/organizaciones` ✅ (1 org: "Familia Rodriguez"); `POST /api/admin/organizaciones/:id/plan` `{plan:"PRO"}` ✅ → suscripción quedó **PRO / fuente MANUAL / ACTIVA** en `billing_db`. admin-web (4300) responde 200 y el preflight CORS desde origin `http://localhost:4300` devuelve `Access-Control-Allow-Origin` correcto.
3. **Nota de campo del body**: el endpoint espera `{ "plan": "FREE"|"PRO" }` (no `codigo`); el frontend `admin-api.service.cambiarPlan` ya manda `plan`.
4. El límite de grupos se evalúa **en vivo** contra billing (`GruposService.asegurarLimiteGrupos` → `resolveEntitlements`), no desde el JWT: tras pasar a PRO, la org puede crear grupos sin que el tutor tenga que re-loguearse.

### Qué falta / verificar (deuda restante del ítem #5)
1. `suspender/reactivar` no se re-verificó en esta sesión (solo cambio de plan); el flujo de suspensión sigue como en la implementación original.
2. Agregar `PLATFORM_ADMIN_*` a `.env.production.example` y READMEs de despliegue; sumar `admin-web` como target Vercel en el runbook (fase-13).
3. (Hecho) Fila puerto 4300 agregada a la tabla de `CLAUDE.md` (proyecto + global).

## Ítem: Diferenciación de roles ORG_ADMIN/TUTOR + grupos múltiples + puntos iniciales visibles
- **Estado**: EN_PROGRESO (frontend hecho, build+lint de app-web limpios; falta verificación E2E en navegador y el cambio de plan del piloto a PRO)
- **Fecha**: 2026-07-24 / **Commit**: — (branch `fase-14-roles-grupos-multiples`)

### Origen (pedido de José 2026-07-23)
Tres mejoras sobre el MVP: (1) poder crear más de un grupo; (2) diferenciar la pantalla/experiencia de ORG_ADMIN vs TUTOR; (3) que los puntos iniciales se guarden por grupo y se vean configurados. Decisiones tomadas con él: piloto a **PRO** (grupos ilimitados, no subir el tope de FREE); diferenciar en las **tres** dimensiones (visual, secciones exclusivas, inicio distinto); **facturación fuera** del panel del admin por ahora.

### Diagnóstico previo (lo que ya existía)
- **Límite de grupos**: no es bug — plan FREE `limiteGrupos: 1` (`billing-service/src/prisma/seed-planes.ts`), enforcement en `identity GruposService.asegurarLimiteGrupos`. PRO ya es `null` (ilimitado). El cambio de plan ya es operable vía el panel PLATFORM_ADMIN (`billing SuscripcionesService.cambiarPlan`), pero ese panel aún no se verificó contra DB real (ver ítem #5).
- **Puntos iniciales**: **ya estaban por grupo** (`scoring ConfiguracionScoringGrupo.puntosIniciales`, GET/PUT `/scoring/grupos/:grupoId/configuracion`) y editables en la pantalla Zonas (`umbrales.page.ts`). El pedido (3) era sobre todo de visibilidad.
- **Roles en la UI**: ORG_ADMIN y TUTOR compartían exactamente la misma área. El menú ya ocultaba "Tutores" a no-admin (`shell.component.html`, flag `soloAdmin` + `auth.esOrgAdmin()`), pero no había nada visual ni de inicio que los distinguiera.

### Frontend ejecutado (`apps/app-web`)
- **Inicio distinto por rol**: nuevo guard `solo-org-admin.guard.ts`; nueva página `paginas/admin/panel-organizacion.page.ts` (grid de todos los grupos de la org + "Nuevo grupo", sin facturación); ruta `/organizacion` gateada; `inicio-usuario.guard.ts` ahora manda ORG_ADMIN → `/organizacion` (o `/onboarding` con 0 grupos) y deja al TUTOR con el flujo previo (grupo directo / selector).
- **Grupos múltiples (UI)**: botón "+ Nuevo grupo" en `selector-grupo.page.ts` y en el panel de organización (link a `/onboarding`); copy del onboarding vuelto genérico ("Nuevo grupo" en vez de "tu primer Grupo"). Backend sin cambios (el tope lo maneja billing; PRO = ilimitado).
- **Diferenciación visual**: badge "Administrador" (ámbar) / "Tutor" (teal) en la topbar (`shell.component.html`), y link "Organización" en el sidebar del grupo solo para ORG_ADMIN (vuelta al panel).
- **Puntos iniciales visibles**: chip "Puntos iniciales: N" en el resumen del grupo (`resumen-grupo.page.ts`, link a Zonas), leído de `scoring.obtenerConfiguracion`.

### Qué falta / verificar
1. ~~**Pasar el piloto a PRO**~~ **HECHO (2026-07-24)**: se pasó "Familia Rodriguez" a PRO vía el panel de plataforma (ver ítem #5, verificación). Ya no está topado en 1 grupo.
2. E2E en navegador: login ORG_ADMIN → `/organizacion` → crear 2º grupo → badge de rol → puntos iniciales en resumen. Login TUTOR → verificar que NO ve el panel ni el badge de admin.
3. Sin tests unitarios nuevos de los componentes/guard (build+lint cubren typecheck de plantillas) — deuda.

## Ítem: Usuario/tutor multi-grupo con la misma cuenta (revisión de ADR-00 §1)
- **Estado**: COMPLETADA_CON_DESVIACIONES (backend + frontend hechos; E2E real 9/10 verde + el 10º bloqueado de forma más estricta, ver abajo)
- **Fecha**: 2026-07-24 / **Commit**: — (branch `fase-14-roles-grupos-multiples`) / **Revisión de arquitectura**: addendum en `docs/architecture/ADR-00-decisiones-fundacionales.md` §1

### Origen (pedido de José 2026-07-23)
"Cada que me invitan como usuario o participante me piden datos nuevos; debería poder unirme a otro grupo con la MISMA cuenta." Decidido con él: aplicar a **participantes Y tutores**; reutilización **solo dentro de la misma organización** (cross-org rompería el aislamiento tenant); se mantiene `Usuario.grupoId` como grupo de origen. Revisa deliberadamente ADR-00 §1 (documentado como addendum, no editado en silencio).

### Backend (identity) — verificado E2E real contra el stack
- **Schema + migración** `20260724023842_usuario_multigrupo`: tabla `UsuarioGrupo` (espejo de `TutorGrupo`, `@@unique([usuarioId, grupoId])`) + **backfill** de la membresía de todo usuario existente desde su `grupoId` (aplicada con `prisma migrate deploy`; 1 usuario → 1 membresía, verificado).
- **JWT del usuario** (`AuthService.emitirSesionUsuario`): `grupoIds` sale de `UsuarioGrupo` (N grupos), con fallback al grupo de origen.
- **Canje**: un usuario NUEVO también crea su fila en `UsuarioGrupo`. Nuevo endpoint **autenticado** `POST /identity/invitaciones/:codigo/aceptar` (controller `InvitacionesAceptarController`, solo `TenantContextGuard`): vincula la cuenta logueada (tutor→`TutorGrupo`, usuario→`UsuarioGrupo`), marca la invitación canjeada, publica `InvitacionCanjeada` (+ `UsuarioUnido` para usuarios) y devuelve sesión nueva con el grupo sumado.
- **Listados por UsuarioGrupo**: interno `GET /internal/identity/grupos/:grupoId/usuarios` y admin `listarPorGrupo` (para que el grupo recién sumado "vea" al participante); `usuarioADto(u, grupoIdContexto)` refleja el grupo del listado. `asegurarPuedeGestionar` del tutor vale si comparte ALGÚN grupo con el usuario.
- **`GET /identity/mis-grupos`** (`MisGruposController`, cualquier principal autenticado): grupos del participante para el selector.

### Frontend (app-web)
- `AuthService`: `gruposUsuario` (todos), `grupoUsuario` ahora es el **grupo ACTIVO** (elegido o el primero) + `seleccionarGrupoUsuario`. Con 1 grupo se comporta igual que antes.
- **Selector de grupo del participante** (`SelectorGrupoUsuarioComponent`): chip en la topbar (diseño elegido por José entre 2 mockups); abre una hoja para cambiar; solo aparece con 2+ grupos. Las 4 pantallas del usuario reaccionan al grupo activo vía `effect` (se recargan al cambiar).
- **Página de invitación**: botón "Unirme con mi cuenta" cuando hay sesión y el tipo coincide (`aceptarInvitacion`); si no, el form de cuenta nueva de siempre.

### Verificación E2E real (scripts en scratchpad, contra el stack local)
`nx build/lint` de app-web + `nx test identity-service` (34/34) OK. Dos scripts de flujo por API vía Gateway:
- **Participante (10/10 verde)**: registrar org → PRO → 2 grupos → canje usuario en A (cuenta nueva, 1 grupo) → **aceptar B con la misma cuenta** (mismo `sub`, JWT con 2 grupos) → `mis-grupos`=2 → grupo B lista al participante → re-aceptar invitación usada = 410.
- **Tutor + bordes (3/4, el 4º más estricto)**: tutor reusa cuenta en 2 grupos ✅; tutor no puede aceptar invitación de usuario = 400 `TIPO_INVITACION_NO_COINCIDE` ✅; **cross-org**: da 404 `INVITACION_NO_ENCONTRADA` (el filtro tenant-scoped sobre `Invitacion` oculta la invitación de otra org **antes** del chequeo explícito de org) en vez del 409 esperado — el rechazo es correcto e incluso más estricto (el usuario ni ve que existe). El chequeo `INVITACION_OTRA_ORG` queda como defensa en profundidad.

### Deuda / a verificar
- **Reinicio de identity en la sesión**: el `nx serve identity-service` original se cayó; se relevantó para el E2E. Sin impacto en código.
- **Sin tests unitarios nuevos** del endpoint `aceptar` ni del selector (cubiertos por E2E real + build/lint). Deuda: specs de `aceptarComoTutor/Usuario` y del componente.
- **UX cross-org**: un usuario logueado en org A que abra un invite de org B verá "invitación no encontrada" (no "es de otra organización"). Irrelevante para el piloto (una sola organización); si algún día importa, saltar el filtro tenant en `obtenerCanjeable` del path `aceptar` para dar el 409 con mensaje claro.
- **E2E en navegador** del selector de grupo y del botón "unirme con mi cuenta": pendiente (verificado por API, no por click).

## Ítem: Reevaluación de infraestructura (Kubernetes u otra)
- **Estado**: PENDIENTE
- **Fecha**: — / **Commit**: — / **Resumen**: — / **Desviaciones**: —

## Ítem: Propuesta de actividad por Usuario (condicional a confirmación de José)
- **Estado**: **CERRADO POR ABSORCIÓN** en el ítem 10 (2026-07-26). José confirmó que sí quería el flujo, y lo pidió con los 3 modos configurables por Grupo — que es exactamente el modo `BAJO_APROBACION` del ítem 10 más sus dos hermanos. El modelo `PropuestaActividad` que este ítem describía se implementó allá (`docs/phases/fase-14-10-contenido-por-integrantes.md`), con los eventos `ActividadPropuestaCreada`/`ActividadPropuestaResuelta` en vez del `PropuestaActividadCreada` que se había bocetado acá.
- **Fecha**: 2026-07-26 / **No hay trabajo pendiente propio**: ver el ítem 10.

## Ítem: Equipos de trabajo (jefe de equipo + tareas colectivas)
- **Estado**: EN_PROGRESO — **backend + frontend completos** (todo compila, tests existentes verdes, lint limpio, migraciones aplicadas contra DB real; mockups de UI aprobados por José antes de construir). **Falta**: tests unitarios nuevos + E2E real (por API y en navegador).
- **Fecha**: 2026-07-25 / **Spec**: `docs/phases/fase-14-09-equipos-de-trabajo.md` (aprobada por José 2026-07-24) / **Commit**: backend `ea44851`; frontend — (branch `fase-14-roles-grupos-multiples`)
- **Nota de la aprobación (2026-07-24)**: José confirmó los defaults (incl. decisión 10: reparto = valor completo a cada miembro, no dividir) y precisó que el reporte del jefe es sobre una **conducta MALA concreta del catálogo** (no un reporte libre) — reflejado en la spec (`conductaId` requerido en `ReporteMiembro`, aprobar sin body).

### Backend ejecutado (compila + tests existentes verdes: identity 34 / activity 87 / scoring 45; lint limpio)
- **Contratos** (`shared-types` + `shared-events`): enums `RolEquipoMiembro`, `AlcanceActividad`, `EstadoReporte`; DTOs `EquipoDto`/`EquipoMiembroDto`/`MiEquipoDto`/`EquipoInternoDto`, requests de equipo, `ReporteMiembroDto`/`CrearReporteMiembroRequest`, `CompletarTareaEquipoResponse`/`AsignacionPuntosEquipoDto`, `PuntajeEquipoDto`; `ActividadDto` sumó `alcance`+`bonoJefePuntos`. Eventos nuevos `TareaEquipoCompletada` (`activity.tarea_equipo_completada`) y `ReporteMiembroCreado` (`activity.reporte_miembro_creado`) en routing-keys/payloads + `event-catalog.md`.
- **identity**: modelos `Equipo` + `EquipoMiembro` (`@@unique([grupoId, usuarioId])` = un equipo por grupo; un solo JEFE por lógica de service) + migración `20260725002652_equipos_fase14`. Módulo `equipos` (service, `EquiposController` TUTOR/ORG_ADMIN: crear/listar/detalle/editar/miembros/sustituir jefe; `MisEquiposController` USUARIO: `GET /identity/mis-equipos`) + interno `GET /internal/identity/equipos/:equipoId`. Excepciones tipadas (`USUARIO_YA_EN_EQUIPO`, `NO_SE_PUEDE_QUITAR_JEFE`, etc.).
- **activity**: `Actividad.alcance`+`bonoJefePuntos` (validación EQUIPO⇒OPCIONAL, bono solo con EQUIPO); modelos `RegistroTareaEquipo` (snapshot inmutable + `miembrosSnapshot` Json) y `ReporteMiembro` (workflow) + enum `EstadoReporte` + migración `20260725003333_equipos_fase14`. Módulo `equipos`: `TareasEquipoService.completar` (jefe/tutor; reparto base + bono al jefe; publica `TareaEquipoCompletada`), `ReportesService` (crear/listar/aprobar/rechazar; aprobar registra `RegistroConducta` MALA por el Tutor → `ConductaRegistrada`; publica `ReporteMiembroCreado`). El completar individual rechaza tareas de equipo (`ES_TAREA_DE_EQUIPO`). Cliente identity `obtenerEquipo`.
- **scoring**: `EventoPuntos.equipoId?` + índice + migración `20260725004309_equipo_id_evento_puntos_fase14`. Consumidor `TareaEquipoCompletada` (`scoring.q.registros-actividad`): un `EventoPuntos` por asignación etiquetado con `equipoId`, idempotente. Endpoint `GET /scoring/equipos/:equipoId/puntaje?seccionId=` (suma derivada, sin campo mutable).
- **notification**: consumidor de `ReporteMiembroCreado` → notifica a los tutores del grupo. `TareaEquipoCompletada` a usuarios quedó fuera (era opcional/EXTENSIÓN).
- **gateway**: sin cambios (ruteo por prefijo `/api/identity|activity|scoring`).

### Frontend ejecutado (`apps/app-web`, build + lint limpios; mockups aprobados por José)
- **API**: `IdentityApiService` (equipos: listar/crear/detalle/editar/miembros/sustituir jefe + `misEquipos`), `ActivityApiService` (completar tarea de equipo, crear/listar/aprobar/rechazar reportes), `ScoringApiService` (`puntajeDeEquipo`). `api.types.CrearActividadRequest` sumó `alcance`+`bonoJefePuntos`.
- **Tutor**: `equipos.page.ts` (lista con jefe/integrantes/puntaje; crear con jefe+miembros; sustituir jefe; gestionar integrantes; archivar) y `reportes.page.ts` (bandeja pendientes/resueltos, aprobar/rechazar). Form de `actividades.page.ts`: selector Alcance Individual/Equipo + "puntos por integrante"/"bono al jefe" + chip "Equipo" en la lista.
- **Participante**: `mi-equipo.page.ts` (puntaje del equipo, tareas de equipo con "Marcar como hecha" para el jefe, integrantes con "Reportar" para el jefe; modal de reporte con conducta MALA + nota). Reacciona al grupo activo (multi-grupo).
- **Navegación**: shell — "Equipos" y "Reportes" en el menú del tutor (grupo "Gente"); "Equipo" en el bottom-nav del participante (5 ítems). Rutas `grupos/:grupoId/equipos`, `.../reportes`, y `/mi-equipo`.

### Verificación E2E real (2026-07-25) — 23/23 verde contra el stack local
Script `e2e-equipos.mjs` (scratchpad, Node fetch vía Gateway :3000). Levantados identity/activity/scoring/notification (los otros ya estaban). Cubre el ciclo completo:
- Setup: registrar org → grupo → config sesión MANUAL → iniciar Sección+Sesión → 3 usuarios por canje → conducta MALA (−5) → actividad de EQUIPO (10 c/u, bono jefe 3).
- Equipos: crear con jefe+2 integrantes; **un-equipo-por-grupo** rechazado (409 `USUARIO_YA_EN_EQUIPO`).
- Reparto: no-jefe no completa (403 `SOLO_JEFE_COMPLETA_TAREA_EQUIPO`); el jefe completa → asignaciones jefe **13** (10+3), integrantes **10**; **puntaje de equipo derivado = 33** (scoring consumió `TareaEquipoCompletada`).
- Reporte: jefe reporta a Alejandra (conducta MALA concreta); auto-reporte rechazado (400 `REPORTADO_NO_ES_MIEMBRO`); bandeja del tutor = 1 pendiente; **aprobar** → re-aprobar da 409 `REPORTE_YA_RESUELTO`; **Alejandra 10−5=5, Diego (no reportado) sigue 10** (descuento solo al reportado, vía `ConductaRegistrada`).
- Sustituir jefe: Diego pasa a JEFE, Luciana a MIEMBRO.

### Qué falta / verificar
1. **Tests unitarios nuevos** de los services (Vitest) — deuda; el E2E real cubre el comportamiento pero conviene fijar casos unitarios.
2. **E2E en navegador** de las pantallas nuevas (el flujo por API está verde; falta verificación por click).
3. **Deuda UI menor**: `mi-equipo` no marca "tarea de equipo ya hecha hoy" (el backend igual corta por `repeticionesMaximasSesion`); el puntaje de equipo se muestra total (no por sección) — decisión de arranque.

## Ítem 10: Contenido creado por los integrantes (3 modos, gated por config del Grupo)
- **Estado**: EN_PROGRESO — **backend + frontend completos y verificados en tests/build/lint**. **Falta**: aplicar la migración contra la DB real y el E2E (por API y en navegador) — en esta sesión no había infra levantada (Docker Desktop apagado, 5432 y 5672 cerrados).
- **Fecha**: 2026-07-26 / **Spec**: `docs/phases/fase-14-10-contenido-por-integrantes.md` (escrita en esta sesión con las decisiones de José) / **Commit**: — (branch `fase-14-roles-grupos-multiples`)
- **Origen**: pedido de José (2026-07-26): *"debe hacer 3 opciones: que sea libre que todos los usuarios puedan crear sus propias actividades, bajo aprobación, y restrictivo"*. Absorbe el ítem 7 del índice de fase 14 (ver arriba).

### Decisiones tomadas con José en esta sesión (las 3 que faltaban para poder especificar)
1. **Qué puede crear el integrante**: **solo actividades OPCIONAL**. Las conductas (BUENA y MALA) siguen siendo exclusivas del Tutor — el ítem 9 ya cubre el caso negativo legítimo (el jefe reporta una MALA del catálogo y el Tutor aprueba). Ampliar a BUENA queda como decisión futura de un campo.
2. **Alcance del contenido creado**: **personal de su autor**. Solo él la ve y la completa; el Tutor la ve para moderar. Un integrante no altera la experiencia de sus hermanos.
3. **Topes por Grupo**: `maxPuntosActividadUsuario` (default **5**) y `maxActividadesActivasPorUsuario` (default **5**, cuenta ACTIVA + propuestas PENDIENTE). Sin esto, el modo LIBRE es un agujero de puntaje (crear *"Respirar = 100 pts"* y autocompletarla).

### Decisiones de implementación que resolvió la spec (huecos que el índice dejaba abiertos)
- **La config vive en `activity-service`** (`ConfiguracionContenidoGrupo`), no en identity: es una regla del catálogo y el catálogo es de activity — sin cruce REST en el camino caliente de cada creación (regla 2).
- **Modelo separado `PropuestaActividad`; `EstadoCatalogo` NO se tocó.** Una propuesta pendiente no es una `Actividad` en un estado raro: es otra tabla. Motivo: `estado: 'ACTIVA' | 'ARCHIVADA'` está asumido en todo el sistema (`mi-estado-hoy`, castigo al cierre, tareas de equipo, límite del plan, `ActividadDto`, y el enum compartido con rewards) — agregarle valores obligaba a auditar cada consulta, y así es **imposible** que una propuesta sin aprobar valga puntos.
- **En modo LIBRE también se escribe la propuesta**, `APROBADA` con `resueltoPorTipo = 'SYSTEM'`: un solo lugar donde el Tutor ve qué propuso cada integrante, y queda el rastro de que se creó sin revisión.
- **Campos fijos del contenido de integrante**: OPCIONAL / SIN_LIMITE / INDIVIDUAL / ASUME_HECHA / bono 0. No viajan en el request → un integrante no puede crear obligatorias ni tareas de equipo ni intentándolo.
- **Cuenta para el límite del plan** (`limites.actividadesPorGrupo`): el modo LIBRE no es un bypass de FREE. En `BAJO_APROBACION` el tope del plan **no** corta al proponer, se revalida al aprobar.
- **Cambiar el modo no toca lo ya creado** (mismo principio que la regla 6): pasar a RESTRICTIVO solo impide crear nuevas; las activas siguen activas y las pendientes siguen resolubles.
- **El autor archiva la suya pero no la edita**: evita "la creo de 1 punto, la aprueban, la subo a 50".

### Backend ejecutado (activity + notification; 107/107 y 22/22 verde, tsc de los 13 proyectos y lint limpios)
- **Contratos**: `shared-types` sumó `ModoCreacionContenidoUsuario`, `OrigenActividad`, `EstadoPropuesta`, `ConfiguracionContenidoGrupoDto`, `PropuestaActividadDto`, `CrearMiActividadRequest/Response`, `MisActividadesDto`, `ActualizarConfiguracionContenidoRequest`, `RechazarPropuestaRequest`; `ActividadDto` sumó `origen` + `creadaPorUsuarioId`. `shared-events`: routing keys `activity.actividad_propuesta_creada` / `activity.actividad_propuesta_resuelta` + payloads, y ambos eventos en `event-catalog.md`.
- **Schema + migración** `20260726120000_contenido_por_integrantes_fase14` (escrita a mano — sin Postgres levantado, mismo criterio que ítems 5 y 8): enums `OrigenActividad`/`ModoCreacionContenidoUsuario`/`EstadoPropuesta`, `Actividad.origen @default(TUTOR)` + `creadaPorUsuarioId` + índice `[grupoId, creadaPorUsuarioId]`, **`creadaPorTutorId` pasó a nullable** (en modo LIBRE no hay tutor detrás; no viaja en el DTO, así que ningún consumidor se rompe), y las tablas `ConfiguracionContenidoGrupo` (fila perezosa, `grupoId` único) y `PropuestaActividad`.
- **Módulo `contenido-usuario`**: `ConfiguracionContenidoService` (GET con defaults en memoria si no hay fila + PUT upsert con auditoría `CONFIG_CONTENIDO_ACTUALIZADA`), `MisActividadesService` (crear con las 5 validaciones en orden, listar todo-en-una-llamada, archivar la propia), `PropuestasService` (bandeja, aprobar → crea la Actividad en transacción, rechazar con motivo), `ContenidoUsuarioController` (8 rutas), DTOs con class-validator y techos duros de cordura para los topes (100 pts / 50 actividades).
- **Excepciones tipadas nuevas**: `CREACION_POR_USUARIO_DESHABILITADA` (403), `PUNTOS_SOBRE_TOPE_DEL_GRUPO` (400, con el tope en el body), `LIMITE_ACTIVIDADES_PROPIAS_ALCANZADO` (409), `PROPUESTA_NO_ENCONTRADA` (404), `PROPUESTA_YA_RESUELTA` (409), `AUTOR_YA_NO_ESTA_EN_EL_GRUPO` (409), `ACTIVIDAD_PERSONAL_DE_OTRO_USUARIO` (403).
- **Parte C (visibilidad personal — el riesgo real del ítem)**: regla única en `comun/visibilidad-actividad.ts` (`filtroVisibilidadUsuario` para queries + `esVisiblePara` en memoria), aplicada en **6** lugares: `ActividadesService.listar`, `ActividadesService.buscarAccesible`, `RegistroService.miEstadoHoy`, `completar`, `iniciarCronometro` y `listarCompletadasOpcionales` (+ `registrarNoHizo` como defensa en profundidad). `CierreService` y `TareasEquipoService` no necesitaron cambio y quedó documentado por qué (filtran OBLIGATORIA y EQUIPO respectivamente; el contenido de integrante es siempre OPCIONAL/INDIVIDUAL).
- **`asegurarLimiteActividades` extraído** a `comun/limite-plan-actividades.ts` (función libre, no provider) para compartirlo sin cambiar constructores ni duplicar la regla; `ActividadesService` delega.
- **notification**: los dos eventos nuevos en el `@RabbitSubscribe` y dos plantillas — `ActividadPropuestaCreada` avisa a los tutores (texto distinto según `requiereAprobacion`), `ActividadPropuestaResuelta` avisa al autor (aprobada/rechazada + motivo) y **no notifica** cuando `resueltoPorTipo = 'SYSTEM'` (el autor acaba de crearla).
- **gateway**: sin cambios (todo cae bajo el prefijo `/api/activity`).

### Tests nuevos (20 en activity, 3 en notification)
- `mis-actividades.service.spec.ts`: RESTRICTIVO da 403 sin escribir nada; LIBRE crea Actividad ACTIVA con los campos fijos + propuesta APROBADA/SYSTEM; BAJO_APROBACION no crea Actividad; tope de puntos; cupo (activas + pendientes); el plan corta en LIBRE y **no** al proponer.
- `propuestas.service.spec.ts`: aprobar crea la actividad del **autor** (con el tutor como `creadaPorTutorId`); doble aprobación 409 sin segunda actividad; 404; tope bajado después de proponer; autor fuera del grupo.
- `registro.service.spec.ts` (Parte C): `mi-estado-hoy` muestra las del tutor + las propias y **no** las del hermano; completar la ajena da 404; el autor sí completa la suya y publica `ActividadCompletada`; un tutor apuntando a otro usuario recibe 403 con code; cronómetro ajeno 404; `completadas-opcionales` no ofrece las de otro integrante.
- `plantillas.service.spec.ts`: los tres textos (revisión / informativo / resolución) y el silencio de la auto-aprobación.
- **Helper de tests extendido**: `bd-registro-en-memoria` soporta `OR` y `{ in: [...] }` en el `where` (lo exige el filtro nuevo) y `actividadDePrueba` trae `origen: 'TUTOR'`; se agregó `actividadPersonalDePrueba`.

### Frontend ejecutado (`apps/app-web`, build + lint limpios; mockups aprobados por José antes de escribir)
- **API**: `ActivityApiService` sumó 8 métodos (config get/put, propuestas listar/aprobar/rechazar, mis-actividades listar/crear/archivar).
- **Tutor** (dentro de la pantalla **Actividades**, opción elegida por José): card colapsable "Contenido de los integrantes" con los 3 modos como opciones excluyentes + los dos topes + aviso de que cambiar el modo no toca lo ya creado; **pestañas** "Del grupo (N) / Propuestas (N pendientes en badge ámbar)"; cada propuesta muestra autor (nombre resuelto por `identity.listarUsuarios`), puntos y repeticiones, con Aprobar y Rechazar **con textarea de motivo inline** (no `prompt()`); chip violeta **"de \<integrante\>"** en las actividades `origen = USUARIO` del listado.
- **Integrante**: la home partió la lista en dos bloques — "Actividades de hoy" y **"Mis metas"** con el botón "Crear la mía" (el bloque aparece si tiene alguna o si el grupo lo habilitó, para que descubra la función); pantalla nueva **`/mis-actividades`** con el aviso del modo vigente, cupo y tope a la vista, form de creación (nombre, detalle, puntos con `max` del grupo, veces por día), lista de activas con archivar, y lista de propuestas pendientes/rechazadas con el motivo. Reacciona al grupo activo (multi-grupo).

### Qué falta / verificar la próxima sesión (en este orden) — ver también el ítem 11, que agrega una migración más
1. **Aplicar la migración contra la DB real** (`docker compose up` + `prisma migrate deploy` de activity) y confirmar que el servicio arranca. La migración está escrita a mano: revisar que `ALTER COLUMN "creadaPorTutorId" DROP NOT NULL` corra sin problema sobre la tabla con datos.
2. **E2E por API vía Gateway** (:3000), cubriendo los criterios de la spec: (a) grupo sin config → crear como USUARIO da 403 `CREACION_POR_USUARIO_DESHABILITADA`; (b) `PUT` modo `LIBRE` → el integrante crea de 3 pts → aparece en su `mi-estado-hoy` → la completa → **scoring le suma 3**; (c) modo `BAJO_APROBACION` → propone → **no** aparece en `mi-estado-hoy` ni en el listado → el tutor aprueba → recién ahí la completa; re-aprobar da 409; (d) rechazo con motivo → nada cambia de puntaje; (e) tope de puntos 400 y cupo 409; (f) **privacidad**: el usuario B no ve ni puede completar la actividad personal de A (404), el tutor sí la ve en el listado del grupo.
3. **E2E en navegador** de las dos pantallas (card de modos + pestaña de propuestas del tutor; "Mis metas" y `/mis-actividades` del integrante).
4. **Colas**: confirmar en el Management UI que `notification.q.eventos-dominio` quedó bindeada a las dos routing keys nuevas (el binding se declara al arrancar notification).
5. Deuda menor: no hay tests unitarios de `ConfiguracionContenidoService` (cubierto indirectamente por los otros specs) ni de los componentes nuevos de app-web (build + lint cubren el typecheck de plantillas).

### Origen (idea de José 2026-07-24)
Dentro de un Grupo, agrupar participantes en **equipos** con un **jefe de equipo** que impulsa al resto a cumplir **tareas colectivas** y ganar puntos en conjunto. Reglas de gobernanza pedidas: si el equipo no cumple, se **sustituye al jefe** (el reemplazo queda sujeto a evaluación, mismo ciclo); si un integrante no coopera / no le hace caso al jefe, éste lo **reporta** para que se le bajen puntos **solo a ese integrante**, sin eximir al equipo de cumplir la tarea.

### Decisiones tomadas con José (fijadas, no reabrir sin motivo)
1. **Puntos del equipo = ledger del equipo + reparto**: cada tarea de equipo genera eventos que al liquidar se reparten a cada miembro como `EventoPuntos` propio (filas nuevas, nunca update — reglas 1 y 6), etiquetados con `equipoId`. El "puntaje del equipo" es una **vista derivada** (suma por `equipoId`), cero campos mutables; los puntajes/zonas individuales siguen coherentes.
2. **Reporte del jefe = reporta → Tutor aprueba**: el jefe crea un `ReporteMiembro` `PENDIENTE`; el descuento se aplica **solo si el Tutor lo aprueba**, y se registra como conducta negativa **generada por el Tutor** (mecanismo actual — ningún participante genera eventos de puntos directo). Respeta el modelo de permisos y evita abuso/revancha.
3. **El jefe NO es un rol de plataforma**: sigue siendo un Usuario/participante; "jefe" es un atributo del `EquipoMiembro` (`rol = JEFE | MIEMBRO`), no un `PrincipalType` ni permisos de Tutor. No toca auth/JWT.

### Defaults acordados para las decisiones secundarias
- **Sustitución del jefe**: **manual por el Tutor** al cerrar un período incumplido (piloto). Automática = futuro (requiere definir con precisión "período de evaluación" y "meta cumplida").
- **Membresía**: un usuario en **un solo equipo por grupo** al arranque (multi-equipo se abre después, como se hizo con multi-grupo).
- **Reparto**: **igual entre miembros + bono configurable al jefe** (default 0).
- **"Cumplió el equipo"**: atado a la Sección/cierre, reusando el ciclo de `session-service`.

### Boceto de arquitectura (transversal — 4 servicios)
- **identity-service**: `Equipo` (`organizacionId` + `grupoId`), `EquipoMiembro` (`rol`); endpoints crear/gestionar miembros, designar/sustituir jefe.
- **activity-service**: Actividad con destinatario = equipo; al completarse publica evento de dominio nuevo (ej. `TareaEquipoCompletada`) con `equipoId` + meta.
- **scoring-service**: consume el evento → genera un `EventoPuntos` por miembro (reparto + bono de jefe), etiquetados con `equipoId`; expone la vista derivada del puntaje de equipo.
- **notification-service**: avisa al Tutor cuando hay un `ReporteMiembro` para revisar.

### Pendiente antes de ejecutar
- Redactar `docs/phases/fase-14-XX-equipos-de-trabajo.md` (schema Prisma de cada servicio, endpoints, catálogo de eventos nuevos, criterios de aceptación) — **no editar** una vez escrita (protocolo de specs).
- Definir la routing key y el payload del evento `TareaEquipoCompletada` en `docs/architecture/event-catalog.md`.

## Ítem 8: Confirmación de obligatorias por el usuario + estado de hoy (barrita de repeticiones)
- **Estado**: COMPLETADA_CON_DESVIACIONES
- **Fecha**: 2026-07-21 / **Spec**: `docs/phases/fase-14-08-confirmacion-obligatorias.md`

### Resumen de lo ejecutado
Modelo opt-in "B2": una actividad `OBLIGATORIA` puede configurarse `REQUIERE_CONFIRMACION`; el Usuario la confirma (0 pts, sin evento) y, si no lo hace, al cerrar la Sesión se le genera un `NO_HIZO` automático que scoring resta. Configurable por actividad. Además se cerró la deuda técnica de Fase 10 (el `Set` optimista de la home) exponiendo el estado real del servidor y la barrita "X de N" de repeticiones.

- **shared-types**: enum `ComportamientoAlCierre`, campo en `ActividadDto`, nuevos `MiEstadoActividadHoyDto`/`MiEstadoHoyDto`.
- **shared-events**: `NoHizoRegistradoPayload.registradoPorTipo` ampliado a `'TUTOR' | 'SYSTEM'`.
- **activity-service (Parte A)**: enum + campo `comportamientoAlCierre @default(ASUME_HECHA)` en `Actividad` (migración retro-compatible), modelo `EventoProcesado` (activity pasa de productor puro a también consumidor). Migración `20260721120000_confirmacion_obligatorias_fase14` escrita a mano (no había DB levantada en esta sesión) + `prisma generate`.
- **activity-service (Parte B)**: `completar` con rama de confirmación (0 pts, sin evento; OBLIGATORIA `ASUME_HECHA` sigue 400); nuevo `GET /activity/grupos/:grupoId/mi-estado-hoy`; validación del campo en crear/editar (OPCIONAL fuerza `ASUME_HECHA`, 400 si el cliente pide `REQUIERE_CONFIRMACION` para opcional).
- **activity-service (Parte C)**: consumidor `CierreConsumer` (cola cuórum `activity.q.sesiones`, routing key `session.sesion_cerrada`) + `CierreService` con la lógica idempotente del castigo (salta confirmadas y no-hizo manuales, snapshot al cierre, `registradoPorId/Tipo = SYSTEM`). `usuariosDelGrupo` agregado al identity-client.
- **Frontend (Parte D)**: home del usuario reescrita contra `mi-estado-hoy` (adiós `Set` optimista); barrita de **segmentos + contador** (diseño elegido por José); botón "Ya lo hice" para confirmables, badge "Obligatoria" sin botón para `ASUME_HECHA`, botón deshabilitado al llegar al tope. Toggle "¿Requiere que el usuario confirme?" en el form del tutor (solo con OBLIGATORIA).

### Desviaciones / decisiones de implementación
- **Migración escrita a mano** (no `prisma migrate dev`): no había Postgres levantado. El SQL replica lo que generaría el CLI; falta aplicarla contra una DB real (`prisma migrate deploy` o `dev`) antes de correr el servicio — pendiente de verificación de la próxima sesión.
- **`mi-estado-hoy` vive en `RegistroService`** (no un service nuevo): reusa la resolución de sesión y el conteo que ya hacía `completar`.
- **Aislamiento del consumidor**: corre sin tenant; filtra explícito por `organizacionId`/`grupoId` del envelope. Se confirmó que la tenant-extension (ALS) no bloquea escrituras sin contexto (mismo patrón que scoring).
- **Ordenamiento `CADA_SESION`** (nota de la spec Parte C): no resuelto — Destino:Dorado usa `SOLO_AL_CIERRE_SECCION`, no hay carrera. Queda señalado como riesgo si algún grupo usa `CADA_SESION`.

### Checklist de aceptación
- [x] OPCIONAL rep. 3: barrita 1/3→3/3, botón deshabilitado al tope, estado sobrevive recarga (viene de `mi-estado-hoy`). *(cubierto por test de `mi-estado-hoy` + UI; validar E2E en navegador pendiente)*
- [x] `completar` OBLIGATORIA `ASUME_HECHA` sigue 400 (test).
- [x] `completar` OBLIGATORIA `REQUIERE_CONFIRMACION` crea confirmación 0 pts sin evento (test).
- [x] Al cerrar la sesión: no-hizo por cada confirmable no confirmada; confirmadas y no-hizo manuales no se tocan (tests de `CierreService`).
- [x] Reentrega del mismo `SesionCerrada` no duplica (test idempotencia).
- [x] Migración: obligatoria preexistente queda `ASUME_HECHA` (default del schema/migración).
- [x] Aislamiento multi-tenant del consumidor (test).

### Qué verificar la próxima sesión (antes de confiar en esto)
1. Aplicar la migración contra la DB real (`nx run activity-service:prisma-migrate` con Postgres arriba) y confirmar que arranca.
2. E2E en navegador del flujo completo: crear obligatoria confirmable → confirmar / no confirmar → forzar-cierre de sesión (Fase 6) → ver el descuento en scoring y el estado en la home.
3. Verificar la cola `activity.q.sesiones` en el Management UI (que se declare y consuma `session.sesion_cerrada`).

### Verificación hecha en esta sesión
- `nx test activity-service`: **87 passed** (incluye 12 tests nuevos: confirmación, `mi-estado-hoy`, `CierreService`).
- `nx build app-web`: OK (typecheck de plantillas incluido).
- `tsc --noEmit` de activity/scoring/notification: OK.
- `nx lint` de activity-service/shared-types/shared-events/app-web: OK.

## Ítem 11: Actividades programadas (solo ciertos días de la semana)
- **Estado**: EN_PROGRESO — **backend + frontend completos y verificados** (124/124 activity, 59/59 session, tsc de los 13 proyectos, build y lint de app-web verdes). **Falta**: aplicar la migración contra la DB real y el E2E (misma situación que el ítem 10: no había infra levantada).
- **Fecha**: 2026-07-26 / **Spec**: `docs/phases/fase-14-11-actividades-programadas.md` / **Commit**: — (branch `fase-14-roles-grupos-multiples`)
- **Origen**: pedido de José (2026-07-26): *"quiero que haya tareas que solo se pueden hacer cierto día, por ahora cierto día pero pienso también poner cierta fecha; en la misma ventana de crear actividad, solo para el tutor"*. Se sumó como ítem 11 al índice de Fase 14 (con nota de fecha, no reescritura).

### Decisiones tomadas con José
1. **Alcance de este corte: solo días de la semana.** Las **fechas concretas** quedan para un corte siguiente; por eso toda la evaluación de disponibilidad vive en una función única (`comun/programacion.ts`) — agregarlas es tocar ese archivo y los DTOs, no los cinco puntos de enforcement.
2. **El integrante ve la actividad apagada, no oculta**: en gris, sin botón, con el chip "solo los martes". Sabe que existe y cuándo le toca.
3. **Convención `0 = domingo … 6 = sábado`**: la que ya usaban los cron de `session-service` y el selector de días de la config de sesión. No se inventó una segunda numeración.

### Decisiones de implementación que resolvió la spec
- **El día se evalúa sobre el día de inicio de la SESIÓN** (no sobre el reloj del momento) y **en la timezone del Grupo**, mismo criterio que `deadlineVencido`. Es lo que hace que una Sesión del martes que cierra a las 00:00 del miércoles siga contando como martes, y que una que arranca lunes 22:00 local (martes 02:00 UTC) cuente como lunes.
- **`SesionCerrada` suma `fechaInicio` al payload** (aditivo, opcional): el consumidor de cierre de activity no tenía cómo saber a qué día pertenecía la sesión cerrada. Si el campo falta (mensaje viejo en la cola durante un despliegue), **no se castiga** ninguna programada — ante la duda no se restan puntos; las no programadas siguen igual.
- **Normalización**: los días se guardan ordenados y sin repetidos, y **los 7 días se guardan como `[]`** (misma semántica que "sin restricción", una sola representación en la base; así `diasSemana.length > 0` alcanza para saber si está programada).
- **El contenido de integrantes (ítem 10) no lleva programación** en este corte: su request no expone el campo.

### Backend ejecutado
- **Schema + migración** `20260726160000_actividades_programadas_fase14`: `Actividad.diasSemana Int[] @default([])` (escrita a mano, sin Postgres levantado — mismo criterio que los ítems previos).
- **`comun/programacion.ts`**: `diaSemanaEnTimezone`, `estaDisponibleEn` y `normalizarDiasSemana`, con 6 tests propios de timezone (`programacion.spec.ts`).
- **Enforcement en los 5 lugares**: `completar`, `iniciarCronometro` y `registrarNoHizo` (409 `ACTIVIDAD_NO_DISPONIBLE_HOY`, con los días en el body del error), `TareasEquipoService.completar` (mismo 409) y **`CierreService`**, que ahora filtra las obligatorias programadas por el día de la Sesión antes de generar los `NO_HIZO`. La consulta de la timezone solo ocurre si hay alguna actividad programada — el caso normal no paga ninguna llamada REST extra.
- **`mi-estado-hoy`** devuelve `disponibleHoy` y `diasSemana` por actividad (la timezone se resuelve una sola vez por request); si identity no responde, se asume disponible: el servidor decide de verdad al registrar, y apagar botones por una falla ajena es peor.
- **`resolverSesionAbierta`** (helper compartido) ahora devuelve también `fechaInicioSesion`.
- **`ActividadDto`** suma `diasSemana`; `CrearActividadRequest`/`EditarActividadRequest` lo aceptan validado (array de 0..6, máx. 7); un `PATCH` que no lo trae **no borra** la programación existente.
- **session-service**: `eventoDeSesion` publica `fechaInicio`; `event-catalog.md` actualizado.

### Tests nuevos (17 en activity, +1 ajustado en session)
- `programacion.spec.ts` (6): convención de días, timezone del Grupo vs UTC, sesión nocturna, 7 días = sin restricción.
- `cierre.service.spec.ts` (5, fase-14-11): **no castiga el día que no toca**, sí el día que toca, el caso de la sesión del lunes 22:00 local, la obligatoria sin programación intacta, y el envelope sin `fechaInicio`.
- `registro.service.spec.ts` (6): 409 al completar fuera de sus días, completar el día correcto, sin días no bloquea, cronómetro y no-hizo fuera de días, y `mi-estado-hoy` marcando `disponibleHoy` por actividad.
- `maquina-secciones.service.spec.ts`: el payload de sesión ahora incluye `fechaInicio`.

### Frontend ejecutado (`apps/app-web`)
- **`core/dias-semana.ts` nuevo**: chips Lun→Dom, nombres y `describirDias` ("todos los días" / "los martes y jueves" / "de lunes a viernes"). **De paso se deduplicó**: `configuracion-sesion.page.ts` tenía su propia copia de esas constantes y del armado del texto, y ahora usa el helper compartido (era la segunda copia; con actividades hubieran sido tres).
- **Tutor**: selector de 7 chips en el modal de crear/editar actividad, con el resumen en lenguaje natural y el hint de que sin marcar nada se puede todos los días; chip 🗓 con los días en la lista de actividades.
- **Integrante**: en la lista de hoy, la actividad que no toca aparece atenuada (`opacity-60`), con "🗓 solo los martes" en lugar de los puntos y un chip "Otro día" en vez del botón. El dato viene de `mi-estado-hoy` — el navegador no recalcula el día.

### Qué falta / verificar la próxima sesión
1. **Aplicar la migración** `20260726160000_actividades_programadas_fase14` contra la DB real (junto con la del ítem 10) y confirmar que activity arranca.
2. **E2E por API**: crear una actividad con `diasSemana: [2]` (martes) → completarla un lunes da 409 `ACTIVIDAD_NO_DISPONIBLE_HOY` → forzar el cierre de la sesión del lunes y confirmar que **no** aparece un `NO_HIZO` → repetir un martes y ver que sí. Verificar además que `SesionCerrada` llega con `fechaInicio` (Management UI o log del consumidor).
3. **E2E en navegador**: selector de días en el modal del tutor y la actividad apagada en la pantalla del integrante.
4. Cuando José pida **fechas concretas**: `comun/programacion.ts` + `ActividadDto`/`CrearActividadRequest` + el selector del modal. El enforcement no se toca.

## Ítem 12: Marcas rojas del tutor (denegar una obligatoria, quemar una repetición)
- **Estado**: EN_PROGRESO — **backend + frontend completos y verificados** (135/135 activity, 50/50 scoring, build de los 5 servicios backend tocados, build y lint de app-web verdes con **0 warnings**). **Falta**: aplicar la migración contra la DB real y el E2E (misma situación que los ítems 10 y 11: no había infra levantada).
- **Fecha**: 2026-07-26 / **Spec**: `docs/phases/fase-14-12-marcas-rojas-del-tutor.md` / **Commit**: — (branch `fase-14-roles-grupos-multiples`)
- **Origen**: pedido de José (2026-07-26): *"cuando el tutor o admin marque que un usuario no hizo algo, que su tarea obligatoria se marque con contorno rojo tipo denegado; y si es una opcional de varias repeticiones y el admin la ajusta de 3 a 2, que se marque en rojo una barrita, y sea una barrita perdida que solo el admin/tutor puede volver a modificar"*. Se sumó como ítem 12 al índice de Fase 14 (con nota de fecha, no reescritura).

### Decisiones tomadas con José (dos rondas de preguntas antes de escribir código)
1. **La barrita perdida quema el cupo**: el tope de hoy pasa a `repeticionesMaximasSesion − vecesPerdidas`. No es un aviso, es un intento gastado.
2. **La obligatoria denegada queda bloqueada**: contorno rojo y sin botón; el integrante no puede "arreglarla" volviendo a confirmar.
3. **Solo el tutor revierte, y revertir devuelve los puntos** (la acción "me equivoqué"). Se descartó la variante "devolvele el intento sin los puntos" para no duplicar UI por un caso raro.
4. **La marca vive dentro de la Sesión actual**: al día siguiente se arranca limpio.
5. **Motivo opcional y visible** para el integrante.
6. **Pendientes que pidió dejar afuera explícitamente**: notificar al integrante (espera la implementación completa de notificaciones a usuarios) y las tareas de equipo del ítem 9.

### El bug que apareció al leer el código (y que motivó la mitad del ítem)
`RegistroService.completar` contaba las completadas **sin filtrar `eliminado`**, así que el cupo ya quedaba quemado del lado del servidor; pero `mi-estado-hoy` **sí** las filtraba. Resultado: la barrita retrocedía de 3/3 a 2/3, el botón «Completar» quedaba habilitado y al tocarlo el usuario comía un 409 `LIMITE_REPETICIONES_ALCANZADO`. El backend hacía lo correcto y la UI lo contradecía. El ítem alinea las dos lecturas en lugar de cambiar la regla: se dejó el conteo como estaba (con un comentario que explica por qué no lleva el filtro) y se expuso el mismo número como `topeEfectivo`.

### Backend ejecutado
- **Schema + migración** `20260726190000_marcas_rojas_del_tutor_fase14`: `RegistroActividad` suma `motivoTutor`, `revertidoPorTutorId` y `revertidoEn` (las tres nullable ⇒ retro-compatible; escrita a mano, sin Postgres levantado, mismo criterio que los ítems previos). **No hubo tabla nueva**: una repetición perdida ya era una `COMPLETADA` con `eliminado = true` y una obligatoria denegada ya era un `NO_HIZO` — solo faltaba leerlas.
- **`completar` e `iniciarCronometro`** rechazan con 409 `ACTIVIDAD_DENEGADA_POR_TUTOR` si hay un `NO_HIZO` vivo. Esto **invierte** el comportamiento del ítem 8, donde el "no hizo" daba de baja la confirmación previa y el usuario podía volver a confirmar como si nada.
- **`mi-estado-hoy`** suma `vecesPerdidas`, `topeEfectivo`, `denegada` y `motivoTutor`. Las marcas se traen en **una sola query** (un `OR` de "COMPLETADA eliminada" y "NO_HIZO vivo") y se agregan en memoria.
- **`POST /activity/registros-actividad/:id/revertir`** (nuevo, TUTOR/ORG_ADMIN): restaura una completada quitada o da de baja un `NO_HIZO`, según el tipo de la fila. Un solo endpoint porque para el tutor las dos son la misma acción ("sacá esa marca"). 409 `MARCA_NO_REVERSIBLE` si no es una marca viva, 409 `NO_HAY_SESION_ABIERTA` si es de otra Sesión, 404 si es de otra organización.
- **`GET /activity/grupos/:g/usuarios/:u/marcas`** (nuevo): las marcas vivas del usuario en la Sesión abierta, con nombre de actividad, puntos y motivo.
- **El motivo del `DELETE` va por query param**, no por body: un DELETE con body atraviesa el Gateway y otros intermediarios que tienen derecho a descartarlo.
- **Revertir no borra el rastro**: `eliminadoPorTutorId`/`eliminadoEn` se conservan y se agregan `revertidoPorTutorId`/`revertidoEn`. La fila cuenta la historia entera en vez de volver a un estado que finge que nunca pasó.

### scoring-service: la parte con trampa
La compensación **no puede negar el asiento original** al revertir. Tras `completar → quitar` el neto ya es 0; deshacer la quita tiene que **sumar**, y negar el original volvería a restar. Se agregó `compensarCadena`, que camina los `corregidoDeId` hasta el último eslabón y crea una fila de signo opuesto **a ese último**. `procesarActividadRegistroEliminado` pasó a usar la misma función: para una quita simple el resultado es idéntico al de antes (la cadena tiene un solo eslabón) y, de paso, la cadena queda estrictamente lineal, sin dos filas apuntando al mismo padre.

Secuencia verificada por test con una actividad de 5 puntos: completar `+5` → quitar `0` → deshacer `+5` → quitar `0`. Y un "no hizo" de 15: `−15` al marcar, `0` al revertir. El ledger nunca se edita: todo son filas nuevas con `corregidoDeId`.

### Tests nuevos (11 en activity, 5 en scoring)
- `registro.service.spec.ts` (11): tope efectivo tras una quita, el 409 del cupo quemado, la reversión completa (estado + evento + rastro conservado), la obligatoria denegada bloqueando `completar`, el desbloqueo al deshacer, `MARCA_NO_REVERSIBLE`, el 404 cross-tenant, el 409 de otra Sesión, la confirmación de 0 pts que no publica evento, el listado de marcas del tutor y el **default intacto** sin ninguna marca.
- `proyeccion.service.spec.ts` (5): restaurar negando la corrección y no el original, la secuencia completa de la tabla de la spec, el "no hizo" revertido, la idempotencia de la reentrega y el error → DLQ si falta el asiento.

### Frontend ejecutado (`apps/app-web`)
- **Integrante**: barrita con **tres** estados de segmento (`hecho` / `libre` / `perdido`) en vez de un booleano; contador "2 de 3 · 1 perdida"; tarjeta con contorno rojo, chip "No hecha" y leyenda "Tu tutor marcó que no la hiciste" cuando está bloqueada; el motivo del tutor debajo, en cursiva. El botón se deshabilita contra el **tope efectivo**, no contra el máximo nominal.
- **Detalle de diseño**: una actividad que llegó al tope **con** repeticiones perdidas ya no se pinta de verde ni se tacha — "llegaste al tope porque te quitaron una" no es un logro.
- **`.segmento-perdido` en `libs/shared-ui/src/theme.css`**: rojo **+ rayado diagonal**. La información no puede depender solo del color (WCAG 1.4.1) y, de paso, se lee como "tachado" y no como "todavía disponible".
- **Tutor** (`panel-operativo.page.ts`): campo de motivo opcional en «Registrar no hizo» y en el bloque de corrección; bloque nuevo «Marcas de hoy» con las marcas vivas del usuario elegido y un botón **Deshacer** por fila. El texto del bloque de corrección ahora avisa que la quita le gasta el intento al integrante.

### Desviaciones / decisiones de implementación
- **Migración escrita a mano** (sin Postgres levantado), igual que los ítems 8, 10 y 11. Ya son **tres** migraciones de activity sin aplicar contra una DB real.
- **`revertir` reusa las columnas de soft-delete para el `NO_HIZO`**: un `NO_HIZO` no tenía otro estado de baja y las columnas ya eran genéricas. Se setean `eliminado`/`eliminadoPorTutorId`/`eliminadoEn` **y** los campos de reversión, así se mantiene el invariante "eliminado ⇒ hay tutor y fecha".
- **El `NO_HIZO` automático del cierre (ítem 8) no es revertible**: nace en una Sesión que se está cerrando, así que `revertirMarca` lo rechaza por la validación de Sesión abierta. Es coherente con la decisión 4, pero **no fue una decisión explícita de José** — si alguna vez quiere corregir un castigo automático, hay que revisarlo.

### Qué falta / verificar la próxima sesión
1. **Aplicar las tres migraciones pendientes de activity** (`...contenido_por_integrantes`, `...actividades_programadas`, `...marcas_rojas_del_tutor`) contra la DB real y confirmar que el servicio arranca.
2. **E2E por API del ciclo completo de puntos**, que es lo único que los tests unitarios no prueban de punta a punta: completar 3 veces una opcional de 5 pts → puntaje 15 → el tutor quita una → puntaje 10 → deshacer → puntaje 15. Verificar en `EventoPuntos` que son filas nuevas encadenadas por `corregidoDeId` y que **ninguna fila vieja cambió**.
3. **Verificar el binding nuevo de la cola `scoring.q.registros-actividad`** con la routing key `activity.actividad_registro_revertido`: la cola ya existía, así que hay que confirmar que el binding se declara al arrancar y no quedan mensajes sin rutear.
4. **E2E en navegador**: la barrita con el segmento rojo rayado y la tarjeta denegada en la pantalla del integrante; el bloque «Marcas de hoy» con Deshacer en el panel del tutor.
5. Cuando se haga la **implementación completa de notificaciones a usuarios**, engancharle el aviso de marca roja (pendiente declarado, no olvidado). Ídem las **tareas de equipo**.
