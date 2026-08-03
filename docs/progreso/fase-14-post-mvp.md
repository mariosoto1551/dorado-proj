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
