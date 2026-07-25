# Fase 14 · Ítem 9 — Equipos de trabajo (jefe de equipo + tareas colectivas)

> Sub-spec detallada del ítem 9 de `fase-14-post-mvp.md`. **No ejecutar hasta que Fase 13 esté estable con uso real** (misma regla que el resto de Fase 14). Este archivo es la especificación decidida con José (2026-07-24); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Fases 2, 5, 6 y 7 completas (identity, catálogo, sesión/sección, scoring + registro) y el ítem multi-grupo de Fase 14 (`UsuarioGrupo`) aplicado. Reutiliza: el interno `GET /internal/identity/grupos/:grupoId/usuarios` (Fase 2), la resolución de Sesión/Sección actual (`GET /internal/session/grupos/:grupoId/secciones/actual`, Fase 6), el mecanismo de registro de conducta por el Tutor y el evento `ConductaRegistrada` (Fase 7), y el ledger inmutable `EventoPuntos` (Fase 7). Todos existen.

## Motivación (el problema que resuelve)

José pidió poder **agrupar participantes de un Grupo en equipos**, cada uno con un **jefe de equipo** que impulsa al resto a cumplir **tareas colectivas** y ganar puntos en conjunto. Con reglas de gobernanza:

- Si el equipo **no cumple**, se **sustituye al jefe**; el reemplazo queda **sujeto a evaluación** (mismo ciclo).
- Si un integrante **no coopera / no le hace caso al jefe**, éste lo **reporta** para que se le bajen puntos **solo a ese integrante** — sin eximir al equipo de cumplir la tarea.

Hoy no existe ningún concepto de sub-agrupación dentro del Grupo: los participantes son planos y todos los puntos son individuales. Este ítem agrega la estructura de equipo, las tareas de equipo con reparto de puntos, y el flujo de reporte del jefe con aprobación del Tutor.

## Decisiones de diseño (cerradas con José, 2026-07-24)

Núcleo (fijado en la conversación de diseño):

1. **Puntos del equipo = ledger del equipo + reparto.** No hay campo mutable de "puntaje de equipo" (regla 1). Cada tarea de equipo completada genera **un `EventoPuntos` por miembro** (filas nuevas, nunca `UPDATE` — reglas 1 y 6), etiquetadas con `equipoId`. El "puntaje del equipo" es una **vista derivada** = suma de los eventos con ese `equipoId`. Los puntajes/zonas individuales siguen coherentes porque cada miembro recibe su parte como evento propio.
2. **Reporte del jefe = reporta una conducta MALA concreta → Tutor aprueba.** El reporte **no es libre**: el jefe reporta una **conducta MALA específica del catálogo del grupo** (`conductaId` requerido) contra un integrante — no un "motivo X" genérico que después haya que interpretar. El jefe crea un `ReporteMiembro` `PENDIENTE`; el descuento se aplica **solo si el Tutor lo aprueba**, registrándose como esa conducta negativa **generada por el Tutor** (mecanismo actual de Fase 7 — ningún participante genera eventos de puntos directo). Respeta el modelo de permisos y evita abuso/revancha.
3. **El jefe NO es un rol de plataforma.** Sigue siendo un Usuario/participante; "jefe" es un atributo de `EquipoMiembro` (`rol = JEFE | MIEMBRO`), no un `PrincipalType` ni permisos de Tutor. No toca auth ni el JWT.

Defaults acordados:

4. **Sustitución del jefe = manual por el Tutor** al cerrar un período incumplido (piloto). La evaluación automática de "cumplió el equipo" queda como futuro (requiere definir con precisión período y meta).
5. **Membresía = un usuario en un solo equipo por grupo** al arranque (multi-equipo se abre después, igual que se hizo con multi-grupo).
6. **Reparto = igual entre miembros + bono configurable al jefe** (default 0).
7. **"Cumplió el equipo" atado a la Sección/cierre**, reusando el ciclo de `session-service` (juicio del Tutor, no automático — ver decisión 4).

Detalles resueltos en esta spec (los "huecos" que faltaban):

8. **Quién completa la tarea de equipo: el jefe** (o un Tutor en su nombre). Un miembro no-jefe **no** puede completarla. Mantiene la responsabilidad clara y evita doble conteo.
9. **Cuándo se reparte: inmediato al completar** (consistente con `ActividadCompletada` individual, Fase 7), no diferido al cierre de Sección. La "evaluación de si el equipo cumplió" (para sustituir al jefe, decisión 4) es un juicio separado del Tutor, no bloquea ni difiere el reparto de puntos.
10. **Reparto = valor completo a cada miembro** (no se divide `valorPuntos / N`): cada miembro recibe `valorPuntos` íntegro, el jefe recibe además `bonoJefePuntos`. Se elige replicar en vez de dividir para (a) evitar redondeos con `Int` (regla 5) y (b) ser más motivador. *(Si José prefiere dividir, es un flag de config — no rediseño; anotarlo antes de implementar.)*
11. **Tareas de equipo son `OPCIONAL`** (suman puntos) para el piloto. Obligatorias de equipo (con castigo colectivo al cierre) quedan fuera de alcance de este ítem.

---

## Parte A — `identity-service`: estructura del equipo

Los equipos son agrupación de participantes → viven en identity, espejo conceptual de `TutorGrupo`/`UsuarioGrupo`.

### Modelo de datos

```prisma
enum RolEquipoMiembro {
  JEFE
  MIEMBRO
}

model Equipo {
  id             String          @id @default(uuid())
  organizacionId String
  grupoId        String
  grupo          Grupo           @relation(fields: [grupoId], references: [id])
  nombre         String
  estado         EstadoCuenta    @default(ACTIVO) // reusa el enum (ACTIVO/INACTIVO); INACTIVO = archivado
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  miembros       EquipoMiembro[]

  @@index([organizacionId])
  @@index([grupoId])
}

model EquipoMiembro {
  id             String           @id @default(uuid())
  organizacionId String
  grupoId        String           // denormalizado del Equipo, para el @@unique de "un equipo por grupo"
  equipoId       String
  equipo         Equipo           @relation(fields: [equipoId], references: [id])
  usuarioId      String
  rol            RolEquipoMiembro @default(MIEMBRO)
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  @@unique([equipoId, usuarioId])
  @@unique([grupoId, usuarioId]) // decisión 5: un usuario en un solo equipo por grupo
  @@index([organizacionId])
  @@index([usuarioId])
}
```

- **Un solo jefe por equipo**: no se puede expresar con un `@@unique` simple de Prisma (unique parcial); se garantiza por lógica de aplicación (crear/sustituir jefe degrada al jefe anterior a `MIEMBRO` en la misma transacción). Documentar el invariante en el service.
- **Sustitución del jefe (decisión 4)**: es un cambio operativo mutable (como mover un miembro), no un asiento de ledger — `updatedAt` alcanza. Si más adelante se quiere trazabilidad histórica de jefes, agregar un `HistorialJefeEquipo` (fuera de alcance de este ítem; anotado como futuro).
- El `Usuario` referenciado debe pertenecer al `grupoId` del equipo (validar contra `UsuarioGrupo`) y a la misma organización (regla 3, siempre del JWT del Tutor, nunca del cliente).

### Endpoints (prefijo `identity`, todos tenant-scoped por el JWT)

Gestión por el Tutor/ORG_ADMIN del grupo (`asegurarPuedeGestionar` — el Tutor comparte grupo con el equipo):

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/identity/grupos/:grupoId/equipos` | TUTOR/ORG_ADMIN | Crear equipo: `{ nombre, jefeUsuarioId, miembrosIds[] }`. Valida que todos sean usuarios del grupo y que ninguno esté ya en otro equipo del grupo (409 `USUARIO_YA_EN_EQUIPO`). |
| `GET` | `/identity/grupos/:grupoId/equipos` | TUTOR/ORG_ADMIN | Listar equipos del grupo con sus miembros. |
| `GET` | `/identity/equipos/:equipoId` | TUTOR/ORG_ADMIN | Detalle. |
| `PATCH` | `/identity/equipos/:equipoId` | TUTOR/ORG_ADMIN | Renombrar / archivar (`estado`). |
| `POST` | `/identity/equipos/:equipoId/miembros` | TUTOR/ORG_ADMIN | Agregar miembro `{ usuarioId }`. |
| `DELETE` | `/identity/equipos/:equipoId/miembros/:usuarioId` | TUTOR/ORG_ADMIN | Quitar miembro (no se puede quitar al jefe sin sustituirlo antes → 409 `NO_SE_PUEDE_QUITAR_JEFE`). |
| `POST` | `/identity/equipos/:equipoId/jefe` | TUTOR/ORG_ADMIN | Sustituir jefe `{ nuevoJefeUsuarioId }` (decisión 4). Degrada al jefe actual a `MIEMBRO` y promueve al nuevo, en una transacción. El nuevo debe ser miembro del equipo. |

Lectura por el participante:

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/identity/mis-equipos` | USUARIO | El/los equipo(s) del participante (uno por grupo), con su rol (`JEFE`/`MIEMBRO`) y sus compañeros. Alimenta la vista de equipo del usuario. |

Interno (para activity y scoring — regla 2, cruce por REST, `x-internal-secret`):

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/internal/identity/equipos/:equipoId` | `{ equipoId, grupoId, organizacionId, nombre, jefeUsuarioId, miembros: [{ usuarioId, rol }] }`. Fuente de verdad de la membresía al momento de completar una tarea. |

---

## Parte B — `activity-service`: tareas de equipo y reportes

### B.1 — Actividad de equipo (schema)

```prisma
enum AlcanceActividad {
  INDIVIDUAL // comportamiento actual: la completa cada usuario para sí
  EQUIPO     // la completa el jefe una vez; scoring reparte a los miembros
}

model Actividad {
  // ... campos existentes ...
  alcance        AlcanceActividad @default(INDIVIDUAL)
  // solo relevante si alcance = EQUIPO; puntos extra al jefe sobre el valor base
  bonoJefePuntos Int              @default(0)
}
```

- `@default(INDIVIDUAL)` → toda actividad preexistente conserva el comportamiento actual (migración retro-compatible).
- Validación al crear/editar: `bonoJefePuntos > 0` solo se permite con `alcance = EQUIPO` (400 si no). `alcance = EQUIPO` exige `tipoPuntaje = OPCIONAL` (decisión 11; 400 `TAREA_EQUIPO_DEBE_SER_OPCIONAL`).

### B.2 — Registro inmutable de la tarea de equipo (schema)

```prisma
model RegistroTareaEquipo {
  id             String   @id @default(uuid())
  organizacionId String
  grupoId        String
  equipoId       String
  actividadId    String
  sesionId       String
  seccionId      String
  // snapshot de la membresía y del reparto al momento de completar (auditoría);
  // el detalle por miembro viaja además en el evento hacia scoring.
  valorPuntosSnapshot Int
  bonoJefeSnapshot    Int
  jefeUsuarioIdSnapshot String
  miembrosSnapshot    Json     // [{ usuarioId, esJefe, puntos }]
  completadaPorId     String
  // 'USUARIO' (jefe) | 'TUTOR'
  completadaPorTipo   String
  createdAt           DateTime @default(now())
  // SIN updatedAt: inmutable, igual que RegistroActividad.

  @@index([organizacionId])
  @@index([equipoId, sesionId])
}
```

### B.3 — Reporte del jefe (schema)

```prisma
enum EstadoReporte {
  PENDIENTE
  APROBADO
  RECHAZADO
}

model ReporteMiembro {
  id                 String        @id @default(uuid())
  organizacionId     String
  grupoId            String
  equipoId           String
  reportadoUsuarioId String
  jefeUsuarioId      String
  // conducta MALA CONCRETA del catálogo que el jefe reporta (requerida): el reporte
  // es sobre una conducta específica, no un reporte libre. El Tutor aprueba/rechaza ESA conducta.
  conductaId         String
  // nota contextual opcional del jefe (no reemplaza a la conducta)
  motivo             String?
  estado             EstadoReporte @default(PENDIENTE)
  resueltoPorTutorId String?
  // RegistroConducta creado al aprobar (traza el asiento aplicado)
  registroConductaId String?
  resueltoEn         DateTime?
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt // objeto de workflow, mutable (NO es el ledger)

  @@index([organizacionId])
  @@index([grupoId, estado])
  @@index([equipoId])
}
```

> `ReporteMiembro` vive en activity (no en identity) a propósito: su resolución **es** registrar una conducta, y `RegistroConducta` + el evento `ConductaRegistrada` ya viven acá. Así la aprobación no cruza servicios para escribir el asiento (regla 2). La membresía/rol del jefe se valida contra el interno de identity (`GET /internal/identity/equipos/:equipoId`), igual que activity ya resuelve `usuariosDelGrupo`.

### B.4 — Endpoints

**Completar tarea de equipo** (decisiones 8 y 9):

`POST /activity/equipos/:equipoId/tareas/:actividadId/completar` — rol USUARIO (jefe del equipo) o TUTOR del grupo.

1. Resolver el equipo vía `GET /internal/identity/equipos/:equipoId` → membresía + `jefeUsuarioId`.
2. Autorización: el principal debe ser el **jefe** del equipo, o un Tutor del grupo. Un miembro no-jefe → 403 `SOLO_JEFE_COMPLETA_TAREA_EQUIPO`.
3. Validar `Actividad` `ACTIVA`, del mismo `grupoId`, `alcance = EQUIPO` (400 si es INDIVIDUAL).
4. Requiere Sesión `ABIERTA` (resolución vía interno de session; 409 `NO_HAY_SESION_ABIERTA`).
5. Respeta `repeticionesMaximasSesion`: si ya hay un `RegistroTareaEquipo` de ese equipo+actividad+sesión al tope, 409 `LIMITE_REPETICIONES_ALCANZADO`.
6. Computar `asignaciones`: cada miembro → `valorPuntos`; el jefe → `valorPuntos + bonoJefePuntos` (decisión 10).
7. Crear `RegistroTareaEquipo` (snapshot de miembros + reparto) y **publicar `TareaEquipoCompletada`** con las `asignaciones` (después del commit).

> El endpoint individual `POST /activity/actividades/:id/completar` rechaza (400 `ES_TAREA_DE_EQUIPO`) si `alcance = EQUIPO` — se completa solo por la ruta de equipo.

**Reporte del jefe** (decisión 2):

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/activity/equipos/:equipoId/reportes` | USUARIO (jefe) | Crear reporte `{ reportadoUsuarioId, conductaId, motivo? }`. `conductaId` debe ser una conducta **MALA** `ACTIVA` del grupo (400 `CONDUCTA_NO_ES_MALA`). Valida (vía interno de identity) que el emisor es el jefe y el reportado es miembro del mismo equipo (400 `REPORTADO_NO_ES_MIEMBRO`). Estado `PENDIENTE`. Publica `ReporteMiembroCreado` → notification avisa al Tutor. |
| `GET` | `/activity/grupos/:grupoId/reportes?estado=PENDIENTE` | TUTOR/ORG_ADMIN | Bandeja de reportes del grupo (incluye la conducta MALA reportada). |
| `POST` | `/activity/reportes/:id/aprobar` | TUTOR/ORG_ADMIN | Sin body (la conducta ya está en el reporte). Registra un `RegistroConducta` de la `conductaId` reportada, **generado por el Tutor** (`registradoPorTipo = 'TUTOR'`, `-valorPuntos`), publica `ConductaRegistrada` → scoring resta **solo al reportado**. Marca el reporte `APROBADO` + guarda `registroConductaId`. |
| `POST` | `/activity/reportes/:id/rechazar` | TUTOR/ORG_ADMIN | `{ motivo? }`. Marca `RECHAZADO`, sin efecto en puntos. |

- **Idempotencia de aprobación**: aprobar un reporte ya `APROBADO`/`RECHAZADO` → 409 `REPORTE_YA_RESUELTO` (no duplica la conducta).
- El descuento recae **solo en el reportado** (regla del pedido); el equipo sigue debiendo la tarea (no hay compensación colectiva).

---

## Parte C — `scoring-service`: reparto y puntaje de equipo

### C.1 — `EventoPuntos.equipoId` (schema)

```prisma
model EventoPuntos {
  // ... campos existentes ...
  // no null solo cuando el asiento viene de una tarea de equipo (fase-14-09);
  // permite derivar el puntaje del equipo sumando por equipoId.
  equipoId String?
}
// + @@index([equipoId])
```

`@default` nulo → asientos históricos quedan sin `equipoId` (individuales), sin migración de datos.

### C.2 — Consumidor de `TareaEquipoCompletada` (el reparto)

Nuevo consumidor RabbitMQ (cola cuórum + `@RabbitSubscribe`, patrón de Fase 7), routing key `activity.tarea_equipo_completada`. Idempotente vía `EventoProcesado` (`consumidor = 'scoring-service'`).

Payload:

```ts
interface TareaEquipoCompletadaPayload {
  registroTareaEquipoId: string;
  actividadId: string;
  equipoId: string;
  organizacionId: string;
  grupoId: string;
  sesionId: string;
  seccionId: string;
  asignaciones: Array<{ usuarioId: string; puntos: number; esJefe: boolean }>;
}
```

Handler (idempotente):
1. Si el `eventId` ya está en `EventoProcesado` → no-op (reentrega).
2. Por cada `asignacion`: crear `EventoPuntos` con `tipoOrigen = ACTIVIDAD_COMPLETADA`, `usuarioId = asignacion.usuarioId`, `puntosSnapshot = asignacion.puntos` (ya con el bono del jefe resuelto por activity), `equipoId`, `origenId = registroTareaEquipoId`, `registradoPorTipo = 'SYSTEM'`, `seccionId`/`sesionId` del payload.
3. Registrar el `eventId` en `EventoProcesado` **en la misma transacción** que los asientos.

- **Tenant**: el consumidor corre sin JWT; usa `organizacionId`/`grupoId` del envelope y saltea el filtro ALS (mismo cuidado que los otros consumidores de scoring).
- Los asientos de equipo participan del puntaje individual y de las zonas como cualquier otro (son `EventoPuntos` normales del usuario), y además son sumables por `equipoId`.

### C.3 — Consulta de puntaje de equipo (vista derivada)

`GET /scoring/equipos/:equipoId/puntaje?seccionId=` — TUTOR/ORG_ADMIN o miembro del equipo.

- Deriva sumando `EventoPuntos WHERE equipoId = :equipoId` (y `seccionId` si se pasa). Devuelve `{ equipoId, puntajeTotal, porMiembro: [{ usuarioId, puntos }] }`.
- **Cero campos mutables** (regla 1): es una lectura agregada del ledger, no un acumulado guardado.

---

## Parte D — `notification-service`

- Consume `ReporteMiembroCreado` (`activity.reporte_miembro_creado`) → notifica al Tutor/ORG_ADMIN del grupo que hay un reporte para revisar.
- Consume `TareaEquipoCompletada` (opcional, EXTENSIÓN) → notifica a los miembros del equipo los puntos ganados. Reusa la resolución de destinatarios que ya hace notification.

---

## Parte E — Frontend (`app-web`)

Mostrar propuesta de UI a José antes de scaffoldear (preferencia registrada).

**Tutor/ORG_ADMIN** (sección de gestión del grupo):
- Pantalla "Equipos": lista de equipos del grupo, crear equipo (nombre + elegir jefe + miembros), editar miembros, **sustituir jefe**, archivar.
- Al crear una Actividad: selector `alcance` (Individual / Equipo) y, si es Equipo, campo `bonoJefePuntos`.
- **Bandeja de reportes**: lista de `ReporteMiembro` `PENDIENTE` (muestra el integrante y la conducta MALA reportada), con aprobar (confirma esa conducta) / rechazar.

**Usuario participante**:
- Vista "Mi equipo": compañeros, quién es el jefe, puntaje del equipo (de `GET /scoring/equipos/:id/puntaje`).
- **Si es jefe**: botón para completar la(s) tarea(s) de equipo del día, y acción "Reportar integrante" (elige compañero + **conducta MALA del catálogo** + nota opcional).
- **Si es miembro**: ve las tareas de equipo y su estado (las completa el jefe), no ve el botón de completar.

---

## Tipos compartidos (`libs/shared-types`)

Respetando la convención de prefijo Request/Response por operación (`CLAUDE.md` §convenciones):

- Enums: `RolEquipoMiembro` (`'JEFE' | 'MIEMBRO'`), `AlcanceActividad` (`'INDIVIDUAL' | 'EQUIPO'`), `EstadoReporte` (`'PENDIENTE' | 'APROBADO' | 'RECHAZADO'`).
- `EquipoDto`, `EquipoMiembroDto`, `MiEquipoDto`.
- `CrearEquipoRequest`/`CrearEquipoResponse`, `SustituirJefeRequest`, `AgregarMiembroRequest`.
- `CompletarTareaEquipoRequest`/`CompletarTareaEquipoResponse`.
- `CrearReporteMiembroRequest` (`{ reportadoUsuarioId, conductaId, motivo? }`), `ReporteMiembroDto` (incluye `conductaId` + datos de la conducta reportada). Aprobar no lleva request body (la conducta ya está en el reporte).
- `PuntajeEquipoDto`.
- `ActividadDto`: agregar `alcance` y `bonoJefePuntos`.

## Eventos (`docs/architecture/event-catalog.md`)

Agregar al catálogo:

| Evento | Routing key | Productor | Consumidores | Nivel |
|---|---|---|---|---|
| `TareaEquipoCompletada` | `activity.tarea_equipo_completada` | Activity Catalog | Scoring, Notification | EXTENSIÓN |
| `ReporteMiembroCreado` | `activity.reporte_miembro_creado` | Activity Catalog | Notification | EXTENSIÓN |

- La aprobación de un reporte **reutiliza `ConductaRegistrada`** (ya existente, ya consumido por scoring/notification) — no es un evento nuevo.
- `scoring-service` pasa a consumir un nuevo evento de activity (`TareaEquipoCompletada`) además de los que ya consume.

## Criterios de aceptación

- [ ] Un Tutor crea un equipo con un jefe y 2 miembros; un participante no puede quedar en dos equipos del mismo grupo (409 `USUARIO_YA_EN_EQUIPO`).
- [ ] Sustituir al jefe deja exactamente un `JEFE` en el equipo (el anterior pasa a `MIEMBRO`).
- [ ] El **jefe** completa una tarea de equipo (`alcance = EQUIPO`, `valorPuntos = 10`, `bonoJefePuntos = 3`): aparece un `EventoPuntos` por cada miembro (`+10`, con `equipoId`) y el jefe recibe `+13`; el puntaje individual de cada uno sube en consecuencia.
- [ ] Un miembro no-jefe que intenta completar la tarea de equipo recibe 403 `SOLO_JEFE_COMPLETA_TAREA_EQUIPO`.
- [ ] Completar la misma tarea de equipo dos veces en la misma Sesión respeta `repeticionesMaximasSesion` (409 al tope).
- [ ] Reentregar el mismo `TareaEquipoCompletada` no duplica los asientos (verificar `EventoProcesado` de scoring).
- [ ] `GET /scoring/equipos/:id/puntaje` devuelve la suma derivada por `equipoId` (no un campo guardado); coincide con la suma de los `EventoPuntos` de sus miembros por tareas de equipo.
- [ ] El jefe reporta a un integrante **por una conducta MALA concreta del catálogo**; el reporte queda `PENDIENTE` (con esa `conductaId`) y el Tutor recibe la notificación. Reportar con una `conductaId` que no es MALA/ACTIVA del grupo → 400 `CONDUCTA_NO_ES_MALA`.
- [ ] El Tutor **aprueba** el reporte (sin re-elegir conducta): se crea un `RegistroConducta` de la conducta reportada (`registradoPorTipo = TUTOR`) y baja el puntaje **solo del reportado**; el reporte queda `APROBADO`. Aprobar de nuevo → 409 `REPORTE_YA_RESUELTO`.
- [ ] El Tutor **rechaza** un reporte: no cambia ningún puntaje; queda `RECHAZADO`.
- [ ] Aislamiento multi-tenant: equipos, reportes y asientos de equipo solo se ven/afectan dentro de la organización+grupo del JWT/envelope.
- [ ] Migración retro-compatible: actividades preexistentes quedan `alcance = INDIVIDUAL`, `bonoJefePuntos = 0`, y se comportan igual que antes; `EventoPuntos` históricos quedan con `equipoId = null`.

## Nota para Claude Code

Feature **transversal a 4 servicios** (identity, activity, scoring, notification) — no es un ítem chico. Orden sugerido de implementación: (1) identity (estructura + internos), (2) activity (actividad de equipo + completar + reportes), (3) scoring (`equipoId` + consumidor de reparto + consulta), (4) notification, (5) frontend. Copiar el patrón de consumidor de Fase 7/14-08 (cola cuórum `durable`, `EventoProcesado`, publicar-después-del-commit, saltear filtro de tenant en el handler). Migraciones a mano solo si no hay Postgres levantado (mismo criterio que ítems previos), y aplicarlas contra DB real antes de correr. No implementar hasta que Fase 13 esté estable (regla de Fase 14). Antes de la Parte C, confirmar con José el punto abierto de la decisión 10 (replicar valor completo vs. dividir).
