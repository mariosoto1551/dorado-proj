# Fase 14 · Ítem 10 — Contenido creado por los integrantes (3 modos, gated por config del Grupo)

> Sub-spec detallada del ítem 10 de `fase-14-post-mvp.md`. Fase 13 está **ESTABLE** (ratificado por José el 2026-07-26 — ver `docs/progreso/fase-13-piloto-deploy.md`), así que la condición de arranque de Fase 14 está cumplida. Este archivo es la especificación decidida con José (2026-07-26); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Fases 5 (catálogo de actividades/conductas), 6 (ciclo Sección/Sesión), 7 (registro + ledger) y 9 (notification/audit) completas, más los ítems de Fase 14 ya ejecutados: multi-grupo (`UsuarioGrupo`), confirmación de obligatorias (ítem 8, `mi-estado-hoy`) y equipos de trabajo (ítem 9, `alcance`/`bonoJefePuntos` en `Actividad`). Todos existen.

## Motivación (el problema que resuelve)

Hoy el catálogo es **exclusivamente del Tutor/ORG_ADMIN**: un participante solo puede completar lo que le pusieron. José quiere que un Grupo pueda **abrir la creación de contenido a sus integrantes**, con distintos niveles de control según la confianza/edad del grupo — desde "que cada uno se arme sus propias metas" hasta "todo pasa por mí".

Este ítem **absorbe el ítem 7** de `fase-14-post-mvp.md` ("propuesta de actividad por Usuario", que estaba condicionado a que José confirmara si lo seguía queriendo): la `PropuestaActividad` que ese ítem describía es exactamente el modelo del modo `BAJO_APROBACION` de acá. El ítem 7 queda **cerrado por absorción**, no descartado.

## Decisiones de diseño (cerradas con José, 2026-07-26)

Núcleo, tal como lo pidió:

1. **Tres modos, configurables por Grupo** (un solo eje de configuración, no un flag por tipo de contenido):
   - **`RESTRICTIVO`** — **default**: solo Tutor/ORG_ADMIN crea. Es el comportamiento actual, byte por byte: un grupo que no toca nada no cambia en nada.
   - **`BAJO_APROBACION`** — el integrante **propone**; queda `PENDIENTE` y **no existe como Actividad** (no vale puntos, no aparece en su lista de hoy) hasta que el Tutor la **aprueba**. El Tutor puede rechazarla con motivo.
   - **`LIBRE`** — el integrante crea y la actividad queda **`ACTIVA` al instante**, sin intervención del Tutor. Igual queda registrada como propuesta auto-aprobada (rastro) y el Tutor la ve, la puede editar y archivar.
2. **Qué puede crear el integrante: solo actividades `OPCIONAL`.** Las **conductas** (BUENA y MALA) siguen siendo exclusivas del Tutor/ORG_ADMIN. Razón: una conducta es el instrumento de premio/castigo del Tutor, y dejar que un integrante fabrique conductas MALA es un vector de abuso directo contra sus hermanos (el ítem 9 ya resuelve el caso negativo legítimo: el jefe de equipo **reporta** una conducta MALA **del catálogo del Tutor**, y el descuento lo aplica el Tutor al aprobar). Ampliar a conductas BUENA es una decisión futura de un solo campo, no un rediseño.
3. **Alcance del contenido creado: personal de su autor.** Una actividad creada por un integrante es **suya**: solo él la ve y solo él la completa. No entra al catálogo compartido del grupo. Razón: un integrante no puede alterar la experiencia de sus hermanos, y el "arma tus propias metas" es justamente el caso de uso. El Tutor/ORG_ADMIN **sí** la ve (para moderar, editar o archivar).
4. **Topes configurables por Grupo** (sin ellos, el modo `LIBRE` es un agujero de puntaje: el integrante crea *"Respirar = 100 puntos"* y se lo autocompleta):
   - `maxPuntosActividadUsuario` (**default 5**): valor máximo en puntos de una actividad creada por un integrante.
   - `maxActividadesActivasPorUsuario` (**default 5**): cuántas actividades propias puede tener vivas a la vez (cuenta `ACTIVA` + propuestas `PENDIENTE`).

Detalles resueltos en esta spec (los huecos que el índice de Fase 14 dejaba abiertos):

5. **La config vive en `activity-service`** (nuevo `ConfiguracionContenidoGrupo`), no en identity. Razón: es una regla **del catálogo**, y el catálogo es de activity — el servicio que la aplica es el mismo que la guarda, sin cruce REST en el camino caliente de cada creación (regla 2).
6. **Modelo separado `PropuestaActividad`; `EstadoCatalogo` NO se toca.** Una propuesta `PENDIENTE` **no** es una `Actividad` en un estado raro: es una fila de otro modelo. Razón: `estado: 'ACTIVA' | 'ARCHIVADA'` está asumido en todo el sistema (`mi-estado-hoy`, castigo al cierre, tareas de equipo, límites del plan, `ActividadDto` de `shared-types`, `EstadoCatalogo` compartido con rewards). Agregarle valores obligaría a auditar cada consulta; un modelo aparte deja el camino existente intacto y hace imposible que una propuesta sin aprobar valga puntos.
7. **En modo `LIBRE` también se escribe la `PropuestaActividad`**, marcada `APROBADA` con `resueltoPorTipo = 'SYSTEM'`. Razón: un solo lugar donde el Tutor ve "qué propusieron mis integrantes y cómo se resolvió", sin importar el modo, y queda el rastro de que se creó sin revisión.
8. **Campos fijos del contenido de integrante** (no los elige el integrante): `tipoPuntaje = OPCIONAL` (decisión 2), `tipoLimiteTiempo = SIN_LIMITE`, `alcance = INDIVIDUAL` (una tarea de **equipo** la crea el Tutor — un integrante no puede repartir puntos a sus hermanos), `comportamientoAlCierre = ASUME_HECHA` (se deriva de OPCIONAL), `bonoJefePuntos = 0`. El integrante elige: **nombre, descripción, valorPuntos** y **repeticionesMaximasSesion**.
9. **Cuenta para el límite del plan.** Una actividad de integrante es una `Actividad ACTIVA` del grupo y cuenta en `limites.actividadesPorGrupo` de billing (Fase 4/5). Razón: si no, el modo `LIBRE` sería un bypass del tope del plan FREE. El tope por integrante (decisión 4) es **adicional**, no reemplazo.
10. **Cambiar el modo no toca lo ya creado.** Pasar a `RESTRICTIVO` **no** archiva ni desactiva las actividades que los integrantes ya tenían activas: solo impide crear nuevas (mismo principio que la regla 6 — no se reescribe hacia atrás). Si el Tutor quiere limpiarlas, las archiva una por una. Las propuestas `PENDIENTE` que queden al cambiar de modo siguen siendo resolubles por el Tutor (aprobar/rechazar) — no se cancelan solas.
11. **El autor puede archivar su propia actividad** (`DELETE /activity/mis-actividades/:id` → `ARCHIVADA`), lo que le libera cupo. **No puede editarla** (evita "la creo de 1 punto, la apruebo, la subo a 50"): para cambiarla, la archiva y crea otra — y en `BAJO_APROBACION` eso implica pasar de nuevo por el Tutor. El Tutor sí puede editarla con el `PATCH` de siempre.

---

## Parte A — `activity-service`: configuración por Grupo

### Modelo de datos

```prisma
// fase-14-10: quién puede crear contenido en el catálogo del Grupo.
enum ModoCreacionContenidoUsuario {
  RESTRICTIVO     // default: solo Tutor/ORG_ADMIN (comportamiento previo a fase-14-10)
  BAJO_APROBACION // el integrante propone; el Tutor aprueba o rechaza
  LIBRE           // el integrante crea y queda ACTIVA al instante
}

model ConfiguracionContenidoGrupo {
  id                              String                       @id @default(uuid())
  organizacionId                  String
  grupoId                         String                       @unique
  modoCreacionUsuario             ModoCreacionContenidoUsuario @default(RESTRICTIVO)
  // Topes del contenido creado por integrantes (decisión 4).
  maxPuntosActividadUsuario       Int                          @default(5)
  maxActividadesActivasPorUsuario Int                          @default(5)
  createdAt                       DateTime                     @default(now())
  updatedAt                       DateTime                     @updatedAt

  @@index([organizacionId])
}
```

- **Fila perezosa**: si un grupo no tiene fila, la lectura devuelve los **defaults en memoria** y no escribe nada. La fila se crea en el primer `PUT` (upsert). Un grupo preexistente queda en `RESTRICTIVO` sin migración de datos.
- Es config **mutable** (no ledger): lleva `updatedAt`. Cada cambio publica auditoría (`AccionAdministrativaRegistrada`), así que el histórico queda en audit-service.

### Endpoints

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/activity/grupos/:grupoId/configuracion-contenido` | TUTOR/ORG_ADMIN/USUARIO | Config vigente (defaults si no hay fila). El **USUARIO** la necesita para saber si puede crear y con qué topes — la UI no hardcodea nada. |
| `PUT` | `/activity/grupos/:grupoId/configuracion-contenido` | TUTOR/ORG_ADMIN | Upsert de `{ modoCreacionUsuario?, maxPuntosActividadUsuario?, maxActividadesActivasPorUsuario? }`. Publica auditoría `CONFIG_CONTENIDO_ACTUALIZADA`. |

`grupoId` siempre validado contra el JWT (regla 3): `asegurarAccesoEscritura` para el `PUT`, `asegurarAccesoLectura` para el `GET`.

---

## Parte B — `activity-service`: propuesta y actividad de integrante

### B.1 — `Actividad`: origen y autor

```prisma
// fase-14-10: quién creó la actividad. TUTOR = comportamiento previo.
enum OrigenActividad {
  TUTOR
  USUARIO
}

model Actividad {
  // ... campos existentes ...
  origen             OrigenActividad @default(TUTOR)
  // Autor + DUEÑO de una actividad personal (decisión 3); null si origen = TUTOR.
  creadaPorUsuarioId String?
  // Pasa a nullable: una actividad creada en modo LIBRE no tiene tutor detrás.
  // En BAJO_APROBACION guarda el Tutor que aprobó (él la puso en el catálogo).
  creadaPorTutorId   String?
}
// + @@index([grupoId, creadaPorUsuarioId])
```

- `@default(TUTOR)` + `creadaPorUsuarioId` nulo → toda actividad preexistente conserva el comportamiento actual (migración retro-compatible).
- `creadaPorTutorId` **pasa de `String` a `String?`**: es un relajamiento de constraint, retro-compatible con las filas existentes. No viaja en `ActividadDto` (ver `comun/mapeadores.ts`), así que ningún consumidor externo se rompe.

### B.2 — `PropuestaActividad` (el workflow)

```prisma
enum EstadoPropuesta {
  PENDIENTE
  APROBADA
  RECHAZADA
}

// Objeto de WORKFLOW mutable (cambia de estado) — NO es el ledger: los puntos
// solo existen cuando la Actividad aprobada se completa por el camino normal
// (RegistroActividad + ActividadCompletada, Fase 7).
model PropuestaActividad {
  id                        String                       @id @default(uuid())
  organizacionId            String
  grupoId                   String
  creadaPorUsuarioId        String
  nombre                    String
  descripcion               String?
  valorPuntos               Int
  repeticionesMaximasSesion Int                          @default(1)
  estado                    EstadoPropuesta              @default(PENDIENTE)
  // Modo vigente al momento de proponer: explica por qué una quedó aprobada sola.
  modoAlCrear               ModoCreacionContenidoUsuario
  resueltoPorId             String?
  // 'TUTOR' | 'SYSTEM' (SYSTEM = auto-aprobada por modo LIBRE, decisión 7)
  resueltoPorTipo           String?
  resueltoEn                DateTime?
  motivoRechazo             String?
  // Actividad creada al aprobar (traza el resultado).
  actividadId               String?
  createdAt                 DateTime                     @default(now())
  updatedAt                 DateTime                     @updatedAt

  @@index([organizacionId])
  @@index([grupoId, estado])
  @@index([creadaPorUsuarioId])
}
```

### B.3 — Endpoints del integrante

**Crear** — `POST /activity/grupos/:grupoId/mis-actividades`, rol **USUARIO**.

Body: `{ nombre, descripcion?, valorPuntos, repeticionesMaximasSesion? }`.

Validaciones, en este orden (barato antes que caro):
1. `grupoId` ∈ `grupoIds` del JWT (404 si no — no revela existencia).
2. Modo del grupo ≠ `RESTRICTIVO` → si lo es, **403 `CREACION_POR_USUARIO_DESHABILITADA`**.
3. `valorPuntos ≥ 1` y `≤ maxPuntosActividadUsuario` → **400 `PUNTOS_SOBRE_TOPE_DEL_GRUPO`** (el mensaje incluye el tope vigente).
4. Cupo propio: `count(Actividad ACTIVA con creadaPorUsuarioId = self) + count(PropuestaActividad PENDIENTE del self)` < `maxActividadesActivasPorUsuario` → si no, **409 `LIMITE_ACTIVIDADES_PROPIAS_ALCANZADO`**.
5. Solo si va a quedar `ACTIVA` (modo `LIBRE`): límite del plan del grupo (decisión 9), reusando `asegurarLimiteActividades` → `LIMITE_PLAN_ALCANZADO` (fail-open si billing no responde, misma decisión de Fase 4/5).

Efecto:
- **`LIBRE`**: en **una transacción**, crea la `Actividad` (`origen = USUARIO`, `creadaPorUsuarioId = principalId`, `estado = ACTIVA`, campos fijos de la decisión 8) y la `PropuestaActividad` `APROBADA` (`resueltoPorTipo = 'SYSTEM'`, `resueltoPorId = principalId`, `actividadId` apuntando a la actividad).
- **`BAJO_APROBACION`**: crea solo la `PropuestaActividad` `PENDIENTE`.

Respuesta `CrearMiActividadResponse`: `{ propuesta: PropuestaActividadDto, actividad: ActividadDto | null }` (`actividad` es null en `BAJO_APROBACION`).

Después del commit: publica `ActividadPropuestaCreada` (Parte D) y auditoría `ACTIVIDAD_PROPUESTA_POR_USUARIO` con `actorTipo = 'USUARIO'`.

**Ver lo propio** — `GET /activity/grupos/:grupoId/mis-actividades`, rol **USUARIO**. Una sola llamada que le da a la UI todo lo que necesita:

```ts
interface MisActividadesDto {
  modoCreacionUsuario: ModoCreacionContenidoUsuario;
  maxPuntosActividadUsuario: number;
  maxActividadesActivasPorUsuario: number;
  /** false si el modo es RESTRICTIVO o si ya llegó al cupo. */
  puedeCrear: boolean;
  /** Sus actividades personales ACTIVA (las que hoy puede completar). */
  actividades: ActividadDto[];
  /** Sus propuestas, todos los estados, más recientes primero. */
  propuestas: PropuestaActividadDto[];
}
```

**Archivar lo propio** — `DELETE /activity/mis-actividades/:actividadId`, rol **USUARIO** (decisión 11). Solo si `origen = USUARIO` y `creadaPorUsuarioId = principalId`; si no, **404**. Pasa a `ARCHIVADA` y libera cupo. Publica auditoría (`ACTIVIDAD_ARCHIVADA_POR_AUTOR`).

### B.4 — Endpoints del Tutor (moderación)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/activity/grupos/:grupoId/propuestas?estado=PENDIENTE` | TUTOR/ORG_ADMIN | Bandeja de propuestas del grupo (sin `estado`: todas, más recientes primero). |
| `POST` | `/activity/propuestas/:id/aprobar` | TUTOR/ORG_ADMIN | **Sin body**. Crea la `Actividad` (`origen = USUARIO`, `creadaPorUsuarioId` = autor, `creadaPorTutorId` = el Tutor que aprueba, `ACTIVA`, campos fijos de la decisión 8) y marca la propuesta `APROBADA` con `actividadId`, en una transacción. Revalida el tope de puntos vigente y el límite del plan. |
| `POST` | `/activity/propuestas/:id/rechazar` | TUTOR/ORG_ADMIN | `{ motivo? }`. Marca `RECHAZADA` + `motivoRechazo`. Sin efecto en puntos ni en el catálogo. |

- **Idempotencia**: aprobar o rechazar una propuesta ya resuelta → **409 `PROPUESTA_YA_RESUELTA`** (no crea una segunda actividad).
- Ambas publican `ActividadPropuestaResuelta` (Parte D) y auditoría (`ACTIVIDAD_PROPUESTA_APROBADA` / `ACTIVIDAD_PROPUESTA_RECHAZADA`).
- Una propuesta de un integrante que ya no está en el grupo se puede rechazar pero no aprobar (**409 `AUTOR_YA_NO_ESTA_EN_EL_GRUPO`**, verificado contra el interno de usuarios de identity).

---

## Parte C — Visibilidad personal (decisión 3): los puntos exactos a tocar

Una actividad `origen = USUARIO` es **privada de su autor**. Esto no es un endpoint nuevo: es un **filtro que hay que agregar en cada lectura existente**, y omitir uno es la falla probable de este ítem. Regla única:

> Un `USUARIO` ve una actividad si `origen = TUTOR` **o** `creadaPorUsuarioId = <su id>`. Un `TUTOR`/`ORG_ADMIN` ve todas.

Lugares a modificar (todos en `activity-service`):

1. **`ActividadesService.listar`** — la rama de `Rol.USUARIO` suma `OR: [{ origen: TUTOR }, { creadaPorUsuarioId: principalId }]`.
2. **`ActividadesService.buscarAccesible`** (detalle/editar/archivar) — un `USUARIO` que pide una actividad personal ajena recibe **404**.
3. **`RegistroService.miEstadoHoy`** — mismo filtro en el `findMany` de actividades: la home del integrante muestra sus propias metas y **no** las de sus hermanos.
4. **`RegistroService.completar` / `iniciarCronometro`** — tras resolver el usuario objetivo: si la actividad es personal y su dueño no es ese usuario → **404** si el principal es `USUARIO` (no revela existencia), **403 `ACTIVIDAD_PERSONAL_DE_OTRO_USUARIO`** si es un Tutor registrando en nombre de alguien (él sí la ve, así que un código claro es mejor que un 404 engañoso).
5. **`RegistroService.listarCompletadasOpcionales`** (el Tutor corrige lo completado de un usuario) — las opcionales se filtran a `origen = TUTOR` o `creadaPorUsuarioId = usuarioObjetivo`, para no ofrecerle al Tutor actividades de otro integrante.

No requieren cambio (verificado, dejar constancia de por qué):
- **`CierreService`** (castigo automático de obligatorias): filtra `tipoPuntaje = OBLIGATORIA` y el contenido de integrante es siempre `OPCIONAL` (decisión 2/8) → nunca lo alcanza.
- **`TareasEquipoService`**: filtra `alcance = EQUIPO` y el contenido de integrante es siempre `INDIVIDUAL` (decisión 8) → nunca lo alcanza.
- **`asegurarLimiteActividades`**: cuenta todas las `ACTIVA` del grupo, incluidas las de integrantes — eso es **deliberado** (decisión 9), no un descuido.

---

## Parte D — Eventos y `notification-service`

Dos eventos nuevos, ambos **EXTENSIÓN**, productor `activity-service`:

| Evento | Routing key | Consumidores |
|---|---|---|
| `ActividadPropuestaCreada` | `activity.actividad_propuesta_creada` | Notification |
| `ActividadPropuestaResuelta` | `activity.actividad_propuesta_resuelta` | Notification |

```ts
interface ActividadPropuestaCreadaPayload {
  propuestaId: string;
  organizacionId: string;
  grupoId: string;
  creadaPorUsuarioId: string;
  nombre: string;
  valorPuntos: number;
  /** 'PENDIENTE' (BAJO_APROBACION) | 'APROBADA' (LIBRE, auto-aprobada) */
  estado: string;
  requiereAprobacion: boolean;
  actividadId: string | null;
}

interface ActividadPropuestaResueltaPayload {
  propuestaId: string;
  organizacionId: string;
  grupoId: string;
  creadaPorUsuarioId: string;
  nombre: string;
  /** 'APROBADA' | 'RECHAZADA' */
  estado: string;
  resueltoPorId: string;
  /** 'TUTOR' | 'SYSTEM' */
  resueltoPorTipo: string;
  actividadId: string | null;
  motivoRechazo: string | null;
}
```

Notificaciones (plantillas de notification, con nombres resueltos por REST como ya hace el servicio):
- `ActividadPropuestaCreada` con `requiereAprobacion = true` → **a los tutores del grupo**: *"<Nombre> propuso la actividad «X» (N pts) — revisala"*.
- `ActividadPropuestaCreada` con `requiereAprobacion = false` (modo `LIBRE`) → **a los tutores del grupo**, informativa: *"<Nombre> creó la actividad «X» (N pts)"*. Se notifica igual: el Tutor tiene que poder enterarse sin entrar a mirar.
- `ActividadPropuestaResuelta` → **al autor** (`creadaPorUsuarioId`): *"Tu actividad «X» fue aprobada"* / *"…fue rechazada"* (+ motivo si vino). No se notifica cuando `resueltoPorTipo = 'SYSTEM'` (el autor acaba de crearla, ya lo sabe).

`scoring-service` **no participa**: los puntos de una actividad de integrante entran por el camino de siempre (`ActividadCompletada` → `EventoPuntos`), sin ninguna rama nueva. Esa es la prueba de que la regla 1 sigue intacta.

---

## Parte E — Frontend (`app-web`)

Mostrar propuesta de UI a José antes de scaffoldear (preferencia registrada).

**Tutor/ORG_ADMIN**, en la pantalla de Actividades del grupo:
- Panel **"Contenido de los integrantes"**: los 3 modos como opciones excluyentes con su explicación en una línea (`Restrictivo` / `Bajo aprobación` / `Libre`), más los dos topes (puntos por actividad, actividades activas por integrante). Guarda con el `PUT` de la Parte A.
- **Bandeja de propuestas** con contador de pendientes: cada fila muestra autor, nombre, puntos y repeticiones, con **Aprobar** / **Rechazar** (motivo opcional). Solo tiene sentido mostrarla si hay propuestas o el modo es `BAJO_APROBACION`.
- En la lista de actividades: chip **"de <integrante>"** en las de `origen = USUARIO`, para que se distingan de las suyas.

**Usuario participante**: pantalla **"Mis actividades"**
- Estado del modo arriba: en `RESTRICTIVO` la pantalla no ofrece crear (explica que el Tutor no lo habilitó); en `BAJO_APROBACION` avisa que lo que cree pasa por el Tutor; en `LIBRE` que queda activo al instante.
- Formulario de creación: nombre, descripción opcional, puntos (con el tope visible y validado en el cliente **y** en el servidor) y repeticiones por sesión. Cupo restante a la vista.
- Lista de sus propuestas con estado (`Pendiente` / `Aprobada` / `Rechazada` + motivo) y de sus actividades activas, con acción **archivar**.
- Sus actividades activas aparecen en la home junto a las del Tutor (sale gratis: `mi-estado-hoy` ya las incluye por el filtro de la Parte C).

---

## Tipos compartidos (`libs/shared-types`)

- Enums: `ModoCreacionContenidoUsuario` (`'RESTRICTIVO' | 'BAJO_APROBACION' | 'LIBRE'`), `OrigenActividad` (`'TUTOR' | 'USUARIO'`), `EstadoPropuesta` (`'PENDIENTE' | 'APROBADA' | 'RECHAZADA'`).
- `ActividadDto`: agregar `origen` y `creadaPorUsuarioId` (`string | null`).
- `ConfiguracionContenidoGrupoDto`; `ActualizarConfiguracionContenidoRequest`.
- `PropuestaActividadDto`; `CrearMiActividadRequest` / `CrearMiActividadResponse`; `RechazarPropuestaRequest` (`{ motivo? }`; aprobar no lleva body).
- `MisActividadesDto` (Parte B.3).

## Criterios de aceptación

- [ ] **Default intacto**: un grupo sin config queda `RESTRICTIVO`; un integrante que intenta crear recibe 403 `CREACION_POR_USUARIO_DESHABILITADA`; nada del comportamiento previo cambia.
- [ ] **Modo `LIBRE`**: el integrante crea una actividad de 3 pts → queda `ACTIVA` al instante, aparece en su `mi-estado-hoy`, la completa y **scoring le suma 3** por el camino normal (`ActividadCompletada`). La propuesta queda `APROBADA` con `resueltoPorTipo = 'SYSTEM'`.
- [ ] **Modo `BAJO_APROBACION`**: el integrante propone → **no** aparece en su `mi-estado-hoy` ni en el listado del catálogo, y no vale puntos. El Tutor recibe la notificación, **aprueba** → recién ahí existe la `Actividad` y el integrante la puede completar. Aprobar de nuevo → 409 `PROPUESTA_YA_RESUELTA`.
- [ ] **Rechazo**: el Tutor rechaza con motivo → la propuesta queda `RECHAZADA`, no se crea ninguna `Actividad`, ningún puntaje cambia, y el autor recibe la notificación con el motivo.
- [ ] **Tope de puntos**: con `maxPuntosActividadUsuario = 5`, crear una de 50 → 400 `PUNTOS_SOBRE_TOPE_DEL_GRUPO`. Subir el tope a 50 y reintentar → funciona.
- [ ] **Tope de cantidad**: con `maxActividadesActivasPorUsuario = 2`, la tercera → 409 `LIMITE_ACTIVIDADES_PROPIAS_ALCANZADO`; archivar una libera el cupo.
- [ ] **Privacidad (decisión 3)**: la actividad personal de A **no** aparece en el listado ni en el `mi-estado-hoy` de B; B pidiéndola por id recibe 404; B intentando completarla recibe 404. El Tutor sí la ve en el listado del grupo.
- [ ] **Un integrante no puede crear contenido fuera de su carril**: no puede crear conductas (no hay endpoint), ni obligatorias, ni tareas de equipo (los campos son fijos, no viajan en el request).
- [ ] **Cambiar a `RESTRICTIVO`** no archiva las actividades ya creadas por integrantes (siguen completables) y solo bloquea crear nuevas; las propuestas `PENDIENTE` siguen resolubles.
- [ ] **Límite del plan**: las actividades de integrantes cuentan en `limites.actividadesPorGrupo` (el modo `LIBRE` no es un bypass del plan FREE).
- [ ] **Aislamiento multi-tenant**: config, propuestas y actividades de integrante solo se ven/afectan dentro de la organización+grupo del JWT.
- [ ] **Migración retro-compatible**: actividades preexistentes quedan `origen = TUTOR`, `creadaPorUsuarioId = null`, y se comportan igual; ningún grupo cambia de modo por la migración.

## Nota para Claude Code

Ítem **de un solo servicio de negocio** (`activity-service`) más notification y frontend — bastante más chico que el ítem 9, pero con un riesgo concentrado: **la Parte C**. El filtro de visibilidad hay que aplicarlo en los cinco lugares listados; olvidar uno significa que un integrante ve o completa la actividad personal de su hermano, y eso no lo agarra ningún test de los que ya existen. Orden sugerido: (1) contratos en `shared-types`/`shared-events` + catálogo de eventos, (2) schema + migración de activity, (3) config (Parte A), (4) propuestas y creación (Parte B), (5) **Parte C completa, con tests**, (6) notification, (7) frontend. Migración a mano solo si no hay Postgres levantado (mismo criterio que los ítems previos), y aplicarla contra DB real antes de correr. Este ítem **cierra el ítem 7** del índice de Fase 14 (`PropuestaActividad`): al terminarlo, marcar el ítem 7 como absorbido en `docs/progreso/fase-14-post-mvp.md`.
