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

### Qué falta / verificar la próxima sesión (contra DB/stack real)
1. Aplicar la migración de identity (`prisma migrate deploy`/`dev`) con Postgres arriba y arrancar identity con `PLATFORM_ADMIN_EMAIL/PASSWORD` para verificar el bootstrap.
2. Flujo E2E real: `nx serve admin-web` (4300) + stack → login admin → listar orgs → cambiar plan (verificar que el JWT del tutor trae el plan nuevo tras re-login) → suspender (verificar 403 `ORGANIZACION_SUSPENDIDA` en login del tutor) → reactivar.
3. Agregar `PLATFORM_ADMIN_*` a `.env.production.example` y READMEs de despliegue; sumar `admin-web` como target Vercel en el runbook (fase-13).
4. (Hecho) Fila puerto 4300 agregada a la tabla de `CLAUDE.md` (proyecto + global).

## Ítem: Reevaluación de infraestructura (Kubernetes u otra)
- **Estado**: PENDIENTE
- **Fecha**: — / **Commit**: — / **Resumen**: — / **Desviaciones**: —

## Ítem: Propuesta de actividad por Usuario (condicional a confirmación de José)
- **Estado**: PENDIENTE — confirmar con José si sigue siendo un requisito antes de diseñarlo.
- **Fecha**: — / **Commit**: — / **Resumen**: — / **Desviaciones**: —

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
