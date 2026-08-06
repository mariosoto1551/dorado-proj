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
5. Cuando se haga la **implementación completa de notificaciones a usuarios**, engancharle el aviso de marca roja (pendiente declarado, no olvidado). Las **tareas de equipo** se cerraron en el ítem 13.

## Ítem 13: Anular una tarea de equipo (marcas rojas, parte 2)
- **Estado**: EN_PROGRESO — **backend + frontend completos y verificados** (148/148 activity, 57/57 scoring, lint de los 18 proyectos y build de los 17 verdes, **0 warnings**). **Falta**: aplicar la migración contra la DB real y el E2E.
- **Fecha**: 2026-07-26 / **Spec**: `docs/phases/fase-14-13-anular-tareas-de-equipo.md` / **Commit**: — (branch `fase-14-roles-grupos-multiples`)
- **Origen**: pedido de José (2026-07-26), inmediatamente después del ítem 12: *"quiero que ahora se pueda anular también las tareas de grupo, por el tutor, que sea posible con la misma lógica"*. Cierra lo que el ítem 12 había declarado fuera de alcance.

### Decisiones propias de equipos (las 5 del ítem 12 se aplicaron tal cual)
1. **Se anula la completada entera, no por miembro**: la tarea se hizo o no se hizo.
2. **El bono del jefe también se pierde** — era el bono *por esa tarea*. Es la pregunta que el ítem 12 había dejado abierta.
3. **Se compensa a quien recibió puntos, no a quien es miembro hoy**: quien salió del equipo igual pierde lo que ganó. Sale gratis porque scoring compensa por `origenId` y no consulta la membresía.
4. **El jefe no anula**: completa, pero corregir es del Tutor. Misma asimetría que el ítem 12 y que la aprobación de reportes del ítem 9.
5. **No hay "no hizo" de equipo**: una tarea de equipo es siempre OPCIONAL, así que la única marca posible es la completada anulada.

### El bug que estuvo a punto de pasar desapercibido
El puntaje del equipo es **derivado sumando `EventoPuntos` por `equipoId`**. La función de compensación del ítem 12 no copiaba ese campo (no hacía falta: en las individuales es `null`). Si se dejaba así, anular una tarea de equipo bajaba los puntajes **individuales** de los tres miembros y dejaba el puntaje **del equipo** intacto en 33 — sin que ningún test existente se pusiera rojo. Ahora `FilaEventoPuntos` incluye `equipoId` y la compensación lo arrastra; hay un test dedicado (`la compensación arrastra el equipoId: el puntaje DERIVADO del equipo cae a 0`).

### Backend ejecutado
- **Schema + migración** `20260726210000_anular_tareas_equipo_fase14`: `RegistroTareaEquipo` suma `eliminado`, `eliminadoPorTutorId`, `eliminadoEn`, `motivoTutor`, `revertidoPorTutorId`, `revertidoEn` (escrita a mano; retro-compatible: toda completada previa queda `eliminado = false`).
- **Nombres espejados**: se usó `eliminado`/`eliminadoPorTutorId`/`eliminadoEn`, igual que `RegistroActividad` y `RegistroConducta`, aunque el botón se llame "Anular". Tres modelos con el mismo concepto y tres nombres distintos era peor que la disonancia campo/botón.
- **`TareasEquipoService`** suma `tareasDeHoy` (lectura del estado), `anular` y `revertirAnulacion`; el conteo de `completar` sigue **sin filtrar** los anulados, así que el intento del día queda quemado igual que en las individuales (ahora documentado y expuesto como `topeEfectivo`).
- **Rutas nuevas**: `GET /activity/equipos/:equipoId/tareas-de-hoy` (miembros + Tutores), `DELETE /activity/registros-tarea-equipo/:id?motivo=` y `POST /activity/registros-tarea-equipo/:id/revertir` (solo Tutor/ORG_ADMIN).
- **`registros` viaja vacío para el USUARIO**: el equipo ve el estado agregado (hechas, anuladas, motivo), no los ids con los que se opera. Mismo criterio que `MarcaRojaDto` en el ítem 12.
- **Leer el estado lo puede hacer cualquier miembro, no solo el jefe**: la anulación le costó puntos a todos.
- **Dos eventos nuevos** (`TareaEquipoAnulada` / `TareaEquipoRevertida`, mismo payload) sobre la cola `scoring.q.registros-actividad` que ya existía.

### scoring: `compensarCadena` → `compensarCadenas`
El reparto son **N asientos con el mismo `origenId`**, uno por miembro. La función del ítem 12 usaba `findFirst`, así que habría compensado a un solo integrante **en silencio**. Ahora usa `findMany`, camina la cadena de cada uno y crea las N compensaciones en **una** transacción idempotente. El caso individual es el caso N = 1, así que las cuatro operaciones (quitar, restaurar, anular, deshacer) comparten una sola función. Anular y deshacer son literalmente la misma operación: solo cambia el `motivoCorreccion`.

### Tests nuevos (13 en activity, 7 en scoring)
- **`tareas-equipo.service.spec.ts` (13, archivo nuevo)**: no existía ningún test de tareas de equipo — **cierra parte de la deuda del ítem 9**. Cubre anular con motivo + evento, el intento quemado, deshacer conservando el rastro, doble anulación 409, revertir lo no anulado 409, el 404 cross-tenant, el 409 de otra Sesión, y los 6 casos de `tareasDeHoy` (contadores, tope efectivo, `registros` vacío para el USUARIO, lectura por un miembro no jefe, sin Sesión abierta, y que no devuelva las individuales).
- **`proyeccion.service.spec.ts` (7)**: las 3 compensaciones y no una, el bono del jefe en −13, **el `equipoId` arrastrado y el puntaje derivado en 0**, la secuencia anular → deshacer → anular, el miembro que ya salió del equipo, la idempotencia y el error → DLQ.

### Frontend ejecutado (`apps/app-web`)
- **`mi-equipo.page.ts`** — cierra la otra mitad de la deuda del ítem 9: la página **no mostraba ningún estado** de las tareas. Ahora cada tarea trae su estado de hoy desde el endpoint nuevo (barrita de repeticiones con segmentos rojos rayados, contador "1 de 2 · 1 anulada", tachado y borde verde cuando está completa de verdad, borde rojo cuando el tutor le quemó el cupo, aviso "El tutor anuló esta tarea — el equipo perdió esos puntos" + motivo). El botón del jefe se deshabilita contra el **tope efectivo**. Lo ven todos los miembros, no solo el jefe.
- **De paso se simplificó**: la página traía el catálogo completo con `listarActividades` y lo filtraba por `alcance = EQUIPO` en el cliente; ahora el endpoint del equipo ya devuelve lo que corresponde con su estado.
- **`equipos.page.ts` (tutor)**: botón "Tareas de hoy" que despliega las completadas de la Sesión abierta, campo de motivo opcional, **Anular** en las vivas y **Deshacer** en las anuladas, con refresco del puntaje del equipo después de cada acción.
- **Arreglo de paso**: `puntajes` pasó a `Record<string, number | undefined>`, que era el único warning `NG8102` del build (el mapa se llena de a uno, así que el `?? '·'` del template no era redundante — el tipo estaba mal, no la plantilla).

### Desviaciones / decisiones de implementación
- **Migración escrita a mano** (sin Postgres levantado). Ya son **cuatro** migraciones de activity sin aplicar contra una DB real (ítems 10, 11, 12 y 13).
- **`anular` usa `ConflictException` genérica** para "ya estaba anulada", no una excepción tipada con code propio: el caso solo se alcanza haciendo doble click o por carrera, y el mensaje alcanza. Revertir sí usa `MARCA_NO_REVERSIBLE` (reusada del ítem 12).
- **`tareasDeHoy` no lanza sin Sesión abierta**: es una lectura, devuelve los contadores en 0. Para eso se agregó `buscarSesionAbierta` (variante no-lanzadora de `resolverSesionAbierta`, que las escrituras siguen usando).

### Qué falta / verificar la próxima sesión
1. **Aplicar las cuatro migraciones pendientes de activity** contra la DB real y confirmar que el servicio arranca.
2. **E2E por API del ciclo de equipo** (es lo que los unitarios no prueban de punta a punta): equipo de 3 con tarea de 10 pts y bono 3 → el jefe completa → puntaje de equipo 33, jefe 13, miembros 10 → el Tutor anula → **equipo 0 y los tres individuales en 0** → deshacer → 33 otra vez. Mirar en `EventoPuntos` que las compensaciones son **3 filas nuevas por acción**, con `corregidoDeId` y con `equipoId` seteado.
3. **Verificar los dos bindings nuevos** de `scoring.q.registros-actividad` (`activity.tarea_equipo_anulada` y `...revertida`) en el Management UI: la cola ya existía, así que hay que confirmar que se declaran al arrancar.
4. **Probar que el jefe recibe 403** al llamar el `DELETE` con su token (el test unitario no pasa por el `RolesGuard`).
5. **E2E en navegador**: barrita y aviso rojo en `mi-equipo` (con un usuario no jefe también), y el bloque "Tareas de hoy" con Anular/Deshacer en la pantalla de equipos del tutor.
6. Sigue pendiente **notificar** al equipo cuando se anula (espera la implementación completa de notificaciones a usuarios) y **anular un reporte de miembro ya aprobado** (otro objeto, otra conversación).

### Deuda del ítem 9 que este ítem cerró
- `mi-equipo` ya muestra si la tarea se hizo hoy (era el primer punto de "Deuda UI menor" del ítem 9).
- Existe el primer archivo de tests de `TareasEquipoService` (era el punto 1 de "Qué falta" del ítem 9). Sigue sin tests `ReportesService`.

## Ítem 14: Prioridad visual de la lista del integrante
- **Estado**: EN_PROGRESO — **backend + frontend completos y verificados** (157/157 activity, 17/17 app-web, lint y build de los proyectos tocados verdes, 0 warnings). **Falta**: E2E en navegador (el orden y la cuenta regresiva son puro comportamiento visual).
- **Fecha**: 2026-07-26 / **Spec**: `docs/phases/fase-14-14-prioridad-visual-de-la-lista.md` / **Commit**: — (branch `fase-14-roles-grupos-multiples`)
- **Origen**: pedido de José (2026-07-26): *"en el panel de usuario, las tareas obligatorias son de mayor importancia, así que siempre van más arriba, si hay hora límite, entonces esos van más arriba… ¿puedes hacer un excelente UI/UX para esto?"*.

### Decisiones tomadas con José
1. **El tipo manda sobre la hora**: las obligatorias siempre arriba; la hora límite ordena **dentro** de cada grupo. Una opcional que vence a las 18:00 queda debajo de una obligatoria sin hora.
2. **Lo accionable arriba**: lo que ya no requiere acción baja a un tramo atenuado al final, detrás de un separador.
3. **El tratamiento visual lo eligió Claude a pedido de José** ("¿puedes ver qué es lo más recomendado? hazlo"): **peso visual sin encabezados de tramo**. Razón registrada en la spec — la lista de un día son unas pocas tarjetas, y tres encabezados sobre cuatro ítems agregan más cromo que contenido; la decisión 2 ya obliga a un separador, y con eso más el acento ámbar en las obligatorias la jerarquía se lee sin texto extra. Si la lista crece a 15 ítems, los encabezados se suman sin rehacer nada: el orden ya está calculado.

### El problema de timezone que apareció al implementar
Para mostrar "vence en 1 h 20 m" hace falta el **instante absoluto** del deadline, y `deadlineHora` es `"HH:mm"` en la timezone del **Grupo** — que el navegador no conoce. Calcularlo con la hora local del dispositivo funciona en el piloto (la familia y el Grupo comparten timezone) y **rompe en silencio** el día que no sea así, además de violar ADR-00 §6. Por eso `mi-estado-hoy` devuelve `deadlineEn` (instante ISO) y el cliente solo resta.

`comun/deadline.ts` evitaba deliberadamente construir el instante absoluto ("estable ante DST"). Esa función —`deadlineVencido`, la que **valida**— no se tocó: la nueva `instanteDeDeadline` es solo para presentación y convive con ella, con eso escrito en su docstring.

### La mentira de UI que se arregló de paso
Una opcional con el **deadline vencido** mostraba «Completar» habilitado y devolvía 409 `DEADLINE_VENCIDO` al tocarlo. Mismo tipo de problema que el del ítem 12 (la UI prometiendo lo que el servidor rechaza), y se arregla con el mismo dato: ahora el botón se reemplaza por un chip "Venció" y la tarjeta baja al tramo de terminadas.

### Backend ejecutado
- **`comun/deadline.ts`**: `instanteDeDeadline` + los helpers privados de resolución de offset **en dos pasadas** (el offset depende del instante buscado — el huevo y la gallina del DST: la primera pasada lo estima leyendo la hora local como UTC, la segunda lo corrige con el offset real de esa fecha).
- **`MiEstadoActividadHoyDto.deadlineEn`**: instante ISO, o `null` si la actividad no es DEADLINE o si no se resolvió la timezone.
- **La timezone se sigue pidiendo UNA vez por request**, y ahora también si hay alguna actividad con DEADLINE (antes solo si había programadas). El caso sin deadlines ni programación no paga ninguna llamada.
- **Degradación**: sin timezone, `deadlineEn` es `null` y la pantalla cae al texto de siempre (`hasta 14:00`), sin cuenta regresiva y sin deshabilitar nada — mismo criterio que `disponibleHoy` en el ítem 11.

### Frontend ejecutado (`apps/app-web`)
- **`core/prioridad-actividades.ts` nuevo**: el comparador, extraído del componente **para poder testear el orden exacto** que pide el criterio de aceptación sin montar la pantalla. Recibe `venceEn` como función, así no depende de señales.
- **`home-usuario.page.ts`**: `armarBloque` ordena y parte cada bloque en pendientes/terminadas, y expone `corte` (índice donde arranca el tramo terminado) para que la plantilla inserte el separador **sin duplicar el template de la tarjeta** — el markup de la tarjeta es largo y tenerlo dos veces se desincroniza solo.
- **Cuenta regresiva**: un `signal` de "ahora" que tickea cada 30 s, con `clearInterval` registrado en `DestroyRef`. Al cambiar, se recalculan las clases de urgencia **y el orden**: una actividad que vence se hunde sola al tramo de terminadas.
- **Colores por urgencia**: neutro (> 3 h, muestra la hora) → ámbar (≤ 3 h) → rojo (≤ 1 h) → gris tachado (venció).
- **Peso visual**: acento ámbar a la izquierda (`border-l-4`) en las obligatorias; las opcionales con borde neutro. Convive con el rojo de denegada (ítem 12) y el verde de completa.
- **Arreglo de paso**: la hora límite ahora se muestra también en las **obligatorias**. Antes solo aparecía en las opcionales, lo cual era absurdo justo en este ítem: la hora de una obligatoria es lo que más apura y era el único dato que no se veía.
- **Chip con la cuenta de pendientes** en el encabezado de cada bloque.

### Tests nuevos (6 en activity, 6 en app-web)
- `deadline.spec.ts` (6): el instante en La Paz (UTC−4), el día de inicio de Sesión y no el día UTC, consistencia con `deadlineVencido` (un minuto antes/después), **DST real** (New York en enero vs. julio da 19:00Z vs. 18:00Z), el día del salto de hora, y medianoche / 23:59 sin correrse de día.
- `registro.service.spec.ts` (3): `deadlineEn` correcto, `null` sin DEADLINE, y `null` con identity caído sin romper `disponibleHoy`.
- `prioridad-actividades.spec.ts` (6, archivo nuevo): el criterio de aceptación completo con las 6 actividades desordenadas, el tipo mandando sobre la hora, el orden por hora, el cronómetro en el medio, la estabilidad del sort, y **el caso `Infinity − Infinity = NaN`** que rompería el comparador si se hubiera usado `Infinity` en vez de `MAX_SAFE_INTEGER`.

### Desviaciones de la spec
- **Una obligatoria `ASUME_HECHA` con el deadline vencido SÍ baja al tramo de terminadas.** La spec dice, sin matizar, que una `ASUME_HECHA` "no se considera terminada" porque es un recordatorio del día; al implementar quedó claro que eso vale para el caso "no tiene botón", no para "ya pasó la hora". El código chequea vencida/denegada/no-disponible **antes** de la excepción de `ASUME_HECHA`. Se deja anotado acá y no se edita la spec (protocolo de `CLAUDE.md`); si José prefiere que nunca baje, es mover una línea.
- **El comparador se extrajo a `core/` ahora**, no "si otra pantalla lo necesita" como decía la nota de la spec. El motivo fue la testeabilidad, que la spec no había previsto.

### Qué falta / verificar la próxima sesión
1. **E2E en navegador** con una Sesión abierta y varias actividades: que el orden sea el de la tabla, que al completar una la tarjeta baje al tramo de abajo y el chip de pendientes decremente, y que la cuenta regresiva cambie de color al acercarse la hora.
2. **Verificar `deadlineEn` contra la DB real** una vez aplicadas las migraciones pendientes: crear una obligatoria con `deadlineHora` y confirmar el instante que devuelve `mi-estado-hoy` para la timezone del grupo piloto.
3. **Mirar el caso de la Sesión nocturna en la UI**: una Sesión que arranca 22:00 local con un deadline de "23:30" — el instante cae el mismo día local pero el día UTC siguiente. El test unitario lo cubre; conviene verlo en pantalla una vez.
4. Si José quiere los **encabezados de tramo** ("Primero esto" / "Cuando puedas") en vez del separador único, el orden ya está calculado: es solo partir el `@for` por tramos.

## Ítem 15: Las tareas de equipo, visibles pero no marcables en la lista del integrante
- **Estado**: EN_PROGRESO — **completo y verificado** (build y lint de app-web verdes, 0 warnings). **Falta**: E2E en navegador. Sin tests unitarios nuevos (ver deuda abajo).
- **Fecha**: 2026-07-26 / **Spec**: `docs/phases/fase-14-15-tareas-de-equipo-visibles-en-la-lista.md` / **Commit**: — (branch `fase-14-roles-grupos-multiples`)
- **Origen**: pedido de José (2026-07-26): *"se debería poder ver en la lista qué tareas son de grupo y no se puede marcar directamente ahí, solo visual, que sepa el usuario"*.

### El bug que había detrás del pedido
Ni `mi-estado-hoy` ni la home filtraban por `alcance`, así que una tarea de equipo **aparecía en la lista individual con el botón «Completar»** — y ese botón **siempre** devolvía 400 `ES_TAREA_DE_EQUIPO`, porque las de equipo van por `POST /activity/equipos/:id/tareas/:id/completar`. Se verificó leyendo el filtro de `miEstadoHoy` (no tiene `alcance`) y la guarda de `completar` (`registro.service.ts`, primera validación).

**Es el tercer caso de la misma familia** que arreglamos en esta sesión: la pantalla ofreciendo lo que el servidor rechaza. Los otros dos fueron el cupo quemado (#12) y el deadline vencido (#14). Los cuatro codes involucrados —`ES_TAREA_DE_EQUIPO`, `LIMITE_REPETICIONES_ALCANZADO`, `DEADLINE_VENCIDO`, `ACTIVIDAD_DENEGADA_POR_TUTOR`— vienen de la misma causa: el cliente no sabía lo que el servidor sí. Queda anotado en la spec que, si aparece un cuarto, conviene auditar de una vez **todas** las validaciones de `completar` contra lo que la home habilita.

### Decisión de José
**Bloque propio «De tu equipo»**, elegido entre tres opciones (bloque propio / mezcladas arriba sin botón / abajo con lo no accionable). Va después de «Actividades de hoy» y antes de «Mis metas», y no cuentan en el chip de pendientes propios.

### Decisiones de implementación
- **Acento teal, no ámbar**: el ámbar ya significa "obligatoria" en esta lista (#14) y reusarlo haría leer como urgente algo que el usuario no puede tocar. **Nota de inconsistencia asumida**: `mi-equipo` usa ámbar para sus tarjetas de tarea, así que el color de "equipo" no coincide entre las dos pantallas — se priorizó que dentro de la lista el ámbar signifique una sola cosa.
- **"+N c/u" y no "+N pts"**: en una tarea de equipo el valor es por integrante (#9, decisión 10: no se divide).
- **Sin barrita de repeticiones**: las completadas de equipo viven en `RegistroTareaEquipo`, así que el `vecesHechas` de `mi-estado-hoy` es siempre 0 para ellas y la barrita se vería vacía aunque el jefe ya la hubiera marcado. El estado real está en «Mi equipo» (#13).
- **Leyenda neutra** ("La marca el jefe desde «Mi equipo»"): la home no sabe si este usuario es el jefe (eso vive en `misEquipos`), así que el texto sirve para los dos casos y el enlace resuelve el resto.
- **El orden y los tramos del #14 se aplican dentro del bloque**: una de equipo programada para otro día o con deadline vencido baja al tramo de terminadas de su propio bloque.

### Fuera de alcance (declarado)
**Mostrar en la home si el jefe ya la marcó hoy.** Requeriría resolver el equipo del integrante y llamar a `tareas-de-hoy` (#13) desde la pantalla más caliente de la app, por un dato que está a un toque en «Mi equipo». Si José lo pide: agregar ese fetch y reusar `TareaEquipoDeHoyDto`.

### Qué falta / verificar
1. **E2E en navegador**: con una tarea de equipo activa, ver el bloque «De tu equipo» separado, sin botón, y que el enlace lleve a `/mi-equipo`. Confirmar que el contador de «Actividades de hoy» no la cuenta.
2. **Sin tests unitarios nuevos**: la lógica es el filtro por `alcance` dentro de `bloques()`, que es un computed del componente y app-web no tiene tests de componentes. El comparador del #14 sí quedó testeado porque se extrajo a `core/`; acá no había nada puro que valiera extraer. Deuda menor, cubierta por build + lint (typecheck de plantillas).
3. Si algún día la lista deja de mostrar las de equipo por decisión de producto, el filtro está en un solo lugar (`bloques()`), no en el backend.

## Ítem 16: Scheduler con recuperación — ninguna transición se pierde por un reinicio
- **Estado**: EN_PROGRESO — **completo y verificado**. 74/74 tests de session-service verdes, lint verde, `tsc --noEmit` limpio, migración aplicada contra `session_db` local, y **verificación contra Postgres real** (ver abajo).
- **Fecha**: 2026-07-27 / **Spec**: `docs/phases/fase-14-16-scheduler-con-recuperacion.md` / **Commit**: — (branch `fase-14-roles-grupos-multiples`)
- **Origen**: José preguntó si la app dependía de estar prendida en el minuto exacto del cron, y si "los servicios de alto nivel" son así. Se auditó el scheduler: **sí dependía**. Pedido textual: *"quiero que esta app sea profesional, que no se pierda cosas y funcione bien"*.

### El bug de diseño que se arregló (venía de la Fase 6, no era un error de código)
El scheduler disparaba **por igualdad de minuto**: cada tick preguntaba "¿el minuto actual **es** el del cron?". `UltimoTickProcesado.minutoEpoch` sólo daba idempotencia "dentro del mismo minuto" — así estaba especificado, textual, en `fase-06-session-section.md:99`. **El código implementaba exactamente la spec.**

Consecuencia: si el proceso no estaba vivo en ese minuto, la transición **no ocurría nunca** y no se recuperaba. Disparadores reales, no exóticos:
- Un deploy (`docker compose up --build`, `runbook-deploy.md:141`) que cruzara el minuto del cron.
- Un reinicio del VPS, un OOM-kill, 90 s de Postgres caído.
- `identity` sin responder justo en ese minuto — ese caso ya reintentaba al minuto siguiente, pero para entonces el cron ya no matcheaba, **así que el reintento no servía de nada**.

Un grupo con `cronAperturaSeccion = "0 0 * * 1"` que perdiera el lunes 00:00 se quedaba en `EVALUACION` **una semana entera**, sin log de error.

### El cambio conceptual
**Un scheduler no debe preguntar "¿es la hora?" sino "¿qué venció?".** Pasa de temporizador a **reconciliador**: cada tick evalúa la ventana `(evaluadoHasta, ahora]` y aplica todas las ocurrencias que caigan adentro, en orden cronológico. Un corte de horas se recupera solo en el primer tick posterior.

### Backend ejecutado (`session-service`, sin frontend, sin endpoints, sin eventos nuevos)
- **Schema + migración** `20260727120000_scheduler_con_recuperacion`: `UltimoTickProcesado.minutoEpoch` (Int) → `evaluadoHasta` (DateTime?). Destructiva a propósito sobre una tabla **operacional** (sin `organizacionId`, se regenera sola) en vez de dejar una columna muerta que la doc describía como el mecanismo de idempotencia. Entra `NULL`: las filas preexistentes **no** disparan recuperación retroactiva al desplegar.
- **`comun/cron.ts`**: nueva `ocurrenciasEntre(expresion, desde, hasta, tz, maximo)` — ventana **abierta en `desde`, cerrada en `hasta`**, que es lo que hace que ticks consecutivos no se solapen ni dejen huecos. `cronMatcheaMinuto` queda (ya no la usa el scheduler, sigue siendo la forma correcta de responder "¿este instante es una ocurrencia?").
- **`scheduler/scheduler.service.ts`**: reescrito alrededor de `reconciliar()`. Lectura barata de la marca de agua fuera de la transacción; `identity.obtenerGrupo` **fuera** de la transacción (es I/O de red); adentro, advisory lock → re-lectura autoritativa → ventana → ocurrencias ordenadas → aplicación → `upsert` de `evaluadoHasta`, todo en la misma transacción.
- **`config/env.schema.ts`**: `SCHEDULER_MAX_RECUPERACION_HORAS`, opcional, default 168 (7 días = un ciclo de Sección del caso Destino:Dorado).

### Decisiones de implementación que importan
1. **Las transiciones recuperadas se sellan con el instante PROGRAMADO, no con el de la recuperación.** Si el cron de las 00:00 se aplica a las 03:17, la Sección lleva `fechaFin = 00:00`. Si no, scoring vería una Sesión con 3 horas de más. Hay test dedicado.
2. **Dos topes, con semánticas distintas**: la ventana máxima (`SCHEDULER_MAX_RECUPERACION_HORAS`, **descarta** lo anterior y loguea warning — fabricar meses de Secciones en silencio sería peor que no hacerlo) y el tope de 500 ocurrencias por tick (**no descarta**: deja `evaluadoHasta` en la última aplicada y el tick siguiente continúa desde ahí).
3. **Advisory lock `pg_advisory_xact_lock(hashtext(grupoId))` por grupo.** `@Cron` de NestJS es in-process: con 2 réplicas ticknean las 2, y como la marca de agua se leía antes de aplicar las transiciones, con Read Committed podían duplicar Secciones. Se usa advisory lock y no `SELECT … FOR UPDATE` porque tiene que funcionar **también cuando la fila todavía no existe**.
4. **Las extensiones se evalúan contra el instante de la ocurrencia**, no contra `ahora`: una extensión vigente a las 00:00 suprime ese autocierre aunque se recupere a las 03:17. El caso "extensión vencida sin cron que matchee" se sigue evaluando una vez por tick contra `ahora`.
5. **La Sección vigente se re-lee en cada ocurrencia** dentro del bucle: `cerrarSeccion` crea la siguiente, así que una referencia en memoria quedaría vieja apenas se recuperan dos ocurrencias en el mismo tick.

### El bug que SOLO apareció al verificar contra Postgres real
La primera versión usaba `tx.$queryRaw` para el advisory lock. **Pasó los 74 unit tests, el lint, `tsc --noEmit` y el build de webpack** — y fallaba en el 100% de las ejecuciones reales:

```
Failed to deserialize column of type 'void'
```

`pg_advisory_xact_lock` devuelve `void` y el deserializador de `$queryRaw` no sabe mapear ese tipo. Como el lock es lo primero de la transacción, **el scheduler habría quedado completamente muerto en producción** — cada tick lanzando, cada grupo salteado. Arreglo: `$executeRaw` (no deserializa filas). Queda comentado en el código para que nadie lo revierta.

**Lección para la próxima sesión**: el fake en memoria (`comun/testing/bd-en-memoria.ts`) no puede validar SQL crudo. Cualquier `$queryRaw`/`$executeRaw` nuevo hay que probarlo contra Postgres de verdad — el suite unit da falsa confianza ahí.

### Cómo se verificó contra Postgres real (reproducible)
Se escribió un spec temporal (`src/scheduler/__verificacion-real.spec.ts`, **borrado después**) que instanciaba `crearClientePrisma` contra `session_db` local y `SchedulerService` real, mockeando sólo `identity` y el publisher. Tres casos, los tres verdes:
1. Advisory lock + `upsert` de `evaluadoHasta` commitean juntos.
2. Transición perdida recuperada 90 s tarde, sellada con el instante programado.
3. **Dos `procesarGrupo` en `Promise.all` sobre el mismo grupo → una sola transición** (el log mostró una única línea "1 ocurrencia aplicada"), que es la prueba de que el advisory lock serializa.

Se borró y no se dejó en el repo porque `src/**/*.spec.ts` es el suite unit y no debe requerir una BD viva. Si se quiere reproducir, el procedimiento es ese.

### Tests nuevos (14 en session-service: 74 totales, antes 60)
- `cron.spec.ts` (+6): ocurrencias de un corte de 3 días en orden; la ventana abierta-en-`desde`/cerrada-en-`hasta` (la propiedad que garantiza ni duplicados ni huecos); corte sin ocurrencias; tope; ventana vacía/invertida; expresión inválida.
- `scheduler.service.spec.ts` (+8, y se reescribieron los existentes): el bug original (proceso caído en el minuto del cron → el tick siguiente lo aplica); 3 días caído → 3 aperturas en orden; sellado con el instante programado; lunes recuperado con el orden sesión→sección; sin marca de agua no se replica historia; recorte a la ventana máxima; tope de 500 con continuación; dos ticks en el mismo minuto sin duplicar; extensión evaluada contra el instante de la ocurrencia; identity caído → el reintento **sí** recupera.

**Los tests preexistentes hubo que ajustarlos**: casi todos necesitan ahora una marca de agua previa (`tickPrevio(...)`), porque sin ella el primer tick sólo fija `evaluadoHasta = ahora` sin aplicar nada. Eso **es** el comportamiento correcto (decisión 3 de la spec), no un workaround del test.

### Qué falta / verificar la próxima sesión
1. **E2E del modo automático con un cron corto** (`*/2 * * * *`): levantar session-service, matarlo durante un ciclo, volver a levantarlo y confirmar que el tick siguiente recupera la transición. Es la única parte que no se probó con el proceso real corriendo (los 3 casos contra Postgres llamaban a `procesarGrupo` directo, sin el `@Cron`).
2. **Desplegar la migración en el piloto** antes de que arranque el próximo ciclo de Sección. `prisma migrate deploy` para session-service; las filas existentes quedan con `evaluadoHasta = NULL` y el primer tick las inicializa sin efectos.
3. **`SCHEDULER_MAX_RECUPERACION_HORAS` no está en el runbook de deploy** — es opcional con default 168, así que no rompe nada si falta, pero conviene documentarla junto al resto de las env de session-service.
4. **El patrón queda establecido para el monorepo**: si aparece otro job periódico (recordatorios, expiración de recompensas, cortes de facturación), nace con ventana `(evaluadoHasta, ahora]` persistida, no con igualdad de minuto.

## Ítem 17: El plan del día — las opcionales se eligen, no se muestran todas
- **Estado**: EN_PROGRESO — **completo y verificado**. 185/185 tests de activity-service verdes (28 nuevos), 27/27 de app-web (10 nuevos), lint verde en los 3 proyectos tocados, `tsc --noEmit` limpio, build de app-web y de los servicios verde, migración aplicada contra `activity_db` local y **verificación contra Postgres real** (ver abajo).
- **Fecha**: 2026-07-27 / **Spec**: `docs/phases/fase-14-17-plan-del-dia.md` / **Commit**: — (branch `fase-14-roles-grupos-multiples`)
- **Origen**: pedido de José (2026-07-27): *"para evitar ruido visual, ¿no se podría hacer que todas las tareas opcionales individuales estén ocultas o inhabilitadas por defecto, para que el participante pueda seleccionar la tarea que quiere hacer para habilitarla y ponerla?"*.

### El problema
La lista del integrante mostraba **todo el catálogo ACTIVA del grupo, todos los días**. Con 20 opcionales cargadas eso son 20 tarjetas diarias, y las obligatorias —lo único innegociable— quedaban ahogadas entre opciones. El orden del #14 acomodaba el ruido pero no lo sacaba. El diagnóstico: el catálogo (un **menú**) y la lista de hoy (un **compromiso**) eran la misma pantalla.

### Decisiones de José (elegidas sobre alternativas presentadas)
1. **Alcance**: solo las OPCIONALES **individuales del catálogo del tutor**. Obligatorias, tareas de equipo y «Mis metas» siguen siempre visibles.
2. **Duración**: por día (una Sesión). Cada día el plan arranca vacío.
3. **Activación**: config por Grupo, **default apagado** (`planDelDiaActivo = false`).
4. **Interacción**: ocultas + botón «＋ Elegir» que abre una hoja con el catálogo (descartadas: acordeón «Otras tareas» y tarjetas en gris con toggle).
5. **Sin tope** de cuántas puede elegir por día — *pero José pidió explícitamente dejarlo anotado para más adelante con tope configurable* (ver deuda 1).
6. **Se puede quitar mientras no la haya empezado**.
7. **Flag `siempreVisible`** por actividad para que el tutor fije 2 o 3 sin volverlas obligatorias.

### Decisiones de implementación que importan
1. **`enPlan` viaja `true` cuando `requiereSeleccion = false`.** El cliente tiene una regla única (*se muestra si `enPlan`*) en vez de combinar dos flags en cada punto de la plantilla. Es la decisión que protege el default: el primer olvido de combinar los flags habría escondido algo que debía verse, y esconder es mucho peor que mostrar de más. Misma lógica en `core/plan-del-dia.ts`: las tres reglas **fallan hacia mostrar** si no llegó el estado del servidor.
2. **`SeleccionPlanDia` no es ledger** — es estado operativo, como `CronometroActivo`: no vale puntos, no publica evento y **se borra físicamente** al sacarla del plan. La regla 6 de `CLAUDE.md` protege lo que sostiene el puntaje; esto no lo sostiene.
3. **`completar` e `iniciar-cronometro` dan de alta el plan solos** (upsert idempotente, después del commit, con el error tragado y logueado). Sin esto, completar una actividad la haría **desaparecer** de la lista en vez de bajarla al tramo "Ya está", y un Tutor completando en nombre del integrante (`datos.usuarioId`) rompería con un plan que él no conoce.
4. **El servidor NO rechaza completar algo fuera del plan** (decisión 10 de la spec). Habría sido un quinto caso de "el servidor rechaza lo que la pantalla ofrecía" —la familia de los ítems 12, 14 y 15— sin ganar nada: los puntos y los topes ya se validan por otro lado.
5. **`DELETE /plan-dia` no chequea `planDelDiaActivo`** a propósito: si el Tutor apagó el modo, la fila ya no se lee y sacarla no hace daño; rechazar dejaría un botón que falla.
6. **`SeleccionPlanDia` sí entra en `MODELOS_TENANT`** (a diferencia de `CronometroActivo`, que no tiene `organizacionId`): las lecturas por usuario+sesión quedan filtradas de arriba. El `upsert` no se intercepta (usa clave única), y ahí el grupo ya viene de la `Actividad` tenant-filtrada.
7. **`siempreVisible` se recalcula en cada PATCH**, igual que `alcance` y `comportamientoAlCierre`: volver OBLIGATORIA o de EQUIPO una opcional fija apaga el flag aunque el request no lo mande.

### Verificación contra Postgres real (reproducible)
Mismo procedimiento que el #16: spec temporal (`src/plan-dia/__verificacion-real.spec.ts`, **borrado después**) con `crearClientePrisma` contra `activity_db` local y el `PlanDiaService` real, mockeando solo identity/session/config. Tres casos, los tres verdes: (a) el doble `upsert` no duplica —la `@@unique(usuarioId, actividadId, sesionId)` aguanta—, (b) `quitar` borra la fila de verdad, (c) `idsElegidos` (findMany con `select`) devuelve lo elegido **de esa Sesión** y nada de otra. Además `prisma migrate deploy` + `migrate status` → *"Database schema is up to date"*, que confirma que la migración escrita a mano coincide exactamente con el schema.

### Tests nuevos (38 en total)
- `plan-dia.service.spec.ts` (19): alta/idempotencia/`PLAN_DEL_DIA_INACTIVO`/no-elegibles (obligatoria, equipo, `siempreVisible`)/actividad personal de otro (404)/programada para otro día/sin Sesión abierta; quitar y sus tres bloqueos (completada viva, completada quitada por el tutor, cronómetro corriendo) + el no-op + el modo apagado; alta automática (elegible, modo apagado, no elegible, y que **nunca lanza**).
- `elegibilidad-plan.spec.ts` (3): la familia que el plan esconde y la garantía de retro-compatibilidad.
- `registro.service.spec.ts` (+6): `mi-estado-hoy` con el modo apagado (nada requiere selección, todo `enPlan`) y con el modo activo; elegirla; completarla sin elegirla; el Tutor completando en nombre del integrante; el cronómetro.
- `app-web/core/plan-del-dia.spec.ts` (10): las tres reglas de visibilidad, incluido el "sin estado cargado se muestra".
- En `registro.service.spec.ts` el helper ahora arma un **`PlanDiaService` real** contra la misma bd en memoria (solo la config del grupo va mockeada), para que los tests vean el alta automática tal como pasa en producción.

### Qué falta / verificar la próxima sesión
1. **Tope configurable de tareas por día — pedido explícito de José para más adelante.** Cuando llegue: `maxActividadesPlanDia Int?` en `ConfiguracionContenidoGrupo` (nullable = sin tope, el comportamiento de hoy), validado en `PlanDiaService.agregar` y expuesto en `MiEstadoHoyDto` para que la hoja «Elegir» deshabilite el tilde al llegar al tope. Nada de lo implementado lo bloquea.
2. ~~**E2E**~~ — **HECHO (2026-07-27)**: se agregó `apps/e2e/src/plan-del-dia.e2e.ts` (4 tests) y la suite completa corre **14/14 verde, dos veces seguidas** contra el stack local. Cubre: el interruptor del Grupo en sus tres estados (apagado = nada cambia y `POST /plan-dia` da 400 `PLAN_DEL_DIA_INACTIVO`; encendido = se esconden; apagar y volver a encender **no** pierde el plan ya armado), qué se puede elegir (obligatoria y `siempreVisible` → 400 `ACTIVIDAD_NO_ELEGIBLE_PARA_EL_PLAN`; elegir es idempotente), quitar lo no empezado **con verificación por SQL de que la fila se borra** (decisión 8: no es ledger) y el 409 `ACTIVIDAD_YA_EMPEZADA` una vez completada, el alta automática al completar —incluido el Tutor marcando en nombre del integrante— y que la Sesión siguiente arranca con el plan vacío. **Falta solo el paseo visual por la UI** (la hoja «Elegir», el ✕, el vacío «Armá tu día»): la suite es API-first y verifica el contrato de `mi-estado-hoy`, que es de donde la home saca todo lo que pinta.

   **Efecto colateral que hubo que resolver**: sumar una suite hizo fallar por **429** dos tests de `seguridad-inmutabilidad` — el Gateway limita a 100 req/min por IP y el setup de cada escenario cuesta ~10 requests. No era un bug del ítem. Se arregló por el lado del test, sin tocar el límite de producción (está fijado en la spec de fase-03): los 7 tests del plan del día se agruparon en **4 escenarios**, se sacaron los umbrales de zona del setup (4 POST por escenario que no se assertaban), y el reintento ante 429 de `support/api.ts` pasó de 20 s a **~66 s** para cubrir la ventana entera del limiter. Queda anotado en `apps/e2e/README.md` como techo de crecimiento de la suite.
3. **Desplegar la migración en el piloto** (`prisma migrate deploy` para activity-service). Es retro-compatible: las dos columnas nuevas arrancan en `false` y la tabla nueva vacía, así que ningún grupo cambia de comportamiento hasta que un Tutor encienda el modo.
4. **Deuda menor de tests**: el filtro de la home vive en `bloques()` (computed del componente) y app-web no tiene tests de componentes; lo puro se extrajo a `core/plan-del-dia.ts` y **sí** está testeado, igual que el comparador del #14.

## Ítem 18: Historial de la sesión — la línea de tiempo del grupo para el Tutor
- **Estado**: EN_PROGRESO — **completo y verificado**. 208/208 tests de activity-service (23 nuevos), 34/34 de identity, 34/34 de app-web (7 nuevos), lint verde en los 5 proyectos tocados, build de activity/identity/app-web verde, **migración aplicada contra `activity_db` real** y **suite E2E nueva 4/4 verde, dos corridas seguidas** contra el stack local.
- **Fecha**: 2026-07-30 / **Spec**: `docs/phases/fase-14-18-historial-de-la-sesion.md` / **Commit**: — (branch `fase-14-roles-grupos-multiples`)
- **Origen**: idea de José (2026-07-30), la primera de cuatro (ítems #18 a #21). Se eligió arrancar por esta porque es la más barata y porque es *observabilidad*: las otras tres cambian el comportamiento del sistema y esta es la que deja ver si esos cambios hacen lo esperado.

### El problema
Los datos del día ya estaban todos guardados, pero **solo se llegaba a ellos de a un participante por vez** (`.../usuarios/:id/completadas` y `.../marcas`). Con seis integrantes eso son seis pantallas para enterarse de qué pasó, y las acciones de corregir (ítems #12 y #13) exigían adivinar primero a quién mirar: la herramienta estaba construida y escondida.

### Decisiones cerradas con José antes de escribir la spec
Timeline cronológico del grupo (no agrupado por participante) · solo la Sesión actual · servido por `activity-service` · pestaña del panel operativo, no página nueva · actividades + conductas + tareas de equipo (canjes y ciclo de sesión fuera) · registro rápido **solo de conductas** · hilo de notas internas invisibles para el integrante · auto-refresco de 30 s + botón · solo TUTOR/ORG_ADMIN.

### Decisiones de implementación que importan
1. **No hay tabla de eventos del historial.** El timeline se arma leyendo y uniendo `RegistroActividad` + `RegistroConducta` + `RegistroTareaEquipo` con un k-way merge en memoria (cada tabla trae sus `limite+1` más nuevos posteriores al cursor, así que el tope global de la página ya está contenido). Materializarlo habría sido duplicar el ledger en una copia desincronizable — la misma prohibición que la regla 1 le impone al puntaje, aplicada a la trazabilidad. La única tabla nueva es `NotaRegistro`, que no deriva de nada.
2. **Lo anulado se muestra tachado, no se esconde** (con filtro opt-in para ocultarlo). Un historial que oculta lo corregido le miente al tutor sobre su propio día, y lo corregido es justo lo que va a querer mirar.
3. **Costo constante por request**: 3 consultas de registros + 2 de catálogo + 1 de notas, y 4 llamadas REST internas (grupo, usuarios, tutores, equipos) — **ninguna por fila**. La de equipos solo se hace si la página trae alguna tarea de equipo (verificado con un test).
4. **Cursor `(createdAt, id)`, no solo `createdAt`.** El desempate por id no es un lujo: dos registros del mismo instante son lo normal cuando un tutor carga varios seguidos, y sin él la paginación repite o saltea filas exactamente en el caso más común. El E2E lo prueba con tres completadas consecutivas contra Postgres real.
5. **Fallbacks legibles en vez de uuids o errores**: esta es la pantalla que más tiene que aguantar datos viejos (un tutor que se fue, un integrante dado de baja). `SYSTEM` se muestra como «Automático al cerrar el día».
6. **Las notas no son ledger** → borrado físico, mismo criterio que `SeleccionPlanDia` del #17. La regla de borrado es de **autoría, no de jerarquía**: un ORG_ADMIN tampoco borra la nota de otro tutor (403 `NOTA_DE_OTRO_TUTOR`, con test).
7. **Las horas se formatean en la timezone del Grupo**, no la del navegador: el servidor manda el instante absoluto más `timezoneGrupo` (mismo problema que resolvió el #14 con `deadlineEn`).
8. **El auto-refresco se corta con más de una página cargada.** Reemplazar la lista por la primera página le sacaría de abajo lo que el tutor scrolleó; el botón ↻ sigue disponible y sí reinicia.

### Desviaciones de la spec
- **La spec decía «no requiere ningún endpoint interno nuevo» y sí hizo falta uno**: `GET /internal/identity/grupos/:grupoId/equipos`. `RegistroTareaEquipo` guarda `equipoId` pero no el nombre, y resolverlo con el interno existente (`equipos/:id`) habría sido **una llamada por equipo de la página** — rompiendo el invariante de costo constante que la propia spec fija como criterio de aceptación. Se agregó el listado por grupo (incluye los equipos `INACTIVO` a propósito: una tarea vieja de un equipo archivado igual tiene que mostrar su nombre). De paso se extrajo `equipoInternoADto` para que el detalle y el listado compartan el mapeo.
- **`eliminarRegistroConducta` no existía en el cliente de app-web** (el endpoint sí, desde Fase 7): se agregó.
- **BD en memoria propia para los tests** (`comun/testing/bd-historial-en-memoria.ts`) en vez de extender la compartida: el historial necesita `orderBy` + `take` + el `where` del cursor (`OR` con `lt`) + `array_contains`, y agregarle todo eso al fake existente habría cambiado el comportamiento de los tests que ya dependen de él.

### Verificación contra el stack real
`prisma migrate deploy` aplicó `20260730120000_historial_de_la_sesion_fase14` contra `activity_db` local. Suite nueva `apps/e2e/src/historial-sesion.e2e.ts` (4 tests), **4/4 verde dos veces**:
1. Las tres tablas unidas en un timeline ordenado, con nombres de participante/ítem/autor resueltos (ninguno es un uuid), el motivo del tutor viajando, y los filtros por tipo y por participante.
2. **Tarea de equipo**: entra al timeline con nombre de equipo, puntos por miembro, bono del jefe y cantidad de miembros — y el filtro por participante la encuentra **por el snapshot**. Este test existe por una razón concreta: el filtro usa `array_contains` sobre el jsonb `miembrosSnapshot` (el `@>` de Postgres), que es la única consulta del ítem que el fake de Vitest no puede validar de verdad.
3. Anular desde el historial no borra la fila (queda tachada con quién y por qué), `incluirAnulados=false` sí la esconde, y deshacer la devuelve a la normalidad.
4. Paginación por cursor sin repetir, cursor corrupto → 400, y **la garantía central del ítem**: la nota interna no aparece en `mi-estado-hoy` del integrante, el integrante recibe 403 al pedir el historial, y borrar la nota la borra físicamente (verificado por SQL directo).

### Qué falta / verificar la próxima sesión
1. **Paseo visual por la pestaña «Qué pasó hoy»**: la suite es API-first y verifica el contrato completo que la pantalla pinta, pero nadie miró todavía el timeline en el navegador (los estados vacíos, la hoja de notas en móvil, el aviso de solo lectura fuera de horario).
2. **Asimetría de conductas, declarada fuera de alcance**: una conducta se puede anular pero **no deshacer**, y su anulación no acepta motivo — a diferencia de las actividades desde el #12. En el historial se nota (una fila de conducta tiene menos botones). Emparejarla necesita un evento nuevo y la cadena de compensación en scoring; es un ítem propio, no un agregado.
3. **Desplegar la migración en el piloto**. Es retro-compatible por construcción: solo agrega un enum y una tabla vacía.
4. **Deuda de tests de componente**: lo puro del timeline se extrajo a `historial-sesion.util.ts` y **sí** está testeado (7 tests, incluido el formateo en la timezone del Grupo); el componente en sí queda cubierto por build + lint, como el resto de app-web.

## Ítem 20: Las obligatorias también suman al cumplirse
- **Estado**: EN_PROGRESO — **completo y verificado**. 217/217 tests de activity-service (9 nuevos), 34/34 de app-web, lint verde, build de activity y app-web verde, **migración aplicada contra `activity_db` real** y **suite E2E nueva 3/3 verde, dos corridas** (la segunda junto con la del #18: 7/7).
- **Fecha**: 2026-07-30 / **Spec**: `docs/phases/fase-14-20-obligatorias-que-suman.md` / **Commit**: — (branch `fase-14-roles-grupos-multiples`)
- **Origen**: segunda de las cuatro ideas de José del 2026-07-30. Se ejecutó después del #18 siguiendo el orden justificado al pie de `fase-14-post-mvp.md`.

### Qué decisión revisa
La **decisión 2 del ítem #8** («confirmar una obligatoria vale 0 puntos»). Siguiendo el protocolo, `fase-14-08-confirmacion-obligatorias.md` **no se editó**: la revisión vive en la spec del #20, con su fecha y su motivo.

### Lo ejecutado
- **Schema**: `Actividad.puntosPorCumplir Int @default(0)` + migración `20260731120000_obligatorias_que_suman_fase14` (solo agrega una columna con default → retro-compatible por construcción).
- **Catálogo**: `resolverPuntosPorCumplir` normaliza el campo contra el tipo y el comportamiento efectivos, **en cada PATCH** — mismo patrón que `siempreVisible` (#17) y `bonoJefePuntos` (#9). Fuera de `OBLIGATORIA + REQUIERE_CONFIRMACION` se guarda 0 en vez de rechazar el request.
- **Registro**: el snapshot de una confirmación pasa de `0` a `actividad.puntosPorCumplir`, y la condición de publicación pasa de *"no es una confirmación"* a **`valorPuntosSnapshot !== 0`** — con premio 0 no se publica nada, que es exactamente el comportamiento anterior.
- **El override del «no hizo» ahora compensa**: se leen las confirmaciones vivas antes de darlas de baja y se publica `ActividadRegistroEliminado` por cada una que valía puntos. Sin esto el integrante se quedaba con el premio **y** el castigo (−8 en vez de −10). Era el único camino del ítem capaz de dejar un número incorrecto, y está verificado con números reales en la E2E.
- **Frontend**: campo «Puntos por cumplirla» en el form del tutor, colgado de la misma condición que la confirmación, con vista previa del par (+2 / −10); la tarjeta del catálogo muestra los dos números cuando hay premio; la tarjeta del integrante muestra `+N` como en cualquier opcional (con premio 0 no muestra nada, igual que hoy).
- **Sin tocar `scoring-service`**: ya sabía procesar los dos eventos reusados y ya armaba la cadena de compensación desde el #12.

### Hallazgo de la verificación (NO es una regresión de este ítem)
La E2E destapó una interacción entre los ítems #8 y #12 que nadie había mirado: en la secuencia **confirmar → el tutor marca «no hizo» → el tutor deshace la marca**, el integrante **no puede volver a confirmar** (409 `LIMITE_REPETICIONES_ALCANZADO`) porque el override del «no hizo» da de baja su confirmación y `completar` cuenta las completadas **incluyendo las eliminadas** (regla explícita del #12: el intento se quemó). El neto de la secuencia queda en **0**: deshacer devuelve el castigo, no el premio.

Verificado que **no** hay doble castigo al cierre: `paresPendientes` mira todos los registros de la Sesión sin filtrar `eliminado`, así que el par ya cuenta como resuelto.

Es coherente con la filosofía del #12 (revertir devuelve los puntos, no el intento), pero **contradice en la letra** un criterio de aceptación del #12 —*«el integrante puede confirmar de nuevo»*—, que en realidad solo se cumple cuando no había confirmación previa. Antes del #20 esto era invisible porque la confirmación valía 0. **No se cambió el comportamiento**: es una decisión de producto de José, no algo para resolver de callado en un ítem que no lo tenía en alcance. El test E2E **asserta el comportamiento actual a propósito**, con el comentario que explica por qué, para que un cambio futuro sea deliberado y no silencioso.

### Tests nuevos (9 unit + 3 E2E)
- `actividades.service.spec.ts` (+4): el premio se conserva en OBLIGATORIA confirmable; se fuerza a 0 en opcional, en `ASUME_HECHA` y en equipo; un PATCH a `ASUME_HECHA` lo apaga aunque no lo mande; un PATCH ajeno al tema lo conserva.
- `registro.service.spec.ts` (+5): confirmar con premio publica `ActividadCompletada` con el snapshot correcto; con premio 0 no publica nada; el «no hizo» sobre una confirmación premiada publica además `ActividadRegistroEliminado` apuntando a esa confirmación; sobre una de 0 pts no publica compensación; y el castigo automático sigue siendo `−valorPuntos`.
- `apps/e2e/src/obligatorias-que-suman.e2e.ts` (3): la secuencia completa con **números reales contra el ledger** (+2 → −10 → 0), la garantía de retro-compatibilidad con premio 0, y el apagado del premio donde nadie podría cobrarlo (incluido el PATCH y el 400 por negativo).

### Qué falta / verificar la próxima sesión
1. **Decidir qué hace «deshacer» con la confirmación premiada** (el hallazgo de arriba): hoy devuelve el castigo pero no el premio, y el intento queda quemado. Si José quiere que revertir restaure la confirmación, es un ítem propio — hay que decidir cómo identificar qué confirmaciones dio de baja *ese* «no hizo».
2. **Paseo visual**: el campo nuevo del form y los dos números en la tarjeta se verificaron por build y por contrato de API, no en el navegador.
3. **Desplegar la migración en el piloto**. Retro-compatible: una columna con default 0.

## Ítem 19: Roles del participante dentro del Grupo
- **Estado**: EN_PROGRESO — **completo y verificado**. 244/244 tests de activity-service (27 nuevos), 48/48 de identity (14 nuevos), 39/39 de app-web (5 nuevos), lint y build verdes en los 18 proyectos del workspace (el único fallo del run completo es `admin-web:test`, que no tiene ningún `.spec.ts` — deuda declarada del #5, no una regresión), **ambas migraciones aplicadas contra Postgres real y verificadas sin drift**, y **suite E2E nueva 4/4 verde**, con la suite completa **25/25 en dos corridas seguidas**.
- **Fecha**: 2026-07-31 / **Spec**: `docs/phases/fase-14-19-roles-del-participante.md` / **Commit**: — (branch `fase-14-roles-grupos-multiples`)
- **Origen**: tercera de las cuatro ideas de José del 2026-07-30. Se ejecutó después del #18 y el #20, siguiendo el orden justificado al pie de `fase-14-post-mvp.md`.

### La spec se escribió en esta sesión
A diferencia del #18 y el #20 —que llegaron con su `fase-14-NN-*.md` ya escrito—, el #19 solo tenía las 5 decisiones de alcance del índice. Antes de tocar código se escribió la spec completa, cerrando con José tres huecos que cambiaban materialmente el trabajo:

1. **Una actividad restringida se OCULTA** para quien no tiene el rol (no se muestra deshabilitada). Es el criterio opuesto al del #15/#21 —tareas de equipo y turnos, que sí se ven sin botón— y la razón quedó anotada en la spec: ahí la visibilidad comunica que el reparto es parejo; acá comunicaría ruido permanente, porque el rol no rota.
2. **El catálogo arranca vacío**, sin roles de seed: ningún grupo estrena roles sin pedirlos.
3. **Nombre + `colorHex`**, sin emoji (mismo patrón que `UmbralZona.colorHex`).

Y una cuarta cerrada antes del frontend: **el rol se asigna con un selector en la lista de integrantes**, no desde un panel por rol.

### Desviación de nomenclatura, deliberada
El índice de la fase nombraba `RolGrupo` / **`UsuarioRolGrupo`**. La spec conservó `RolGrupo` pero **la asignación quedó como campo `UsuarioGrupo.rolGrupoId`, no como tabla de unión** (decisión 9, con su justificación escrita). Con un solo rol por participante (decisión 2 del índice) una tabla N:N sería una 1:1 disfrazada, y el invariante habría que sostenerlo con lógica de aplicación — exactamente el dolor que dejó el «un solo JEFE por equipo» del #9, que no se pudo expresar como `@@unique` parcial. Como campo, lo garantiza el esquema. Si algún día se abre multi-rol, la migración es la habitual (tabla nueva + backfill), igual que se hizo con multi-grupo.

### Lo ejecutado
- **identity**: modelo `RolGrupo` (nombre, `colorHex`, archivable, `@@unique([grupoId, nombre])`) + `UsuarioGrupo.rolGrupoId`; `RolesGrupoService`/`RolesGrupoController` con catálogo (el `GET` acepta también sesión USUARIO, decisión 5), alta, edición/archivado y **un solo `PUT` idempotente** para asignar/cambiar/quitar; dos internos nuevos; `UsuarioDto.rolGrupo` y `EquipoMiembroDto.rolGrupo` poblados solo en los endpoints que alimentan pantallas.
- **activity**: `Actividad.rolesPermitidos String[] @default([])` (sin FK — regla 2, se valida por REST interno al escribir), `comun/restriccion-rol.ts` con la regla en un solo lugar, y su aplicación en los **cinco** caminos.
- **app-web**: pantalla «Roles» (junto a «Equipos»), selector de rol por integrante en «Usuarios», campo «Restringir a roles» en el form de Actividad, chips de rol en el catálogo del Tutor y en «Mi equipo», y el aviso «⚠ hoy no la ve nadie».
- **Sin tocar scoring, session, rewards ni notification**, y **sin eventos de dominio nuevos**: las mutaciones de rol se auditan con `AccionAdministrativaRegistrada`, que ya existía (`ROL_GRUPO_CREADO`/`_ACTUALIZADO`/`_ARCHIVADO`, `ROL_PARTICIPANTE_ASIGNADO`).

### Decisiones de implementación que importan
1. **El punto de aplicación que duele es el quinto**: el castigo automático al cerrar la Sesión (`consumo/cierre.service.ts`). Los otros cuatro —lista, detalle, registro, plan del día— fallan a la vista; este no se manifiesta en ninguna pantalla, se manifiesta como puntos negativos inexplicables al día siguiente para alguien que nunca vio esa actividad. Se escribió su test primero, tal como pedía la spec, y tiene además un E2E propio contra el ledger real.
2. **Costo cero cuando el grupo no usa roles** (decisión 13). El cruce REST se paga **solo** si el catálogo consultado tiene alguna actividad restringida — mismo gate que el `necesitaTimezone` que ya vivía en `mi-estado-hoy`. Hay tres tests que lo verifican con espías sobre `IdentityClientService`, uno por camino caliente (listado, `mi-estado-hoy`, cierre de sesión). En los grupos que existen hoy, este ítem no agrega **ni una** llamada.
3. **Un solo interno para el camino caliente**: `GET /internal/identity/grupos/:grupoId/roles-asignados` devuelve `[{ usuarioId, rolGrupoId }]` y nada más. El catálogo completo (`.../roles`) queda para la escritura del catálogo de actividades, que es camino frío. El del payload chico es además el que va a reusar el #21 para el atajo «todos los del rol X».
4. **Archivar desasigna** (decisión 12). Se eligió eso en vez de bloquear el archivado con un 409 `ROL_EN_USO` porque identity **no puede** preguntarle a activity si el rol está en uso sin invertir la dirección de las llamadas internas (hoy activity→identity, nunca al revés). El costo es que la actividad queda pedida por un rol que ya no tiene nadie: por eso el catálogo del Tutor la marca con «⚠ hoy no la ve nadie».
5. **Duplicados normalizados en el service, no solo por `@@unique`**: Postgres distingue mayúsculas, así que «Cocina» y «cocina» pasarían el índice sin problema y nadie entendería cuál es cuál en el selector.
6. **La decisión 11 salió gratis**: una actividad personal del integrante (#10) no puede llevar `rolesPermitidos` porque `datosActividadDesdePropuesta` no toca el campo y el default es `[]`. No hizo falta código de validación — queda anotado acá para que un cambio futuro en ese mapeo no lo rompa en silencio.
7. **El PUT de asignación no es optimista en la UI**: el rol decide qué actividades ve el integrante, y una pantalla que miente sobre eso es peor que una que tarda medio segundo.

### Verificación contra Postgres real
`prisma migrate deploy` aplicó `20260731090000_roles_grupo_fase14` (identity) y `20260731130000_roles_permitidos_fase14` (activity). Ambas se escribieron a mano, así que además se corrió **`prisma migrate diff --from-config-datasource --to-schema`** contra las dos bases: *"No difference detected"* en las dos — el SQL a mano es exactamente lo que Prisma habría generado. Sobre datos reales: las **161 actividades** ya existentes en `activity_db` quedaron todas con `rolesPermitidos = ARRAY[]` y ninguna nula, que es la garantía de retro-compatibilidad del ítem.

### Tests nuevos (46 unit + 4 E2E)
- `roles-grupo.service.spec.ts` (14, nuevo): alta con normalización de nombre y color, duplicado ignorando mayúsculas y espacios, `cantidadAsignados` en el listado del Tutor y su ausencia en el del participante, el participante de otro grupo rechazado, archivar **desasignando** (y no desasignando al renombrar ni al re-archivar), asignar/cambiar/quitar, rol de otro grupo rechazado, y la acción administrativa con el rol anterior.
- `actividades.service.spec.ts` (+13): validación de `rolesPermitidos` contra el catálogo (inexistente, archivado, duplicados), el 400 sobre tarea de equipo, el PATCH que conserva o libera la restricción, el PATCH a EQUIPO que falla en vez de restringir a escondidas, y el filtrado del listado para USUARIO (con rol, con otro rol, sin rol, Tutor ve todo) **incluido el test de costo cero**.
- `cierre.service.spec.ts` (+4): **el test del ítem** — solo castiga a quien tiene el rol, las no restringidas siguen castigando a todos, costo cero sin restricciones, y «nadie con el rol = ningún castigo» (el caso del rol archivado).
- `registro.service.spec.ts` (+7): `mi-estado-hoy` oculta o muestra según el rol, el integrante sin rol, costo cero, el 403 al completar y el 400 del Tutor al marcar «no hizo» fuera del rol.
- `plan-dia.service.spec.ts` (+3): la hoja «＋ Elegir» no es una puerta lateral a lo que la lista oculta.
- `app-web/core/roles-grupo.spec.ts` (5, nuevo): la regla del aviso «hoy no la ve nadie», incluido el rol archivado y el «sin catálogo cargado no afirma nada».
- `apps/e2e/src/roles-del-participante.e2e.ts` (4): la restricción aplicada en lista + catálogo del Tutor + registro a la vez; **el castigo al cierre alcanzando solo a quien tiene el rol** (verificado contra el ledger: Ana −10, Luis 0); archivar desasignando y escondiendo, con el rol archivado ya no asignable; y el aislamiento (rol de otra organización rechazado al asignar y al restringir una actividad, duplicado normalizado, mismo nombre válido en otro grupo).

### Qué falta / verificar la próxima sesión
1. **Paseo visual**: la pantalla «Roles», el selector en la lista de integrantes y los chips se verificaron por build, lint y contrato de API, no en el navegador.
2. **Desplegar las dos migraciones en el piloto**. Retro-compatibles por construcción: tabla nueva vacía + una columna con default.
3. **Fuera de alcance a propósito, anotado para no «aprovechar el viaje»**: rol sobre tareas de equipo (`alcance = EQUIPO` lo rechaza con 400) y rol sobre conductas y recompensas (decisión 4 del índice).
4. **Enganche con el #21**: el atajo «todos los del rol X» para precargar el pozo de turnos ya tiene su interno listo (`roles-asignados`). El #21 no depende de esto para salir, pero sale más barato ahora.

## Ítem 21: Turnos rotativos — a quién le toca la obligatoria
- **Estado**: EN_PROGRESO — **completo y verificado**. 279/279 tests de activity-service (35 nuevos), 44/44 de app-web (5 nuevos), lint y build verdes, **migración aplicada contra `activity_db` real y verificada sin drift**, **suite E2E nueva 5/5 verde** y la suite completa **30/30 en dos corridas seguidas**.
- **Fecha**: 2026-07-31 / **Spec**: `docs/phases/fase-14-21-turnos-rotativos.md` / **Commit**: — (branch `fase-14-roles-grupos-multiples`)
- **Origen**: última de las cuatro ideas de José del 2026-07-30, ejecutada en el orden acordado (18 → 20 → 19 → 21).

### El pedido que cambió el modelo
El índice de la fase describía el turno como **un pozo de participantes que rota uno por uno**. Al empezar la sesión, José pidió que el patrón pudiera ser `José - Luciana - José - Alejandra`: una persona con **más turnos que otra**.

Eso obligó a cambiar el modelo mental antes de escribir una línea: la secuencia pasó a ser **una lista ORDENADA de posiciones**, no un conjunto de participantes. `[José, Luciana, José, Alejandra]` son 4 posiciones y 3 personas, y José recibe 2 de cada 4 turnos **porque aparece dos veces** — la repetición vive en los datos, no en una regla de pesos. Resultó más simple que la rotación pareja, no más complejo.

### Decisiones cerradas con José en esta sesión (12 a 14 de la spec)
1. **Secuencia literal**, no pesos: el Tutor arma la lista tal cual y ve exactamente lo que va a pasar. Con pesos, `[José, Luciana, José, Alejandra]` y `[José, José, Luciana, Alejandra]` serían indistinguibles, y son repartos distintos.
2. **El azar baraja las POSICIONES, no las personas**: cada vuelta sigue teniendo 4 turnos y José sigue teniendo 2, lo que cambia es cuáles. Barajar personas destruiría el patrón apenas se enciende el modo azar.
3. **Las altas y bajas del grupo NO editan la lista sola**: el sistema avisa y saltea, pero la secuencia es del Tutor. Ajustarla automáticamente cambiaría el reparto sin que él lo decidiera.
4. Del frontend: **armador con lista + botón «agregar»** (repetir a alguien es elegirlo de nuevo) y la tarjeta del que no tiene el turno **apagada con «hoy le toca a Ana»**.

### Decisiones de implementación que importan
1. **La vuelta se sella entera al empezarla** (`VueltaTurno.ordenUsuarioIds`), no turno por turno. Es lo que hace el azar auditable —la vuelta ya está decidida y escrita— y lo que resuelve limpio el caso de editar la secuencia a mitad de vuelta: no toca la vuelta en curso, entra en la siguiente. Se guarda **también en modo ORDEN_FIJO**, a propósito, para que los dos modos se comporten idéntico ante una edición.
2. **El turno nunca se deriva de una fórmula sobre la fecha** (decisión 1 del índice): sale siempre de la última `AsignacionTurno` escrita. Si se derivara, cambiar la lista reescribiría el pasado y sería imposible auditar por qué se castigó a alguien.
3. **Sin cola nueva**: `activity.q.sesiones` (creada por el #8) pasa a escuchar también `session.sesion_abierta`. Se suma la routing key al binding existente, sin cambiar las opciones de la cola.
4. **Con turno activo, la obligatoria deja de ser de todos**: en `cierre.service.ts` el único par candidato es (asignado, actividad). Es el mismo punto ciego que el rol del #19 —no se ve en ninguna pantalla— y por eso tiene test propio y E2E contra el ledger.
5. **Rol (#19) y turno se combinan por intersección**: una posición de alguien que perdió el rol se saltea igual que la de alguien que se fue. Si ninguna queda válida, ese día no hay turno y **nadie es castigado** — preferible a elegir un reemplazante que el Tutor no decidió.
6. **Idempotencia con un hueco cerrado a mano**: la creación de la vuelta tolera `P2002` y reusa la permutación existente. Sin eso, una reentrega tras un fallo parcial moriría en el unique y —peor— en modo AZAR volvería a barajar, cambiando el reparto a mitad de vuelta.
7. **Costo cero cuando no se usa**: sin rotaciones activas, el consumidor no consulta identity y el registro no resuelve ni Sesión ni asignación (una consulta local barata primero). Verificado con tests.

### Tests nuevos (35 unit + 5 E2E)
- `rotacion-turnos.spec.ts` (12, nuevo): la aritmética pura — el recorrido `José, Luciana, José, Alejandra`, la proporción conservada en AZAR, los dos motivos de salteo, la vuelta sin nadie válido y el corte al final de la vuelta.
- `sellado-turnos.service.spec.ts` (13, nuevo): cuatro días seguidos con el patrón, la vuelta 2 arrancando en José, la vuelta sellada entera, los salteos por baja y por rol, el día no programado que **no consume turno**, la reentrega que no avanza dos veces, el caso del #16 (varias sesiones seguidas), la frecuencia SECCION y el costo cero.
- `cierre.service.spec.ts` (+6): **el test del ítem** — solo el asignado recibe el NO_HIZO; el asignado que ya confirmó; el día sin turno que no castiga a nadie; la obligatoria sin rotación que sigue castigando a todos; el turno apagado; y el castigo siguiendo al **reasignado**.
- `registro.service.spec.ts` (+6): confirmar del asignado (con el premio del #20), 403 `NO_ES_TU_TURNO`, 409 `SIN_TURNO_VIGENTE`, 400 `NO_ES_SU_TURNO` para el Tutor, y `mi-estado-hoy` con `esMio` en ambos sentidos.
- `app-web/core/turnos.spec.ts` (5, nuevo): el resumen «José: 2 de cada 4», que no repite lo obvio cuando nadie está repetido.
- `apps/e2e/src/turnos-rotativos.e2e.ts` (5): el patrón día por día contra el bus real, la tarjeta visible pero no confirmable, el castigo del cierre contra el ledger, la reasignación con su rastro, y la validación + apagado.

### Hallazgo de la verificación (no es un bug del ítem)
Al escribir la E2E quedó a la vista que en **modo MANUAL cerrar una sesión no abre la siguiente**: `forzar-cierre` solo publica `SesionCerrada`, y hace falta `abrir-siguiente` para que salga el `SesionAbierta`. Es el comportamiento correcto de la Fase 6 (en manual el Tutor decide cuándo empieza el día), pero conviene tenerlo presente: **un grupo en modo manual no sella turnos hasta que alguien abre la sesión del día**. En modo automático lo hace el scheduler (con la recuperación del #16), que es el caso normal del piloto.

### Qué falta / verificar la próxima sesión
1. **Paseo visual**: el armador de la secuencia y la tarjeta «hoy le toca a…» se verificaron por build, lint y contrato de API, no en el navegador.
2. **Desplegar la migración en el piloto**. Retro-compatible por construcción: **no toca la tabla `Actividad`** — una actividad sin fila en `TurnoActividad` se comporta exactamente como antes.
3. **Turnos sobre opcionales**: la spec lo deja fuera (decisión 11 del índice) y el endpoint lo rechaza con 400. Extenderlo sería una validación menos, no un rediseño.
4. **El armador solo aparece al EDITAR una actividad**, no al crearla: guardar la secuencia necesita el id, que todavía no existe. Si molesta, se resuelve guardando la actividad primero y abriendo el bloque después — es cambio de flujo de UI, no de backend. → **Resuelto por el #23 T1 (2026-08-01)**, junto con el resto de los pendientes 1 y 4 de esta lista.

## Ítem 23 · Tanda 1: Turnos visibles y guardado único

- **Estado**: EN_PROGRESO (el ítem es por tandas; **la T1 está completa y verificada**). 58/58 tests de app-web (14 nuevos), 279/279 de activity-service **sin tocar el backend**, lint y build verdes, **suite E2E de navegador nueva 3/3 en dos corridas** y la suite completa **34/34** contra el stack local.
- **Fecha**: 2026-08-01 / **Spec**: `docs/phases/fase-14-23-claridad-del-area-del-tutor.md` / **Commit**: — (branch `fase-14-tienda-de-monedas`)
- **Origen**: José, usando la app, reportó tres molestias —no saber si algo quedó guardado, no encontrar dónde está cada cosa, pantallas sobrecargadas— y pidió un orden para revisarlas. Al acotar la primera, la señaló con precisión: *«lo de los turnos no se sabe… no se sabe si la actividad es por turnos o es uno cualquiera»*, aclarando que no era problema de redacción.

### El problema: no era redacción, era que el dato no estaba en la pantalla

Cuatro hallazgos, verificados en el código antes de decidir nada:

1. **La lista de actividades nunca decía que una actividad rota.** La tarjeta tenía chips para equipo, siempre-a-la-vista, roles, días y autor; para turnos, ninguno. Y no era un olvido de maquetado: el turno se pedía **de a una actividad y solo al abrir el modal de edición**, así que el dato no existía en esa pantalla.
2. **El endpoint que lo resuelve existía desde el #21 y no lo usaba nadie.** `GET /activity/grupos/:grupoId/turnos-de-hoy` se construyó «para el panel operativo», tiene cliente en `activity-api.service.ts` y cobertura E2E — y **ninguna pantalla lo llamaba**. La función estaba entera; faltaba el cable.
3. **El modal tenía dos modelos de guardado incompatibles**: el formulario persistía en el submit y el bloque de turnos tenía **su propio «Guardar turnos»** que pegaba contra la API al instante. Dos consecuencias reproducibles: armar la secuencia y apretar el «Guardar» principal **no guardaba los turnos**; apretar «Guardar turnos» y después **Cancelar** los dejaba guardados igual.
4. **Destildar «Por turnos» borraba la rotación en el acto**, sin confirmación: el `DELETE` salía en el mismo `change` del checkbox.

El diagnóstico que importa para las tandas siguientes: **el backend siempre estuvo bien**. La sensación de «esto no quedó guardado» no venía de un dato que faltara sino de una pantalla que no lo pedía y de un formulario con dos dueños. Es el modo de falla que produce construir ítem por ítem sin revisar el conjunto — cada pieza correcta, el conjunto incoherente.

### Decisiones de José en esta sesión
1. **El chip dice a quién le toca hoy** (`🔁 Hoy: Luciana`), elegido sobre «`🔁 Por turnos · cada día`»: responde de una vez si rota y quién, y la segunda es la pregunta del día a día.
2. **La ausencia del chip significa «es de todos»** — no se agrega un chip `De todos`: la tarjeta ya llega a cinco chips.
3. **Un solo Guardar**, sobre las alternativas de «dos botones pero que se note» y «sacar turnos a su propia pantalla».
4. Sobre lo visual, en general para el ítem: pulido dentro de la identidad actual, con libertad de rediseñar donde el rediseño sea lo que resuelve la molestia.

### Decisiones de implementación que importan
1. **Cero backend.** Ni endpoint, ni DTO, ni migración: los cuatro hallazgos se resolvieron en `app-web`. Los 279 tests de activity-service quedaron intactos y verdes, que es la prueba de que el alcance se respetó.
2. **El armador pasó a ser un componente CONTROLADO**: perdió `actividadId`, el `ActivityApiService`, su botón, su toast y el `apagar()` inmediato. Emite `EstadoTurnoForm` y el formulario contenedor decide. Es el patrón que se replica en las tandas siguientes: *un formulario, un botón, cancelar cancela*.
3. **`accionDeTurno` (en `core/turnos.ts`, testeado aparte) decide qué mandar.** Con un solo submit la pregunta «¿hay algo que persistir?» deja de ser obvia. El caso que justifica la función: **sin cambios no se manda nada**, porque un PUT idempotente igual sellaría una vuelta nueva de la rotación (decisión 15 del #21) — guardar la actividad sin haber tocado los turnos no debe cambiar a quién le toca mañana.
4. **El turno va segundo y encadenado** (`switchMap`) porque al crear no hay id hasta que el servidor responde: exactamente el motivo por el que el bloque antes solo existía al editar. Si el turno falla con la actividad ya guardada, se recarga igual, para que la pantalla muestre lo que quedó y no lo que se intentó.
5. **La rotación activa y vacía ahora se avisa.** Antes lo impedía un botón deshabilitado; sin ese botón hacía falta decirlo, en el bloque y al intentar guardar.

### La suite E2E de navegador (primera del repo)
`apps/e2e/src/turnos-visibles.e2e.ts` (3 tests, gated por `E2E_UI=1`). El resto de la suite es API-first a propósito, pero **acá el objeto de prueba es la pantalla**: los cuatro defectos son invisibles desde la API —«cancelar y que igual quede guardado» no es un estado ilegal del sistema— y solo se manifiestan en la secuencia de clics. Cubre: la lista sin chip / con chip tras guardar (verificando contra la API que el mismo botón guardó las dos cosas), que Cancelar no guarde lo nuevo **ni apague lo que había**, y que el armador exista al crear.

Se sumó `emailContacto`/`password` a `Organizacion` en `support/escenario.ts` — aditivo — porque el login por UI no tiene atajo: el access token vive en memoria (regla 7), así que no se puede inyectar sesión por storage.

**Dos peleas con el entorno, resueltas del lado del test y no del de producción** (mismo criterio que el #17 con su 429):
- **429 del Gateway**: con una organización y un login por test, la suite se comía las 100 req/min y el navegador —a diferencia de `support/api.ts`— no reintenta. Se resolvió con **un escenario, una pestaña y un login para toda la suite**, y agrupando los casos por flujo en vez de uno por criterio: cada `goto` de esa pantalla cuesta seis llamadas.
- **Un falso negativo que casi se confunde con un bug de la app**: el test leía la API inmediatamente después del click en Guardar y la encontraba vacía. El PUT salía y respondía 200; lo que faltaba era esperar a que el modal se cerrara, que es lo que marca el fin del encadenado PATCH → PUT. Vale anotarlo porque el síntoma («el turno no se guardó») era idéntico al defecto que este ítem corrige.

### Qué falta / verificar la próxima sesión
1. **El chip `Hoy: <nombre>` con nombre real** se verificó por unit test, no en el navegador: la E2E corre en modo MANUAL y sin Sesión abierta no hay turno sellado, así que el navegador vio la variante `Por turnos`. Cubrir la otra exige abrir sesión y esperar el sellado por el bus — se hace cuando la T4 vuelva sobre esta pantalla.
2. **`turnos-de-hoy` es N+1 en llamadas a session-service**: itera las actividades rotativas y cada `asignacionVigente` resuelve la Sección por REST. Preexistente del #21 y acotado (solo actividades con rotación activa; cero consultas si el grupo no usa turnos), pero está a un `Map` de resolverse. **No se tocó porque la T1 declara alcance cero-backend**; queda para cuando haya otro motivo para entrar ahí.
3. **Turno huérfano al cambiar el tipo de actividad**: si una obligatoria con rotación pasa a OPCIONAL o a EQUIPO, el bloque desaparece y la fila de `TurnoActividad` queda activa sin efecto. Es preexistente —la T1 no cambió el comportamiento— y no rompe nada porque el cierre solo mira obligatorias. Anotado por si conviene apagarla explícitamente.
4. **Cierra tres pendientes del #21**: el 1 (paseo visual, ahora cubierto por navegador) y el 4 (el armador solo al editar) quedan resueltos; el 2 (desplegar la migración) sigue abierto y no depende de esto.
5. **Siguiente: la T2** (patrones a `libs/shared-ui`), que hoy tiene solo tres componentes (`ConfirmDialog`, `ZonaBadge`, `EstadoSeccionBadge`) mientras el resto está copiado a mano en cada página.

   **Inventario relevado el 2026-08-01, para no volver a buscarlo** (`apps/app-web/src/app`, contando la cadena de clases literal):

   | Patrón | Clase que se repite | Ocurrencias | Archivos |
   |---|---|---|---|
   | Tarjeta / panel | `rounded-2xl border border-slate-200 bg-white` | 44 | 29 |
   | Campo de formulario | `rounded-lg border border-slate-300 px-3 py-2 text-sm` | 64 | 18 |
   | Estado vacío | `border-dashed border-slate-300` | 30 | 25 |

   Los tres cubren prácticamente toda la superficie del área Tutor, y **el orden de extracción debería ser ese**: la tarjeta es la que más archivos toca (29) y la que fija el ritmo visual; el campo es el que más se repite por archivo (15 veces solo en `actividades.page.ts`) y es el que tiene que quedar alineado con el contrato de guardado que salió de la T1; el estado vacío es el más barato y el que más se nota, porque hoy cada pantalla redacta el suyo.

   Cuidado al entrar: `actividades.page.ts` (1182 líneas), `panel-operativo.page.ts` y `configuracion-sesion.page.ts` concentran los tres patrones a la vez — conviene extraer contra una pantalla chica primero (`roles-grupo.page.ts` o `tutores.page.ts`) y recién después bajarlo a las grandes.

## Ítem 23 · Tanda 2: Patrones a `shared-ui`

- **Estado**: EN_PROGRESO (el ítem es por tandas; **la T2 está completa y verificada**). 58/58 tests de app-web y **18/18 de shared-ui (los 18 son nuevos: la librería no tenía ningún test de componente)**, lint y build verdes, y la **suite E2E completa 34/34 en dos corridas seguidas** contra el stack local. **Cero backend**, igual que la T1.
- **Fecha**: 2026-08-02 / **Spec**: `docs/phases/fase-14-23-claridad-del-area-del-tutor.md` (sección «Tanda 2», escrita en esta sesión) / **Commit**: — (branch `fase-14-tienda-de-monedas`)
- **Origen**: el inventario que la T1 dejó anotado el 2026-08-01, ampliado al empezar esta sesión.

### El inventario creció al re-contarlo, y en la dirección que importaba

El relevamiento preliminar de la T1 listaba tres patrones (tarjeta 44/29, campo 64/18, estado vacío 30/25). Al re-contar antes de escribir la spec aparecieron dos cosas que cambian el encuadre:

1. **El modal no estaba contado y era la duplicación más cara.** Quince pantallas del área Tutor reescribían las mismas doce líneas, **once de ellas con las clases del panel idénticas carácter por carácter** (`max-w-md` ×7, `max-w-sm` ×4). Y es el patrón con más superficie de accesibilidad: ninguna de las quince declaraba `role="dialog"` ni `aria-modal`, ni cerraba con Escape. La única implementación correcta del repo era `ConfirmDialog`, que nadie reusó para los formularios.
2. **Dieciséis de los sesenta y cuatro campos no tenían anillo de foco.** No era una variante de diseño: era la cadena completa **menos** `focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none`. En esos dieciséis, navegando con Tab no se veía dónde estaba el cursor (WCAG 2.4.7). Nadie lo eligió — salió de copiar la cadena equivocada.

Y la lectura de fondo, que es lo que justifica que la tanda exista: **casi toda la divergencia era espaciado**. Las 10 formas de tarjeta son una sola con `p-4`/`p-3`/`p-3.5`/sin padding; los 9 botones primarios son dos tamaños tipeados distinto cada vez; los 12 estados vacíos son uno solo con `mt-6`/`mt-5`/`mt-4`/`mt-3`. No había decisiones de diseño detrás — había tipeo.

### Decisiones de José en esta sesión
1. **Forma mixta**: clase CSS para lo que es solo piel (tarjeta, campo, botón, etiqueta, botonera), componente para lo que tiene estructura (modal, estado vacío, campo con etiqueta). Sobre las alternativas «todo componente» (obligaba a un `input` por cada variante de layout de las 44 tarjetas) y «todo clase CSS» (dejaba el modal copiado quince veces).
2. **Migración del área Tutor completa**, las tres grandes incluidas, sobre «solo las chicas y medianas»: dejar las grandes para la T4 haría convivir dos estilos justo donde más se nota.
3. **La extracción corrige el foco en los dieciséis**, sobre conservar una variante «sin foco» para no mover nada visualmente.

### Decisiones de implementación que importan
1. **Las clases traen el caso dominante incluido** (`.tarjeta` con `p-4`, `.campo` con `w-full`) porque **Tailwind 4 ordena `components` antes que `utilities`**: una utilidad en el markup siempre las pisa. Así `class="tarjeta p-0"` funciona y la excepción queda a la vista en el markup, en vez de escondida en otra cadena de doce clases. Es lo que permitió colapsar las 10 variantes de tarjeta en una clase sin perder ninguna.
2. **El `<form>` lo pone la página adentro del `<ui-modal>`**, no lo provee el componente. Es lo que deja el submit en manos del formulario — el contrato que salió de la T1 (*un formulario, un botón, cancelar cancela*) — sin que el modal tenga que reenviar eventos.
3. **`.btn-primario`/`.btn-secundario` no se tocaron.** Son los CTA grandes de marca que comparte `public-site`; el botón de un panel de gestión es otra cosa. Las clases nuevas van en español (`.boton`, `.boton-primario`, `.boton-neutro`, `.boton-peligro`, `.boton-sm`) como el resto del código.
4. **Los `@if (x(); as alias)` que envolvían un modal se resolvieron con el `@if` ADENTRO del `ui-modal`**, no reescribiendo el alias: el modal decide visibilidad (`[abierto]="x() !== null"`) y el `@if` sigue estrechando el tipo. Menos churn y sin tocar la lógica.
5. **Tres pasadas mecánicas con script, el resto a mano.** Las cadenas de clases (225 reemplazos), los estados vacíos (17) y los pares etiqueta+campo (38) son suficientemente regulares para automatizar casando `</div>`/`</label>` **por profundidad, no con una regex glotona**. Los 15 modales se hicieron a mano: la condición del `@if` y el título varían pantalla por pantalla, y un error ahí rompe un modal en silencio.
6. **`ui-campo` y `ui-estado-vacio` llevan `host: { class: 'block' }`**: un custom element es inline por defecto, y sin eso el `class="mt-6"` que le pone la página no hace nada.

### La regresión que encontró la E2E (y que ningún unit test iba a encontrar)

Con tests, lint y build **todos verdes**, la E2E de navegador de la T1 falló dos de sus tres casos. La causa es una diferencia de semántica que el `ui-modal` introdujo sin que se note:

**El contenido proyectado lo crea la PÁGINA, no el modal.** El `@if (abierto())` que vive adentro de `ui-modal` controla su propio template, pero no destruye lo que le proyectan. Antes de la T2 cada modal estaba envuelto en su propio `@if` en la página, que **sí** destruía el formulario al cerrar. Al reemplazar ese `@if` por `<ui-modal [abierto]>`, el formulario dejó de destruirse: **todo estado de un componente hijo sobrevive al cierre y reaparece al reabrir**.

El síntoma concreto: `app-turnos-actividad` guarda `activo`, `secuencia`, `modo` y `frecuencia` en signals propios, y solo los resetea cuando cambia su input `turno`. Después de armar una secuencia y **cancelar**, el siguiente modal abría con la casilla «Por turnos» ya tildada; el click del test la **destildaba** y el armador nunca aparecía. Es exactamente el tipo de defecto que este ítem existe para eliminar —«no sé si esto quedó guardado»— y lo habría reintroducido en las quince pantallas a la vez.

**Corregido** devolviendo el `@if` a la página, adentro del `ui-modal` (`<ui-modal [abierto]="x()"> @if (x()) { <form>…</form> } </ui-modal>`), en los 9 modales que no lo tenían; los otros 6 ya lo tenían por su `@if (…; as alias)`. Queda documentado en el JSDoc de `ModalComponent` porque **no es evidente leyendo el componente**: el `@if` de la página parece redundante con el `[abierto]` y no lo es.

Vale anotar el método: los 58 unit tests de app-web y los 18 de shared-ui pasaban con la regresión adentro. Solo la aparece una secuencia real de clics —abrir, armar, cancelar, reabrir—, que es justo lo que la T1 argumentó al escribir la primera E2E de navegador del repo.

### Lo que se agregó y no existía
- `<ui-modal>`: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` al título, **cierre con Escape** y foco llevado al primer campo del modal al abrir (antes quedaba en el botón que lo abrió, atrás del fondo).
- `.campo`: anillo de foco en los 64, no en 48.
- `.boton`: `focus-visible:ring` en los 66 botones del área.

### Tests nuevos (18, todos en shared-ui)
`libs/shared-ui` no tenía **ningún** test de componente antes de esto (solo el `should create` del scaffold). Los tres componentes nuevos se probaron con un **componente anfitrión**, no aislados: los tres son controlados o proyectan contenido, y aislados no se ejercita lo que importa.
- `modal.component.spec.ts` (9): `aria-modal`, `aria-labelledby` apuntando al título real, **Escape que emite `(cerrar)` sin cerrarse solo** (el padre manda), el click en el fondo, el foco al primer campo, los tres anchos y el `<form>` proyectado adentro del panel.
- `estado-vacio.component.spec.ts` (4): icono/título/detalle, el icono `aria-hidden`, el caso sin icono ni título y el borde punteado.
- `campo.component.spec.ts` (5): el `<label>` que envuelve al control, la ayuda, el error tapando la ayuda con `role="alert"` y el `(opcional)`.

**Un hallazgo del entorno, anotado para la próxima**: `shared-ui` corre sus tests **con zone.js**, a diferencia de `app-web` que es zoneless. El fixture no auto-detecta, así que `await fixture.whenStable()` sola no renderiza nada y todas las aserciones de DOM dan vacío — hace falta `fixture.detectChanges()` antes. Los primeros 13 de 18 fallaron por eso y el síntoma (`expected '' to contain …`) parecía un componente roto.

### Verificación de los criterios de aceptación

| # | Criterio | Cómo se verificó |
|---|---|---|
| 1 | Las cuatro cadenas ya no aparecen en `paginas/tutor` | `grep`: 0 archivos para las cuatro. Los dos `border-dashed` que quedan **no son estados vacíos** (una fila informativa en `guia-primeros-pasos` y una nota chica en `turnos-actividad`) y se dejaron a propósito. |
| 2 | Los 64 campos con anillo de foco | Está en `.campo`, que es la única forma que quedó. |
| 3 | Los 15 modales con Escape y `role="dialog"` | Unit test del `ui-modal` + los 15 pasaron a usarlo. |
| 4 | El contrato de la T1 intacto | El `<form>` sigue siendo de la página; ninguna acción se movió al modal. |
| 5 | El área Usuario sin cambios | `git diff --name-only` → **0 archivos** en `paginas/usuario`. |
| 6 | Backend sin tocar | Ningún archivo de servicio en el diff. |
| 7 | Lint y build verdes, tests con los casos nuevos | 58/58 app-web + 18/18 shared-ui, lint y build de ambos. |

Y además, **la suite E2E completa 34/34 en dos corridas seguidas** contra el stack local (incluida la de navegador de la T1, que es la que destapó la regresión del proyectado).

### Peleas con el entorno, para no repetirlas
- **`scripts/e2e-up.mjs` falló tres veces antes de levantar**, siempre por el mismo flake: el **worker de plugins de Nx** muere por timeout (`Plugin worker … exited unexpectedly` a los 10s) al arrancar los 9 `serve` a la vez, tumba uno distinto cada vez (session-service, después gateway) y dispara el teardown completo. Se resolvió con `nx daemon --start` + `NX_PLUGIN_NO_TIMEOUTS=true`. **Ojo con `--no-infra`**: si un teardown anterior bajó los contenedores, la migración muere con `P1001` y parece otro problema.
- **La suite falló una vez con 32/34** (los dos casos de `turnos-visibles`) y pasó 34/34 las dos corridas siguientes. Se verificó que **no era rate limit**: cero respuestas `429` en todo el log del stack. Es timing en la carga de la lista; anotado por si reaparece.
- **El smoke UI de `flujo-completo` necesita `public-site` en :4321**, que `e2e-up.mjs` no levanta. Sin eso falla con un `goto` a un puerto muerto y parece un bug de la app.

### Qué falta / verificar la próxima sesión

1. **Paseo visual**: la migración se verificó por tests, lint, build, `grep` de las cadenas y la E2E de navegador, **pero no mirando las 16 pantallas una por una**. Los tres cambios de comportamiento deliberados (anillo de foco donde no había, Escape que cierra, foco que entra al modal) conviene verlos.
2. **`shared-ui` ahora tiene tests de componente**: si se agregan más, arrancar por el patrón de componente anfitrión + `detectChanges()` que quedó en los tres specs, para no repetir el rato perdido con zone.js.
3. **Cuidado al meter un `<ui-modal>` nuevo**: va **siempre** con su `@if` adentro. Sin él, el estado del formulario sobrevive al cierre (ver la regresión de arriba) y no lo va a detectar ningún unit test.
4. **La T3 (navegación) hereda terreno parejo**, que era el punto de hacer la T2 antes: la pantalla de configuración del grupo que propone la T3 se arma con `ui-modal`, `ui-campo` y las clases, sin inventar nada.
5. **Fuera de alcance a propósito**: el área Usuario (decisión 4 de la tanda) y los patrones con una sola forma de uso (pestañas, chips de filtro, interruptores). Si la T4 los toca en más de una pantalla, ahí conviene bajarlos a `shared-ui`.

## Ítem 23 · Tanda 3: Navegación del área Tutor

- **Estado**: EN_PROGRESO (el ítem es por tandas; **la T3 está completa y verificada**). 70/70 tests de app-web (12 nuevos), 18/18 de shared-ui, lint y build verdes, y la **suite E2E completa 37/37 en dos corridas seguidas** (3 de ellos nuevos). **Cero backend**, igual que la T1 y la T2.
- **Fecha**: 2026-08-02 / **Spec**: `docs/phases/fase-14-23-claridad-del-area-del-tutor.md` (sección «Tanda 3», escrita en esta sesión) / **Commit**: — (branch `fase-14-tienda-de-monedas`)
- **Origen**: el síntoma 2 de los tres que José reportó el 2026-08-01 —«no encontrar dónde está cada cosa»—, relevado esta vez **mirando las 16 pantallas**.

### La herramienta que hizo falta para poder decidir

Las tandas 1 y 2 se diagnosticaron leyendo código. La T3 es sobre *dónde está cada cosa*, y eso no se ve leyendo archivos sueltos: hay que mirar el área entera de una sentada. Se escribió `apps/e2e/src/capturas-tutor.e2e.ts` —gated por `E2E_CAPTURAS=1`, **no verifica nada**— que arma un grupo cargado, recorre las 16 pantallas y deja una captura de cada una. Sirvió para las dos cosas de esta sesión: **cerrar el pendiente 1 de la T2** (el paseo visual que había quedado sin hacer) y relevar la T3 sobre hechos y no sobre memoria.

Dos cosas que salieron de mirar y no se habrían visto de otro modo:
- **«Primeros pasos» aparecía TRES veces en la misma pantalla**: ítem del menú, tarjeta del Resumen y píldora flotante, las tres al mismo destino.
- **El Resumen, sin Sección activa, era una sola tarjeta vacía** con dos botones del mismo peso («Configurar sesión» y «Panel de la semana»), ninguno de los cuales era claramente el siguiente paso.

Y una que la herramienta **descartó**: el contador de la guía parecía inconsistente entre pantallas (3/6 en una, 4/6 en otra). Al capturar todo contra la misma organización quedó claro que eran dos orgs distintas de dos corridas. No se reportó como hallazgo.

### El diagnóstico

1. **La configuración vivía en seis lugares y tres no tenían pantalla propia**: modo de recompensas (arriba del catálogo de `/recompensas`), plan del día y contenido de los integrantes (los dos arriba del catálogo de `/actividades`, ocupando el primer tercio de una pantalla a la que se entra a ver otra cosa). Y **ninguno de los seis decía en qué estado estaban los otros cinco**.
2. **El menú mezclaba lo diario con lo que se define una vez**: el grupo «Sistema de puntos» juntaba **Zonas** —se configura al empezar y no se vuelve— con **Entregas**, que se usa todas las semanas.

### Decisiones de José en esta sesión
1. **Hub que edita lo chico y linkea lo que es CRUD**: los cuatro interruptores se editan en `/configuracion`; Zonas y Roles siguen siendo pantallas propias y desde el hub se ve su estado. Sobre «todo adentro» (metía dos listas con modales en una pantalla ya larga) y «índice de solo lectura» (no sacaba los interruptores de donde estaban escondidos).
2. **Menú de cuatro grupos** (*Día a día* / *Catálogo* / *Gente* / *Ajustes*), sobre el corte binario «usar/configurar» y sobre dejarlo como estaba.
3. **El home muestra las cuatro cosas**, y José preguntó explícitamente si no era demasiado. La respuesta de diseño —que aprobó viendo el boceto— es **jerarquía, no paralelo**: una sola cosa grande, «te esperan» **condicional** (sin pendientes el bloque no existe y quedan tres), «Hoy» en tres líneas con «ver todo», y «cómo van» como **fila** por persona y no tarjeta.

### Decisiones de implementación que importan
1. **Los bloques del hub agrupan por LA PREGUNTA que responden, no por el servicio que los guarda.** «Qué se gana» cruza rewards y scoring; «qué ve el integrante» cruza activity e identity. Al tutor esa frontera no le significa nada, y agrupar por servicio habría reproducido el problema que la tanda viene a resolver.
2. **`/configuracion-sesion` redirige en vez de desaparecer.** Es la única ruta del área que alguien pudo haber guardado, y además el «Configurar sesión» del Resumen apuntaba ahí.
3. **Las pantallas de catálogo conservan una línea de estado que linkea al hub** (`Plan del día: apagado · Contenido: restrictivo — Ajustes →`). Mudar un control sin dejar rastro convierte «no sé dónde está» en «desapareció», que es peor.
4. **`actividades.page.ts` sigue leyendo la config aunque ya no la edite**: el modo habilita la pestaña «Propuestas» y el plan del día habilita «siempre a la vista» en el modal. Se fue el formulario, no la lectura.
5. **`ModoRecompensasComponent` se mudó de padre sin tocarlo** —ya era controlado, con su propio diálogo de confirmación— salvo por sacarle su tarjeta: adentro del bloque del hub daba borde sobre borde.
6. **La acción principal del home es UNA sola** y sale de `accionPrincipal()` en `core/home-grupo.ts`, testeada aparte: sin Sección «Iniciar la primera semana», en EVALUACION «Ir a evaluación», en manual sin sesión abierta «Abrir la sesión de hoy», y si no «Registrar lo de hoy». **En automático no ofrece abrir la sesión**, porque ahí la abre el scheduler y el botón mentiría.

### Tests nuevos (12 unit + 3 E2E)
- `core/home-grupo.spec.ts` (12, nuevo): los seis caminos de `accionPrincipal` —incluido el que distingue manual de automático—, el progreso hacia la zona siguiente (piso, techo, **la zona sin tope que se muestra llena y no a medias**, sin umbrales, y un puntaje fuera de todo tramo) y la concordancia singular/plural de los pendientes.
- `apps/e2e/src/navegacion-tutor.e2e.ts` (3, nuevo): el hub mostrando las seis y guardando desde ahí + la redirección de la ruta vieja; el catálogo sin configuración arriba pero con el rastro que linkea; y el menú de cuatro grupos con la guía **una sola vez** y el home ofreciendo una sola acción.

### Peleas con el entorno
- **El home es ahora la pantalla más cara del área: nueve llamadas** (sección, usuarios, puntajes, umbrales, config de scoring, config de sesión, historial, reportes y entregas). Con un test de E2E por criterio, la cuarta carga se pasaba de las **100 req/min** del Gateway, el 429 le pegaba al refresh silencioso y la pestaña volvía al login. Se resolvió **agrupando menú y home en un solo caso**, que es la misma lección que la T1 ya había dejado escrita. Queda anotado como deuda: si el home se vuelve más pesado, conviene un endpoint de resumen en vez de nueve llamadas.
- La herramienta de capturas también pega contra los dos límites: **una pausa de ventana cada 6 pantallas** y **reintento del login** (`/auth/login` tiene el límite estricto de 10/min, y correrla varias veces seguidas mientras se la ajusta lo agota).
- **Un backtick dentro de un comentario HTML** en un template literal de Angular corta el template y produce `TS: template must be a string / Value could not be determined statically`, más warnings falsos de «componente importado y no usado». El síntoma no se parece a la causa.

### Qué falta / verificar la próxima sesión
1. **El home con Sección activa no se vio en el navegador**: las capturas y la E2E corren sin Sección abierta, así que «Cómo van» con sus barras y «te esperan» con pendientes reales se verificaron por unit test y contrato, no mirando. Se cubre cuando la T4 vuelva sobre el panel operativo.
2. **Las nueve llamadas del home** (punto de arriba). No es un problema hoy —el piloto es un grupo chico— pero es lo primero que va a doler si crece.
3. **`guia-flotante.component.ts` se eliminó**: si en algún momento se quiere volver a un recordatorio flotante, conviene que **no duplique** algo que ya está en pantalla.
4. **Siguiente: la T4** (pantalla por pantalla, de la más recargada a la más simple). El orden que fija la spec arranca por Actividades, que **acaba de bajar de 1399 a ~1290 líneas** al mudarse los dos bloques de configuración — parte del trabajo de la T4 ya está hecho.

---

## Ítem 23 · Tanda 4: Las dos pantallas más cargadas

- **Estado**: EN_PROGRESO (el ítem es por tandas; **la primera vuelta de la T4 está completa y verificada**). 82/82 tests de app-web (12 nuevos), **283/283 de activity-service (4 nuevos)**, 24/24 de shared-ui (6 nuevos), lint y build verdes, y la **suite E2E completa 42/42 en dos corridas seguidas** (5 de ellos nuevos).
- **Fecha**: 2026-08-02 / **Spec**: `docs/phases/fase-14-23-claridad-del-area-del-tutor.md` (sección «Tanda 4», escrita en esta sesión) / **Commit**: — (branch `fase-14-tienda-de-monedas`)
- **Origen**: el síntoma 3 de los que José reportó el 2026-08-01 —«pantallas sobrecargadas»—, relevado esta vez **con Sección abierta y registros hechos**: las pantallas operativas vacías no sirven para juzgar si están recargadas, y las capturas de la T3 se habían sacado sin Sección.

### El hallazgo: la acción más frecuente del día no existía en ninguna pantalla

**El Tutor no podía marcar «completó».** No era una decisión de producto: `POST /activity/actividades/:id/completar` declara `@Roles(USUARIO, TUTOR, ORG_ADMIN)` desde el #8, acepta `usuarioId` en el body **y lo audita** —queda registrado quién lo marcó—, y el cliente del frontend ya tenía la firma exacta (`completarActividad(actividadId, usuarioId?)`). Lo llamaba una sola pantalla, la del integrante, y sin `usuarioId`.

Es **el mismo modo de falla que la T1 encontró con `turnos-de-hoy`**: la función está entera y falta el cable. Dos veces en cuatro tandas, y las dos veces sobre capacidades construidas «para más adelante» en un ítem que no las consumía. Vale como patrón a mirar: una capacidad que ningún camino de la interfaz ejerce no está terminada, aunque tenga tests.

José confirmó que era un hueco: en la casa pasa todo el tiempo que el chico hace algo y avisa, o no tiene el teléfono a mano, y hasta ahora la única salida era pedirle que lo marcara él.

### El único backend del ítem, y por qué

Es la primera tanda de las cuatro que toca el backend, y conviene dejar escrito el razonamiento. Para que el Tutor marque **sobre la lista real del integrante** hace falta *esa* lista, y solo existía para el propio integrante (`GET grupos/:grupoId/mi-estado-hoy`, `@Roles(USUARIO)`). Componerla en Angular obligaba a **reimplementar las reglas de visibilidad de cinco ítems** (#10, #11, #17, #19, #21) en la interfaz — duplicar lógica de negocio en el frontend es exactamente lo que este proyecto no hace.

- `miEstadoHoy` se generalizó a **`estadoHoyDe(tenant, grupoId, usuarioId)`**, y el método viejo pasó a llamarla con `tenant.principalId`. Una sola línea de diferencia y **cero cambio de comportamiento para el integrante** — hay un test que lo afirma comparando las dos salidas con `toEqual`.
- `GET grupos/:grupoId/usuarios/:usuarioId/estado-hoy`, `@Roles(TUTOR, ORG_ADMIN)`. **Sin schema, sin migración, sin evento.**
- El aislamiento no se afloja: `tenant` sigue decidiendo organización y grupo, y `usuarioId` es solo el sujeto de la consulta.

### Decisiones de implementación que importan

1. **La pestaña «Registrar» pasó de tres formularios a un flujo por persona.** Antes eran «Registrar no hizo», «Registrar conducta» y «Corregir completadas», los tres con la misma forma (*elegí usuario → elegí ítem → Registrar*) y **había que volver a elegir a la misma persona en cada uno**. Ahora se elige una vez y todo lo de abajo es de ella.
2. **«Corregir completadas» desapareció como formulario**: lo ya completado se ve en la misma fila con su contador (`1 de 2`) y se quita desde ahí. Es la misma información, no dos.
3. **Las reglas de la fila viven en `core/registro-tutor.ts`, no en el componente** —mismo criterio que `core/turnos.ts` (T1) y `core/home-grupo.ts` (T3)—, y **no deciden nada**: traducen el estado que ya mandó el servidor a lo que la fila ofrece. `motivoDeBloqueo` ordena los motivos por lo que le importa al Tutor: primero lo que él mismo hizo (la marca roja), después lo que decidió el calendario.
4. **El motivo del «no hizo» (#12) se pide en la confirmación.** Antes era un campo permanente del formulario y el texto **quedaba escrito de una marca a la siguiente**, fácil de mandar pegado a la equivocada. Obligó a sumarle a `ConfirmDialog` un `pideMotivo` distinto de `requiereMotivo`: el motivo del #12 es **opcional por diseño**, así que exigirlo habría cambiado una regla de negocio para acomodar al diálogo, en vez de al revés.
5. **Los controles de Sección dicen qué hacen.** «Controles» pasó a «Ritmo de la semana», «Forzar evaluación» a «Pasar a evaluación» con su advertencia al lado, y pide confirmación por ser irreversible. También se corrigió el «1 sesiones».

### Desviación de la spec: las tres secciones del modal no son las tres de la tabla

La spec (sección «El modal de actividades») fija **Cuándo se puede hacer / Quién la hace / Límite de tiempo**. Lo implementado es **Cómo se cumple / Cuándo se puede hacer / Quién la hace**: el límite de tiempo terminó **adentro de «Cuándo se puede hacer»** —es una pregunta sobre cuándo, y como sección propia quedaba con tres campos que ya tenían casa— y en su lugar apareció «Cómo se cumple», que agrupa descripción, confirmación al cierre y puntos por cumplirla (#20), que en la tabla de la spec no tenían sección asignada.

Siguen siendo **tres secciones plegadas y tres campos a la vista**, que es lo que piden los criterios 7 y 8. Se registra acá y **no se edita la spec** (protocolo de `CLAUDE.md`).

### El hueco que encontró la E2E: «Quién la hace» no se abría sola con turnos

El criterio 8 de la spec dice que «Quién la hace» se abre sola si la actividad ya tiene **alcance EQUIPO, roles o turnos**. `abrirSeccionConDatos` contemplaba los dos primeros y **no los turnos**: editar una actividad que solo rota la mostraba plegada, que es justo el defecto que la T1 vino a corregir, con otra cara.

La causa es real y vale anotarla: **el turno no está en `ActividadDto`** —vive en su propio recurso— y `obtenerTurno` llega **después** de que corre `abrirSeccionConDatos`. Se resolvió con el mapa que la lista ya tiene cargado (`turnos-de-hoy`, **una sola llamada por pantalla** desde la T1), que trae una fila por actividad con rotación activa haya o no asignación sellada de hoy. Sin costo nuevo.

Lo encontró la suite de la T1 al fallar, no un unit test: es el segundo caso del ítem en que **la E2E ve algo que la unidad no puede ver** (el primero fue el estado que sobrevivía dentro de `ui-modal`, en la T2).

### El segundo hueco: las tareas de equipo llegaban con un botón que el servidor rechaza

`estadoHoyDe` no filtra por alcance —a propósito: el #15 decidió que **las de equipo se ven** en la lista del integrante aunque no se marquen desde ahí, porque las completa el jefe desde «Mi equipo»—, y `MiEstadoActividadHoyDto` **no trae `alcance`**. La primera versión de `filasDeRegistro` no lo miraba, así que al Tutor le aparecían con `✓ hizo` habilitado y el clic terminaba en un `400 ES_TAREA_DE_EQUIPO`.

Se corrigió leyendo el alcance del **catálogo**, que la función ya recibía para resolver los nombres: la fila se muestra (el integrante también la ve), dice *«La marca el jefe del equipo»* y no ofrece ninguna de las tres acciones —tampoco `quitar`, porque anular una de equipo tiene su propio camino (#13)—.

Es la lectura correcta del criterio 2 llevada hasta el final: «la misma lista que ve el integrante» incluye **las mismas restricciones**, no solo los mismos ítems.

### Consecuencia sobre la suite de la T1 (no es una regresión)

Al plegar «Quién la hace», el armador de turnos quedó **a un clic** en vez de suelto en el formulario, y los tres casos de `turnos-visibles.e2e.ts` que lo tocaban dejaron de encontrarlo. Se les agregó `abrirSeccionQuien()`, idempotente. El criterio 6 de la T1 —«el bloque de turnos aparece al crear»— **se sigue cumpliendo**: existe al crear, y desde plegada la sección dice su estado (decisión 3 de la T4: plegar no es esconder).

### Tests nuevos (4 backend + 18 unit + 5 E2E)

- `registro.service.spec.ts` (4): que `estadoHoyDe` devuelve la lista del usuario **pedido** y no la del principal que consulta; que un integrante sin marcas sale en cero; que **es la misma función** que `mi-estado-hoy` (`toEqual` entre las dos salidas, que es el criterio 2 de la tanda escrito como test); y el caso sin Sesión abierta. **Los tests que cubren `mi-estado-hoy` pasan sin modificarse** (criterio 9).
- `core/registro-tutor.spec.ts` (12, nuevo): los cuatro motivos de bloqueo y su orden de precedencia, el filtro de `enPlan` (lo que el integrante no ve, el Tutor tampoco lo ve marcable), el turno ajeno, la tarea de equipo que se ve sin ofrecer acción, y el texto de repeticiones.
- `libs/shared-ui/.../confirm-dialog.component.spec.ts` (6, nuevo): **el componente existía desde la Fase 10 sin ningún test** —la T2 le escribió specs a los tres componentes nuevos y este quedó afuera—. Se le escribe una al sumarle `pideMotivo`, fijando justamente el matiz que se pierde sin test: `requiereMotivo` muestra el textarea **y bloquea** confirmar hasta que haya texto (espacios no cuentan), `pideMotivo` lo muestra **y no lo exige**. Más el limpiado del motivo al reabrir, que es lo que evita mandarlo pegado a la marca siguiente.
- `apps/e2e/src/registro-del-tutor.e2e.ts` (5, nuevo): elegir al integrante una vez y marcar con un clic **verificando en el historial que quedó el TUTOR como quien registró**; la corrección en la misma fila; el motivo viajando desde la confirmación; y los dos del modal (tres campos + tres secciones plegadas con su estado, y la que se abre sola al editar).

### Peleas con el entorno, y el helper que salió de ellas

- **El límite del Gateway ahora se toca corriendo la suite completa.** Con la suite nueva son cuatro escenarios de navegador seguidos, y las suites **que corren después** empiezan a recibir 429 aunque ellas mismas estén bien: en una corrida fallaron 7 tests que **pasaban los 7 al correr sus suites por separado**. No es flakiness, es presupuesto de requests compartido. Es la tercera tanda que tropieza con esto (T1 y T3 lo anotaron).
- El error engaña: el 429 le pega al refresh silencioso y la pestaña vuelve al login, así que el síntoma que se ve es «el elemento no existe», no «me limitaron».
- El que corta primero no es el límite global de 100/min sino **`/auth/login`, que es 10/min**: con un `beforeAll` por suite de navegador, la última se lo come antes de empezar.
- **Se extrajo `apps/e2e/src/support/navegador.ts`** con `APP_URL` y un `entrarComoTutor` que **reintenta esperando la ventana**. Estaba copiado en cuatro archivos y **solo la herramienta de capturas tenía el reintento** —lo había aprendido la T3— mientras las tres suites que sí verifican cosas seguían con la versión frágil. Es el mismo diagnóstico que la T2 hizo sobre las pantallas, aplicado a los tests: el patrón copiado a mano diverge, y la copia que aprendió algo no se lo enseña a las otras.

### Qué falta / verificar la próxima sesión

1. **Segunda vuelta de la T4**: Historial de sesión (561 líneas), Equipos (538) y Recompensas (seis sub-pantallas), que la decisión 2 dejó para después a propósito.
2. **El presupuesto de requests de la E2E**: el reintento del login destapona el arranque de cada suite, pero **no baja el consumo**. Antes de sumar una quinta suite de navegador conviene decidir el fondo: un escenario compartido entre suites, o un límite distinto en entorno de test. Subirlo en producción no es opción — es una defensa real.
3. **La T5 (pulido final)** sigue con alcance solamente: transiciones, foco y teclado, responsive y revisión de textos.
4. **El panel operativo con equipos** no se miró en esta vuelta: la lista por persona muestra lo individual, y una actividad de equipo la marca el jefe. Verificar que el Tutor no quede sin camino para eso.

---

## Ítem 23 · Tanda 4 (segunda vuelta): Historial, Equipos y Recompensas

- **Estado**: EN_PROGRESO (el ítem es por tandas; **la T4 está completa: las dos vueltas**). 82/82 tests de app-web, 24/24 de shared-ui, **36/36 de gateway (3 nuevos)**, 283/283 de activity-service **sin tocar su código**, lint y build verdes, y la **suite E2E completa 48/48 en dos corridas seguidas** (6 nuevos).
- **Fecha**: 2026-08-02 / **Spec**: `docs/phases/fase-14-23-claridad-del-area-del-tutor.md` (sección «Tanda 4 (segunda vuelta)», escrita en esta sesión) / **Commit**: — (branch `fase-14-tienda-de-monedas`)
- **Origen**: las tres pantallas que la decisión 2 de la primera vuelta dejó para después, «con lo aprendido acá».

### La herramienta hizo falta otra vez, y por el mismo motivo

En el paseo de la T3, **Equipos y Recompensas salían vacías**: un botón «Nuevo equipo» y un recuadro punteado. Una lista vacía no dice nada sobre si la pantalla está recargada. Se extendió `capturas-tutor.e2e.ts` para que cree **un equipo con su tarea completada por el jefe** y **dos recompensas de zona** — el mismo movimiento que la primera vuelta hizo al abrir la Sección para juzgar las operativas, aplicado a las dos que faltaban. Recién ahí apareció la tarjeta de equipo con sus cuatro botones en fila.

### El hallazgo: el ítem se contradecía a sí mismo

**Seis acciones destructivas se ejecutaban con un clic**, en la sesión siguiente a la que había establecido lo contrario para el panel operativo. Y en Equipos, el motivo de anular era un **campo permanente y único para toda la pantalla**: se escribía para un equipo y seguía ahí al abrir el de otro — **exactamente el defecto que la primera vuelta acababa de corregir**, en la pantalla de al lado.

Es el tercer caso del ítem del mismo modo de falla, y el más incómodo porque el autor de las dos partes es el mismo: **una decisión tomada para una pantalla no se propaga sola a las demás**. La T1 y la primera vuelta de la T4 lo encontraron como «capacidad construida que ninguna pantalla ejerce»; acá es «criterio establecido que ninguna otra pantalla adopta».

### Decisiones de José en esta sesión

1. **Se confirma lo que no tiene vuelta atrás, no todo lo que es rojo.** Sobre «confirmar todas» (agregaba un clic a la operación más frecuente del día, que además ya es reversible) y sobre no tocarlas.
2. **El equipo se edita en un solo lugar**, «Quiénes están», con hacer jefe y quitar en la fila de cada persona. Sobre dejar los dos modales y sobre darle pantalla propia al equipo.
3. **La conducta rápida se va del historial**, que estaba duplicada en las dos pestañas de la misma pantalla.

### Dos correcciones al diagnóstico, encontradas al implementarlo

Las dos importan porque cambiaron lo que se hizo, y las dos vienen de que el inventario inicial fue por `grep`:

1. **Anular una entrega YA confirmaba.** El conteo la había marcado porque el `(click)` llama a un método llamado `anular`, cuando lo que hace es abrir un modal con su motivo obligatorio para los castigos. Eran **seis** acciones sin confirmación, no siete. Se corrigió la spec antes de tocar nada.
2. **Archivar un producto o una bolsa NO es reversible.** En la conversación se las había supuesto reversibles y quedaban fuera; al ir a aplicarlas apareció `recompensas.service.ts:146` —*«Soft delete (spec): ARCHIVADA. No hay reactivación por endpoint»*— y por la regla que José eligió, **entran**. Se le dijo y se siguió con la regla, no con el reparto que se había supuesto.

### Decisiones de implementación que importan

1. **«Hacer jefe» no pide confirmación**, aunque sea un cambio de mando: volver atrás es el mismo clic en la otra fila. Es la regla de la decisión 1 aplicada en el caso que no es obvio.
2. **Anular una marca del historial tampoco**, y es el caso que le da sentido a la regla: es la acción que el tutor hace todos los días y el «Deshacer» aparece al lado apenas se ejecuta. Confirmarla habría sido tratar el color como criterio.
3. **Las pestañas de Recompensas pasaron al control segmentado del panel operativo**, no al revés: el del panel ya declaraba `role="tablist"` y `aria-selected`, y las de Recompensas **no declaraban nada**. Dos formas para el mismo trabajo, y solo una accesible — el hallazgo de los modales de la T2 en un patrón que aquel inventario no había contado.
4. **El motivo del `pideMotivo`**: se reusó el input que la primera vuelta le agregó a `ConfirmDialog`, sin tocarlo. Era la prueba de que estaba bien planteado.

### El presupuesto de requests de la E2E, saldado

Era la deuda 2 de la vuelta anterior y con la quinta suite de navegador **pasó de molestia a bloqueo**: la corrida completa fallaba 3 o 4 tests **que pasaban todos al correr sus suites por separado**. Las cinco suites comparten el presupuesto de 100 req/min por IP, y el 429 le pega al refresh silencioso: la pestaña vuelve al login y el síntoma que se ve es «el elemento no existe».

Se resolvió con un **seam de configuración en el middleware**, no bajando la defensa:

- `RATE_LIMIT_GLOBAL` y `RATE_LIMIT_AUTH` **solo si están definidas**; sin ellas rigen los 100/10 de la spec de Fase 3, que es lo que corre en producción. Las define `scripts/e2e-up.mjs`, que es el script que existe para levantar el stack de E2E, y están documentadas en `.env.example` como test-only.
- **Un valor basura cae al de la spec**, no a «sin límite»: un typo en un deploy no puede convertirse en una defensa apagada. Hay un test que lo fija, junto con otro que fija que **sin variable el default no cambió** — que es lo que en realidad importa proteger.
- Efecto medido: la suite completa pasó de **~8 minutos con 4 fallos** a **55 segundos con 0**. La mayor parte de esos 8 minutos eran reintentos y esperas de ventana.

### Tests nuevos (3 backend + 6 E2E)

- `gateway/.../rate-limit.middleware.spec.ts` (3): sin variables rige el límite de la spec; con la variable la ventana admite ese número; y un valor no numérico **no afloja** nada.
- `apps/e2e/src/confirmaciones-tutor.e2e.ts` (6, nuevo): anular una tarea de equipo preguntando y con el motivo escrito **en el diálogo** (verificado contra la API, no contra la pantalla); cancelar sin efecto; el modal fusionado haciendo jefe y quitando **sin cerrarse**; archivar una bolsa avisando que no se puede deshacer, con las pestañas declarando `tablist`; borrar una nota preguntando; y **anular una marca del historial sin preguntar**, que es el criterio 2 y la mitad interesante de la regla.

### Peleas con el entorno

- **Un backtick dentro de un comentario HTML** en un template de Angular cortó el template literal y produjo `Incorrect number of arguments to @Component decorator`. Está anotado desde la T3 y volvió a pasar: el síntoma no se parece a la causa.
- **`getByRole('dialog')` se volvió ambiguo** cuando el modal y la confirmación conviven —los dos declaran `role="dialog"`, que es justo lo que la T2 vino a lograr—. Se resuelve nombrando el modal; vale anotarlo porque va a repetirse en cada pantalla que confirme desde adentro de un modal.
- El dev server dejó un `vite-error-overlay` de un estado intermedio del watch que **intercepta los clics** de Playwright: el test falla con «element intercepts pointer events» y el código está bien.

### Qué falta / verificar la próxima sesión

1. **La T5 (pulido final)** es lo que queda del ítem: transiciones, foco y navegación por teclado, responsive y revisión de textos. Sigue con alcance solamente.
2. **`catalogo-items` y `billeteras` no se tocaron**: el primero ya confirmaba y el segundo no tiene acciones destructivas. Quedan como estaban a propósito, no por olvido.
3. **Cuidado al bajar procesos en Windows**: en esta sesión un `taskkill /T` sobre los PID de los puertos 3000-3008 **se llevó puesta la infra de Docker y el `public-site`** — el árbol de procesos alcanzaba más de lo previsto. Para reiniciar el stack conviene `pnpm dev:backend` (que hace su propio teardown) y verificar `docker ps` después. Nada se perdió (los contenedores se relevantan y las bases son volúmenes), pero costó veinte minutos.
4. **El área Usuario sigue afuera** del ítem entero (decisión de alcance 1). Sus seis pantallas no vieron ninguna de las cinco tandas.

---

## Ítem 24: Destinatario y vigencia de una Actividad

- **Estado**: EN_PROGRESO — completo y verificado. 346/346 tests de activity-service (63 nuevos), 104/104 de app-web (22 nuevos), lint y build verdes, **migración aplicada contra `activity_db` real** (columnas verificadas por `\d "Actividad"` y fila `OK` en `_prisma_migrations`), y **suite E2E completa 38/38 en dos corridas seguidas** (8 tests nuevos).
- **Fecha**: 2026-08-03 / **Spec**: `docs/phases/fase-14-24-destinatario-y-vigencia.md` (escrita en esta sesión) / **Commit**: — (branch `fase-14-tienda-de-monedas`)
- **Origen**: pedido de José (2026-08-03), tres molestias que aparecieron usando la app. Nace del mismo lugar que el #23 —la experiencia de uso— pero **agrega capacidades**, así que va como ítem propio y no como una tanda de aquel.

### Las tres molestias, que son la misma vista de tres lados

**La actividad no dice para quién ni hasta cuándo es, así que la pantalla tampoco puede decirlo.** (a) una actividad era del Grupo entero o de nadie —lo más cerca eran el rol del #19 y el turno del #21—; (b) todo era diario o por día de la semana, sin «el 24 de diciembre» ni «durante marzo»; (c) la lista del Tutor era un `@for` plano en orden de creación, sin agrupar ni buscar.

### El diseño del #11 se cobró, y conviene dejarlo anotado

La spec del ítem 11 declaró `comun/programacion.ts` **punto único de extensión** «para cuando se agreguen fechas concretas o rangos, lo que José anticipó». Este ítem fue esa extensión, y el diseño funcionó como estaba escrito: **la vigencia entró entera por `estaDisponibleEn` y los 8 puntos de enforcement la heredaron sin lógica nueva**. El compilador los enumeró solos al cambiar la firma —de tres parámetros sueltos a un objeto `ProgramacionActividad`—, que fue la forma más barata de comprobar que no faltaba ninguno.

Es el primer ítem del proyecto que **cobra una extensión que otra spec dejó preparada por nombre**. Vale como evidencia a favor del patrón: escribir el punto único cuesta poco en el momento y ahorra un rediseño después.

### Lo que sí costó: el destinatario es la TERCERA regla de «quién ve qué»

Ya estaban la de autoría (#10, `visibilidad-actividad.ts`) y la de rol (#19, `restriccion-rol.ts`), cada una con su archivo y su advertencia escrita de que **hay que aplicarla en cada lectura y cada escritura**. Con una tercera suelta, «aplicar dos y olvidar la tercera» dejaba de ser un descuido improbable.

Se resolvió **componiendo las tres** en `comun/destinatario.ts` (`esDestinatario` / `filtroDestinatario`): quien aplica una, aplica las tres. Los otros dos archivos **no cambian de comportamiento** —el nuevo los llama—; lo que se consolidó es el punto de llamada, no la regla.

### Decisiones de implementación que importan

1. **Los cuatro modos son excluyentes y el modo NO se guarda**: se deriva de qué array está lleno. Un enum no evitaría el estado inconsistente (habría que validar igual) y sí obligaría a migrar el valor de toda fila existente. La invariante vive en `resolverDestinatario`, que evalúa los valores **finales** (request + fila) porque en un PATCH parcial la ambigüedad nace del cruce: mandar `usuariosPermitidos` a una actividad restringida por rol la deja con dos modos, y el request por sí solo se ve válido.
2. **Elegir un modo vacía los otros dos**, en el servidor y en el formulario. Es lo que hace que el selector se comporte como un selector.
3. **Las fechas son `String` `"YYYY-MM-DD"`, no `DateTime`** — misma convención que `deadlineHora` con `"HH:mm"` desde Fase 7. Un `DateTime` obligaría a decidir a qué hora y en qué zona empieza el «1 de marzo», que es el error que el #11 se cuidó de no cometer. Bonus: la comparación de strings `YYYY-MM-DD` es lexicográfica y cronológica a la vez.
4. **`vigenciaVencidaEn` es una función aparte de `estaDisponibleEn`**, y la separación es el ítem entero en miniatura: lo que **hoy no toca** vuelve mañana (no se archiva), lo que **venció** no vuelve (se archiva). Mezclarlas habría archivado toda actividad de los martes cada miércoles.
5. **El archivado automático vive en el consumidor de `SesionCerrada`** (el del #8), no en un cron nuevo: es el único punto del sistema que corre una vez por día por grupo y que **ya resolvió la fecha y la timezone**. Un cron sería una segunda fuente de verdad sobre «qué día es hoy para este grupo». Corre **fuera de la transacción del castigo**: archivar no debe poder deshacer un ledger ya escrito.
6. **Dos motivos, dos códigos**: `ACTIVIDAD_FUERA_DE_VIGENCIA` y `ACTIVIDAD_NO_DISPONIBLE_HOY` son mensajes distintos para el integrante («todavía no empieza» no es «los martes»), y la vigencia gana cuando fallan las dos porque es el motivo más definitivo. El factory `excepcionSiNoDisponible` evita repetir ese `if` en los tres puntos que rechazan escritura.
7. **Costo cero para quien no usa el ítem**: `ContextoParticipanteService` mira el catálogo ya leído y pide a identity **solo lo que el catálogo exige** (mismo patrón que `hayRestriccionesDeRol` del #19 y `necesitaTimezone`). En un grupo sin destinatarios ni roles, `mi-estado-hoy` no agrega ni una llamada. Para el cierre de Sesión hay `resolverParaGrupo`, que arma el contexto de todo el grupo con **dos llamadas en total**, no dos por persona.
8. **Los gates de «¿tiene programación?» hubo que ampliarlos uno por uno.** Ocho lugares preguntaban `diasSemana.length > 0` para decidir si pagar el cruce REST; con solo vigencia cargada, la actividad se salteaba el chequeo entero. Es la parte del ítem que el cambio de firma **no** detectó sola: compila igual. Se centralizó en `tieneProgramacion`.

### El hueco que encontró la E2E: el bloqueo estaba, el ocultamiento no

La decisión 10 de la spec dice que **fuera de su rango la actividad no aparece** — a diferencia del «hoy no toca» del #11, que sí se ve en gris porque mañana vuelve. Lo implementado cubría el **enforcement** (no se puede registrar, 409 `ACTIVIDAD_FUERA_DE_VIGENCIA`) y **no el ocultamiento**: la vencida seguía llegando a `mi-estado-hoy` con su botón, y el clic terminaba en un 409.

Es la misma clase de error que la T4 del #23 encontró con las tareas de equipo —la lista traía un botón que el servidor rechaza—, y **ningún unit test lo iba a agarrar**: los que existían verificaban que completar fallara, que es la mitad de la regla.

La causa de raíz es de orden en el código: `estadoHoyDe` resolvía la timezone **después** de armar la lista de visibles, así que en el punto donde se filtraba todavía no había con qué evaluar fechas. Se reordenó (contexto → timezone → filtro de vigencia → turnos → mapeo) y el filtro usa `motivoNoDisponible === 'FUERA_DE_VIGENCIA'`, **no** `estaDisponibleEn`: la vigencia oculta y el día apaga, y esa distinción es el ítem entero en miniatura. Sin timezone resuelta no se filtra nada — mismo criterio fail-open que `disponibleHoy`, porque esconder actividades por una falla de identity es peor que mostrarlas de más.

Quedaron dos tests que fijan el matiz: uno afirma que la vencida y la futura **no están en la lista**, y el otro que una actividad de otro día **sí está, con `disponibleHoy: false`**.

### El hallazgo del camino: un test del #11 que nunca probó lo que decía

`cierre.service.spec.ts` tenía un test llamado «envelope sin fechaInicio (mensaje viejo): saltea las programadas y castiga las normales» que llamaba `envelopeCierre(randomUUID(), undefined)`. **En JavaScript un `undefined` explícito dispara el valor por default del parámetro**, así que el payload siempre viajaba con `fechaInicio` y la rama nunca se ejercitaba. Pasaba por otro motivo: la actividad programada era de un martes y la sesión, de un lunes.

Se destapó al escribir el test equivalente para el archivado, que falló por eso mismo. Corregido cambiando el centinela a `null` (que no dispara el default); el test del #11 sigue verde y **ahora sí prueba lo que dice**.

También hizo falta enseñarle al doble de Prisma de ese spec el operador `{ not: null }` y `updateMany`: sin eso el filtro del archivado pasaba de largo y el test no probaba nada.

### Frontend

- **`core/destinatario-actividad.ts`** con las reglas de presentación (agrupar, buscar, los dos chips, `venceHoy`), testeado aparte — mismo criterio que `core/turnos.ts` (#23 T1), `core/home-grupo.ts` (T3) y `core/registro-tutor.ts` (T4). El componente no decide.
- **El modal**: «¿Quién la hace?» pasó de una lista suelta de roles a **un selector de cuatro modos**, dentro de la sección «Quién la hace» que la T4 ya había creado. Los atajos de precarga («todo el grupo», «los de cocina») **suman a una lista editable**, no fijan una regla — es el patrón del pozo de turnos del #21, y es lo que resuelve «los de cocina y además Ana» sin inventar una semántica de cruce. La vigencia va **junto a los días**, porque se cruzan.
- **Los resúmenes de sección plegada dicen lo nuevo** (`👤 Ana y Luis`, `📅 del 01/03 al 30/03`): sin eso, una actividad acotada a marzo se vería idéntica a una permanente, que es el defecto que la T4 vino a corregir.
- **La lista**: buscador (sin distinguir mayúsculas ni acentos) + cuatro secciones plegables con contador. **Las secciones vacías no se muestran** — un grupo que no usa equipos no debería ver «De equipos (0)» para siempre.

### Peleas con el entorno

- **Procesos viejos en 3000-3008**: la primera corrida de la E2E falló entera contra un stack de una sesión anterior, con el código previo — el síntoma era que las validaciones nuevas devolvían 201 en vez de 400. Está anotado desde antes; conviene verificar el código que corre, no solo que el puerto responda.
- **La misma trampa con otra cara, y esta costó tres corridas**: un `e2e-up` posterior **no reemplaza** un proceso viejo que sigue tomando el puerto — el `nx serve` nuevo compila el bundle actualizado, falla al bindear y **el viejo sigue atendiendo**. El síntoma era desconcertante: `dist/main.js` tenía el código nuevo (verificado con `grep`), los unit tests pasaban, y la API se comportaba **mitad nueva y mitad vieja** (`disponibleHoy: false` correcto, filtro ausente) — porque el proceso había cargado el bundle 20 minutos antes de que se recompilara. Node no recarga en caliente. **Diagnóstico rápido**: comparar `CreationDate` del proceso del puerto contra el `mtime` de `dist/apps/<servicio>/main.js`; si el proceso es más viejo, está corriendo otra cosa. Los avisos de `inspector on localhost:9229 failed` son la pista temprana y es fácil descartarlos como benignos.
- **`node scripts/e2e-up.mjs --serve-only` no sobrevive** si se lo lanza con `&` desde una shell que después termina: los nueve `nx serve` mueren juntos con el padre. El ciclo completo (`node scripts/e2e-up.mjs`) es el camino confiable.
- **Procesos Nx huérfanos que se acumulan**: tras varias corridas abortadas quedaron 24 procesos `nx` vivos que hacían fallar los builds con «Failed to load Nx plugin(s)» y bloqueaban `nx reset` con `EPERM`. Se limpian filtrando por `CommandLine` (`dorado-project` + `nx@23`) con `Stop-Process` **sin `/T`** — el árbol completo se lleva puesta la infra de Docker, que es la advertencia que la T4 del #23 ya había dejado anotada.

### Qué falta / verificar la próxima sesión

1. **El chip de destinatario reusa el diccionario de nombres ya cargado**; un id sin nombre conocido (participante que se fue del grupo) **se omite** en vez de mostrarse crudo. Conviene verlo en pantalla una vez con ese caso real.
2. **La lista del participante no se reordenó**: sigue siendo alcance de la segunda vuelta del #23. Lo único que cambió para él sale del servidor (deja de recibir lo que no le corresponde).
3. **Conductas quedan afuera a propósito** (decisión 15 de la spec), igual que el contenido creado por integrantes (#10, que ya es personal por definición).
4. **El archivado automático depende de que la Sesión cierre.** Un grupo que no abre sesiones no archiva sus vencidas — correcto por diseño (nada corre), pero conviene tenerlo presente si aparece un reporte de «la actividad vencida sigue ahí».

---

## Corrección posterior al #24: los dados de baja aparecían en los selectores

**Reportado por José al probar el #24**: en «¿Quién la hace? → ciertas personas» figuraban integrantes que él mismo había desactivado.

### Dónde estaba (y dónde NO estaba) el problema

El backend nunca estuvo mal. El endpoint **interno** `GET /internal/identity/grupos/:grupoId/usuarios` filtra por `ACTIVO` desde la fase-02, así que ni el sellado de turnos ni el cierre de Sesión toman en cuenta a un dado de baja — una posición suya en una rotación ya se salteaba con el aviso `YA_NO_ESTA_EN_EL_GRUPO`.

El endpoint **público** `GET /identity/grupos/:grupoId/usuarios` sí devuelve a los `INACTIVO`, y eso también es correcto: la pantalla de Integrantes es la que los da de baja y la que los reactiva. El agujero era del lado del navegador — las pantallas que usan esa lista para **elegir** a alguien no filtraban. `equipos.page.ts` sí lo hacía (`disponibles`), y esa era justamente la señal de que era un olvido y no una decisión.

### La regla, y por qué quedó escrita en un archivo propio

Se agregó **`core/usuarios.ts`** con `soloActivos()` y el criterio explicado: **elegir** a alguien va con los activos; **nombrar** a alguien (chips, historial, ranking, un turno ya guardado) va con el padrón completo. Es el mismo motivo por el que el backend tiene `comun/destinatario.ts`: el filtro hay que aplicarlo en cada selector nuevo, y olvidarse de uno no lo agarra ningún test preexistente. Con una función nombrada y documentada, la próxima pantalla que liste integrantes tiene dónde mirar.

La distinción no es cosmética: si se filtrara también el diccionario de nombres, una actividad que quedó asignada a alguien dado de baja mostraría la sección «De personas» **sin ninguna persona**, que es peor que verlo dado de baja.

### Qué se tocó

- **`actividades.page.ts`**: el signal pasó a llamarse `padronDelGrupo` (todos) y `usuariosDelGrupo` es ahora un `computed` de activos — así el selector de «ciertas personas» y los dos atajos de precarga («todo el grupo», «los de cocina») quedaron filtrados sin tocar cada uso. `nombresParaChips()` se movió explícitamente al padrón.
- **`turnos-actividad.component.ts`**: recibe el padrón entero y deriva `activos()` adentro. El `<select>` de «Elegir integrante…» y los atajos ofrecen solo activos; `nombreDe()` sigue con la lista completa para poder nombrar a quien ya estaba en una secuencia guardada.
- **`panel-operativo.page.ts`**: los botones de «a quién le registro algo» ahora salen de `usuariosActivos()`. El filtro del historial de la Sesión **no** se tocó: un dado de baja puede tener registros de esa Sesión y hay que poder filtrarlos.

### Lo que se dejó como está, a propósito

`panel-evaluacion`, `resumen-grupo`, `entregas`, `reportes` y `billeteras` también piden la lista completa, pero **solo para resolver nombres** — las filas salen de scoring/rewards, no de esa lista. Filtrar ahí escondería puntaje o canjes de alguien desactivado a mitad de Sección, que es exactamente lo contrario de lo que se busca.

### Verificación

`nx test app-web` (13 archivos, 108 tests), `nx build app-web` (typecheck de templates) y `nx lint app-web`, los tres en verde. `core/usuarios.spec.ts` cubre el filtro. Falta la vuelta manual: desactivar a alguien en Integrantes y confirmar que desaparece de los tres selectores pero sigue apareciendo con nombre en una actividad que ya lo tenía asignado.

---

## Segunda corrección al #24: el pozo de turnos no salía del destinatario

**Preguntado por José (2026-08-03)**, revisando cómo se combinan las capacidades del #11, el #21 y el #24: *«si la tarea ya tiene limitantes de que solo Lu y Ale pueden hacerlo, entonces la configuración de turnos se debería limitar a ellos, ¿verdad?»*.

Tenía razón, y era **la mitad de un criterio de aceptación que había quedado sin implementar**. La spec del #24 (`A.7`) pedía dos cosas y solo se hizo una:

- ✅ el `PUT` de la secuencia rechaza posiciones fuera de `usuariosPermitidos` (400 `TURNO_FUERA_DEL_DESTINATARIO`) y el `PATCH` de la actividad poda las que quedan fuera;
- ❌ *«los atajos del armador pasan a ofrecer, cuando hay destinatario nominal, solo a los destinatarios»* — el componente recibía `padronDelGrupo()` sin cruzar con nada.

El síntoma: se acotaba la actividad a Luciana y Alejandra, el selector de turnos seguía ofreciendo a todo el grupo, y armar la secuencia con un tercero terminaba en un toast de error **con la actividad ya guardada** (el turno va segundo y encadenado, ver T1 del #23).

### Por qué vale anotarlo aparte

Es el **tercer caso del mismo modo de falla** que la fase ya tenía identificado por nombre: una regla que existe entera en el servidor y a la que le falta el cable del lado del navegador (la T1 con `turnos-de-hoy`, la T4 con las tareas de equipo, y ahora esta). Con la diferencia de que acá la validación del servidor **sí** existía y funcionaba — el defecto era que se enteraba el usuario, no el sistema. Un 400 correcto sigue siendo una interfaz mala si la pantalla dejó armar lo que va a rechazar.

Ninguna de las tres se agarra con unit tests del servidor: los que existían verificaban que el `PUT` fallara, que es exactamente la mitad de la regla.

### La otra mitad de la pregunta, que ya estaba bien

«Martes/jueves/sábado + rotación diaria» funciona como corresponde desde el #21: un día en que la actividad no corre **no consume turno** (`correHoy` en `sellado-turnos.service.ts`, decisión 9). Con secuencia `[Luciana, Alejandra]` y orden fijo el reparto se cierra cada dos semanas —3 y 3 sobre los 6 días corribles— y ningún lunes le «gasta» el turno a nadie. Está cubierto por `sellado-turnos.service.spec.ts`. No se tocó nada de esto.

### Qué se tocó

- **`core/turnos.ts`**: `elegiblesParaTurno(usuarios, destinatarios)` (los dos filtros —activos y destinatarios— con el porqué de cada uno) y `podarSecuencia(secuencia, destinatarios)`. Mismo criterio de siempre: la regla vive en `core/`, testeada aparte, y el componente no decide.
- **`turnos-actividad.component.ts`**: input nuevo `destinatarios`, `activos()` pasa por `elegiblesParaTurno`, y un `effect` que poda la secuencia en el acto cuando el destinatario se acota mientras el armador está abierto. El texto del atajo cambia a «los destinatarios» y una nota explica de dónde sale el pozo — la restricción se ve, no sorprende.
- **`actividades.page.ts`**: `pozoDeTurnos()` y, sobre todo, **el reordenamiento del formulario**: el armador de turnos pasó a ir **después** de «¿Quién la hace?», no antes. Es lo que José señaló como el orden lógico y es la parte que hace que el resto no haga falta explicarlo: el pozo sale del destinatario, así que preguntar el destinatario primero es el orden en que se piensa la actividad.

### El detalle de implementación que no es obvio

`pozoDeTurnos()` devuelve la **referencia viva** de `form.usuariosPermitidos` (y una constante compartida cuando no hay restricción), no una copia. El método se evalúa en cada detección de cambios, y un array nuevo por vuelta dispararía el `effect` del armador sin que hubiera cambiado nada — con la emisión de `cambio` de por medio, en loop. Funciona porque los handlers del destinatario **reasignan** el array en vez de mutarlo, así que la identidad cambia exactamente cuando cambia la lista. Por el mismo motivo `podarSecuencia` devuelve la misma referencia cuando no hay nada que sacar, y hay un test que lo fija (`toBe`, no `toEqual`).

### Verificación

`nx test app-web` (13 archivos, **117 tests**, 9 nuevos), `nx build app-web` (typecheck de templates) y `nx lint app-web`, los tres en verde. Los selectores de `turnos-visibles.e2e.ts` son por `name`/`role`, no por orden, así que el reordenamiento no los toca — pero **la suite E2E no se volvió a correr**: queda para la próxima sesión, junto con la vuelta manual (acotar una actividad a dos personas con la rotación ya armada y confirmar que el tercero desaparece del pozo en el acto).

---

## Ítem 25: Objetivo de ahorro y mínimo de repeticiones

- **Estado**: EJECUTADO (backend + frontend; tests/lint/build verdes, migraciones aplicadas contra Postgres real). **Sin E2E ni vuelta manual todavía.**
- **Fecha**: 2026-08-03 / **Spec**: `docs/phases/fase-14-25-objetivo-y-minimo-de-repeticiones.md` / **Commit**: — (mismo branch que el #24)

### Origen (dos preguntas de José, 2026-08-03)

Una propuesta y una pregunta, hechas en el mismo mensaje: *«debería haber una opción simple de marcar objetivo dentro de la pantalla del usuario en recompensas»* y *«¿cuál es la lógica de las obligatorias de varias repeticiones? ¿si una obligatoria tiene hasta 3 repeticiones y no hace 2, le quita puntos?»*.

La respuesta a la segunda fue que **no**: el castigo del cierre era binario por par (usuario, actividad) — con **una sola** confirmación no había descuento, y el `repeticionesMaximasSesion` funcionaba como techo del **premio** del #20, no como exigencia. No estaba escrito en ninguna spec: era una consecuencia no enunciada del `Set` de pares del #8. Al quedar a la vista, José pidió que existiera el mínimo.

### Qué se ejecutó

**Mínimo (`activity-service`)**: campo `Actividad.repeticionesMinimasSesion` (default **1** = comportamiento previo exacto), acotado a `1 ≤ mín ≤ máx` y forzado a 1 fuera de `OBLIGATORIA` + `REQUIERE_CONFIRMACION`. El cierre pasó de un `Set` de pares a contar confirmaciones vivas y quemadas por separado, y escribe **una** fila `NO_HIZO` con `−valorPuntos × faltantes`.

**Objetivo (`rewards-service`)**: modelo `ObjetivoParticipante` (`@@unique([usuarioId, grupoId])`), `PUT`/`DELETE mi-objetivo`, `objetivo` dentro de `mi-billetera` y `objetivoNombre`/`objetivoFaltan` en el listado del Tutor. Comprar el producto que era el objetivo lo borra en la misma transacción.

**Frontend**: campo «Mínimo para no perder puntos» en el modal del Tutor (solo donde puede significar algo), barrita del integrante con el umbral en ámbar + «te faltan N para no perder puntos», tarjeta de objetivo sobre la billetera con barra grande, botón «☆ Marcar objetivo» por producto, y la línea «🎯 ahorrando para X» en Billeteras del Tutor.

### Decisiones que se tomaron con José en la sesión

1. **Castigo proporcional** (`−valorPuntos × faltantes`), no un castigo único al no llegar al mínimo: es simétrico con el premio del #20, que ya escala por repetición, y castigar 2 de 3 igual que 0 de 3 enseña a abandonar. Se le mostraron las dos tablas de resultados antes de elegir.
2. **El objetivo se persiste** en el backend y **el Tutor lo ve**: media razón de ser del objetivo es que el adulto pueda reforzarlo fuera de la app.

### Desviaciones y decisiones de implementación

- **La pantalla del integrante tenía un tope propio que la spec no preveía.** `topeAlcanzado` para una obligatoria confirmable devolvía `confirmada` (= `vecesHechas > 0`), así que **el botón desaparecía después de la primera confirmación** aunque el servidor aceptara hasta el tope efectivo. Con eso, un mínimo de 3 habría sido **inalcanzable desde la interfaz** y el castigo, automático e inevitable. Es el mismo modo de falla que la T1 y la T4 del #23 (la capacidad entera del lado del servidor y el cable faltante del lado de la pantalla), esta vez descubierto antes de que llegara a producción. Corregido: con `repeticionesMaximasSesion > 1` el tope de una confirmable es `vecesHechas >= topeEfectivo`, y la barrita —que era solo para opcionales— ahora también las cubre.
- **Una marca `NO_HIZO` del Tutor cancela el castigo automático esté viva o deshecha.** Es el comportamiento previo (el `Set` no miraba `eliminado`) y se conservó a propósito para no cambiar de contrabando una regla del #12 dentro de este ítem. Queda anotado: tras «marcar no hizo → deshacer», el integrante que no confirmó **no recibe el castigo del cierre**. Es el mismo hueco que el #20 ya había dejado anotado por el otro lado (no puede re-confirmar), y sigue siendo decisión de producto pendiente.
- **Las repeticiones quemadas bajan el mínimo** (`min(mínimo, topeEfectivo)`), en el cierre y en `mi-estado-hoy` con la misma cuenta. Sin esto, el Tutor quemando 2 de 3 dejaba un mínimo de 3 imposible **encima** del castigo que la marca roja ya aplicó.
- **`ObjetivoService` repite el cálculo del saldo** en vez de reusar `BilleteraService.saldoDe`: es `BilleteraService` el que depende de él (arma el objetivo dentro de `mi-billetera`), así que inyectarlo al revés sería un ciclo. Seis líneas de `aggregate` contra un `forwardRef`.
- **El objetivo es lo único de la economía que no es ledger**: se pisa con `upsert` y no deja historia. Cambiar de idea sobre qué querés comprarte no tiene nada que auditar (decisión 3 de la spec), a diferencia de `EventoMoneda`, que nunca se edita.

### Verificación

`nx test activity-service` **357/357** (11 nuevos: 6 del castigo por mínimo, 5 de la validación) · `nx test rewards-service` **143/143** (13 nuevos: objetivo, lectura, listado del Tutor y las dos de la compra) · `nx test app-web` 117/117 · `nx lint`+`nx build` de los cuatro proyectos tocados, verdes. Migraciones `20260803204402_minimo_repeticiones_fase14` y `20260803205414_objetivo_participante_fase14` **creadas y aplicadas contra Postgres real** con `prisma migrate dev`.

### Segunda vuelta del mismo día: cerrar los pendientes

Con el ítem ya implementado, José pidió corregir lo que quedara pendiente antes de cerrar la sesión. Cuatro cosas:

1. **Se corrió la E2E completa** (`node scripts/e2e-up.mjs`), que la sesión anterior había dejado sin correr: **38/38 verdes**, incluidas las del #24 — ninguna regresión por el mínimo ni por el objetivo. (Las 18 `skipped` son las suites de navegador, gateadas por `E2E_UI=1`.)
2. **Suite E2E nueva del ítem** (`minimo-de-repeticiones.e2e.ts`, 5 tests): el castigo proporcional **contra el ledger de scoring**, que es lo único que los unit tests no pueden probar — ellos verifican la fila que escribe el cierre, no que scoring reste lo que esa fila dice. Cubre 1 de 3 (`+2 −20`), 0 de 3 (`−30`), 3 de 3 (`+6`), la **retro-compatibilidad** con mínimo 1 y el 400 del mínimo mayor que el máximo.
3. **El mínimo faltaba en la lista del Tutor.** `textoDeRepeticiones` decía «1 de 3» y nada más, cuando el Tutor es justamente quien puede hacer algo al respecto **durante** el día. Ahora dice «1 de 3 · faltan 2». Es el mismo criterio de la decisión 16 aplicado a la otra pantalla: la regla tiene que verse donde está la acción.
4. **Dos alineaciones de convención**: `FijarObjetivoBody` → `FijarObjetivoRequest` (regla 5 de estilo de `CLAUDE.md`), y el rechazo a un Tutor pasó de `ConflictException` a `ForbiddenException`, que es lo que ya hacía `miBilletera` con el mismo caso. Además se actualizó `ActividadDto` en `docs/architecture/shared-types.md`, que había quedado sin los campos del #24 (`usuariosPermitidos`, `equiposPermitidos`, `vigenteDesde/Hasta`) además de los de este ítem.

### Qué debería verificar la próxima sesión

1. **Vuelta manual del objetivo**: marcarlo desde la tienda, cerrar sesión, entrar desde otro navegador y confirmar que sigue; después comprarlo y ver que se limpia. Nada de eso está cubierto por E2E (el objetivo no tiene suite propia: es estado de UI sobre endpoints ya testeados en unidad).
2. **Modo `DIRECTO`**: confirmar en navegador que el botón de objetivo no aparece (la tienda entera no se renderiza en ese modo, así que debería ser gratis).
3. **El hueco del `NO_HIZO` deshecho** sigue abierto y es decisión de producto, no bug: tras «marcar no hizo → deshacer», el integrante que no confirmó **no** recibe el castigo automático del cierre (y por el #20, tampoco puede re-confirmar). Los dos lados del mismo caso, esperando una decisión.

## Ítem 26: Etiquetas del catálogo de recompensas

- **Estado**: EJECUTADO (backend + frontend; tests/lint/build verdes, migración aplicada contra Postgres real).
- **Fecha**: 2026-08-03 / **Spec**: `docs/phases/fase-14-26-etiquetas-del-catalogo.md` / **Commit**: — (mismo branch que el #24 y el #25)

### Origen (pedido de José, 2026-08-03)

*«Quiero que sea posible etiquetar las recompensas desde el tutor/admin, solo para marcarlo y quizás seleccionar todos de x etiqueta para la tienda o premios directos.»*

El pedido llegó con la solución adentro y con una duda declarada («quizás»). Lo que faltaba decidir eran cuatro cosas, y se cerraron con él antes de escribir una línea: catálogo de etiquetas vs. texto libre, una o varias por ítem, dónde vale el atajo «todos los de X», y si el participante las ve.

**José delegó explícitamente el tercer uso** («y lo que más me recomiendes aparte de estos 2», sobre filtro y bolsa). Se eligió **crear productos de tienda en masa** y se descartó **asignar zona en masa**, por un motivo que no es de gusto: el select de zona está **deshabilitado al editar** un ítem (`catalogo-items.component.ts`), así que una edición masiva habría permitido por lote exactamente lo que la pantalla prohíbe de a uno. En cambio, en modo `TIENDA` cada premio necesita hoy su producto cargado a mano, uno por uno: ahí sí había trabajo repetitivo real.

### Qué se ejecutó

**Backend (`rewards-service`)**: dos tablas nuevas —`EtiquetaCatalogo` (nombre + `colorHex`, archivable, `@@unique([grupoId, nombre])`) y `EtiquetaEnRecompensa` (N:M)—, módulo `etiquetas/` con CRUD + desarchivar + `PUT /rewards/recompensas/:id/etiquetas`, `?etiquetaId=` en el listado del catálogo, y `POST /rewards/grupos/:grupoId/productos/desde-etiqueta`. **`Recompensa` no cambia ni una columna**: la migración es aditiva pura.

**Frontend (`app-web`)**: gestor de etiquetas como modal desde la pestaña Catálogo (sin pestaña nueva), fila de chips de filtro, chips en cada tarjeta, selector en el modal del ítem, «Agregar los de \<etiqueta\>» al armar una bolsa y «Desde una etiqueta» con previsualización en Productos.

### Decisiones cerradas con José en la sesión

1. **Catálogo de etiquetas por Grupo**, no texto libre: con texto libre «Juguetes»/«juguetes»/«juguete» son tres etiquetas a la semana de uso, y renombrar sería editar ítem por ítem — justo el trabajo manual que el ítem viene a eliminar.
2. **Varias por ítem**, a diferencia del rol del #19 que es uno solo: allá la cardinalidad 1 evitaba conflictos entre roles porque el rol **restringe**; acá la etiqueta no restringe nada.
3. **Solo la ve el Tutor.** Es organización del adulto, no una categoría de producto para el participante.
4. **Tres usos y ninguno más**: filtrar el catálogo, precargar una bolsa, publicar productos en masa.

### Decisiones de implementación y desviaciones

- **`EtiquetaCatalogo`, no `EtiquetaRecompensa`.** Leídas juntas, `EtiquetaRecompensa` y la tabla de unión se confunden a simple vista, y este ítem toca los tres archivos donde conviven. Además dice la verdad: etiqueta **ítems del catálogo**, que incluyen castigos — el propio #22 dejó anotado que llamarle «Recompensa» a un castigo es un nombre heredado, y no hacía falta propagarlo a lo nuevo.
- **Archivar una etiqueta es reversible, y por eso NO pide confirmación.** Es lo contrario de lo que el #23 T4 (segunda vuelta) decidió para productos y bolsas, y por el mismo criterio: *se confirma lo que no tiene vuelta atrás, no todo lo que es rojo*. Desarchivar un producto vuelve a poner algo **comprable** en la tienda; desarchivar una etiqueta vuelve a mostrar un chip. Es la única entidad archivable de `rewards` cuya reactivación no puede resucitar nada.
- **Archivar NO desasigna**, al revés que el #19 con los roles. Allá la asignación **ocultaba actividades**, así que dejarla viva escondía cosas por una regla invisible; acá no hace nada por sí sola, y conservarla es lo que hace que desarchivar restituya el estado exacto.
- **La asignación va por `PUT` sobre un sub-recurso, no como campo del `PATCH` del ítem.** En un PATCH parcial, un array vacío es indistinguible de «no lo mandé» — la misma ambigüedad que el #24 tuvo que resolver a mano en la validación de destinatarios. Un `PUT` no tiene esa duda: lo que viene es lo que queda.
- **El compilador atajó un bug real al sumar el segundo parámetro del mapeador.** `recompensaADto` pasó a recibir `etiquetas` con default `[]`, y eso rompió los dos `.map(recompensaADto)` de `canjes.service.ts` —donde `Array.prototype.map` habría inyectado **el índice del array** como etiquetas—. Es justo el camino de los elegibles del participante, o sea el lugar donde la decisión 12 se habría filtrado. Quedó anotado en el código: ahí el mapeador se llama con lambda a propósito.
- **Costo cero para quien no usa el ítem.** `mapaPorRecompensa` corta en la primera consulta si el grupo no tiene ninguna etiqueta activa —mismo gate que el `necesitaTimezone` de activity y el cruce de roles del #19—, y el participante no paga ninguna de las dos consultas. Hay tests con espías para las dos cosas. En pantalla, un grupo sin etiquetas no ve fila de filtros, ni chips, ni el botón «Desde una etiqueta».
- **El precio de la creación masiva es `>= 1`, no `>= 0`** como decía el primer borrador de la spec. Se corrigió **la spec** antes de escribir el código, porque `ProductosService.validarReferencias` ya rechazaba `< 1` con `PRECIO_INVALIDO` desde el #22: dejar el número mal habría creado dos mínimos distintos para la misma cosa.
- **La lógica de los tres atajos vive en `core/etiquetas-catalogo.ts`, no en los componentes.** Son decisiones sobre qué subconjunto del catálogo cae bajo una etiqueta, y eso se testea sin montar una pantalla (mismo criterio que `core/turnos.ts` del #21 y `core/destinatario-actividad.ts` del #24).
- **Un producto archivado no bloquea la republicación.** El Tutor lo sacó de la vitrina a propósito; volver a publicarlo es una decisión válida, y la regla está escrita igual en el backend y en la previsualización del frontend, con test en los dos lados.

### El hallazgo del camino: los `code` de negocio de rewards no llegaban al cliente

La E2E de este ítem falló cuatro veces con el **status correcto y el `code` equivocado**: `409 CONFLICTO` donde el test esperaba `ETIQUETA_DUPLICADA`, y `400 VALIDACION` donde esperaba `ETIQUETA_INVALIDA`, `SIN_ITEMS_PARA_CREAR` y `SOLO_EN_MODO_TIENDA`.

No era el test. `HttpExceptionFilter` (`libs/shared-auth`) **solo conserva el `code` de negocio cuando la excepción extiende `DomainException`**; un `new BadRequestException({ message, code })` deja el code **dentro** del body de la excepción de Nest, que el filtro descarta y reemplaza por el genérico del status. Los tests unitarios no lo ven porque inspeccionan la excepción cruda, donde el code sí está: hace falta mirar el **sobre HTTP real** para que el hueco aparezca.

Se creó `apps/rewards-service/src/comun/excepciones.ts` —el servicio era el único con codes de negocio y **sin** ese archivo, que identity, activity y billing sí tienen desde sus fases— y las cinco excepciones del ítem pasaron a `DomainException`.

**Queda anotado como deuda, no se tocó**: los codes del #22 tienen exactamente el mismo problema y hoy llegan al frontend como `VALIDACION` — `CASTIGO_NO_VA_EN_BOLSA`, `CASTIGO_NO_ES_COMPRABLE`, `REFERENCIA_INVALIDA`, `BOLSA_VACIA`, `PRECIO_INVALIDO`, `ZONA_REQUERIDA` y los de compra. Ninguna pantalla los discrimina hoy (todas muestran `mensajeDeError`), así que no hay bug visible; pero cualquier pantalla futura que quiera ramificar por code va a fallar en silencio. Convertirlos es mecánico y cabe en una pasada corta; se dejó afuera por no meter un refactor transversal de `rewards` dentro de este ítem.

### La corrida que no probó nada: nueve procesos zombis

La primera corrida completa dio **40 passed / 9 failed** y las 9 fallas incluían tres tests del #25 que estaban verdes. La causa no era el código: los **nueve** puertos de servicio (3000-3008) estaban tomados por procesos `node dist/apps/<servicio>/main.js` **arrancados a las 16:23**, antes de esta sesión. `nx serve` levantó los nuevos, no pudo bindear, y la suite entera corrió contra un binario viejo — por eso `POST /rewards/grupos/:id/etiquetas` daba 404 aunque el log del proceso nuevo mostrara la ruta mapeada.

Es la trampa que ya estaba anotada para este entorno (procesos viejos ocupando puertos), pero anotada solo para 3000-3002. **Vale para los nueve**, y el modo de falla es traicionero: no hay error visible en el arranque —el aviso que sí aparece es `Starting inspector on localhost:9229 failed`, que parece benigno—, la suite corre entera y el veredicto es plausible. Después de matarlos, la misma suite pasó de 6.1 min a 57 s.

**Antes de creerle a una corrida E2E de este repo, verificar que los nueve puertos estén libres.**

### Verificación

`nx test rewards-service` **168/168** (25 nuevos: 12 del catálogo/asignación/archivado, 7 de la creación masiva, 4 de los chips y el filtro, 2 de costo cero con espías) · `nx test app-web` **129/129** (9 nuevos, sobre `core/etiquetas-catalogo.ts`) · `nx lint` + `nx build` de `rewards-service`, `app-web` y `shared-types`, verdes. Migración `20260803220144_etiquetas_catalogo_fase14` **creada y aplicada contra Postgres real** con `prisma migrate dev`.

**Suite E2E completa 49/49 en dos corridas seguidas** (53,2 s y 59,2 s), con la suite nueva `etiquetas-catalogo.e2e.ts` (6 tests) adentro. Los 18 `skipped` son las suites de navegador, gateadas por `E2E_UI=1`.

### Qué debería verificar la próxima sesión

1. **Vuelta manual en navegador**: crear dos etiquetas desde el gestor, asignarlas, filtrar la grilla, archivar una y recuperarla. Nada de eso está cubierto por E2E de navegador (la suite del ítem es API-first).
2. **La deuda de los `code` del #22** (arriba): decidir si se convierten a `DomainException` en una pasada corta. Es mecánico y hoy no rompe nada visible.
3. **El tope de 5 etiquetas por ítem** es un número de interfaz, no de dominio (decisión 8). Si a José le queda corto, subirlo es cambiar `MAX_ETIQUETAS_POR_ITEM` y su espejo en el frontend.

## Ítem 27: Termómetro de zonas en el resumen del grupo

- **Estado**: EJECUTADO (frontend puro; tests/lint/build verdes). **Sin verificación en navegador** — ver "Qué falta" abajo.
- **Fecha**: 2026-08-03 / **Spec**: — (no tiene `fase-14-27-*.md`; ver más abajo por qué) / **Commit**: el que cierra el día.

### Origen (pedido de José, 2026-08-03)

*«Quisiera que dentro de la pantalla de inicio del grupo del tutor, o sea resumen, haya más formas de ver cómo va el puntaje. Mi mamá sí o sí quiere un termómetro, no sé por qué, pero bueno. Sería un termómetro con los colores de las zonas y los participantes apuntando, pero no sé si con un hover sería suficiente para ver a todos los participantes en caso de estar en el mismo lugar o muy juntos.»*

El pedido trae la solución adentro (un termómetro) y **una duda técnica declarada** (el hover). Lo que faltaba decidir eran cuatro cosas, y se cerraron con él antes de escribir una línea: cómo resolver el amontonamiento, si el termómetro convive con la lista o la reemplaza, hasta dónde llega la escala cuando la zona más alta no tiene tope, y qué otras vistas entraban.

### La duda del hover se contestó antes de ofrecerle opciones, y no por el amontonamiento

José preguntó si el hover alcanzaba para desamontonar. La respuesta correcta no era sobre amontonamiento: **el hover no existe en un teléfono**, y ésta es la pantalla que se mira en el teléfono. Cualquier diseño donde un nombre aparezca solo al pasar el mouse deja a esos participantes invisibles justo en el dispositivo principal. Eso descartó de entrada media familia de soluciones, e hizo que las tres opciones ofrecidas (separar etiquetas, burbuja agrupada, un carril por persona) fueran todas usables sin hover — la burbuja pedía un toque, no un hover.

Vale anotarlo porque es un modo de falla que **no aparece en ningún test**: se ve en un teléfono real o no se ve.

### Por qué este ítem no tiene `fase-14-27-*.md`

Todos los ítems anteriores escribieron su spec antes del código. Éste no, y conviene que quede escrito el criterio para que no se lea como un descuido ni como el nuevo default:

Es **frontend puro**: no toca schema, ni endpoint, ni evento, ni un solo campo de DTO. `GET /api/scoring/grupos/:grupoId/umbrales` y `puntajesDeGrupo` ya traían exactamente lo que hace falta. No había nada que especificar que no fuera decisión de presentación, y esas se cerraron con José en la sesión, con opciones concretas y previsualizadas.

Escribir la spec **después** de implementar habría sido peor que no escribirla: un archivo fechado como decisión previa que en realidad describe lo ya hecho. Es exactamente la clase de reescritura retroactiva que el protocolo de esta carpeta existe para evitar (regla 6 de `CLAUDE.md` aplicada a la documentación). Las decisiones quedaron en el índice de `fase-14-post-mvp.md` y acá.

**En cuanto un ítem toque backend, vuelve la spec antes del código.**

### Qué se ejecutó

Tres archivos nuevos y una pantalla tocada, todo en `app-web`:

- **`core/termometro.ts`** — la geometría: escala en puntos, bandas por zona, separación de etiquetas y promedio del grupo. Sin Angular adentro.
- **`core/termometro.spec.ts`** — 20 tests.
- **`paginas/tutor/termometro-zonas.component.ts`** — presentacional puro, recibe umbrales y participantes ya cargados.
- **`paginas/tutor/resumen-grupo.page.ts`** — selector `Lista` / `Termómetro` sobre la sección «Cómo van».

### Decisiones cerradas con José en la sesión

1. **Etiquetas que se separan solas, con línea guía al punto real.** Descartadas la burbuja «+3» (pide un toque para saber quiénes son) y el carril por participante (imposible que se tapen, pero se pierde el «todos en el mismo termómetro», que era el pedido).
2. **Selector de vistas, una a la vez y recordada** — no las dos apiladas. El largo del resumen es justo lo que el #23 T3 vino a arreglar; agregar un bloque permanente lo habría desandado.
3. **La zona abierta se dibuja con el alto de la anterior, más una flecha.** Descartado el techo dinámico (la escala se deforma cada vez que alguien suma puntos y deja de poder compararse entre semanas) y la meta configurable (era la más motivadora, pero pedía un campo nuevo en la config de scoring — backend, o sea otro ítem).
4. **Solo el termómetro por ahora.** Se ofrecieron pista de carrera horizontal, podio y evolución diaria; las tres descartadas. La evolución además habría necesitado un endpoint de histórico por día que hoy no existe.

### Decisiones de implementación y desviaciones

- **Escala lineal en puntos, no bandas de igual alto.** Con los umbrales del seed, Verde mide 25 puntos y Rojo 10, así que Verde ocupa 33,3 % del tubo y Rojo 13,3 %. Igualar las bandas se ve más prolijo y es mentira: la altura de una marca dejaría de significar su puntaje.
- **El mercurio es el promedio del grupo, no un participante.** Un termómetro muestra *una* temperatura. Acá esa temperatura es «cómo viene el grupo» y las personas son las marcas sobre la escala. **El descalificado no cuenta para el promedio** —su puntaje ya no representa cómo viene la semana— pero **sí se dibuja** como marca, atenuado: sigue siendo alguien que está ahí.
- **Los bordes entre zonas salen del `puntosMin` de la de arriba, no del `puntosMax + 1` de la de abajo.** Si un Grupo dejó un hueco al configurar sus umbrales, así se reparte en vez de dibujar una franja muerta. `calcularCortes` además fuerza monotonía: umbrales mal cargados deforman el dibujo pero no rompen la división.
- **La separación de etiquetas se comprime antes que desbordar.** Con muchos participantes la separación pedida no entra en 100 %, así que se recorta a `100 / cantidad`. Hay test con 20 participantes: todas las etiquetas quedan dentro del tubo y en orden estricto.
- **El tubo crece con la cantidad de gente** (300–520 px). Con alto fijo, 12 participantes quedaban encimados aunque el algoritmo los separara — la separación es un porcentaje, y un porcentaje de poco alto son pocos píxeles.
- **`localStorage` para la vista elegida** (`dorado:resumen-vista`), con `try/catch` por si está bloqueado. **Es el primer uso de `localStorage` en `app-web`** y por eso quedó comentado en el código: la regla 7 de `CLAUDE.md` prohíbe guardar **tokens** ahí, y esto es una preferencia de presentación sin ningún dato de sesión. Si se quiere revertir, es cambiarlo por un signal en memoria.
- **Quien se pasa del techo se ancla arriba con `↑`, no se sale del tubo.** Es el precio de la decisión 3 y se hace visible en vez de disimularse: con los umbrales del seed, 78 puntos quedan sobre un techo de 75.
- **Todos los colores salen de `UmbralZona.colorHex`.** Ninguno está escrito en el componente; un grupo con otras zonas dibuja su propio termómetro. El único hex hardcodeado es el gris de «sin promedio».

### Verificación

`nx test app-web` **149/149** (20 nuevos, todos sobre `core/termometro.ts`) · `nx lint app-web` y `nx build app-web` verdes. Backend sin tocar: no hubo migración ni cambio de contrato.

Se armó además una **réplica estática** del componente con la geometría exacta que devuelve `construirEscala` para el caso real (seis participantes, umbrales del seed), y se revisó contra ella. Sirvió para confirmar el caso que motivó el ítem: Lucas 44 / Emma 43 / Joaco 41 caen casi pegados sobre el tubo y sus tres nombres se leen sin superponerse.

### Qué falta / verificar la próxima sesión

1. **No se levantó la app en el navegador.** Es lo primero a hacer: la geometría está cubierta por tests y por la réplica, pero el render real no. Mirar en particular el bulbo asomando bajo el tubo, las líneas guía en pantalla angosta y que la columna de etiquetas no se coma el nombre largo.
2. **Probarlo en un teléfono de verdad**, no en el emulador angosto del navegador. Todo el diseño se eligió para que funcione sin hover; eso solo se confirma en el dispositivo.
3. **Preguntarle a la mamá de José si es el termómetro que tenía en la cabeza.** El ítem nace de un pedido de ella y quedó verificado solo contra criterios técnicos.
4. **La lista sigue siendo la vista por default.** Si se confirma que el termómetro es el que se usa, hay una decisión chica pendiente: cambiar el default o dejar que lo decida la preferencia guardada de cada uno (hoy es lo segundo).

## Ítem 28: Monedas por cumplir (la segunda fuente de la economía)

- **Estado**: EJECUTADO_CON_DESVIACIONES — backend, frontend, migración aplicada contra Postgres real y suite E2E propia verde.
- **Fecha**: especificado 2026-08-03, ejecutado 2026-08-04 / **Spec**: `docs/phases/fase-14-28-monedas-por-cumplir.md`

### Origen (pedido de José, 2026-08-03)

*«Quisiera que la aplicación también pueda tener la opción de monedas por cumplir actividades — que en caso de estar configurado por tienda, el tutor pueda crear o modificar actividades para que además de puntos den monedas; flexible, tal que no haya dependencias entre sí.»*

Misma sesión que el #27 y el mismo camino que el #24/#25: José mirando la app y notando lo que el sistema no deja decir. El #22 montó una economía cuyo **único ingreso es semanal y depende de la zona** — tender la cama diez veces y tenderla cuatro pueden caer en la misma zona y rendir lo mismo.

### Lo que se decidió (resumen; el detalle y el porqué están en la spec)

Diez decisiones cerradas con preguntas cerradas. Las que más condicionan la ejecución:

1. **Puntos y monedas son independientes** — es el pedido literal y gobierna todo lo demás.
2. **El valor en monedas vive en `rewards-service`** (`RendimientoAccion`), no en `Actividad`: decisión 11 del #22 aplicada igual. **`activity-service` no cambia ni un campo de schema y `activity_db` no tiene migración.**
3. **Cuatro hechos pagan**: opcional completada, obligatoria confirmada, tarea de equipo y conducta BUENA.
4. **Nada resta monedas por lo que se hace.** El único camino al saldo negativo sigue siendo la bancarrota del cierre (#22).
6. **Deshacer compensa con piso en 0** y escribe la fila aunque recupere 0.
9. **El integrante nunca pone monedas** — cae por construcción, sin regla nueva que mantener.
10. **Pantalla propia** (`Rendimiento › Por actividad`), no campo en el formulario de la actividad.

### El hallazgo que cambió el alcance (leer esto antes de tocar nada)

`activity-service` **no publica el evento cuando el registro vale 0 puntos** — `registro.service.ts` líneas **313**, **765** y **894**, guard deliberado del #20. Con él, una actividad de **0 puntos + 5 monedas nunca le llegaría a rewards** y la decisión 1 sería imposible.

**Resolución (Parte D de la spec)**: los tres guards se quitan y el descarte del 0 se muda a `scoring-service` (`ProyeccionService.proyectarRegistro`). El evento pasa a significar «esto pasó» en vez de «esto valió puntos», que es lo correcto para un fan-out por topic exchange.

Verificado en esta sesión: **`ActividadCompletada` hoy lo consume solo `scoring-service`** — `notification-service` y `audit-service` no lo escuchan (`grep` sobre ambos `src/`: cero resultados). Por eso la superficie del cambio es exactamente scoring y nada más.

> **Es el único cambio del ítem sobre código en producción, y cae en el camino más caliente de la app (registrar una actividad).** El invariante a sostener es explícito: *el contenido de `EventoPuntos` no cambia ni una fila*.

### Baseline verde ANTES de mover el guard

Corrido en esta sesión, sobre el árbol limpio en `fase-14-tienda-de-monedas` (último commit `2a6b457`), para que mañana cualquier rojo sea atribuible al ítem y no a algo heredado:

| Proyecto | `nx test` | Archivos |
|---|---|---|
| `activity-service` | **357/357** | 18 |
| `scoring-service` | **57/57** | 5 |
| `rewards-service` | **168/168** | 13 |

Comando exacto (ojo con la trampa 1 de las notas de Windows — las comillas en `-t` no son opcionales):

```
npx nx run-many -t "test" -p activity-service scoring-service rewards-service --skip-nx-cache
```

**El paso 1 del arranque tiene que devolver estos mismos tres números.** Si alguno se mueve, el error está en el guard mudado, no en el ítem que lo puso.

`nx run-many -t "lint,build"` sobre los mismos tres: **verde (exit 0)**, con **3 warnings preexistentes** de `@typescript-eslint/no-non-null-assertion` — dos en `apps/activity-service/src/comun/rotacion-turnos.spec.ts` (50:22 y 51:16) y uno en `apps/activity-service/src/turnos/turnos.service.ts` (439:38). **Son del #21, no de este ítem**: quedan anotados acá para que mañana no se persigan como si fueran nuevos.

### Arranque de mañana (en orden, tal como lo deja la spec)

0. **Pre-flight de entorno** — la trampa 12 de las notas de Windows: chequear que los **nueve** puertos 3000-3008 no tengan `node` zombis de una corrida anterior antes de creerle a cualquier verificación. No hace falta levantar el stack para los pasos 1-4.
1. **Quitar los tres guards de `registro.service.ts`** (313, 765, 894) y **mudar el descarte a `ProyeccionService.proyectarRegistro`** (`puntosSnapshot === 0` → no escribe `EventoPuntos`, marca `EventoProcesado`). Reemplazar el comentario de las líneas 309-312 por uno que explique por qué el guard del #20 se fue, citando esta spec — no borrarlo sin más. **Correr activity + scoring y comparar contra el baseline de arriba: tiene que dar exactamente lo mismo.**
2. **`GET /internal/activity/grupos/:grupoId/catalogo-rendible`** en activity + `ActivityClientService` en `apps/rewards-service/src/clientes/` (molde: `scoring-client.service.ts`).
3. **Schema + migración de `RendimientoAccion`** y los dos valores nuevos de `TipoMovimientoMoneda`, más el `GET`/`PUT` de la Parte C.
4. **El consumidor** (`rewards.q.acciones`, ocho routing keys): acreditación primero, reversión después, **test antes que código en la reversión**.
5. Tipos compartidos y frontend — **mostrarle el mockup a José antes de scaffoldear** (preferencia registrada).

### Las tres trampas que la spec deja señaladas

1. **El guard mudado** es lo más riesgoso (ver invariante arriba).
2. **La reversión con piso en 0 lee el saldo y escribe contra él**: necesita el mismo `pg_advisory_xact_lock` que la compra del #22 y **probado contra Postgres real** — ese `$queryRaw` pasa tests, lint, typecheck y build, y falla en el 100 % de las corridas reales si está mal escrito (herencia del #16, repetida en el #22).
3. **La tarea de equipo son N movimientos con el mismo `origenId`**, uno por miembro: la reversión tiene que buscarlos **todos**. Buscar el primero deja el resto de las billeteras mal en silencio — el error exacto que el #13 documentó para scoring.

---

## Ítem 28 — EJECUCIÓN (2026-08-04)

Todo lo de arriba es el plan que dejó la sesión de especificación. Esto es lo que realmente pasó.

### El baseline se cumplió exactamente

Los tres números del plan volvieron idénticos tras mover el guard: **357/357** activity, **57/57** scoring, **168/168** rewards. El invariante que la spec puso en primer plano —*el contenido de `EventoPuntos` no cambia ni una fila*— se sostuvo, y los 4 tests de activity que cambiaron de resultado son exactamente los que **afirmaban el guard viejo** («no publica evento»), reescritos para afirmar lo contrario con el motivo escrito al lado.

### El hueco que la spec no vio: la compensación también se rompía

D.2 dice que scoring descarte `puntosSnapshot === 0`. Lo que no dice es qué pasa **después**: `compensarCadenas` busca el asiento original del registro que se quita, y **lanza si no lo encuentra** (guard deliberado de Fase 7 contra el descarte silencioso). Con el 0 descartado en la creación, quitar una confirmación de 0 puntos —el caso exacto que este ítem habilita— buscaba un asiento que nunca existió y **mandaba el mensaje a la DLQ**.

La ausencia de asiento es **ambigua**: puede ser «valía 0» o «el evento llegó desordenado», y la segunda tiene que seguir fallando ruidosamente. Se resolvió con un campo **opcional** `valorPuntosSnapshot` en `ActividadRegistroEliminadoPayload` y `ActividadRegistroRevertidoPayload`: con `0` explícito no hay nada que compensar; **sin el campo se compensa (y lanza) como siempre**, así un mensaje viejo en vuelo no cambia de comportamiento.

**Es una desviación registrada**: D.1 afirma «cambio de payload **cero**». Esa afirmación era correcta sobre el hecho que describe (quitar los guards) pero incompleta sobre su consecuencia. La spec **no se editó** (protocolo de `CLAUDE.md`).

Dato que acotó el riesgo, verificado antes de decidir: `valorPuntos` tiene `@Min(1)` en los DTOs de actividades y conductas, así que **el único origen que puede traer 0 es la confirmación de una obligatoria** (`puntosPorCumplir`). `NO_HIZO` y `CONDUCTA` nunca valen 0 y su ledger no cambia ni una fila — el descarte «para los tres orígenes» de D.2 es uniformidad defensiva, no un cambio de datos.

### EL BUG DEL ÍTEM: ocho `@RabbitSubscribe` sobre una cola no rutean por routing key

La primera versión del consumidor declaraba **un `@RabbitSubscribe` por routing key**, los ocho apuntando a `rewards.q.acciones`. Compila, pasa lint, pasa los 32 tests unitarios nuevos — y **está mal**: ocho suscripciones sobre una misma cola registran ocho consumidores AMQP contra ella, y RabbitMQ reparte **round-robin entre consumidores, sin volver a mirar la routing key** con la que cada uno se dio de alta. Un `ActividadCompletada` caía en el handler de tareas de equipo y explotaba en `payload.asignaciones.map`.

**Los unit tests no podían verlo**: llamaban a `consumer.onActividadCompletada(...)` directamente, así que el ruteo lo hacía el test, no RabbitMQ. Lo destapó la E2E, con el error visible en el log de rewards durante suites de **otros** ítems (historial, mínimo de repeticiones) — que pasaban igual porque no miran monedas.

El patrón correcto **ya estaba en el repo**: `ScoringConsumer.onRegistro` usa **un** handler con `routingKey: [...]` y `switch` por `eventType`. Se reescribió así. Y los tests se cambiaron para entrar **todos por `onRegistro`**, que es la única puerta real: ahora el despacho está bajo test, más tres tests nuevos sobre la puerta en sí (cada evento a su rama, `eventType` desconocido que falla ruidoso, envelope sin `grupoId`).

Es el **cuarto caso del mismo modo de falla en Fase 14** —después de `turnos-de-hoy` (#23 T1), el «✓ hizo» del Tutor (#23 T4) y el ocultamiento por vigencia (#24)—: *la unidad verifica la pieza, y lo que falla es el cable*.

### Otras desviaciones y decisiones propias

1. **`GET /rewards/grupos/:grupoId/valores-en-monedas`, endpoint que la Parte C no lista.** La Parte C dice «nada más», pero la Parte F pide que **el participante vea el precio antes de completar** y la sección «fuera de alcance» difiere explícitamente ese punto a la Parte F. El `GET` de la Parte C es `TUTOR`/`ORG_ADMIN` y trae nombres, motivos y bonos: no sirve. El nuevo devuelve **el mínimo** (`origenId` + monedas) y lo leen `USUARIO`, `TUTOR` y `ORG_ADMIN` —el Tutor porque desde el #23 T4 marca sobre la misma lista del integrante—. **En `DIRECTO` devuelve `[]`**, así «no se muestra en DIRECTO» cae por construcción y no como un `if` más en la plantilla. No llama a activity: es lectura local, para no pagar un cruce REST en el camino del integrante.
2. **`CONDUCTA_MALA_NO_RINDE` cuesta una llamada extra, solo en el camino de error.** El interno `catalogo-rendible` devuelve solo conductas `BUENA` (D.3 tal cual), así que una `MALA` «no está en la lista» y daría `ACCION_INEXISTENTE`. Para darle su code propio (decisión 17) el service le pregunta a activity por esa conducta **únicamente cuando el `origenId` no apareció** — cero costo en el camino feliz, y sin ensuciar el interno con datos que la pantalla no muestra.
3. **`repeticionesMaximasSesion` viajando en el DTO**, que D.3 no enumera: lo pide el aviso de calibración que eligió José (ver abajo).
4. **`monto: recuperado === 0 ? 0 : -recuperado`** en la reversión: `-0` es un valor distinto de `0` para `Object.is`, y una fila de ledger con `-0` es la clase de rareza que aparece años después en una comparación. Lo encontró un test.
5. **`RENDIMIENTO_ACCION` con `monedas <= 0` no escribe fila.** La spec dice «si no hay fila o `monedas = 0`»; se extendió a `<= 0` porque la validación ya impide negativos y una fila negativa que se colara por otro camino no debe poder debitar (decisión 4).

### La UI que eligió José (mostrada antes de scaffoldear, preferencia registrada)

Se le ofrecieron tres layouts con mockup y tres definiciones del aviso. Eligió:

- **Fila compacta** con los puntos a la izquierda en solo lectura y el campo de monedas a la derecha; el bono del jefe baja indentado solo en las de equipo; las `ASUME_HECHA` van sin campo y **con el motivo escrito** (decisión 15). Se descartaron la tarjeta por actividad (demasiado scroll con 30 actividades) y la variante con buscador y filtro.
- **Máximo teórico por semana** para el aviso: `Σ (monedas × repeticiones) × sesiones de la Sección`. Es el techo real —lo más alto que alguien puede llegar a cobrar—, contra el techo del otro camino (la zona más alta). Se descartaron «una vez cada cosa» (subestima el techo justo donde hay actividades repetibles) y «por sesión» (deja la comparación con la zona, que es semanal, al ojo del Tutor).

Tres cosas que el cálculo decide y están escritas en `core/calibracion-monedas.ts`: multiplica por las repeticiones (decisión 16), **incluye el bono del jefe** porque es un techo y el techo lo toca quien es jefe de todo, y **cuenta las conductas una vez por sesión** porque no tienen tope y el máximo real sería infinito. La aritmética vive en `core/` y se testea sin montar Angular, como `core/termometro.ts` del #27.

### Verificación

| Proyecto | Antes | Después |
|---|---|---|
| `activity-service` | 357/357 | **357/357** (4 reescritos, ninguno nuevo) |
| `scoring-service` | 57/57 | **63/63** (+6: el descarte del 0 y su simétrico) |
| `rewards-service` | 168/168 | **206/206** (+38) |
| `app-web` | 149/149 | **159/159** (+10) |

- `lint` y `build` verdes. Los **3 warnings** de `no-non-null-assertion` siguen siendo los preexistentes del #21.
- **Migración aplicada contra Postgres real** (`prisma migrate deploy`) y **sin drift**: `prisma migrate diff` → *«No difference detected»*.
- **Suite E2E completa 73/73 en dos corridas seguidas**, con `E2E_UI=1` (las 18 de navegador incluidas, más `app-web` y `public-site` servidos) y con la suite nueva `monedas-por-cumplir.e2e.ts` (6 tests). La primera corrida —antes del fix— dio **3 rojos**, los tres del ítem nuevo, y eso fue lo que destapó el bug del consumidor.
- Migración **aditiva pura**: `RendimientoAccion` nueva + dos valores de enum. No toca ninguna tabla existente, y `activity_db` no tiene migración (decisión 2 cumplida: `activity-service` no cambió **ni un campo** de schema).

### Nota de herramienta: `prisma migrate diff` cambió de flags

Prisma 7.8 renombró `--from-url` / `--to-schema-datamodel` a **`--from-config-datasource` / `--to-schema`**. Las sesiones anteriores usaban los nombres viejos; el comando que verifica drift hoy es:

```
cd apps/<servicio> && npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
```

### Qué falta / verificar la próxima sesión

1. **La vuelta manual en navegador** del ítem completo: cargar precios, completar desde el integrante y ver subir el saldo. Es lo que el #27 dejó pendiente y sigue siendo la verificación que más barato encuentra un problema de forma.
2. Que **`MonedasPorAccion` no tiene consumidor todavía**: se publica y quedó documentado en el catálogo con Notification y Audit como consumidores previstos, pero **ninguno de los dos lo escucha** — exactamente la misma situación que `MonedasAcreditadas` dejó el #22 (verificado con `grep`: cero resultados en ambos `src/`). No es un bug de este ítem; es deuda heredada del #22 que este ítem repite.

---

## Ítem 29: Asistente de IA para el área del Tutor — COMPLETO, 7 de 7 tandas (2026-08-04)

> Spec: `docs/phases/fase-14-29-asistente-ia.md` (escrita antes de tocar código). Índice: entrada #29 de `fase-14-post-mvp.md`.
> **Estado: las 7 tandas ejecutadas y los 12 criterios de aceptación cubiertos.**
> Un Tutor entra por el menú, conversa, ve la propuesta con el valor viejo al lado del nuevo y la aplica — verificado en el navegador contra OpenAI real (tanda 6) y fijado con el proveedor stubbeado para que se verifique en cada corrida (tanda 7).

### Origen (pedido de José, 2026-08-04)

*«Quiero implementar IA a mi aplicación, que una cuenta de empresa pueda usar la IA dentro de la app, que pueda editar tareas, crear tareas y muchas cosas más. Primero el plan de implementación: qué haría la IA, qué debe hacer el dueño para usarla, y cómo implementarla de forma segura. Usaré la API de OpenAI: ¿debo usar API projects o API users?»*

La respuesta a la pregunta técnica, que gobierna la Parte E de la spec: **projects**. Un project por entorno (`dorado-dev` / `dorado-staging` / `dorado-prod`), cada uno con su límite de gasto, y adentro un **service account** con su key. Nunca una key de usuario (muere con la persona y no se puede acotar) y **nunca un project por tenant** (no escala —habría que crear projects por API en cada alta— y el aislamiento entre organizaciones hay que hacerlo en el JWT igual). La atribución de costo por organización se mide en `ai_db` contando tokens, no en el dashboard de OpenAI. Hacia el proveedor van `safety_identifier` (SHA-256 de `organizacionId:usuarioId`) y `prompt_cache_key`, los dos parámetros que reemplazaron al viejo `user`.

### Las cinco decisiones que José cerró antes de que se escribiera una línea

1. **Los tokens los paga la plataforma**, con la IA como feature de PRO y cuota mensual por organización. Descartado BYOK (cada tenant con su key): exige almacén cifrado de secretos por tenant y sube muchísimo la fricción de alta.
2. **La IA propone, el humano aplica.** El modelo no tiene ninguna herramienta que escriba.
3. **Solo `ORG_ADMIN` y `TUTOR`.** El participante no habla con el asistente — eso deja el ítem #4 de la fase (menores) afuera por construcción y no por una regla que haya que mantener.
4. **Cuatro capacidades**: armar catálogo, editar en lote, explicar/analizar el grupo, calibrar tienda.
5. **Viene apagada** y la prende el `ORG_ADMIN` aceptando un aviso, con el consentimiento registrado con fecha y usuario.

### La decisión estructural (es lo que hay que entender antes de tocar las tandas 3–7)

**La IA no tiene manos.** `ai-service` no conoce ningún secreto que le permita mutar la base de otro servicio: sus clientes internos son todos `GET`, y **aplicar una propuesta lo hace el frontend con el JWT del Tutor contra los endpoints públicos que ya existen**. Cero superficie de escritura nueva, ninguna autorización nueva que auditar, y el peor caso de un prompt injection exitoso es una propuesta fea que un humano ve antes de aplicar.

La segunda defensa es de la misma clase —estructural, no un chequeo—: **el tenant nunca es un argumento de una herramienta**. Ninguna herramienta de lectura declara `organizacionId` ni `grupoId`; los inyecta el servicio desde el JWT. El modelo no puede pedir datos de otro grupo porque no existe un parámetro donde escribirlos.

Si en una tanda futura aparece la tentación de que `ai-service` escriba «para que sea más cómodo», parar y volver a la spec: eso no es una optimización, es el ítem entero.

### Tanda 1 — billing (feature + cuota)

- `Plan.asistenteIa` (`Boolean @default(false)`) y `Plan.cuotaTokensIaMensual` (`Int?`), migración **aditiva pura**.
- `seed-planes.ts`: FREE → `false` / `0`; PRO → `true` / `2_000_000`. **El 2M es un punto de partida, no una conclusión** — es el número a revisar con el consumo real del piloto.
- `EntitlementsDto` sumó `features.asistenteIa` y `limites.tokensIaMensuales`.
- Verificado contra Postgres real: `FREE → f / 0`, `PRO → t / 2000000`, y `migrate diff` → *«No difference detected»*.

**La trampa que deja anotada**: una columna nullable nueva deja las filas existentes en `NULL`, y en este modelo `NULL` significa **sin límite** — o sea lo contrario de lo seguro. No es un bug porque `asistenteIa` cae en `false` y la cuota no se consulta con la feature apagada. Pero fija una regla para las tandas 4 y siguientes: **el gate es `asistenteIa`, y la cuota nunca se lee sin haber pasado por ahí primero.**

### Tanda 2 — andamio de `ai-service`

Servicio NestJS nuevo, **puerto 3009**, prefijo `/api/ai`, base propia `ai_db`. Molde: `rewards-service`.

- Schema con cuatro modelos: `ConfiguracionIaOrganizacion` (el opt-in), `Conversacion`, `Mensaje` (ledger inmutable, fuente de verdad del consumo) y `Propuesta`.
- **El consumo se deriva sumando `Mensaje`, no de un contador mutable** (regla 1 del proyecto aplicada a los tokens). Un `tokensUsados` que se incrementa sería justo el campo mutable que este proyecto no usa en ninguna parte, y acá además el que decide si se le cobra a la plataforma.
- `comun/excepciones.ts` **desde el día uno**, con los 7 `code` de la spec. Se escribió antes que cualquier endpoint a propósito: en rewards, que era el único servicio con codes de negocio sin ese archivo, la E2E del #26 descubrió que **ningún code llegaba al cliente** después de tener el servicio entero escrito del modo equivocado.
- `configuracion/` completo: `GET`/`PUT /ai/configuracion`, con el `PUT` restringido a `ORG_ADMIN` (prender el asistente saca datos hacia un tercero: es decisión del dueño, no de cada Tutor).
- `BillingClientService` con **fail-CLOSED**, al revés que el de activity (fase-04) y a propósito, documentado en el propio archivo: allá un billing caído omite un chequeo de límite y el costo es una actividad de más; acá el entitlement decide si se gasta dinero real contra un proveedor externo, así que la duda se resuelve **apagando**.
- Fuera del servicio: `tabla-ruteo.ts` + `env.schema.ts` del Gateway, `apps/gateway/.env(.example)`, `.env.production.example`, `infra/docker/init-databases.sh` (`ai_db`), `CLAUDE.md` (puerto 3009) y `libs/shared-types/src/lib/ia.ts`.

**Al terminar la tanda 2 el dueño puede prender el switch y no pasa nada.** Eso es el criterio, no un efecto colateral: la superficie de configuración existe y funciona antes de que exista una sola llamada al proveedor.

### Los dos bugs que encontró la verificación, no la escritura

1. **`?? 0` colapsaba «sin límite» a «sin cuota»** en `estadoDelPlan`. Lo agarró un test unitario, y es exactamente la trampa que la tanda 1 había dejado anotada media hora antes: `null` y `0` están a un carácter de distancia y significan lo opuesto.
2. **El servicio no arrancaba con la API key vacía.** `@IsOptional()` de class-validator solo saltea `undefined` y `null`, no string vacío — y `.env.example` declara `OPENAI_API_KEY=`, así que **quien copiara el ejemplo tal cual se quedaba con un servicio que no levanta**, lo contrario del criterio entero de la tanda. **Tests, lint y build estaban los tres verdes**; lo destapó levantar el proceso de verdad. Es el **quinto caso del mismo modo de falla en la Fase 14** —tras `turnos-de-hoy` (#23 T1), el «✓ hizo» del Tutor (#23 T4), el ocultamiento por vigencia (#24) y el consumidor round-robin (#28)—: *la unidad verifica la pieza y lo que falla es el cable*. Resuelto con `@Transform(value === '' ? undefined : value)` y fijado con `env.schema.spec.ts` (6 tests).

### Desviaciones registradas

- **`EventoProcesado` no se creó.** El árbol que se le mostró a José antes de scaffoldear la incluía, pero la decisión 15 de la spec dice que este servicio no toca RabbitMQ: la tabla habría nacido muerta.
- **`Mensaje` no está en `MODELOS_TENANT`** aunque lleve `organizacionId`: cuelga de una `Conversacion` que sí está filtrada, no tiene `grupoId`, y el cálculo de cuota necesita agregarlo por organización **fuera** de un contexto de grupo. El service manda `organizacionId` explícito en el `where` — mismo criterio que los services de monedas de rewards.
- El generador `@nx/nest` **no acepta `--unitTestRunner=vitest`** (solo `jest|none`). Se generó con `none` y se agregaron a mano `vitest.config.mts`, `eslint.config.mjs`, los targets `prisma-generate`/`prisma-migrate` y los flags estrictos de `tsconfig.app.json`, copiados de `rewards-service`.
- `prisma migrate dev` **no regeneró el cliente** (el seed de billing falló con `Unknown argument asistenteIa` hasta correr `prisma generate` a mano). Misma familia que la nota de flags del #28.

### Verificación

| Proyecto | Antes | Después |
|---|---|---|
| `ai-service` | — | **18/18** (nuevo: 12 de configuración + 6 de env) |
| `billing-service` | 9/9 | **9/9** |
| `gateway` | 36/36 | **36/36** |
| El resto del workspace | — | sin cambios (activity 357, app-web 159, rewards 206, identity 48, session 74, scoring 63, notification 22, audit 24, shared-ui 24, shared-auth 20, e2e 17) |

- **`lint` 19/19 proyectos** y **`build` 18/18** verdes.
- **Dos migraciones aplicadas contra Postgres real** (`billing_db` y `ai_db`), las dos con `migrate diff` → *«No difference detected»*.
- **Arranque real del proceso verificado**: `Nest application successfully started`, rutas `GET`/`PUT /ai/configuracion` mapeadas, **sin `OPENAI_API_KEY`**, y `401` sin JWT.
- `admin-web:test` sigue fallando por no tener ningún `.spec.ts` — deuda declarada del #5, **verificada como preexistente**, no una regresión de este ítem.
- **Sin E2E todavía**: es la tanda 7. Nada de lo hecho hasta acá pasó por el Gateway.

### Tanda 3 — clientes internos de lectura + las 8 herramientas (2026-08-04)

Los dos tests estructurales se escribieron **como tests sobre la forma, no sobre el comportamiento**, que es la diferencia que hace que sigan valiendo en la tanda 6:

- **`definiciones.spec.ts`** recorre las 8 definiciones y falla si alguna declara un parámetro que matchee `/organizacion|grupo|tenant|usuarioId|principal/`. Un test de comportamiento probaría que las herramientas de HOY ignoran el tenant que manda el modelo; este prueba que **no hay dónde escribirlo**. Verifica además que ninguna tenga `required` no vacío (un obligatorio sería contexto, y el contexto lo pone el servicio) y que ninguna acepte propiedades extra.
- **`clientes-solo-lectura.spec.ts`** lee los archivos de `src/clientes/` **como texto** y falla ante cualquier `method:` que no sea `'GET'`, ante cualquier mención de `POST|PUT|PATCH|DELETE`, y si aparece un `fetch(` fuera de la base. Leer el fuente en vez de importarlo es a propósito: lo que se quiere fijar es una propiedad de lo que se commitea, y un `method: 'POST'` en una rama que ningún test recorre igual aparece. Tiene también un test que falla si la carpeta se queda sin clientes — el modo de falla clásico de un test que barre archivos es pasar por estar vacío.

**La forma que hace verdadero al primero**: todos los clientes extienden `ClienteInternoBase`, que expone **un solo método de red, `get`**. No existe el método que escribiría. `BillingClientService` se migró a la misma base en el camino (su `null` significa otra cosa —fail-closed, apaga el asistente— pero eso lo decide `ConfiguracionService`, no el cliente).

**Y la que hace verdadero al segundo**: `ContextoHerramienta` es el único argumento de tenant del ejecutor, y **solo `AccesoGrupoService.contextoPara` sabe construirlo**. No se puede ejecutar una herramienta sobre un grupo que nadie validó porque no hay forma de fabricar un contexto sin pasar por la validación.

**Ese `AccesoGrupoService` no es una copia del de los otros servicios, y la diferencia importa.** En activity/rewards/scoring, una lectura con un `grupoId` ajeno la vuelve inofensiva el filtro automático de tenant de Prisma: devuelve lista vacía. `ai-service` **no tiene tablas propias con estos datos** — los pide por REST interno con el `grupoId` como parámetro, y los endpoints internos confían en el llamador. Si acá no se valida la pertenencia, **no la valida nadie**: para un `ORG_ADMIN` (que viaja con `grupoIds` vacío por diseño) el chequeo local pasa siempre, así que hace falta la llamada a identity. Es exactamente el criterio de aceptación 4, y se verificó contra identity real con dos organizaciones distintas.

**Endpoints internos nuevos** (todos `GET`, todos de solo lectura): `activity` sumó `grupos/:id/actividades`, `grupos/:id/conductas` y `grupos/:id/resumen-cumplimiento`; `scoring` sumó `grupos/:id/resumen-puntajes`; y **`rewards` estrenó `InternalController`** — la spec de Fase 8 no le había definido ninguno y hasta acá solo tenía el health.

Dos decisiones de diseño de esos endpoints:

- **`resumen-puntajes` resuelve la Sección dentro de scoring**, desde su propio ledger (`EventoPuntos` más reciente del grupo), en vez de pedírsela a session-service. Encadenar un tercer servicio para contestar algo que el ledger ya sabe agrega una dependencia y un modo de falla a un camino de solo lectura. Devuelve `origen: SNAPSHOT | EN_VIVO` y el ejecutor lo traduce a `definitivo: true/false`: **el modelo tiene que poder decir «provisorio» cuando lo es**.
- **`resumen-cumplimiento` cuenta solo las marcas vigentes** (`eliminado` sin `revertidoPorTutorId` queda afuera, igual que queda afuera del puntaje) y **devuelve también las actividades con 0 marcas**, que son justamente el caso que la herramienta existe para encontrar. Verificado contra datos reales: de 18 actividades del grupo piloto, apareció una en 0/0/0.

`listar_participantes` compone gente + roles + equipos en **una sola herramienta y no en tres**: las tres preguntas se hacen juntas («¿a quién le pongo esta actividad?»), y separarlas costaría tres vueltas del loop, o sea tres llamadas al proveedor pagadas para responder una cosa. **Sin emails ni `username`**, y no por un filtro: `UsuarioDto` no tiene email, así que no hay de dónde sacarlo — la única forma en que una regla sobre datos personales sobrevive a las próximas cuatro tandas. Hay un test que serializa la salida y busca `@`.

Las cuatro `*_INTERNAL_URL` nuevas son **requeridas** en el env schema, no opcionales: un servicio que levanta sin saber a quién preguntarle deja herramientas que fallan de a una en medio de una conversación, mucho más difícil de diagnosticar que un proceso que no arranca y dice por qué.

#### El bug que encontró levantar el stack (y el que encontró el build)

1. **`ai-service` no tenía `internal-health.controller.ts`.** Faltaba desde la tanda 2 y no se notó porque la verificación de esa tanda fue contra el puerto directo. El Gateway pingea `/internal/health`, no la puerta pública: `GET /api/health` reportaba **`ai: "down"` con el servicio arriba y contestando 401 correctamente**. Peor que un dato feo en una pantalla: volvía **imposible de verificar el criterio de aceptación 9** de la spec —«con ai-service apagado, el health lo reporta caído»— porque lo reportaba caído siempre, prendido o apagado. **Sexto caso del mismo modo de falla en la Fase 14** (tras `turnos-de-hoy` del #23 T1, el «✓ hizo» del #23 T4, el ocultamiento del #24, el consumidor round-robin del #28 y la API key vacía de la tanda 2): *la unidad verifica la pieza y lo que falla es el cable*.
2. **`EstadoCatalogo` no existe como tipo en `shared-types`** (los DTOs del catálogo usan el literal `'ACTIVA' | 'ARCHIVADA'`). Lo escribí en el DTO nuevo y **tests y lint pasaron los dos en verde**: vitest transpila sin chequear tipos y ESLint no está en modo type-aware. Lo agarró el `build`. Vale como recordatorio de que en este repo **los tres targets miran cosas distintas** y ninguno subsume a los otros.

#### Verificación de la tanda 3

| Proyecto | Antes | Después |
|---|---|---|
| `ai-service` | 18/18 | **47/47** (+29: 6 estructurales de definiciones, 4 estructurales de clientes, 12 del ejecutor, 5 de acceso al grupo, 2 de env) |
| `activity-service` | 357/357 | **357/357** |
| `scoring-service` | 63/63 | **63/63** |
| `rewards-service` | 206/206 | **206/206** |
| El resto del workspace | — | sin cambios (app-web 159, identity 48, session 74, notification 22, gateway 36, shared-ui 24, shared-auth 20, billing 9, e2e 17) |

- **`lint` 19/19** y **`build` 18/18** verdes (`--skip-nx-cache` los dos).
- **Stack real levantado** (7 servicios) y los **8 endpoints internos nuevos ejercitados con `x-internal-secret`: los 8 en 200 con datos del grupo piloto**.
- **Las 8 herramientas ejecutadas contra los servicios reales** con un spec temporal (borrado al terminar): las 8 en `ok=true`. Y el aislamiento del `ORG_ADMIN` verificado contra identity real: grupo de otra organización → rechazado, grupo propio → contexto.
- **El Gateway rutea `/api/ai`** (pendiente #1 de la sesión anterior): `GET /api/ai/configuracion` sin token devuelve el `401 NO_AUTENTICADO` que emite ai-service — o sea proxyó y el servicio contestó, no un 404 del Gateway.
- **`/api/health` reporta `ai: "up"`** después del fix del health controller.
- Sin migraciones: esta tanda **no tocó ningún schema Prisma**.

**Fuera del código**: `infra/render.yaml` sumó el **décimo servicio** (bloque `ai-service` completo, sin `RABBITMQ_URL` porque no toca eventos) y `AI_INTERNAL_URL` en el Gateway — no estaban, la tanda 2 no había llegado a ese archivo. `.env.production.example` sumó la sección de `ai-service`, que tampoco existía. `apps/ai-service/.env(.example)` sumaron las cuatro URLs internas.

### Tanda 4 — el loop con OpenAI (2026-08-04)

Primera tanda que gasta dinero real. José cargó la key (`sk-proj-…`, de un service account como pedía la spec) y preguntó qué poner en `OPENAI_MODEL`, que la spec deliberadamente **no** ancló.

**El modelo: `gpt-5.6-terra`.** Se verificó contra la doc del proveedor —tres modelos de frontera vigentes, los tres con function calling— y se probaron los tres con la key real. El criterio no fue «el del medio»: esta tarea **no necesita razonamiento de frontera** (hay que llenar veintipico de campos de forma consistente teniendo el schema a la vista, no resolver algo difícil), así que Sol se paga sin comprar nada; pero **tampoco es barata de verdad**, porque cada propuesta se valida contra el DTO real y **una que no valida vuelve al modelo para que reintente**, o sea que un modelo flojo no ahorra tokens, los gasta dos veces. Es una línea de `.env`: si el piloto muestra que Luna alcanza para lo conversacional, cambiarlo cuesta un deploy.

#### Lo que encontró probar contra la API antes de escribir el loop

Se hizo una llamada real **antes** de escribir una línea del loop, y trajo dos cosas que hubieran salido mal:

1. **Un turno puede traer VARIAS `function_call`.** Una pregunta simple devolvió dos en la misma respuesta. Un loop que asume «una herramienta por iteración» descarta trabajo que el modelo pidió y deja un `call_id` sin responder, que es como se cuelga un loop de herramientas. Por eso **el tope de 8 cuenta TURNOS, no llamadas**: contar llamadas cortaría a la mitad un turno legítimo que pidió tres listados juntos.
2. **Los tokens de razonamiento se facturan y compiten contra `max_output_tokens`.** Vienen dentro de `output_tokens` (13 de 72 en una respuesta corta), así que contabilizarlos aparte subestimaría justo los turnos que más piensan; y un `max_output_tokens` chico hace que el razonamiento se coma el presupuesto y salga `status: incomplete` con texto vacío — que en pantalla se ve como si el asistente no hubiera contestado, no como un error.

#### EL BUG DE LA TANDA: la fórmula del `prompt_cache_key` de la spec no funciona

La spec fija `prompt_cache_key = org:${organizacionId}:grupo:${grupoId}`. Con dos uuid eso mide **83 caracteres**, y el proveedor rechaza ese parámetro por encima de **64** (medido: 64 pasa, 65 devuelve `string_above_max_length`). Con la fórmula literal **toda conversación terminaba en 503** — no había forma de que el asistente funcionara una sola vez, y el síntoma era un `PROVEEDOR_NO_DISPONIBLE` genérico que no decía nada sobre la causa.

Resuelto con un **sha-256 hex, que mide exactamente 64 y entra justo sin recortar**. Conserva lo único que la clave necesita cumplir (mismo grupo ⇒ misma clave, otro grupo ⇒ otra) y arregla de paso **una contradicción interna de la spec**: su Parte E punto 7 dice que el id de organización *no sale en claro* hacia el proveedor, y esa fórmula lo mandaba en claro en cada llamada. **Desviación registrada; la spec no se edita.**

Es el **séptimo caso del mismo modo de falla en la Fase 14**: unidad, lint y build no podían verlo —el string se arma bien, lo rechaza el tercero—, lo destapó llamar de verdad.

#### Decisiones propias de la tanda

- **El historial que se le manda al modelo es solo el texto conversado: las llamadas a herramientas NO se reproducen.** El ledger guarda un resumen (`ok (2186 bytes)`), no los datos, así que no habría con qué rearmarlas — y no es una limitación sino lo correcto: si el Tutor pregunta algo dos horas después, conviene que el modelo **vuelva a leer** el catálogo en vez de razonar sobre una foto vieja. Es la decisión «memoria entre conversaciones: ninguna, el contexto lo dan las herramientas» aplicada también **entre turnos**.
- **Las filas de herramienta se guardan con 0 tokens.** Lo que cuesta una herramienta es que su salida entre como *entrada* del turno siguiente, y eso ya lo contabiliza ese turno: cargarlo en los dos lados contaría doble.
- **`ErrorConConsumo`**: un fallo del proveedor en la vuelta 3 no puede borrar la contabilidad de las vueltas 1 y 2. El error arrastra el parcial y el `finally` del service lo escribe igual, mientras hacia arriba viaja la causa real y no el envoltorio interno.
- **Tarifa de un modelo desconocido: la más cara conocida, no cero.** Un modelo nuevo en el `.env` no puede reportar costo 0 —eso diría que el asistente es gratis justo cuando nadie sabe cuánto sale—. Sobreestimar es el error barato.
- **El `POST /mensajes` todavía NO es SSE**, que es lo que pide la Parte C. Se difiere a la tanda 6 junto con la pantalla que lo consume y con el cable que la propia spec marca como riesgoso (que el proxy del Gateway no buffere `text/event-stream`): streamear contra un cliente que no existe habría dejado sin verificar justamente lo que puede romperse. **Anotado como pendiente explícito, no como olvido.**

#### Verificación de la tanda 4

| Proyecto | Antes | Después |
|---|---|---|
| `ai-service` | 47/47 | **82/82** (+35: 9 del loop, 7 del proveedor, 5 de tarifas, 14 de conversaciones) |
| El resto del workspace | — | sin cambios (activity 357, rewards 206, app-web 159, session 74, scoring 63, identity 48, gateway 36, shared-ui 24, notification 22, shared-auth 20, e2e 17, billing 9) |

- **`lint` 19/19** y **`build` 18/18** verdes. Sin migraciones: el schema de la tanda 2 ya tenía los cuatro modelos.
- **Conversación real contra OpenAI, de punta a punta por el Gateway: 12/12 checks verdes**, cubriendo los criterios de aceptación 1, 2, 3, 4, 5 y 10 de la spec:
  - FREE → 402 `FEATURE_NO_DISPONIBLE` al habilitar **y** al conversar.
  - PRO con el switch apagado → 403 `IA_NO_HABILITADA`; habilitar sin aceptar → 400 `AVISO_NO_ACEPTADO`; con el aviso → `aceptoAvisoEn` escrito.
  - **El modelo llamó herramientas de verdad** (`listar_actividades` + `listar_umbrales_zona` en el mismo turno) y contestó en castellano con el catálogo real del grupo.
  - **Cuota agotada → 402 `CUOTA_IA_AGOTADA` y el proveedor NO se llamó** (llamadas antes = llamadas después): el pre-flight corta antes de gastar, no después.
  - Un Tutor de otra organización PRO y habilitada → **404** sobre la conversación ajena.
  - `GET /ai/configuracion` reporta exactamente la suma del ledger, y **no existe ninguna columna contador** (verificado contra `information_schema`).
- **Costo medido** de una conversación de 2 mensajes con 4 llamadas al proveedor y un catálogo chico: **7.910 tokens, USD 0,0117**. Sin caché habrían sido USD 0,0188 → **el `prompt_cache_key` ahorró un 38%**, que es la razón por la que ese parámetro está en el diseño.
- **Lo que eso implica para la cuota**: al ritmo medido (≈1,48 µUSD por token), una organización que queme los **2M tokens del plan PRO** cuesta **≈ USD 3**. El tope de gasto del project `dorado-dev` está hoy en **USD 5**, o sea que alcanza para desarrollo y el piloto pero **está por debajo de dos organizaciones a cuota llena** — hay que subirlo o bajar la cuota antes de vender el plan.

### Tanda 5 — las herramientas de propuesta (2026-08-04)

Las cuatro `proponer_*`, la validación con Zod y el ciclo de vida de `Propuesta`. Es la tanda donde la IA empieza a proponer cambios de verdad — y donde **la asimetría del ítem se vuelve código**: el modelo «llama» a estas herramientas y no ejecutan nada; el servicio valida, guarda una fila en `ai_db` y le contesta «propuesta armada, mostrala».

#### Que un cambio de DTO rompa el build (y la verificación de que realmente pasa)

La spec pide que las operaciones se persistan con la forma exacta del request destino «para que un cambio de DTO rompa el build acá y no en producción». Eso **no era posible** como estaba el repo: `CrearActividadRequest` y compañía vivían solo como clases con decoradores dentro de su servicio, y `ai-service` no puede importarlas.

Se llevaron los **contratos** a `shared-types` y las clases los `implements` con un alias local (`implements ContratoCrear`), sin renombrar nada. Dos detalles que costaron:

- **Los enums no son compatibles entre servicios.** La clase de activity valida contra los enums que **genera Prisma**; TypeScript trata dos `enum` declarados por separado como tipos distintos aunque tengan los mismos valores, así que el `implements` no compilaba. Se resolvió tipando esos campos con el **tipo plantilla del enum** —que da la unión de sus strings— al que sí son asignables los miembros de ambos enums, y que se sigue derivando del enum.
- **La anotación `z.ZodType<Contrato>` sola no alcanza.** Por tipado estructural, un esquema al que le falta un campo **opcional** del contrato sigue siendo asignable: renombrar `siempreVisible` no habría roto nada y la propuesta simplemente habría dejado de poder configurarlo — un deterioro silencioso, peor que un build roto. Se cerró con un chequeo de cobertura de claves (`Exhaustivo<ClavesNoCubiertas<...>>`), y **se verificó a mano renombrando un campo opcional a propósito**: el build falla nombrando el campo.

#### Los dos bugs que encontró llamar de verdad (y el segundo cambió el diseño)

1. **La propuesta se guardaba impecable y fallaba entera al aplicar.** La primera corrida real armó 4 actividades de shape perfecto y **las 4 devolvieron 400**: el modelo mandaba `deadlineHora` y `duracionCronometroMinutos` en actividades `SIN_LIMITE`. Zod decía que sí (los campos existen, el formato es válido) y el endpoint decía que no (en `SIN_LIMITE` van en null). O sea exactamente lo que la decisión 11 existe para evitar: *«el Tutor nunca ve una propuesta que la API rechazaría»*. Faltaban los **invariantes cruzados**, que ahora viven en `propuestas/invariantes.ts`.

2. **El modelo NO puede omitir una propiedad declarada.** Al agregar los invariantes como rechazos, dos corridas seguidas terminaron con el modelo **quemando las ocho iteraciones del loop** contra el mismo error, alternando entre poner un valor de relleno y sacarlo, y la conversación terminó **sin ninguna propuesta**. Se le estaba pidiendo algo imposible: emite todas las propiedades del esquema, siempre. Su única forma de decir «no aplica» es `null`.

   Eso obligó a **cambiar la regla del archivo**, que es el aprendizaje de la tanda:

   > **Se rechaza lo ambiguo, se normaliza lo determinado.**

   Con `SIN_LIMITE`, los dos campos son null y no hay otra lectura posible: pedirle al modelo que acierte algo que el servidor deriva solo es hacerle hacer trabajo que además hace mal, y pagarlo en tokens. Un `DEADLINE` sin hora se sigue rechazando —esa hora no se puede inventar—. Es además lo que el propio endpoint destino hace con otros campos (`bonoJefePuntos` fuera de EQUIPO): los fuerza en silencio.

   **El resultado se mide**: el mismo pedido pasó de 49,5 s y 67.000 tokens (sin propuesta) a **19,6 s y 48.000 tokens con la propuesta armada**. Dejar de pelear con el modelo salió más barato y más correcto.

   Corolario para las tandas que vienen: en un **alta**, `null` / `""` / `[]` son todos «no lo puse»; en un **PATCH**, `null` **borra** el campo (fase-14-24) y se conserva. Son dos significados opuestos del mismo valor, y `limpiarVacios` lleva el flag explícito.

#### El tercer bug: el Gateway cortaba a los 30 s

Una corrida tardó 30,0 s y se comió un **502 `SERVICIO_NO_RESPONDE`** mientras `ai-service` seguía trabajando **y gastando tokens** del otro lado: el Tutor veía un error y la plataforma pagaba igual. El `proxyTimeout` del Gateway era un **30 s fijo para todas las rutas**.

Se hizo **por ruta**, con el default de la spec de Fase 3 intacto y solo `/api/ai` en 120 s. No es «subamos el timeout global»: que un servicio interno tarde más de 30 s significa que está roto, y eso se quiere seguir viendo. Mismo criterio de *seam* que el `RATE_LIMIT_*` del #23 T4.

#### Otras decisiones

- **`proponer_precios_tienda` apunta a `/rewards/productos/:id`, no a `/rewards/recompensas/:id`** como dice la Parte D de la spec: **en `Recompensa` no hay ningún precio**, vive en `ProductoTienda`. Con la ruta literal de la spec, aplicar habría fallado siempre. **Desviación registrada; la spec no se edita.**
- **Una propuesta que no valida no se guarda, ni siquiera parcialmente.** No se guarda «lo que sí validó»: una propuesta a medias es peor que ninguna, porque el Tutor no tiene cómo saber qué falta.
- **`VENCIDA` se deriva de la fecha al leer**, no se persiste. Un cron que recorra la tabla marcando filas viejas es trabajo y un modo de falla nuevo a cambio de nada.
- **Los invariantes son un espejo deliberado** de reglas que viven en activity, y **pueden derivar**: queda anotado. La alternativa —un endpoint de «validá esto sin guardarlo»— era superficie nueva en el servicio que este ítem se propuso no tocar, y la red de seguridad es que fallar es visible y recuperable (fila roja).

#### Verificación de la tanda 5

| Proyecto | Antes | Después |
|---|---|---|
| `ai-service` | 82/82 | **126/126** (+44: 22 de propuestas, 19 de invariantes, 3 estructurales nuevos) |
| `gateway` | 36/36 | **41/41** (+5: `tabla-ruteo.spec.ts`, que no existía) |
| El resto del workspace | — | sin cambios (activity 357, rewards 206, app-web 159, session 74, scoring 63, identity 48, shared-ui 24, notification 22, shared-auth 20, e2e 17, billing 9) |

- **`lint` 19/19** y **`build` 18/18** verdes. Sin migraciones: el schema de la tanda 2 ya tenía `Propuesta`.
- **Ciclo completo contra OpenAI real, por el Gateway: 14/14 checks**, cubriendo los criterios 6, 7 y 8:
  - El modelo leyó el catálogo vacío y las zonas, y **armó una propuesta de 4 actividades** con valores calibrados contra los umbrales del grupo.
  - **Nada se escribió hasta aplicar**: el catálogo seguía en 0 con la propuesta ya guardada.
  - **Las 4 operaciones se aplicaron tal cual**, con el JWT del Tutor y sin traducir un solo campo — que es la prueba real de «aplicar es un `for`».
  - Aplicado parcial → `APLICADA_PARCIAL` con las 3 filas; re-aplicar → 409; vencida → legible pero 409 al aplicar; propuesta de otra organización → 404.
- Zod **4.4.3** es dependencia nueva del workspace.

### Tanda 6 — el frontend y el SSE (2026-08-04)

La pantalla `/asistente`, la conversión del `POST /mensajes` a SSE y el rate limit por usuario de la Parte E 5c. Es la tanda donde el ítem se vuelve algo que un Tutor puede usar.

#### La decisión que José tomó antes de que se escribiera una línea

Se le ofrecieron dos profundidades de streaming y eligió **«el más barato, con tal de que dé la respuesta igual de bien»**, o sea: **SSE de progreso, con el texto entero en un solo evento**. Vale dejar escrito por qué esa opción no le quita nada al producto, porque el nombre engaña:

- **No cambia la respuesta ni lo que cuesta.** El proveedor cobra lo mismo con `stream: true` que sin él, y devuelve el mismo texto. Lo único que cambia es si aparece de a pedacitos o de una.
- **Lo caro estaba en otro lado.** Streamear los deltas obliga a parsear el SSE del proveedor, a acumular los argumentos de las `function_call` a mano y a sacar el `usage` del evento final — es decir, a reescribir el único camino del monorepo que gasta dinero, y a rehacer la contabilidad del `finally` que la Parte E punto 6 exige.
- **Y el 90% del tiempo de espera no es texto.** Medido en esta tanda: de un turno de 4,6 s, el texto tardó 2,1 s y el resto se fue en llamadas a herramientas. Lo que hace usable la pantalla es **saber qué está haciendo** («leí las actividades del grupo», «armé una propuesta»), no ver la última oración escribirse letra por letra.

Los otros dos: layout de **una columna con el historial en panel** (el área Tutor ya gasta una columna en la sidebar; dos layouts era mantener dos), y el **rate limit por usuario entra en esta tanda**.

#### Los dos endpoints negocian por `Accept`, y no es una transición

Con `Accept: text/event-stream` transmiten; sin él contestan el JSON de siempre. **Hay dos clientes legítimos con necesidades opuestas**: el navegador, que necesita mostrar algo durante 40 segundos, y los scripts de verificación y la suite E2E de la tanda 7, que quieren un cuerpo entero que se pueda afirmar de una. La lógica es una sola — `ConversacionesService` recibe un emisor opcional y no sabe cuál de los dos lo llama; sin emisor el camino no tiene ni una rama nueva.

**`POST /conversaciones` también transmite**, aunque la spec solo pide SSE en `/mensajes`: el primer mensaje corre exactamente el mismo loop, y dejarlo como request/response haría que *toda conversación nueva arranque con la pantalla congelada* — justo el momento en que el Tutor todavía no sabe si esto funciona.

#### La regla del controller, que es lo único que hay que entender de él

> **El canal no se abre hasta que el turno emite su primer evento.**

Todo lo que rebota antes de gastar un token —el plan, el switch del dueño, la cuota, que la conversación sea de otro— sale como status HTTP de verdad: 402, 403, 404. Abrir el stream primero convertiría esos cuatro rechazos en un `200 OK` con la mala noticia adentro, y el cliente tendría que aprender a leer errores en dos lugares para saber por qué no puede hablar. Después del primer evento ya hay un 200 escrito y no hay vuelta: de ahí en más el fallo viaja como evento `error` con el mismo `code` de negocio. Por eso `transmitir()` **no tiene `finally`**: cerrar el canal en el camino del rechazo dejaría al `HttpExceptionFilter` sin dónde escribir.

#### Tres cosas que se resolvieron distinto de lo obvio

1. **El latido de 15 s no es decorativo.** Entre que el modelo empieza a pensar y contesta pueden pasar 50 segundos sin un solo byte, y el `proxyTimeout` de `/api/ai` es de 120 s **de inactividad**. Sin latido, un turno lento queda a un pelo del mismo 502 que encontró la tanda 5 — pero esta vez con la respuesta ya en camino.
2. **Una emisión que falla no puede tumbar el turno.** El Tutor cierra la pestaña, el socket muere y el próximo `write` lanza. Si esa excepción subiera, se perdería el `ResultadoLoop` con todo lo gastado: **cortar la conexión saldría gratis**, que es exactamente lo que la Parte E punto 6 no permite. El emisor va envuelto en un `try/catch` que loguea y sigue, y el canal ignora todo lo que se escriba después de que el cliente cortó.
3. **El rate limit por usuario es una capa propia, no un número más.** El limitador que ya existía corre en el paso 3 de `main.ts`, **antes** de la validación JWT — y la clave que hace falta acá es el `sub` del token, que en ese punto no existe todavía. Va como paso 5, después del JWT. **10 turnos por minuto y por persona**: un turno tarda 20–50 s con un humano esperándolo, así que nadie llega a 3 usando la app; corta bastante antes de que un bucle haga daño, y la cuota mensual sigue siendo la defensa del gasto total.

#### El bug que encontró el test, y por qué importa el modo de falla

`standardHeaders: 'draft-8'` de `express-rate-limit` llama a `response.append()`, que es un método de **Express** y no de `node:http`. El doble de respuesta del test no lo tenía, la librería capturó ese fallo y lo pasó a `next(err)` — o sea que **el request siguió de largo como si no hubiera límite**: 11 de 11 pasaron. Un doble incompleto convirtió «cortado» en «permitido» sin decir una palabra. En producción `append` existe (el limitador global ya lo usa y sus 429 están probados), así que era un artefacto del test, pero el modo de falla —*una defensa que se apaga en silencio*— es el que no se puede dejar pasar. La lista de métodos del doble quedó documentada como parte del test.

#### Los dos hallazgos de mirar la pantalla, que ningún test iba a dar

Se corrió una conversación real contra OpenAI **en el navegador**, con capturas. Las dos correcciones salieron de mirarlas:

1. **El orden estaba al revés de como ocurrió.** La tarjeta de propuesta se dibujaba **arriba** del rastro de herramientas que la había producido, porque las propuestas colgaban del último mensaje y el rastro iba después del bucle. Ahora el rastro va pegado al **último mensaje del usuario** —el que lo disparó— y las tarjetas al final: usuario → rastro → respuesta → propuestas.
2. **El consumo decía «0%» después de gastar dinero de verdad.** Una conversación entera come ≈0,4% de la cuota de PRO y `Math.round` lo dejaba en cero, que se lee como «el contador no anda». Abajo del 1% ahora dice «menos del 1%».

#### La tarjeta de propuesta es el control humano de todo el ítem

La decisión 2 —«la IA propone, el humano aplica»— vale exactamente lo que valga lo que se lee en esa tarjeta: **si el Tutor no entiende qué va a pasar, aprobar es un botón y no una revisión**. De ahí tres cosas:

- **Nada de JSON crudo.** `core/propuesta-ia.ts` traduce el request literal del endpoint destino a filas legibles, con el valor viejo al lado del nuevo. Hay un test que afirma que la pantalla no contiene ni `valorPuntos` ni `{`.
- **Se saltean los campos que no cambian nada.** El modelo **no puede omitir una propiedad declarada** (lo aprendió la tanda 5), así que una edición que solo sube los puntos igual llega con veinte campos; sin ese filtro, el único que importa queda escondido entre diecinueve que no.
- **El orden de los campos es una decisión, no el orden en que el modelo los emitió** — que cambia entre respuestas y haría que dos propuestas del mismo tipo se lean distinto sin ninguna razón.

Y **se confirma «Aplicar» pero no «Descartar»** (regla del #23 T4: se confirma lo que no tiene vuelta atrás). Descartar no borra nada que exista en el grupo: la propuesta nunca tocó una base.

#### Otras decisiones

- **El switch del `ORG_ADMIN` va en el panel de la organización, no en la configuración del grupo.** La fila de configuración es *por organización* (decisión 5) y prenderla manda datos a un tercero: un switch en la pantalla de un grupo sugeriría que se prende por grupo —lo que es falso— y lo pondría al alcance de quien no tiene esa decisión.
- **Se escribió un parser de SSE propio (`core/sse-parser.ts`) en vez de usar `EventSource`.** `EventSource` solo hace GET y no manda cabeceras; esto es un `POST` con body y con el token en `Authorization` (regla 7: el access token vive en memoria, no hay cookie de sesión que aprovechar). Lo que se pierde con `fetch` es la reconexión automática, y **perderla es lo correcto**: un turno que se reconecta solo vuelve a llamar al proveedor y vuelve a pagarlo.
- **El rastro de herramientas se borra al terminar el turno.** Una conversación reabierta desde el historial no lo tiene (el ledger guarda un resumen, no los pasos), así que dejarlo solo en el turno en vivo haría que la misma conversación se vea distinta antes y después de recargar.
- **`ai-service` no ganó ningún camino de escritura.** El «Aplicar» lo hace `app-web` con el JWT del Tutor, contra `POST /api/activity/actividades` y compañía. `core/aplicar-propuesta.ts` es literalmente un `for` sobre las operaciones y hay un test que afirma que lo que se ejecuta es **el objeto tal cual lo guardó el servidor**: un `if` ahí sería la señal de que el servidor dejó de guardar la forma del endpoint destino.

#### Verificación de la tanda 6

| Proyecto | Antes | Después |
|---|---|---|
| `ai-service` | 126/126 | **148/148** (+22: 8 del canal SSE, 4 del progreso del loop, 4 del service, 6 del controller) |
| `gateway` | 41/41 | **49/49** (+8 del rate limit por usuario) |
| `app-web` | 159/159 | **205/205** (+46: 7 del parser SSE, 17 del diff, 12 del aplicar, 4 de herramientas, 6 de la tarjeta) |
| El resto del workspace | — | sin cambios (activity 357, rewards 206, session 74, scoring 63, identity 48, shared-ui 24, notification 22, shared-auth 20, e2e 17, billing 9) |

- **`lint` 19/19** y **`build` 18/18** verdes. Sin migraciones: esta tanda no tocó ningún schema.
- **El cable riesgoso, medido: 9/9 checks contra el stack real.** El proxy **no bufferea** — primer evento a los **34 ms** y último a los **4638 ms** de un turno de 4639 ms; `content-type: text/event-stream` conservado y **sin `content-length`** (que sería la firma de un cuerpo entero). El camino sin `Accept` sigue contestando el JSON de siempre, y el límite por usuario cortó en el intento 9 (los dos turnos reales previos ya habían gastado 2 de los 10).
- **Conversación real de punta a punta en el navegador, contra OpenAI**: el modelo leyó las zonas del grupo, armó una propuesta de 3 actividades, **el catálogo seguía en 0 con la propuesta a la vista**, y al apretar «Aplicar todo» las 3 quedaron creadas con el JWT del Tutor. La propuesta quedó en `APLICADA`. Se verificaron también el ítem del menú, la entrada de contexto del catálogo vacío y el panel de historial.
- `admin-web:test` sigue fallando por no tener ningún `.spec.ts` — deuda declarada del #5, **verificada como preexistente**.

#### Sobre la corrida de la suite E2E completa

**Resultado final: 71 pasaron, 2 fallaron, ninguno por esta tanda** (con `E2E_UI=1`, o sea incluyendo las cuatro suites de navegador).

La primera corrida había dado **4 fallos**, y perseguirlos dejó dos cosas anotadas:

- **Tres eran el presupuesto de requests por IP.** Levanté el stack a mano y `scripts/e2e-up.mjs` arranca el Gateway con `RATE_LIMIT_GLOBAL=1000` / `RATE_LIMIT_AUTH=100`, que yo no había puesto. Corridas por separado las tres suites pasan, y al reintentar `confirmaciones-tutor` sola falló **otro** test distinto — que es la firma del presupuesto y no la de un bug. Con el Gateway reiniciado con esas dos variables, las cuatro suites de navegador pasan enteras. **Cuarta tanda de la fase que tropieza con esto** (#23 T1, T3, T4 y ahora esta): el síntoma siempre es «la pantalla no cargó», nunca «me limitaron».
- **`flujo-completo` › smoke UI** falla porque `public-site` (:4321) no estaba servido. No es un fallo, es una suite que no se corrió.

Y en la segunda corrida apareció uno nuevo que **vale la pena arreglar en su ítem**, porque va a volver:

> **`destinatario-y-vigencia.e2e.ts:391` falla de noche y no se terminó de diagnosticar. NO es una regresión de esta tanda** — no se tocó nada de activity ni de session, y la misma prueba había pasado un rato antes en esta misma sesión.
>
> Lo que se sabe: el test arma `diasSemana` excluyendo **el día de hoy según `new Date().getDay()` del proceso que corre el test**, y el servidor decide con `estaDisponibleEn(programacion, fechaInicioSesion, timezone)` — o sea contra **el día en que arrancó la Sesión, en la timezone del Grupo**, no contra el reloj de quien pregunta (ver `activity-service/src/comun/programacion.ts`, que existe justamente para no cometer ese error). Devuelve **201 donde el test espera 409**.
>
> La primera hipótesis fue el desfasaje de zonas —esta máquina está en **UTC-4** y el Grupo en **Buenos Aires (UTC-3)**, así que entre las 23:00 y las 00:00 locales los dos lados están en días distintos— y **se descartó**: a las 00:00 locales las dos zonas ya coinciden en miércoles y la prueba **sigue fallando**. Queda como deuda del ítem #24: el día de ese test tiene que derivarse de la Sesión y de la timezone del Grupo, no del reloj del runner, pero **la causa exacta hay que confirmarla antes de escribir el arreglo** — no repetir el error de dar por buena la primera explicación que suena bien.

### Tanda 7 — la suite E2E con el proveedor stubbeado (2026-08-04)

La última. Convierte los dos cables que la tanda 6 ejerció a mano —el SSE por el proxy y «aplicar es un `for`»— en algo que se verifica en cada corrida.

#### La decisión que hace que este stub sirva

> **El proveedor se reemplaza por HTTP, no por un `if` adentro del servicio.**

`OPENAI_BASE_URL` (nueva, opcional, default la URL real) apunta `ai-service` a un servidor local que habla **la Responses API de verdad**: `output` con `function_call` y `message`, `usage` con `input_tokens` / `output_tokens` / `cached_tokens`, y un `call_id` distinto por llamada. La alternativa —una rama `if (esTest)` dentro de `OpenAiService`— haría que **lo que corre en la suite no sea lo que corre en producción**, justo en el archivo donde eso más importa: el cliente HTTP, el parseo de la salida, la lectura del `usage` y la contabilidad de tokens. Con esta forma, todo ese camino es el mismo y lo único que cambia es a quién le habla.

El stub (`apps/e2e/src/support/stub-proveedor.ts`) tiene un **guion como cola**: cada escenario carga los turnos que necesita y el stub los va consumiendo. Cuando se acaban, contesta un texto de cierre — así un loop que se descontrola termina en vez de colgar la suite. Y registra **todo lo que se le pidió**, que es lo que permite afirmar lo más importante de varias pruebas: **que al proveedor NO se lo llamó**.

`scripts/e2e-up.mjs` suma `ai-service` (novena base, décimo proceso) y le pisa `OPENAI_API_KEY` con una de mentira además de apuntar la base al stub: si ahí quedara la key real y alguien cambiara la URL sin querer, **cada corrida de la suite gastaría plata**.

#### Qué se testea, y qué explícitamente no

**No se testea que el modelo proponga cosas buenas** — no es determinista y no es lo que se rompe en un deploy. Los 17 escenarios cubren el sistema: el gate de plan/switch/consentimiento, los tres roles, el stream por el proxy, la cuota, el aislamiento entre organizaciones, la validación de lo que propone, el ciclo de vida de la propuesta y el aplicado parcial. Los que más valen:

- **«con la cuota agotada devuelve 402 y NO se llama al proveedor»** — el assert que importa es `stub.llamadas === 0`. El pre-flight corta antes de gastar, no después.
- **«los tokens quedan registrados aunque el proveedor falle a mitad de camino»** — primer turno bien (500 tokens), segundo turno 500 del stub, la conversación termina en 503 y **el consumo del mes queda en 500**. Es la Parte E punto 6 escrita como test: contabilizar solo lo que termina bien deja abierta la puerta a consumir gratis cortando la conexión.
- **«una herramienta ejecutada en el contexto de A nunca devuelve una fila de B»** — se inspecciona lo que el servicio le mandó al proveedor en el segundo turno, que lleva adentro la salida de la herramienta. Ahí se ve **qué datos salieron de verdad**: aparece la actividad de ALFA, no la de BETA, y no hay ni un `@`.
- **«el consumo es la suma del ledger»** — compara el DTO contra un `sum()` en SQL y después consulta `information_schema` para afirmar que **no existe ninguna columna contador**.
- **«hacia el proveedor no viaja ni la organización en claro ni un email»** — el `safety_identifier` y el `prompt_cache_key` miden 64 y no contienen ni el `organizacionId` ni el `grupoId`.

#### Dos expectativas que estaban mal en el test, no en el código

La suite salió 15/17 en la primera corrida y las dos correcciones fueron del test:

1. **El stream devuelve `201`, no `200`.** Y está bien que así sea: negociar por `Accept` cambia **cómo** llega la respuesta, no qué pasó — y crear una conversación es crear algo. Los dos caminos, con y sin SSE, devuelven el mismo status.
2. **Listar conversaciones sobre el grupo de otra organización da `404`, no `403`.** `AccesoGrupoService` valida la pertenencia contra identity y un grupo ajeno **no existe** para quien pregunta. Es más correcto que un 403: no se confirma que exista y sea de otro.

#### Verificación de la tanda 7

- **`asistente-ia.e2e.ts`: 17/17 en dos corridas seguidas**, en ~10 segundos cada una (no habla con OpenAI, así que no cuesta ni tiempo ni dinero).
- **Criterio de aceptación 9, verificado con `ai-service` realmente abajo**: `GET /api/health` reporta `ai: "down"` (posible gracias al health controller que agregó la tanda 3) y **las 17 pruebas de navegador del área Tutor pasan igual** — el asistente no está en el camino crítico de ninguna pantalla. El shell pide su configuración y el fallo se traga en silencio: sin respuesta, el ítem del menú simplemente no aparece.
- `ai-service` **148/148**, lint y build verdes. Sin migraciones.
- **Suite E2E completa con `E2E_UI=1`**: ver la nota de abajo.

Con esto **los 12 criterios de aceptación de la spec están cubiertos**: 1-3 y 6-8 en la suite nueva, 4 con dos organizaciones reales, 5 y 10 con el stub como testigo, 9 con el servicio abajo, 11 entre la suite y los tests de la tanda 3, y 12 con las dos corridas seguidas.

### Qué debería verificar la próxima sesión antes de seguir

1. ~~Confirmar que el Gateway rutea `/api/ai`.~~ **Hecho en la tanda 3**: `401 NO_AUTENTICADO` emitido por ai-service a través del proxy, y `/api/health` reportando `ai: "up"` tras el fix del health controller que faltaba.
2. **Que `ai_db` exista en el entorno donde se trabaje.** Se creó a mano con `CREATE DATABASE ai_db` en el contenedor que ya estaba corriendo, porque `infra/docker/init-databases.sh` **solo corre con el volumen vacío**. En una máquina limpia el script ya la incluye; en una con el volumen viejo, hay que crearla a mano.
3. **La trampa de los puertos vale ahora para diez**, no nueve: 3000–3009. Antes de cualquier E2E, matar procesos `dist/` viejos (el #26 perdió una corrida entera de 6 minutos por esto y la falla no da ningún error al arrancar).
4. **Que la cuota de 2M tokens/mes de PRO sigue siendo el número que se quiere**, ahora con un dato: al ritmo medido en la tanda 4, 2M tokens ≈ **USD 3 por organización y por mes**. El tope de gasto del project de OpenAI (**USD 5** en `dorado-dev`) está **por debajo de dos organizaciones a cuota llena**: alcanza para desarrollo y el piloto, no para vender el plan.
5. **Que el `PUT /ai/configuracion` a través del Gateway responda 403 con un JWT de `TUTOR`** y 200 con uno de `ORG_ADMIN`. La tanda 4 lo ejerció con un `ORG_ADMIN` real (200) pero **no con un `TUTOR`**: falta el lado que rebota. Sigue cubierto por unidad.
6. **Que `scripts/e2e-up.mjs` no levanta `ai-service`.** Sigue sin tocarse, **y ahora es una decisión y no un olvido**: el criterio de aceptación 9 pide correr la suite completa con `ai-service` abajo. Antes de la tanda 7 hay que sumarlo — con las cuatro `*_INTERNAL_URL` nuevas, que son requeridas.
7. **Que el `resumen_cumplimiento` no se vuelva caro con un grupo grande.** Hoy trae todos los `RegistroActividad` de la ventana y agrupa en memoria. Con el grupo piloto (18 actividades, 90 días) son 4,7 KB y milisegundos; con un grupo de 40 personas y un año habría que pasarlo a un `groupBy` en SQL. No es un problema todavía y no se optimizó por adelantado — queda anotado para no descubrirlo en producción.
8. **Que los invariantes de `propuestas/invariantes.ts` son un espejo de reglas de activity y pueden derivar.** Si activity agrega una validación nueva, acá no aparece sola: el síntoma va a ser una propuesta que falla al aplicar con una fila roja. Antes de tocar las reglas de negocio del catálogo, mirar ese archivo.
9. ~~Que el `POST /ai/conversaciones/:id/mensajes` todavía NO es SSE.~~ **Hecho en la tanda 6**, y el cable verificado contra el stack real: el proxy no bufferea (primer evento a los 34 ms de un turno de 4,6 s).
10. ~~Que el rate limit por usuario no existe.~~ **Hecho en la tanda 6**: `rate-limit-ia.middleware.ts`, 10 turnos por minuto y por persona, como paso 5 de `main.ts` (después del JWT, porque la clave es el `sub`).

Y lo que deja abierto la tanda 6:

11. **Levantar el stack a mano NO es lo mismo que `scripts/e2e-up.mjs`.** Ese script arranca el Gateway con `RATE_LIMIT_GLOBAL=1000` y `RATE_LIMIT_AUTH=100`; sin esas dos variables la suite E2E completa falla tests que están bien, y el síntoma es «la pantalla no cargó», nunca «me limitaron». **Cuarta tanda de la fase que tropieza con esto.** Antes de culpar a un cambio, mirar con qué env arrancó el Gateway.
12. **Una recarga completa de página volvió al login una vez de tres**, en un script temporal que hacía dos `page.goto` seguidos. El inicializador de la app espera el refresh silencioso (`provideAppInitializer` con `firstValueFrom`), así que el guard ve el estado ya resuelto: la vuelta al login significa que el servidor **rechazó** el refresh, probablemente por rotación del token entre dos recargas casi simultáneas. **No es de esta tanda** —no se tocó nada de auth— y la app real navega por router, no recargando; pero si aparece en la tanda 7 con la suite de navegador, empezar por acá y no por el asistente.
13. **El estado del asistente se carga una vez por sesión en el shell** (`IaApiService.cargarConfiguracion()` en `ngOnInit`, solo para tutores). Es lo que decide si el menú muestra «Asistente» y si aparecen las dos entradas de contexto. Si el `ORG_ADMIN` prende el switch, **los Tutores ya logueados no ven el ítem hasta recargar** — es aceptable para algo que se prende una vez, pero está anotado por si molesta.
14. ~~La suite E2E de la tanda 7 va a necesitar `ai-service` arriba y con la key apuntando al stub.~~ **Hecho en la tanda 7**: `scripts/e2e-up.mjs` levanta `ai-service` con `OPENAI_BASE_URL` apuntando al stub local **y con la key pisada por una de mentira**, así que ni siquiera un error de configuración hace que la suite gaste plata.

Y lo que deja abierto el ítem ya terminado:

15. **`OPENAI_BASE_URL` es la única variable nueva del ítem que producción NO define.** El default es la URL real; existe solo para la suite. Si algún día aparece en un `.env` de producción, es un error — no una configuración.
16. **Los invariantes de `propuestas/invariantes.ts` siguen siendo un espejo de reglas de activity y pueden derivar** (pendiente 8, sin cambios). La suite nueva no los cubre: sus propuestas son válidas a propósito, porque lo que testea es el sistema y no el criterio del modelo.
17. **El costo del piloto sigue sin revisarse** (pendiente 4): 2M tokens ≈ USD 3 por organización y por mes, contra un tope de USD 5 en el project `dorado-dev`. La suite ya no gasta nada, pero el número del plan sigue siendo el de la tanda 1.

---

## Ítem 30: Alcance total del asistente sobre la configuración del Grupo — EN CURSO, tandas 1 a 5 de 9 (2026-08-05)

> Spec: `docs/phases/fase-14-30-alcance-total-del-asistente.md` (escrita en esta misma sesión, con José). Prerrequisito: el #29 completo y verificado. **No revisa ninguna decisión de aquel ítem**: agrega herramientas dentro de sus tres reglas estructurales (la IA no escribe, el tenant no es parámetro, un humano ve todo antes de que exista).

### Tanda 1 — las dos reglas, sobre lo que ya existía (2026-08-05)

Es la tanda que la Parte F pone primero y describe como *«la que hay que hacer aunque el resto del ítem se posponga»*: no agrega ni una capacidad nueva al asistente, **arregla los dos defectos del #29 y escribe las dos reglas que los hacen irrepetibles**. Al terminarla, `proponer_precios_tienda` funciona por primera vez y el id de organización deja de salir hacia el proveedor, todo sobre el catálogo viejo.

#### El primer defecto: el `productoId` que nadie devolvía

`proponer_precios_tienda` pedía un `productoId`, lo validaba como uuid, y **ninguna de las ocho lecturas devolvía un id de producto** — el precio vive en `ProductoTienda`, no en `Recompensa`, así que `listar_recompensas` devolvía otra entidad. El modelo solo podía inventarlo y la propuesta moría cuando el Tutor apretaba «Aplicar».

Arreglado con la lectura que faltaba: `listar_tienda`, con su endpoint interno nuevo (`GET /internal/rewards/grupos/:grupoId/tienda`, tercero de ese controller) y su método en `RewardsClientService`. Devuelve productos y bolsas **en una sola herramienta**, por el mismo criterio que `listar_participantes`: un producto de fuente BOLSA no se entiende sin saber qué hay adentro, y pedirlos por separado costaría una vuelta más del loop, o sea otra llamada al proveedor pagada para contestar una cosa.

Pero el arreglo del caso no es lo que importa. **La regla es la decisión 1**, y quedó escrita así:

- `uuidDe(qué, ...origen)` en `definiciones-propuesta.ts` **exige** declarar de qué herramienta de lectura sale cada id. El tipo `NombreHerramientaLectura` se deriva de la tupla literal de nombres, así que **un origen inventado no compila** — verificado a propósito: `uuidDe('el producto', 'listar_productos')` da `TS2345` con los nueve nombres válidos en el mensaje.
- El origen viaja también en la descripción que lee el modelo (*«…tal como vino de listar_tienda»*), que es una mejora del prompt además de una defensa: le dice qué llamar antes.
- Acepta **varios** orígenes, porque hay ids que salen de dos lados: el `origenId` de un rendimiento es una actividad o una conducta.
- El test estructural recorre las dos familias hasta el fondo de los arrays y falla si una propiedad uuid no declara origen, o declara uno que no existe.

Y un segundo test que es el que de verdad cierra la puerta: **ninguna propiedad puede hablar de un uuid en su descripción sin estar declarada como tal**. El primero solo ve lo que pasó por `uuidDe`; este ve el camino corto — una propiedad escrita a mano que pide un id igual. Verificado rompiéndolo: reemplazar `uuidDe(...)` por un objeto literal equivalente pone el test en rojo con el mensaje que explica por qué.

#### El segundo defecto: el id de organización sí salía hacia el proveedor

La medida 7 de la Parte E del #29 dice que el id de organización **no** sale en claro hacia OpenAI. Salía. `listar_actividades`, `listar_conductas`, `listar_umbrales_zona` y `listar_recompensas` devolvían **el DTO tal como venía del endpoint interno**, y los cuatro DTOs llevan `organizacionId` y `grupoId` justo después del `id`. Las dos lecturas que se armaban a mano campo por campo nunca tuvieron el problema, y esa es exactamente la diferencia: **pasar el DTO entero es el camino corto y nadie lo había cerrado**.

Ahora **las nueve lecturas moldean su respuesta campo por campo** (decisión 9), y el molde cobra las dos cosas que `listar_participantes` ya se cobraba sin decirlo: viaja solo lo que el modelo necesita y cada campo se nombra pensando en que lo lea un modelo (`actividadId` en vez de `id`, `nombreZona` en vez de `nombreZonaSnapshot`).

Tres cosas que aparecieron al moldear y que un `delete` sobre los cuatro DTOs no habría tocado:

1. **Las etiquetas de una recompensa son otro DTO con tenant adentro**, anidado. Un molde de primer nivel las habría dejado pasar enteras.
2. **`resumen_cumplimiento` era el quinto caso**, no uno de los cuatro: `ResumenCumplimientoDto` lleva `grupoId` en la raíz. La spec nombra cuatro lecturas porque contó las que devuelven entidades; contando la salida real son cinco.
3. **El fallback del servicio caído también filtraba**: `resumen ?? { grupoId, dias, actividades: [] }` mandaba el grupo por la puerta del error. Es el mismo agujero, del lado que nadie mira.

El test es el hermano exacto del estructural del #29 pero **sobre la salida**: ejecuta las nueve herramientas y falla si alguna clave —hasta el fondo de arrays y objetos— matchea `/organizacionId|grupoId|tenant/`, más el chequeo de que no viaje ningún `@` ni `username`. **Los mocks devuelven los DTOs con sus campos de tenant adentro a propósito**: con fixtures ya limpios el test pasaría sin verificar nada, que es precisamente cómo el defecto sobrevivió a la tanda 3. Y va con un contrapeso —un molde que devolviera `{}` también pasaría el otro— que verifica que lo que el modelo necesita sigue estando.

#### La decisión 2, en su primera instancia

`proponer_precios_tienda` ahora **valida el `productoId` contra la tienda real del grupo** antes de guardar nada: un id que no está devuelve el error al modelo nombrando el campo **y diciéndole qué llamar** (`listar_tienda`), en vez de una propuesta guardada que muere al aplicar. Sin esto, la decisión 1 evita que el modelo *no tenga* el id, pero no que confunda uno de otra entidad — y ahora que los ids abundan, ese es el error probable.

Efecto colateral gratis: con la tienda leída, la etiqueta de la tarjeta ya puede decir el «antes» (`«Helado»: 20 → 30 monedas`) en vez de un número suelto, y el snapshot guarda nombre y precio viejo para el frontend de la tanda 8.

#### Los metadatos no viajan al proveedor

`formato` y `origen` **no son JSON Schema**. Podrían mandarse igual —el proveedor ignora las claves que no conoce— y por eso mismo no se mandan: que el catálogo funcione no puede depender de un detalle de la implementación de un tercero, y la Parte E promete que lo que sale se puede leer en un solo lugar. `aJsonSchema()` los saca recursivamente y `openai.service.ts` es el único que la llama. Tres tests: que saca los metadatos, que llega hasta los objetos anidados dentro de arrays (**donde viven todos los ids de este catálogo**, así que un limpiador de primer nivel los dejaría pasar todos) y que no le cambia nada más al esquema.

#### El costo en tokens (criterio 12)

Medido sobre lo que efectivamente viaja (`tools` serializado, con `aJsonSchema` aplicado):

| | Herramientas | Caracteres | ≈ tokens |
|---|---|---|---|
| Antes (fase-14-29) | 12 | 16.591 | ~4.148 |
| Después de la tanda 1 | 13 | 17.267 | ~4.317 |

**+676 caracteres, ~+169 tokens (+4,1%)** por una herramienta, en línea con el promedio del catálogo existente. El bloque entra por caché vía `prompt_cache_key` (idéntico entre llamadas de una conversación), así que desde el segundo turno el costo real es ~10% de eso. El número queda acá para comparar contra el salto a 26 herramientas que va a producir el resto del ítem.

#### Verificación

- **`ai-service` 162/162** (+14: 7 en `definiciones.spec.ts`, 6 en `herramientas.service.spec.ts`, 1 en `propuestas.service.spec.ts`) y **`rewards-service` 206/206** sin regresiones.
- **Lint 19/19 y build verdes**, sin warnings nuevos.
- **Los dos lados del criterio 1 verificados rompiéndolos a propósito**: un origen inexistente no compila (`TS2345`), y una propiedad uuid escrita a mano sin `uuidDe` pone dos tests en rojo. Los dos se restauraron.
- **El endpoint interno nuevo, contra Postgres real** (`infra/docker-compose.yml` + `nx serve rewards-service`, con los datos del piloto ya cargados): `200` con el secreto y `401` sin él; el producto de fuente BOLSA sale con su `bolsaId` y la bolsa con sus dos `recompensaIds`; **el aislamiento verificado con tres grupos** —cada uno ve solo lo suyo y un grupo inexistente devuelve las dos listas vacías—; y **ni una clave de tenant en la respuesta real**, no solo en el tipo.
- **Sin migraciones**: la tanda no toca ningún schema.


### Tanda 2 — los contratos en `shared-types` y sus `implements` (2026-08-05)

La tanda que la Parte F pide aislada porque **es la que puede romper builds ajenos**: toca DTOs de cuatro servicios ya cerrados y **no cambia ni un comportamiento**. Son anotaciones de tipo sobre clases que ya tenían esos campos.

Doce contratos nuevos: conductas (crear y editar) en `activity.ts`; umbrales (crear y editar) y configuración de scoring en `scoring.ts`; recompensas (crear y editar), etiquetas (crear, editar y asignar), bolsa y producto-crear en `rewards.ts`.

#### Lo que el relevamiento corrigió de la spec

La Parte C lista nueve contratos como *«ya existen y se reusan tal cual»*, y es cierto — **pero ninguna de sus clases los `implements`**. Los siete de identity (equipos y roles, del #9 y el #19) y el de turnos (#21) nacieron como interfaces para el frontend, y desde entonces las dos mitades podían derivar sin que nada se pusiera rojo. O sea que la garantía que este ítem necesita —*renombrar un campo en un servicio rompe el build de quien arme ese request*— **no valía para ninguno de los ocho**.

Quedaron enganchados en esta tanda. Por eso el alcance real fue **8 archivos de DTO en 4 servicios**, y no los «siete DTOs de tres servicios» que anticipaba la spec: identity no estaba en la cuenta porque se la daba por hecha.

`ConfigurarTurnoRequest` necesitó además un cambio en el contrato: sus dos campos de enum pasaron a **tipo plantilla** (`` `${ModoTurno}` ``), por el mismo motivo documentado en `CrearActividadRequest` — la clase valida contra los enums que genera Prisma y TypeScript los trata como tipos distintos. **Es una ampliación, no un cambio de contrato**: los miembros de los dos enums siguen siendo válidos, y `app-web` (su único consumidor) compila sin tocar una línea.

#### El agujero que apareció al escribirla: `implements` sola no alcanza

**`implements` no detecta un campo OPCIONAL renombrado.** Por tipado estructural, una clase a la que le falta una propiedad opcional del contrato le sigue siendo asignable. Renombrar `permiteAutoreporte` en activity habría pasado el build entero, y el asistente simplemente habría dejado de poder configurarlo: un deterioro silencioso.

Es **el mismo agujero exacto que el #29 encontró del otro lado del cable** —allá con `z.ZodType<Contrato>` y los esquemas Zod— y se cierra igual: comparando las **claves**, que es lo que la asignabilidad no mira. Vive en `libs/shared-types/src/lib/contratos.ts` (`Exhaustivo` + `ClavesNoCubiertas`) y se aplica en una línea por clase, **20 en total**.

Van como **dos tipos y no como uno solo** —la forma obvia, un `SinClavesFaltantes<A, B>` que envuelva a los dos— porque no compila: la restricción `extends never` no se puede verificar sobre parámetros genéricos, hace falta aplicarla donde los dos tipos ya son concretos. Se intentó primero de la forma obvia y el compilador lo rechazó en los seis servicios a la vez.

Que este agujero apareciera en la tanda 2 y no en la 4 es exactamente lo que la Parte F buscaba al pedirla aislada.

#### Verificación

- **Los dos chequeos verificados rompiéndolos a propósito.** Renombrar un campo **opcional** en el contrato deja el build en rojo nombrando la clave: `TS2344: Type '"permiteAutoreporteRenombrado"' does not satisfy the constraint 'never'`, en los dos usos (crear y editar). Sin la cobertura de claves eso pasaba en verde. Restaurado.
- **Suite completa del workspace**: activity 357, rewards 206, app-web 205, session 74, scoring 63, gateway 49, identity 48, notification 22, ai-service 162 — **todo verde y sin un solo test tocado**, que es lo que se espera de una tanda que no cambia comportamiento.
- **Lint 19/19 y build de los 6 proyectos afectados** (incluido `app-web`, el consumidor del contrato de turnos).
- `admin-web:test` falla por **no tener ningún `.spec.ts`** — deuda declarada del #5, no una regresión (verificado corriéndolo aparte: «No tests found»).
- **Sin migraciones y sin tocar ninguna regla de negocio.**

#### Fuera de la spec, hecho igual

`docs/architecture/shared-types.md` no listaba **ninguno** de los contratos de request del #29 (actividades y producto), aunque sí los de equipos, roles y turnos de ítems anteriores. Se agregaron los del #29 junto con los de esta tanda, más el par de tipos de cobertura y los tres DTOs internos de la tienda. El `index.ts` de la librería dice *«no agregar ni quitar campos sin actualizar primero ese documento»*, así que dejarlo desactualizado era acumular la misma clase de deuda que el ítem vino a pagar.


### Tanda 3 — las tres lecturas restantes (2026-08-05)

`listar_etiquetas`, `listar_turnos` y `configuracion_del_grupo`, con **cinco endpoints internos nuevos** repartidos en tres servicios: configuración y turnos en activity, configuración en scoring, etiquetas y configuración en rewards. Con esto el catálogo de lectura queda en **doce**, que es el número final del ítem.

Ninguna recibe `organizacionId` ni `grupoId` y todas son `GET`, así que los dos tests estructurales del #29 las cubrieron sin tocarles una línea.

#### `configuracion_del_grupo`: una herramienta, tres servicios

Es la única lectura que compone tres llamadas —activity, scoring y rewards, **en paralelo**— en una sola respuesta. El criterio es el mismo que llevó a juntar gente, roles y equipos en `listar_participantes`: el modelo la consulta para entender el terreno antes de proponer, y partirla en tres costaría dos vueltas más del loop, o sea **dos llamadas al proveedor pagadas para contestar una cosa**.

Lo que trae es exactamente lo que hace que otros campos signifiquen algo: `planDelDiaActivo` (sin el cual `siempreVisible` es un campo que no se puede proponer con criterio), las reglas de contenido de los integrantes, `puntosIniciales` —con 100 de base una actividad de 5 no pesa lo mismo que con 0— y el **modo de recompensas**, que evita el error más caro de todos: proponer precios en un grupo `DIRECTO` es proponer sobre una tienda que nadie ve.

**Un servicio que no contesta deja su parte en `null`, no en un default.** La diferencia no es cosmética: decir «DIRECTO» sin saberlo haría que el asistente descarte la tienda de un grupo que sí la usa. Si no contesta ninguno de los tres, es un error legible y no un objeto de nulls.

#### Los defaults viven en un solo lugar

Los tres endpoints de configuración tienen que devolver la config **efectiva**, y «sin fila» es una configuración, no un dato que falta: un grupo sin fila es `RESTRICTIVO`, arranca en 0 y está en modo `DIRECTO`. Esos defaults ya estaban resueltos en memoria por los services de cada ítem, así que los endpoints internos **delegan** en vez de repetirlos —`ConfiguracionContenidoService.resolver` en activity y `ConfiguracionService.leer` en rewards, que pasó de privado a público con la misma justificación que ya tenía `obtenerModo`—. Dos copias de un default se separan sin que nadie lo note, y el síntoma sería un asistente que razona sobre un grupo que no existe.

Eso obligó a que `InternalModule` importe módulos de negocio en los dos servicios, cosa que antes no hacía en ninguno. Es el cableado que compila bien y falla al arrancar, así que se verificó levantando.

#### Lo que decidió el molde

- **Los turnos van sin nombres.** `TurnoActividadDto` lleva el nombre de cada participante y la previsión de la vuelta en curso; resolverlos cuesta una llamada a identity y quien consume esto ya tiene `listar_participantes`. El interno devuelve `usuarioId` y orden, nada más — y **solo las actividades que tienen turno**: la ausencia de fila es la respuesta de que esa actividad no rota.
- **La secuencia conserva los repetidos.** Que la misma persona aparezca dos veces no es un error de datos: es cómo se le dan más turnos que a los demás (fase-14-21). Hay un test que lo fija, porque un molde que dedupliqué «para limpiar» rompería ese ítem entero sin que nada más se queje.
- **Las etiquetas se piden por su id**, que es lo único que hace falta para poder asignarlas y lo único que no se podía obtener.

#### Verificación

- **`ai-service` 167/167** (+5), y activity 357, rewards 206, scoring 63 **sin una regresión**. Lint 19/19 y build 19/19.
- **Los cinco endpoints internos contra el stack real**, con los datos del piloto: los cinco en `200`, `401` sin el secreto. El grupo real devolvió `planDelDiaActivo: true`, modo `LIBRE`, **100 puntos iniciales**, modo `TIENDA` con la moneda «perigreses» y **dos rotaciones con sus secuencias en orden** — o sea que el asistente ahora ve el grupo tal como está configurado, no un grupo genérico.
- **Los defaults verificados contra un grupo inexistente**: `RESTRICTIVO`, `planDelDiaActivo: false`, `puntosIniciales: 0` y `DIRECTO`. Es el camino que corre en cualquier grupo que nunca tocó esa pantalla, o sea la mayoría.
- **Aislamiento**: las etiquetas de un grupo con datos vuelven solo para ese grupo; el otro devuelve `[]`.
- **Ni una clave de tenant ni un `@`** en las cinco respuestas reales, verificado sobre el JSON que sale, no sobre el tipo.
- **El cableado nuevo de módulos arranca**: los tres servicios levantaron y los endpoints contestaron 200 —lo que además prueba que no eran procesos viejos escuchando en el puerto, la trampa que ya se cobró una corrida entera en el #26—.
- **Sin migraciones.**

#### El costo en tokens, actualizado (criterio 12)

| | Herramientas | Caracteres | ≈ tokens |
|---|---|---|---|
| fase-14-29 | 12 | 16.591 | ~4.148 |
| tanda 1 | 13 | 17.267 | ~4.317 |
| tanda 3 | 16 | 18.937 | ~4.734 |

**+14% sobre el catálogo original, con un tercio de las herramientas nuevas ya adentro.** Las tres lecturas de esta tanda costaron ~417 tokens entre las tres, o sea menos que una definición de propuesta: son las baratas del ítem, y las once que faltan son las caras. El bloque entra por caché, así que desde el segundo turno se paga ~10%.

#### Qué falta después de la tanda 3

Las tandas 4 a 9 de la Parte F, en ese orden. Las 4 a 7 son independientes entre sí y cada familia entregada funciona sola: si hay que cortar el ítem por la mitad, se corta ahí.

Anotado para las que siguen:

1. **La spec dice «cuatro lecturas que devuelven el DTO crudo» y son cinco** (`resumen_cumplimiento` incluida). No cambia ninguna decisión; el test cubre las nueve por igual, y las cuatro lecturas que se agreguen van a nacer cubiertas.
2. **`NOMBRES_HERRAMIENTAS_LECTURA` se escribe a mano** (de un `.map()` no sale el tipo literal que hace cumplir la decisión 1). Hay un test que la mantiene pegada a las definiciones reales: agregar una herramienta y olvidarse de la lista pone eso en rojo, no algo lejano.
3. **El endpoint interno de la tienda devuelve también las ARCHIVADAS** y el filtro por estado se aplica en `ai-service`, para las dos listas por igual. Una bolsa archivada con productos activos es una combinación que el Tutor tiene que poder ver.
4. **La conversación real contra OpenAI queda pendiente para el final del ítem.** La tanda 1 se verificó con unidad, build y el endpoint interno real; lo que no se ejerció es el modelo llamando a `listar_tienda` y proponiendo un precio de punta a punta. Es la clase de cable que esta fase viene encontrando rota siete veces, así que **no cuenta como verificado hasta correrlo**.
5. **Los esquemas Zod de `ai-service` todavía no usan los doce contratos nuevos.** La tanda 2 dejó el contrato y su `implements` del lado del servicio; el `implements` del lado del esquema —con su `Exhaustivo`/`ClavesNoCubiertas`, que es lo que cierra el cable entero— entra con cada familia, en las tandas 4 a 7. Hasta entonces los contratos nuevos no tienen ningún consumidor: **están escritos y no probados por nadie**.
6. **La cobertura de claves vale para lo que se agregue.** Toda clase de request nueva que quiera ser proponible necesita las dos cosas —`implements` y su línea de `Exhaustivo<ClavesNoCubiertas<…>>`—; con una sola, un campo opcional renombrado sigue pasando en verde. No hay test que lo obligue: es una convención con un archivo que la explica (`libs/shared-types/src/lib/contratos.ts`).


### Tanda 4 — familia catálogo: conductas, turnos y los dos campos de actividad (2026-08-05)

La primera de las cuatro familias, y la primera tanda del ítem que **le agrega capacidades al asistente** en vez de arreglar lo que había. Tres herramientas de propuesta nuevas —`proponer_crear_conductas`, `proponer_editar_conductas`, `proponer_configurar_turnos`— más los dos campos de actividad de la decisión 8. Ningún endpoint destino hubo que crearlo: los tres existen y están probados desde la Fase 5 y el #21.

Es también la primera tanda que **consume los contratos que la tanda 2 dejó escritos y sin consumidor** (pendiente 5 de aquella): los tres esquemas Zod van tipados `z.ZodType<Contrato>` con su `Exhaustivo<ClavesNoCubiertas<…>>`, que es el otro extremo del cable — ahora renombrar un campo en activity rompe el build de `ai-service` en los dos lados.

#### El `null` significa lo contrario que en una actividad

En un PATCH de actividad, `null` **borra** el campo (fase-14-24: así se quita una vigencia), y por eso `limpiarVacios` lo conserva. En una conducta no hay **ni un campo anulable** —sus cuatro campos son string, enum, número y booleano—, así que ahí `null` solo puede significar «no lo puse».

No es una sutileza: **el modelo no puede omitir una propiedad declarada** (lo aprendió la tanda 5 del #29), así que en una edición de un solo campo manda los otros tres en `null`. Si el `null` se conservara, **toda edición de conducta fallaría** contra un error que el modelo no puede resolver, y la conversación terminaría sin ninguna propuesta. La regla que queda escrita: **el `null` se conserva solo si el contrato destino tiene algún campo anulable**; si no, es ausencia. Hay un test que lo fija con los tres nulls adentro.

#### La lista de posiciones es plana hacia el modelo y de objetos hacia el endpoint

`ConfigurarTurnoRequest` pide `posiciones: Array<{ usuarioId }>`. Al modelo se le expone una **lista plana de ids**, y el armador la convierte. Las dos razones:

1. Un objeto de una sola clave por posición es tokens que no compran nada.
2. El test estructural del tenant (decisión 9 del #29) **prohíbe una propiedad que matchee `/usuarioId/`**, y con la forma del contrato la herramienta no habría compilado ese test.

Ese segundo punto es el hallazgo de la tanda y hay que dejarlo anotado para la 7: **la familia personas no lo va a poder esquivar** —`jefeUsuarioId`, `nuevoJefeUsuarioId` y el `usuarioId` de «sumar un miembro» son campos del contrato, no una elección de forma—. Esa tanda va a tener que decidir si afina la regex (el test es sobre el *tenant*, y una persona del grupo no es el tenant) o si busca otra forma; lo que no puede hacer es tocarla sin pensarlo, porque la regla es la defensa contra el prompt injection que no depende de que el modelo se porte bien.

La conversión vive del lado de `ai-service` a propósito: así el esquema Zod puede seguir siendo el contrato **exacto**, que es lo único que hace que un cambio en activity rompa este build.

#### Qué se replica del endpoint destino y qué no

Mismo criterio que `invariantes.ts`: **solo se replican las reglas que rechazan**, no las que el destino normaliza en silencio.

- **Turnos**: las cuatro que `PUT /activity/actividades/:id/turno` rechaza — la actividad tiene que ser OBLIGATORIA (`TurnoSoloObligatoriaException`) e INDIVIDUAL (`TurnoSoloIndividualException`), las posiciones tienen que ser participantes del grupo (`UsuarioNoEsDelGrupoException`) y, si la actividad está dirigida a personas concretas, salir de esa lista (`TurnoFueraDelDestinatarioException`, fase-14-24 decisión 6 — un turno para quien no ve la actividad es un castigo que cae sobre una pantalla vacía).
- **Conductas**: ninguna. Se leyó `conductas.service.ts` entero buscándolas y lo único que tira es `NotFoundException`, que ya lo cubre la validación de referencia de la decisión 2. `permiteAutoreporte` en una BUENA **no se rechaza**: el servicio lo fuerza a `false`, así que mandarlo no rompe nada.

#### Las dos reglas del ítem, ahora como test sobre lo nuevo

- **Criterio 3 (ninguna operación usa `DELETE`)**: el tipo de `OperacionPropuesta.metodo` ya lo hace imposible de escribir, pero eso solo cubre lo que se escribe a mano. El test arma una propuesta **real de cada una de las siete herramientas** y mira el método de cada operación — y la tabla de argumentos **se compara contra el catálogo**, así que agregar una herramienta y olvidarse de ella pone esto en rojo en vez de dejarla sin cubrir.
- **Criterio 4 (ningún esquema acepta `estado`)**: test estructural sobre las definiciones de propuesta, hermano de los otros tres. Es la forma en que la decisión 3 se rompería sin que aparezca la palabra `DELETE` en ningún lado: los endpoints de rol y de equipo aceptan un `estado`, y poner algo en `INACTIVO` es archivarlo por otro camino. Las de **lectura** sí lo aceptan, y ahí es lo contrario: sirve para VER lo archivado.

#### Dos cosas que la Parte F no puso en esta tanda y entraron igual

1. **El frontend de estos tres tipos.** La Parte F lo pone en la tanda 8, pero `TITULOS` está tipado `Record<TipoPropuestaIa, string>` y el `switch` de `armarFilas` es exhaustivo: al crecer la unión, **`app-web` dejó de compilar**. Se hizo la parte que corresponde a esta familia y nada más —los tres títulos, los enums nuevos en `VALORES`, dos casos del `switch` (el alta de conducta reusa `filaDeAlta` tal cual) y `conductas` en el contexto—. La alternativa era un `default` que dibujara la tarjeta vacía, y eso es exactamente lo que la decisión 2 no quiere: una tarjeta que no se entiende convierte «Aplicar» en un botón. **Que cada familia funcione sola incluye su tarjeta.**
2. **Una línea del system prompt.** La capacidad 1 decía «armar el catálogo de actividades y conductas» y el prompt cierra con *«si te piden algo fuera de las cuatro capacidades, explicá que eso se hace desde la app»*. Una rotación no entra en ninguna de las cuatro, así que el modelo tenía la herramienta y la instrucción de no usarla. **Es el mismo modo de falla de siempre** —la unidad verifica la pieza y lo que falla es el cable—, encontrado esta vez antes de que costara una corrida: las herramientas nuevas de cada familia hay que mirarlas contra el prompt, no solo contra el catálogo.

#### El costo en tokens, actualizado (criterio 12)

| | Herramientas | Caracteres | ≈ tokens |
|---|---|---|---|
| fase-14-29 | 12 | 16.591 | ~4.148 |
| tanda 1 | 13 | 17.267 | ~4.317 |
| tanda 3 | 16 | 18.937 | ~4.734 |
| tanda 4 | 19 | 25.770 | ~6.443 |

**+55% sobre el catálogo original**, y el salto de esta tanda es de +6.833 caracteres: ~5.560 de las tres herramientas nuevas y ~1.270 de los dos campos de actividad, que entran **dos veces** porque `camposActividad()` alimenta crear y editar.

La decisión 10 pide mirar si lo que sobra es un catálogo mal escrito. No lo es, y se verificó midiendo una por una: las tres nuevas pesan 1.777, 1.743 y 2.044 caracteres, en línea con `proponer_rendimientos_monedas` (1.435) y muy por debajo de las de actividades (5.805 y 5.561, que son las caras del catálogo porque llevan veinte campos descriptos). **Lo que cuesta es la cantidad de campos, no la prosa**, y eso confirma lo que anticipaba la tanda 3: las lecturas eran las baratas, las propuestas son las caras. Con las ocho que faltan el catálogo va a rondar los ~11k tokens; el bloque entra por caché vía `prompt_cache_key`, así que desde el segundo turno de una conversación se paga ~10% de eso.

#### Verificación de la tanda 4

- **`ai-service` 185/185** (+18: 12 en `propuestas.service.spec.ts`, 1 estructural nuevo en `definiciones.spec.ts` y 5 de la tabla del criterio 3) y **`app-web` 207/207** (+2).
- **Suite completa del workspace verde**: activity 357, rewards 206, session 74, scoring 63, gateway 49, identity 48, notification 22 — **sin una sola regresión y sin ningún test ajeno tocado**.
- **Lint 19/19 y build 19/19**, incluido `app-web` (el que se había puesto rojo).
- **Migración aplicada contra Postgres real**: `20260805231457_fase_14_30_conductas_y_turnos`, aditiva sobre el enum `TipoPropuesta` (`CREAR_CONDUCTAS`, `EDITAR_CONDUCTAS`, `TURNOS`). Sin backfill: las filas existentes conservan sus cuatro valores.
- **Lo que NO se verificó y no se va a dar por verificado**: el apply de punta a punta contra los endpoints reales de activity con un JWT de Tutor. La forma del body la garantiza el contrato en tiempo de compilación y las reglas de rechazo están replicadas y testeadas, pero **el cable entero es de la tanda 9 (E2E)** y del pendiente 4 de la tanda 3. No se hizo acá porque no hay forma de obtener un JWT de Tutor del piloto sin la contraseña de José.

#### Qué falta después de la tanda 4

Las tandas 5 a 9 de la Parte F. Las 5, 6 y 7 son independientes entre sí; la 8 (frontend) ya tiene hecha la parte de la familia catálogo y la 9 (E2E) cierra todo.

Anotado, además de los seis puntos de la tanda 3 que siguen valiendo:

7. **La tanda 7 va a chocar con el test estructural del tenant.** `usuarioId` está en la regex de parámetros prohibidos y la familia personas lo necesita por contrato. Ver el detalle arriba: es una decisión, no un ajuste.
8. **El `null` de cada familia se decide por el contrato, no por costumbre.** Recompensas y productos **sí** tienen campos anulables (`descripcion`, `bolsaId`, `recompensaId`), así que la tanda 5 va a necesitar `limpiarVacios(…, false)` en sus PATCH y `true` en sus POST, que es el criterio del #29 y no el de esta tanda.
9. **El system prompt hay que mirarlo en cada familia.** La capacidad 4 nombra «precios de la tienda y cuántas monedas paga cada acción»; las recompensas, las etiquetas, las zonas, los roles y los equipos **no están en ninguna de las cuatro capacidades**. Sin esa línea, el modelo va a tener herramientas que su propio prompt le dice que no use.


### Tanda 5 — familia economía: recompensas, productos, bolsas y etiquetas (2026-08-05)

La familia más grande del ítem: **cinco herramientas** (cuatro nuevas más la ampliación de la decisión 7) contra cuatro endpoints de `rewards-service`, y la que más reglas del destino tuvo que replicar. Con ella el catálogo llega a **23 herramientas**, o sea a un asistente que ya puede armar la economía entera de un grupo nuevo.

#### La decisión 7, y por qué el nombre y el tipo no coinciden

`proponer_precios_tienda` pasó a llamarse **`proponer_editar_productos`** y dejó de cubrir solo el precio: el mismo `PATCH` acepta nombre, descripción, fuente, mecánica y el ítem o la bolsa que entrega, así que el subconjunto anterior era arbitrario. Renombrar la herramienta es gratis —su nombre solo viaja hacia el proveedor dentro de un request, no está persistido en ningún lado—, pero **el valor `PRECIOS_TIENDA` del enum se conserva** porque sí está en filas de la base. Que los dos no coincidan es deliberado y está explicado en los tres lugares donde alguien lo va a mirar: el enum de Prisma, el union de `shared-types` y el tipo del servicio.

#### El chequeo de contrato encontró una propuesta que el endpoint habría rechazado

Escribí `camposRecompensa` compartido entre crear y editar, como en actividades, conductas y productos. **No compiló**, y el error es exactamente el que la decisión 11 existe para producir:

```
Type 'string | null | undefined' is not assignable to type 'string | undefined'
```

`CrearRecompensaRequest.descripcion` es `string | undefined` y `EditarRecompensaRequest.descripcion` es `string | null`: en un alta no hay nada que borrar, en un PATCH `null` borra. Compartir el campo habría dejado pasar un alta con `descripcion: null` que el endpoint contesta con 400 — **una propuesta que el Tutor aplica y le sale una fila roja**, que es literalmente lo que la decisión 11 se propuso hacer imposible. Es el único de los tres pares de esta tanda con esa asimetría (producto y etiqueta son anulables en los dos lados), o sea la clase de detalle que no se encuentra leyendo.

Y confirma el pendiente 8 de la tanda 4: **el `null` se decide por contrato y por operación**, no por familia. Acá conviven los tres casos — POST con `limpiarVacios(…, true)`, PATCH con `false`, y un array vacío que **significa algo** (ver etiquetas).

#### Lo que se replicó del destino, que acá es mucho

Cinco reglas que `rewards-service` rechaza, todas leídas en su código y no supuestas:

- **La zona en modo DIRECTO.** `umbralZonaId` es obligatorio y tiene que ser de este grupo; en modo TIENDA se ignora. Por eso el armador lee el modo antes. **Si el servicio no contesta no se inventa el modo**: se valida la zona si vino y decide el endpoint — suponer DIRECTO haría fallar propuestas correctas de un grupo con tienda, y suponer TIENDA dejaría pasar propuestas que mueren al aplicar. Mismo criterio que la tanda 3 con `null` en vez de un default.
- **Las dos puertas contra el castigo comprable** (fase-14-26 decisión 20): un castigo no puede ser un producto de fuente ITEM ni entrar en una bolsa.
- **Las referencias excluyentes**: fuente ITEM va con `recompensaId` y sin `bolsaId`, y al revés. En una **edición se valida el estado fusionado** —el producto que ya existe más los cambios—, igual que el endpoint: subirle el precio a un producto de fuente BOLSA no puede exigir que el request repita el `bolsaId`.
- **La bolsa vacía o archivada**, que si no fallaría recién al comprarse.
- **El tope de 5 etiquetas por ítem** y que existan y estén activas.

#### El límite de las dos tandas, y por qué el error explica en vez de solo rechazar

Una bolsa recién existe cuando el Tutor aprieta «Aplicar», así que **su id no puede referenciarse en la misma propuesta**. Es el mismo límite que la decisión 5 evitó a nivel propuesta, acá adentro de una. Lo mismo con una etiqueta recién creada.

El producto que apunta a una bolsa desconocida se rechaza con un mensaje que dice **qué hacer** —«proponé primero las bolsas y después, en otra propuesta, los productos que las venden»— y no solo que se equivocó. Es la lección de `invariantes.ts` del #29: un error que describe el problema empuja al modelo a inventar un valor; uno que describe la acción lo saca del pozo. El mensaje además **cambia según si la propuesta está creando bolsas**: si no lo está, el id ajeno es otro error y el consejo es llamar a `listar_tienda`.

#### El array vacío que sí significa algo

`PUT /rewards/recompensas/:id/etiquetas` **reemplaza la lista completa** (fase-14-26), así que `etiquetaIds: []` es una operación legítima —«sacale todas»— y no un «no lo puse». Es el único caso del ítem donde un array vacío tiene sentido, y por eso ese campo **no pasa por `limpiarVacios`**, que descarta arrays vacíos por diseño desde el #29. La tarjeta lo dice con todas las letras («ninguna»), porque una lista que se vacía es justamente lo que el Tutor tiene que ver antes de aprobar.

#### Frontend, otra vez en esta tanda y por el mismo motivo

Los cuatro tipos nuevos entraron a `propuesta-ia.ts` igual que en la tanda 4: la unión creció y `app-web` deja de compilar. Tres cosas propias:

- **Las dos altas de tienda se distinguen por la ruta** (`/bolsas` vs `/productos`), que es el dato que ya viaja. Agregarle al DTO un campo «tipo de operación» habría sido duplicar en la propuesta algo que la ruta ya dice sin ambigüedad.
- **`AZAR` pasó de «al azar en cada vuelta» a «al azar»**: el mismo valor es el modo de una rotación y la mecánica de un producto, y `VALORES` es un mapa único para todos los tipos. Un mapa por tipo sería la otra salida y no vale lo que cuesta.
- **El contexto pasó de 6 a 11 lecturas** (recompensas, bolsas, etiquetas y umbrales nuevos), todas en el mismo `allSettled`: que falle una no puede dejar la tarjeta sin las otras.

**Fuera de la Parte F, otra vez**: `core/herramientas-ia.ts` —el rastro de progreso que el Tutor ve mientras el modelo trabaja— tenía las 8 lecturas y 4 propuestas del #29 y nada más. Las cuatro lecturas de las tandas 1 y 3 ya salían con su nombre técnico en pantalla (`configuracion_del_grupo` en vez de «la configuración del grupo»): el archivo degrada a propósito, así que no era un bug, pero era deuda acumulándose en silencio. Quedaron las 23.

Y el system prompt otra vez: la capacidad 4 decía «precios de la tienda y cuántas monedas paga cada acción», que no cubre premios, castigos, etiquetas ni bolsas. **Segunda tanda seguida en que el prompt es lo último que se acuerda de crecer** — queda como punto fijo de la lista para las tandas 6 y 7.

#### El costo en tokens, actualizado (criterio 12)

| | Herramientas | Caracteres | ≈ tokens |
|---|---|---|---|
| fase-14-29 | 12 | 16.591 | ~4.148 |
| tanda 1 | 13 | 17.267 | ~4.317 |
| tanda 3 | 16 | 18.937 | ~4.734 |
| tanda 4 | 19 | 25.770 | ~6.443 |
| tanda 5 | 23 | 35.169 | ~8.792 |

**+112% sobre el catálogo original**, con la familia más grande adentro. Medidas una por una, las cinco de economía pesan entre 1.786 y 2.857 caracteres —`proponer_crear_productos` es la más cara porque lleva dos arrays de objetos, bolsas y productos— y siguen todas muy por debajo de las de actividades (5.805 y 5.561). El bloque entra por caché vía `prompt_cache_key`, así que desde el segundo turno de una conversación se paga ~10%. Con las dos familias que faltan el catálogo va a rondar los ~11k tokens, que es lo que anticipaba la tanda 4.

#### Verificación de la tanda 5

- **`ai-service` 204/204** (+19) y **`app-web` 210/210** (+3).
- **Workspace entero verde**: activity 357, rewards 206, session 74, scoring 63, gateway 49, identity 48, notification 22 — **sin una regresión**. `admin-web:test` sigue fallando por no tener ningún `.spec.ts` (deuda declarada del #5, no una regresión).
- **Lint y build 19/19.**
- **Migración aplicada contra Postgres real**: `20260806002634_fase_14_30_economia`, aditiva (`CREAR_RECOMPENSAS`, `EDITAR_RECOMPENSAS`, `PRODUCTOS_TIENDA`, `ETIQUETAS`). Sin backfill.
- **Lo que sigue sin verificarse**, igual que en la tanda 4: el apply de punta a punta contra rewards con un JWT de Tutor. Es de la tanda 9.

#### Qué falta de este ítem

Las tandas 6 a 9. Anotado, además de lo de arriba:

10. **La tanda 6 (umbrales) es la única con validación de conjunto.** Los rangos tienen que cubrir la recta sin huecos ni solapes **sobre el estado resultante**, no sobre lo que la propuesta trae — una edición parcial que sola parece rota puede ser correcta junto a las otras. Y es la única propuesta del ítem cuyo efecto **cambia el pasado** (decisión 6): mover un rango recalcula la zona de todos en el acto, incluidas las secciones ya cerradas.
11. **El aviso de la tarjeta de umbrales necesita `resumen_puntajes`**, que hoy el frontend del asistente no carga: el contexto trae 11 lecturas y ninguna es esa. Entra con la tanda 6 o con la 8, pero entra.
12. **`proponer_crear_productos` y `proponer_etiquetas` aceptan las dos listas vacías** y el armador rechaza si las dos lo están. Es la primera herramienta del catálogo con `required: []`, y el test estructural que exige `required` vacío es **solo para las de lectura**: si algún día se quiere la misma regla del otro lado, hay que escribirla.
