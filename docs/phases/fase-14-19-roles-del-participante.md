# Fase 14 · Ítem 19 — Roles del participante dentro del Grupo

> Sub-spec detallada del ítem 19 de `fase-14-post-mvp.md`. Este archivo es la especificación decidida con José (decisiones de alcance el 2026-07-30, detalles cerrados el 2026-07-31); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Fases 2, 5, 6 y 7 completas, y de Fase 14: multi-grupo (`UsuarioGrupo`), confirmación de obligatorias (#8), equipos de trabajo (#9), contenido por integrantes (#10), actividades programadas (#11) y plan del día (#17). Todos existen y están ejecutados.

Reutiliza tal cual: el guard `InternalSecretGuard` + `x-internal-secret` (ADR-00 §4), el `IdentityClientService` de activity (`apps/activity-service/src/clientes/identity-client.service.ts`), el filtro de visibilidad de `apps/activity-service/src/comun/visibilidad-actividad.ts` (mismo patrón de "una regla, un archivo, aplicada en todas las lecturas"), y el registro de acción administrativa de Fase 9.

## Motivación (el problema que resuelve)

Hoy todos los participantes de un Grupo ven exactamente el mismo catálogo. Si en una casa Ana se ocupa de la cocina y Luis de las mascotas, las dos listas igual muestran las cuatro actividades de las dos áreas: cada uno tiene que saber de memoria cuáles son "suyas", y una obligatoria que no le corresponde igual lo castiga al cerrar la sesión.

El #9 ya resolvió la agrupación **horizontal** (equipos que hacen tareas juntos). Esto resuelve la **funcional**: qué le toca a cada uno por lo que es dentro del grupo, sin partir el grupo en dos.

## Decisiones de diseño

Cerradas con José el 2026-07-30 (en el índice de la fase):

1. **El catálogo de roles y la asignación viven en `identity-service`**, colgados de `UsuarioGrupo`. El rol es **por Grupo**, no por Organización: el mismo participante puede tener rol en un grupo y ninguno en otro, igual que el resto del catálogo del proyecto (actividades, conductas, umbrales, equipos son todos por grupo).
2. **Un solo rol por participante** (mismo criterio que el jefe de equipo del #9: sin reglas de conflicto entre roles).
3. **NO viaja en el JWT.** El token dura minutos, el Tutor cambia roles en vivo y un usuario está en varios grupos. Se resuelve por REST interno.
4. Por ahora el rol **solo filtra actividades** (lista de roles permitidos; vacío = todos, que es el comportamiento actual y hace la migración retro-compatible). **Conductas y recompensas quedan fuera de alcance a propósito.**
5. El rol es **visible para todos** dentro del grupo, como etiqueta junto al nombre.

Nombre obligatorio: **`RolGrupo`**, nunca `Rol` a secas — `Rol` ya es el rol de plataforma (`TUTOR`/`USUARIO`/`ORG_ADMIN`/`PLATFORM_ADMIN`) en `shared-types`. Dos conceptos distintos con el mismo nombre es un bug esperando.

Cerradas con José el 2026-07-31 (los huecos que faltaban):

6. **Una actividad restringida se OCULTA por completo** para quien no tiene el rol. No se muestra deshabilitada. Es el mismo criterio con el que el #17 sacó ruido de la lista del integrante, y el opuesto al del #15/#21 (tareas de equipo y turnos, que sí se muestran sin botón) — ahí la visibilidad comunica "el reparto es parejo"; acá comunica ruido permanente, porque el rol no rota.
7. **El catálogo de roles arranca vacío.** Ningún rol precargado por seed, igual que actividades, conductas y equipos: el Tutor carga los suyos. Hace la migración trivialmente retro-compatible (ningún grupo existente estrena roles sin pedirlos).
8. **El rol tiene nombre + color** (`colorHex`), como `UmbralZona.colorHex` de Fase 7. Sin emoji.

Detalles resueltos en esta spec:

9. **La asignación es un campo en `UsuarioGrupo`, no una tabla `UsuarioRolGrupo`.** El índice de la fase nombró `RolGrupo` / `UsuarioRolGrupo` para fijar la nomenclatura frente al `Rol` de plataforma; a la hora de modelar, con **un solo rol por participante** (decisión 2) una tabla de unión sería una relación 1:1 disfrazada de N:N, y el invariante "un solo rol" habría que sostenerlo con lógica de aplicación (el mismo dolor que el "un solo JEFE por equipo" del #9, que no se pudo expresar como `@@unique` parcial). Con `UsuarioGrupo.rolGrupoId String?` el invariante lo garantiza el esquema y no hay nada que sostener a mano. Si algún día se abre multi-rol, la migración es la habitual (tabla nueva + backfill del campo), igual que se hizo con multi-grupo.
10. **`rolesPermitidos` exige `alcance = INDIVIDUAL`** (400 `RESTRICCION_ROL_SOLO_INDIVIDUAL`). Una tarea de equipo la completa el jefe en nombre del equipo: cruzar rol funcional con membresía de equipo abre preguntas ("¿el jefe necesita el rol? ¿y si la mitad del equipo no lo tiene?") que este ítem no necesita responder. Anotado como futuro.
11. **Una actividad personal del integrante (#10, `origen = USUARIO`) nunca lleva `rolesPermitidos`** (400 si viene no vacío). Su dueño ya es una sola persona; restringirla por rol no significa nada.
12. **Archivar un rol desasigna a quienes lo tenían.** Las actividades que lo listaban en `rolesPermitidos` quedan restringidas a un rol que ya nadie tiene: se ocultan para todos los participantes (decisión 6), el Tutor las sigue viendo con un aviso en el catálogo. Se eligió esto en vez de bloquear el archivado con un 409 `ROL_EN_USO` porque identity **no puede** preguntarle a activity si el rol está en uso sin invertir la dirección de las llamadas internas (hoy activity→identity, nunca al revés) ni romper la regla 2.
13. **El filtro por rol se paga solo si el grupo lo usa.** `mi-estado-hoy` resuelve el rol del participante por REST interno **únicamente si alguna actividad del grupo tiene `rolesPermitidos` no vacío** — mismo patrón que el `necesitaTimezone` que ya vive en `registro.service.ts` (la timezone se pide una vez por request y solo si hay actividades programadas o con deadline). Con el catálogo sin restricciones —o sea, todos los grupos existentes— este ítem **no agrega ni una llamada** al camino caliente.
14. **Una caída de identity propaga 503**, no se degrada a "sin rol". Es el precedente ya vigente en activity (`IdentityClientService` es fail-closed a propósito: es aislamiento de datos, no cupo) y el fallback silencioso sería peor — con "sin rol" asumido, la decisión 6 vaciaría la lista del integrante sin explicar por qué.
15. **Cambiar el rol de un participante no toca nada de lo ya registrado.** El ledger es inmutable (regla 1) y los registros de actividad también (regla 6): si Ana completó una actividad de COCINA y hoy pasa a LIMPIEZA, esos puntos quedan como están. El rol filtra **desde ahora**, no retroactivamente.

---

## Parte A — `identity-service`: catálogo de roles y asignación

### A.1 — Modelo de datos

```prisma
// Rol funcional de un participante DENTRO de un Grupo (fase-14-19). Nada que ver
// con el `Rol` de plataforma de shared-types (TUTOR/USUARIO/ORG_ADMIN/
// PLATFORM_ADMIN): esto es "cocina", "mascotas", "limpieza" — etiquetas que
// define el Tutor de cada grupo. Espejo conceptual de Equipo (fase-14-09), un
// escalón más simple: sin miembros propios, la pertenencia vive en UsuarioGrupo.
model RolGrupo {
  id             String         @id @default(uuid())
  organizacionId String
  grupoId        String
  grupo          Grupo          @relation(fields: [grupoId], references: [id])
  nombre         String
  // Color de la etiqueta, "#RRGGBB". Mismo criterio que UmbralZona.colorHex
  // (Fase 7): el frontend NUNCA lo hardcodea, lo lee de la API.
  colorHex       String
  // reusa EstadoCuenta (ACTIVO/INACTIVO); INACTIVO = archivado. No hay borrado
  // físico: activity guarda ids de rol sin FK (regla 2) y borrar dejaría
  // referencias colgadas imposibles de explicar en una pantalla.
  estado         EstadoCuenta   @default(ACTIVO)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  asignaciones   UsuarioGrupo[]

  @@unique([grupoId, nombre])
  @@index([organizacionId])
  @@index([grupoId])
}

model UsuarioGrupo {
  // ... campos existentes ...
  // fase-14-19: rol del participante EN ESTE grupo. null = sin rol, que es el
  // default y el comportamiento previo al ítem 19 (migración retro-compatible).
  // Un solo rol por participante (decisión 2) garantizado por el esquema: es un
  // campo, no una tabla de unión (decisión 9).
  rolGrupoId String?
  rolGrupo   RolGrupo? @relation(fields: [rolGrupoId], references: [id])

  // + @@index([rolGrupoId])
}
```

- `@@unique([grupoId, nombre])` evita dos roles homónimos en el mismo grupo. Postgres compara con distinción de mayúsculas, así que la comparación **normalizada** (trim + lowercase) se hace además en el service antes de escribir → 409 `ROL_GRUPO_DUPLICADO`. Sin eso, "Cocina" y "cocina" conviven y nadie entiende cuál es cuál en el selector.
- `colorHex` se valida con `/^#[0-9A-Fa-f]{6}$/` (400 `COLOR_INVALIDO`).
- `nombre`: 1–30 caracteres tras `trim` (entra en un chip junto al nombre del participante).
- Regla 3: `organizacionId`/`grupoId` **siempre** del JWT validado del Tutor y del grupo verificado, nunca del body.

### A.2 — Endpoints públicos (prefijo `identity`, tenant-scoped por JWT)

Gestión (TUTOR del grupo / ORG_ADMIN, vía el `asegurarPuedeGestionar` que ya usan equipos):

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/identity/grupos/:grupoId/roles` | Crear rol `{ nombre, colorHex }`. 409 `ROL_GRUPO_DUPLICADO` si ya existe (normalizado). |
| `GET` | `/identity/grupos/:grupoId/roles` | Listar roles del grupo con `cantidadAsignados`. `?incluirArchivados=true` para la pantalla de gestión. |
| `PATCH` | `/identity/roles/:rolGrupoId` | Renombrar / cambiar color / archivar (`estado`). Archivar **desasigna** a todos sus participantes en la misma transacción (decisión 12). |
| `PUT` | `/identity/grupos/:grupoId/usuarios/:usuarioId/rol` | Asignar / cambiar / quitar: body `{ rolGrupoId: string \| null }`. Idempotente. Valida que el usuario sea miembro del grupo (404 `USUARIO_NO_ES_DEL_GRUPO`) y que el rol sea `ACTIVO` **de ese mismo grupo** (400 `ROL_GRUPO_INEXISTENTE`). |

> Un solo `PUT` para asignar, cambiar y quitar (en vez de `POST` + `DELETE`): con un rol por participante la operación es "fijar el valor", y el `PUT` la hace idempotente y sin estados intermedios. `null` quita el rol.

Lectura por el participante (decisión 5 — el rol es visible para todos dentro del grupo):

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/identity/grupos/:grupoId/roles` | **también USUARIO miembro del grupo** | Mismo endpoint de arriba; el USUARIO recibe solo los `ACTIVO` y sin `cantidadAsignados`. Alimenta las etiquetas de la app del participante. |

El rol propio y el de los compañeros viajan además dentro de `UsuarioDto` (ver §Tipos compartidos), así que las pantallas que ya listan integrantes —"Mi equipo" del #9, la lista de participantes del Tutor— no necesitan una llamada extra.

Toda mutación de esta parte (crear/editar/archivar rol, asignar/quitar) registra **`AccionAdministrativaRegistrada`** con el mecanismo ya existente de Fase 9. No hay eventos de dominio nuevos en este ítem.

### A.3 — Endpoints internos (`x-internal-secret`, nunca vía Gateway)

| Método | Ruta | Devuelve | Quién lo consume |
|---|---|---|---|
| `GET` | `/internal/identity/grupos/:grupoId/roles` | `RolGrupoInternoDto[]` = `[{ id, grupoId, organizacionId, nombre, colorHex, estado }]`. Incluye archivados (un registro viejo igual tiene que poder mostrar el nombre del rol). | activity: validar `rolesPermitidos` al crear/editar una actividad. |
| `GET` | `/internal/identity/grupos/:grupoId/roles-asignados` | `[{ usuarioId, rolGrupoId }]` — solo participantes `ACTIVO` del grupo, `rolGrupoId` puede ser `null`. | activity: `mi-estado-hoy`, plan del día, completar/confirmar y el castigo al cierre. |

`roles-asignados` es deliberadamente **el payload más chico posible** (dos ids por participante): es el que entra al camino caliente y el que va a reusar el #21 para precargar el pozo de turnos con "todos los del rol X". Se resuelve en **una llamada por request**, nunca una por fila — mismo invariante que el #18 tuvo que sostener con `equiposDelGrupo`.

---

## Parte B — `activity-service`: la restricción y dónde se aplica

### B.1 — Schema

```prisma
model Actividad {
  // ... campos existentes ...
  // fase-14-19: ids de RolGrupo (identity) que pueden verla/registrarla. SIN FK:
  // son de otra base (regla 2), se validan por REST interno al escribir. Vacío =
  // todos, que es el default y el comportamiento previo al ítem 19.
  rolesPermitidos String[] @default([])
}
```

Validaciones al crear/editar (todas en la escritura del catálogo, que es fría — el camino caliente no paga nada):

- Cada id debe existir en el catálogo `ACTIVO` del grupo → 400 `ROL_GRUPO_INEXISTENTE` (vía `GET /internal/identity/grupos/:grupoId/roles`).
- `rolesPermitidos` no vacío exige `alcance = INDIVIDUAL` → 400 `RESTRICCION_ROL_SOLO_INDIVIDUAL` (decisión 10).
- `rolesPermitidos` no vacío exige `origen = TUTOR` → 400 `ACTIVIDAD_PERSONAL_SIN_ROLES` (decisión 11).
- Sin duplicados; se normaliza a lista única.

### B.2 — La regla, en un solo archivo

Nuevo `apps/activity-service/src/comun/restriccion-rol.ts`, hermano de `visibilidad-actividad.ts` y con la misma advertencia en el encabezado:

```ts
/** Filtro Prisma: actividades sin restricción + las del rol del participante. */
export function filtroRolUsuario(rolGrupoId: string | null) {
  return rolGrupoId
    ? { OR: [{ rolesPermitidos: { isEmpty: true } }, { rolesPermitidos: { has: rolGrupoId } }] }
    : { rolesPermitidos: { isEmpty: true } };
}

/** Misma regla en memoria, para filas ya leídas. */
export function esDeSuRol(
  actividad: { rolesPermitidos: string[] },
  rolGrupoId: string | null
): boolean {
  return (
    actividad.rolesPermitidos.length === 0 ||
    (rolGrupoId !== null && actividad.rolesPermitidos.includes(rolGrupoId))
  );
}
```

**Los cinco puntos donde hay que aplicarla** (olvidar uno es el bug de este ítem):

1. **`GET /activity/grupos/:grupoId/mi-estado-hoy`** — se suma al `filtroVisibilidadUsuario` que ya está en el `where` ([registro.service.ts:357](apps/activity-service/src/registro/registro.service.ts#L357)). Con el gate de la decisión 13: se pide `roles-asignados` solo si el grupo tiene alguna actividad restringida.
2. **Listado/detalle de actividades servido a un USUARIO** — misma composición de filtros.
3. **Registrar** (`POST /activity/actividades/:id/completar` y la confirmación de obligatorias del #8) — 403 `ACTIVIDAD_NO_ES_DE_TU_ROL`. La pantalla ya no la muestra, pero el servidor es el que decide: un cliente viejo con la lista cacheada no puede colar el registro.
4. **Plan del día (#17)** — `POST /activity/grupos/:grupoId/plan-dia` rechaza elegir una actividad que no es de su rol, con el mismo 403. Si no, la hoja «＋ Elegir» sería una puerta lateral a lo que la lista oculta.
5. **Castigo automático al cerrar la Sesión (#8)** — `apps/activity-service/src/consumo/cierre.service.ts`. **Es el punto crítico de este ítem**: una obligatoria de LIMPIEZA no puede restar puntos a quien nunca tuvo ese rol. El consumidor corre sin JWT, resuelve `roles-asignados` del grupo una sola vez por evento y saltea a los participantes fuera del rol. Un olvido acá no se ve en pantalla: aparece como puntos negativos inexplicables al día siguiente.

> El mismo cuidado vale para el `puntosPorCumplir` del #20: si la actividad no es de su rol, no hay ni premio ni castigo, porque para ese participante la actividad no existe.

### B.3 — Lo que el Tutor sigue viendo

Un TUTOR/ORG_ADMIN ve **todas** las actividades del catálogo, restringidas o no (necesita gestionarlas), igual que ya pasa con el filtro de visibilidad del #10. En el catálogo, una actividad restringida muestra los chips de sus roles; si **ninguno** de sus roles tiene participantes asignados (caso de la decisión 12, rol archivado), muestra además el aviso "nadie tiene este rol: hoy no la ve ningún integrante".

Las acciones del Tutor sobre un participante concreto (marca roja del #12, "no hizo", correcciones) **sí** respetan la restricción: registrar un "no hizo" de una actividad que no es del rol del participante → 400 `ACTIVIDAD_NO_ES_DE_SU_ROL`.

---

## Parte C — `scoring-service`, `session-service`, `rewards-service`, `notification-service`

**Sin cambios.** El rol no toca el motor de puntaje: filtra qué actividades existen para cada participante, y los asientos que llegan a scoring ya vienen filtrados por activity. Las conductas y las recompensas quedan fuera de alcance por la decisión 4. Se anota explícitamente para que no se "aproveche el viaje" y se agregue restricción por rol a otra cosa en la misma sesión.

---

## Parte D — Frontend (`app-web`)

Mostrar propuesta de UI a José antes de scaffoldear (preferencia registrada).

**Tutor / ORG_ADMIN:**
- Pantalla **"Roles"** en la gestión del grupo (junto a "Equipos"): lista con el chip de color, cantidad de integrantes asignados, crear (nombre + selector de color), renombrar, archivar. Archivar pide confirmación y avisa a cuántos participantes va a desasignar (`ConfirmDialog` de `shared-ui`).
- En la **lista de integrantes**: selector de rol por participante (incluye "Sin rol"), un `PUT` por cambio.
- En el **formulario de Actividad**: campo "Restringir a roles" (multi-select de los roles `ACTIVO`, vacío = todos), con el texto de ayuda "vacío = la ven todos". Deshabilitado si la actividad es de equipo (decisión 10), con el motivo visible.

**Participante:**
- Chip de rol (nombre + `colorHex`) junto al nombre propio en la home y junto al de los compañeros en "Mi equipo" y en el ranking del grupo.
- **Nada más cambia**: la lista simplemente trae menos tarjetas. No hay pantalla nueva ni explicación de por qué falta algo — esa es exactamente la decisión 6.

---

## Tipos compartidos (`libs/shared-types`)

Respetando la convención de prefijo Request/Response por operación:

- `RolGrupoDto` = `{ id, grupoId, nombre, colorHex, estado, cantidadAsignados? }`.
- `CrearRolGrupoRequest` / `CrearRolGrupoResponse`, `ActualizarRolGrupoRequest` (`{ nombre?, colorHex?, estado? }`).
- `AsignarRolGrupoRequest` = `{ rolGrupoId: string | null }`.
- `RolGrupoInternoDto`, `RolAsignadoDto` = `{ usuarioId, rolGrupoId: string | null }`.
- `UsuarioDto`: agregar `rolGrupo?: { id, nombre, colorHex } | null` (poblado cuando el DTO se pide en contexto de un grupo — es un dato por grupo, igual que `grupoId`).
- `ActividadDto` y los request de crear/editar actividad: agregar `rolesPermitidos: string[]`.

## Eventos (`docs/architecture/event-catalog.md`)

**Ninguno nuevo.** Las mutaciones de rol se auditan con `AccionAdministrativaRegistrada` (Fase 9), que ya existe y ya se consume. Anotar en el catálogo las nuevas `accion` que se registran: `ROL_GRUPO_CREADO`, `ROL_GRUPO_ACTUALIZADO`, `ROL_GRUPO_ARCHIVADO`, `ROL_PARTICIPANTE_ASIGNADO`.

## Criterios de aceptación

- [ ] Un Tutor crea dos roles ("Cocina" verde, "Limpieza" azul) en su grupo; crear un tercero llamado "cocina" → 409 `ROL_GRUPO_DUPLICADO`. Un `colorHex` inválido → 400 `COLOR_INVALIDO`.
- [ ] El Tutor asigna "Cocina" a Ana y "Limpieza" a Luis; un `PUT` con `rolGrupoId: null` deja a Ana sin rol. La operación es idempotente (repetirla no cambia nada ni falla).
- [ ] Asignar un rol de **otro grupo** a un participante → 400 `ROL_GRUPO_INEXISTENTE`. Asignar a alguien que no es miembro del grupo → 404 `USUARIO_NO_ES_DEL_GRUPO`.
- [ ] Con una actividad restringida a "Cocina": `mi-estado-hoy` de Ana la incluye; el de Luis y el de un participante **sin rol** no la traen (decisión 6). El catálogo del Tutor la sigue mostrando, con sus chips.
- [ ] Luis intenta completarla igual (llamada directa al endpoint) → 403 `ACTIVIDAD_NO_ES_DE_TU_ROL`. Lo mismo al intentar meterla en su plan del día (#17).
- [ ] **Cierre de sesión (#8)**: una OBLIGATORIA restringida a "Cocina" con castigo −10 genera el asiento negativo **solo** para Ana. Luis y el participante sin rol terminan la sesión sin ningún `EventoPuntos` de esa actividad.
- [ ] **#20 combinado**: la misma obligatoria con `puntosPorCumplir = +2` acredita al confirmar **solo** a quien es del rol.
- [ ] `rolesPermitidos` no vacío sobre una actividad con `alcance = EQUIPO` → 400 `RESTRICCION_ROL_SOLO_INDIVIDUAL`; sobre una actividad personal (`origen = USUARIO`) → 400 `ACTIVIDAD_PERSONAL_SIN_ROLES`.
- [ ] Archivar "Cocina" desasigna a Ana; la actividad restringida deja de verse para **todos** los participantes y el catálogo del Tutor muestra el aviso de "nadie tiene este rol" (decisión 12).
- [ ] Un participante ve el chip de rol de sus compañeros (decisión 5), con el `colorHex` que devuelve la API — sin ningún color hardcodeado en el frontend.
- [ ] **Costo cero cuando no se usa**: en un grupo sin ninguna actividad restringida, `mi-estado-hoy` **no** llama a `roles-asignados` (decisión 13). Verificable con un espía sobre el `IdentityClientService` en el test.
- [ ] Con identity caído y el grupo usando roles, `mi-estado-hoy` responde 503 — no una lista vacía (decisión 14).
- [ ] **Aislamiento multi-tenant**: los roles de un grupo no son visibles ni asignables desde otra organización ni desde otro grupo de la misma organización.
- [ ] **Migración retro-compatible**: tras aplicarla, toda actividad preexistente queda con `rolesPermitidos = []`, todo `UsuarioGrupo` con `rolGrupoId = null`, y ningún grupo cambia de comportamiento.

## Nota para Claude Code

Feature de **dos servicios** (identity + activity) más frontend — bastante más chica que el #9, más grande que el #20. Orden de implementación: (1) identity (schema + catálogo + asignación + los dos internos), (2) activity (`rolesPermitidos` + `restriccion-rol.ts` + **los cinco puntos de aplicación de B.2**, empezando por el del cierre, que es el que duele), (3) `shared-types`, (4) frontend. 

El riesgo real de este ítem no es el modelo de datos —es trivial— sino **olvidar uno de los cinco puntos de aplicación**. El del cierre automático (B.2.5) no se manifiesta en ninguna pantalla: se manifiesta como puntos negativos injustos al día siguiente. Escribir ese test primero.

Migraciones a mano solo si no hay Postgres levantado (mismo criterio que los ítems previos), y **aplicarlas contra DB real antes de dar el ítem por cerrado** — el #16 dejó el precedente de un bug que pasaba tests, lint, typecheck y build y fallaba en el 100% de las corridas reales.
