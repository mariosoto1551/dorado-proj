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
- **Estado**: PENDIENTE — confirmar con José si sigue siendo un requisito antes de diseñarlo.
- **Fecha**: — / **Commit**: — / **Resumen**: — / **Desviaciones**: —

## Ítem: Equipos de trabajo (jefe de equipo + tareas colectivas)
- **Estado**: EN_PROGRESO — **backend completo** (identity/activity/scoring/notification; compila, tests existentes verdes, lint limpio, migraciones aplicadas contra DB real). **Falta**: frontend app-web + tests unitarios nuevos + E2E real.
- **Fecha**: 2026-07-25 / **Spec**: `docs/phases/fase-14-09-equipos-de-trabajo.md` (aprobada por José 2026-07-24) / **Commit**: — (branch `fase-14-roles-grupos-multiples`)
- **Nota de la aprobación (2026-07-24)**: José confirmó los defaults (incl. decisión 10: reparto = valor completo a cada miembro, no dividir) y precisó que el reporte del jefe es sobre una **conducta MALA concreta del catálogo** (no un reporte libre) — reflejado en la spec (`conductaId` requerido en `ReporteMiembro`, aprobar sin body).

### Backend ejecutado (compila + tests existentes verdes: identity 34 / activity 87 / scoring 45; lint limpio)
- **Contratos** (`shared-types` + `shared-events`): enums `RolEquipoMiembro`, `AlcanceActividad`, `EstadoReporte`; DTOs `EquipoDto`/`EquipoMiembroDto`/`MiEquipoDto`/`EquipoInternoDto`, requests de equipo, `ReporteMiembroDto`/`CrearReporteMiembroRequest`, `CompletarTareaEquipoResponse`/`AsignacionPuntosEquipoDto`, `PuntajeEquipoDto`; `ActividadDto` sumó `alcance`+`bonoJefePuntos`. Eventos nuevos `TareaEquipoCompletada` (`activity.tarea_equipo_completada`) y `ReporteMiembroCreado` (`activity.reporte_miembro_creado`) en routing-keys/payloads + `event-catalog.md`.
- **identity**: modelos `Equipo` + `EquipoMiembro` (`@@unique([grupoId, usuarioId])` = un equipo por grupo; un solo JEFE por lógica de service) + migración `20260725002652_equipos_fase14`. Módulo `equipos` (service, `EquiposController` TUTOR/ORG_ADMIN: crear/listar/detalle/editar/miembros/sustituir jefe; `MisEquiposController` USUARIO: `GET /identity/mis-equipos`) + interno `GET /internal/identity/equipos/:equipoId`. Excepciones tipadas (`USUARIO_YA_EN_EQUIPO`, `NO_SE_PUEDE_QUITAR_JEFE`, etc.).
- **activity**: `Actividad.alcance`+`bonoJefePuntos` (validación EQUIPO⇒OPCIONAL, bono solo con EQUIPO); modelos `RegistroTareaEquipo` (snapshot inmutable + `miembrosSnapshot` Json) y `ReporteMiembro` (workflow) + enum `EstadoReporte` + migración `20260725003333_equipos_fase14`. Módulo `equipos`: `TareasEquipoService.completar` (jefe/tutor; reparto base + bono al jefe; publica `TareaEquipoCompletada`), `ReportesService` (crear/listar/aprobar/rechazar; aprobar registra `RegistroConducta` MALA por el Tutor → `ConductaRegistrada`; publica `ReporteMiembroCreado`). El completar individual rechaza tareas de equipo (`ES_TAREA_DE_EQUIPO`). Cliente identity `obtenerEquipo`.
- **scoring**: `EventoPuntos.equipoId?` + índice + migración `20260725004309_equipo_id_evento_puntos_fase14`. Consumidor `TareaEquipoCompletada` (`scoring.q.registros-actividad`): un `EventoPuntos` por asignación etiquetado con `equipoId`, idempotente. Endpoint `GET /scoring/equipos/:equipoId/puntaje?seccionId=` (suma derivada, sin campo mutable).
- **notification**: consumidor de `ReporteMiembroCreado` → notifica a los tutores del grupo. `TareaEquipoCompletada` a usuarios quedó fuera (era opcional/EXTENSIÓN).
- **gateway**: sin cambios (ruteo por prefijo `/api/identity|activity|scoring`).

### Qué falta / verificar
1. **Frontend app-web**: gestión de equipos (tutor), form de actividad con alcance/bono, bandeja de reportes, vista "Mi equipo" + completar tarea / reportar (jefe).
2. **Tests unitarios nuevos** de los services (reparto con bono, aprobación de reporte, un-equipo-por-grupo, sustitución de jefe) — deuda.
3. **E2E real** por API vía Gateway: crear equipo → tarea de equipo → completar (jefe) → ver reparto en scoring/puntaje de equipo → reporte → aprobar (tutor) → descuento solo al reportado.

## Ítem: Contenido creado por los integrantes (gated por config del Grupo)
- **Estado**: PENDIENTE — idea de José (2026-07-24), registrada como ítem 10 en `docs/phases/fase-14-post-mvp.md`; falta redactar spec.
- **Fecha**: — / **Commit**: — / **Resumen**: — / **Desviaciones**: —
- **Origen**: que un Grupo pueda configurar si sus integrantes crean su propio contenido (opcionales, conductas buenas/malas). Punto aparte del ítem 9 (equipos). A acotar: moderación/aprobación del Tutor y el riesgo de que un integrante fabrique conductas MALA.

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
