# Fase 14 · Ítem 21 — Turnos rotativos: a quién le toca la obligatoria

> Sub-spec detallada del ítem 21 de `fase-14-post-mvp.md`. Este archivo es la especificación decidida con José (decisiones de alcance el 2026-07-30, patrón dinámico y detalles el 2026-07-31); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Fases 2, 5, 6 y 7 completas, y de Fase 14: confirmación de obligatorias (#8), actividades programadas (#11), marcas rojas (#12), scheduler con recuperación (#16), plan del día (#17), roles del participante (#19) y **los dos valores de la obligatoria (#20)**. Todos ejecutados.

Del **#20 la dependencia es dura**: los turnos heredan el modelo de puntos de la obligatoria (premio al confirmar, castigo al cerrar), y hacerlo al revés obligaría a retocar el reparto dos veces. Del **#19 es floja**: el atajo «todos los del rol X» para precargar la secuencia es una comodidad — este ítem funciona con lista manual.

Reutiliza: la cola `activity.q.sesiones` (ya existe desde el #8, hoy suscrita solo a `session.sesion_cerrada`), el evento `SesionAbierta` (que ya viaja con `fechaInicio` desde el #11), `estaDisponibleEn` de `comun/programacion.ts`, la resolución de timezone del Grupo y `EventoProcesado` para idempotencia.

## Motivación (el problema que resuelve)

Hoy una obligatoria es de **todos**: los seis integrantes tienen que confirmar «sacar la basura» todos los días, o los seis se comen el castigo. En una casa real esa tarea es **de uno por día**, y el reparto es justamente el punto: hoy le toca a José, mañana a Luciana.

Sin esto, la única forma de expresarlo es crear seis actividades restringidas por rol y reasignarlas a mano cada día — que es exactamente el trabajo manual que la plataforma debería evitar.

## Decisiones de diseño

Cerradas con José el 2026-07-30 (en el índice de la fase):

1. **El turno se persiste, sellado al abrir la Sesión**, nunca se deriva al vuelo de una fórmula sobre la fecha. Si se derivara, cambiar la lista de integrantes reescribiría el pasado y sería imposible auditar por qué se castigó a alguien.
2. **Frecuencia configurable por actividad**: rota por Sesión (día) o por Sección (semana).
3. El modo al azar es **azar sin repetir hasta completar la vuelta** (shuffle bag), no azar puro: con un castigo de por medio, que a uno le toque tres veces seguidas se percibe como injusticia del sistema.
4. **La secuencia la arma el Tutor**, con atajos que la precargan, pero siempre queda explícita y visible antes de guardar.
5. **Quien no tiene el turno igual ve la tarea**, sin botón y con «hoy le toca a Ana» — mismo patrón visual que las tareas de equipo del #15.
6. Premio y castigo van **solo a quien tiene el turno**.
7. Si el asignado no cumple, **el turno avanza igual** al día siguiente: la rotación es un calendario, el castigo ya es la consecuencia.
8. El Tutor puede **reasignar el turno del día a mano**, y queda registrado quién reasignó.
9. Los días en que la actividad no corre por el #11 **no consumen turno**.
10. Quien entra al Grupo a mitad de vuelta se suma **en la vuelta siguiente**.
11. La rotación aplica **a obligatorias**; extenderla a opcionales después es una validación, no un rediseño.

Cerradas con José el 2026-07-31 (el patrón dinámico y sus consecuencias):

12. **El patrón es una SECUENCIA LITERAL, no un reparto parejo.** El Tutor arma la lista tal cual —`[José, Luciana, José, Alejandra]`— y puede repetir a quien quiera. Esto es lo que revisa el modelo mental del índice: el turno **no** es «un pozo de participantes que rota uno por uno», es **una lista ordenada de posiciones** donde una misma persona puede ocupar varias. José tiene 2 de cada 4 días sin ninguna regla especial: la repetición vive en los datos, no en el algoritmo.
13. **El modo al azar baraja las POSICIONES, no las personas.** Con la lista de arriba, cada vuelta sigue teniendo 4 turnos y José sigue teniendo 2 — lo que cambia es cuáles. Barajar personas destruiría el patrón que el Tutor definió apenas se enciende el azar, y ese patrón es el punto del ítem.
14. **Las altas y bajas del Grupo NO editan la lista sola.** La secuencia es del Tutor y se mantiene explícita (decisión 4): el sistema solo **avisa** («Alejandra ya no está en el grupo») y, si al sellar toca una posición de alguien que ya no pertenece al grupo, **la saltea** y sigue a la siguiente. Ajustarla automáticamente cambiaría el patrón sin que el Tutor lo hubiera decidido.

Detalles resueltos en esta spec:

15. **La vuelta se sella entera al empezarla, no turno por turno.** Se guarda la permutación de esa vuelta (`VueltaTurno.ordenUsuarioIds`) y los turnos diarios se leen de ahí. Es lo que hace que el azar sea reproducible y auditable (la vuelta ya está decidida y escrita), y lo que resuelve limpio las decisiones 10 y 14: **editar la secuencia no toca la vuelta en curso**, entra en la siguiente. En `ORDEN_FIJO` la permutación es la copia literal de la lista — se guarda igual, a propósito, para que las dos modalidades tengan exactamente el mismo comportamiento frente a una edición a mitad de vuelta.
16. **La asignación del día es estado operativo, no ledger.** Guarda a quién le tocó, de qué vuelta salió, y —si hubo reasignación— quién la hizo, cuándo y a quién le tocaba originalmente. No se borra ni se reescribe la historia: reasignar **actualiza la fila del día** dejando el rastro, y además publica `AccionAdministrativaRegistrada` (Fase 9). Los puntos que se derivan de ella sí son ledger, y esos siguen las reglas de siempre.
17. **Con el turno activo, la obligatoria deja de ser de todos.** Para quien no tiene el turno **no se evalúa**: ni castigo al cierre, ni premio, ni confirmación posible. No es «la ve deshabilitada y además la castigan» — la decisión 6 se aplica en el mismo lugar donde el #19 aplica su filtro (`consumo/cierre.service.ts`), y por el mismo motivo: es el punto que no se ve en ninguna pantalla.
18. **Rol (#19) y turno se combinan por intersección.** Si la actividad está restringida por rol *y* tiene turnos, una posición de alguien que no tiene el rol se saltea igual que la de alguien que ya no está en el grupo (decisión 14). El Tutor lo ve avisado al configurar; el atajo «todos los del rol X» precarga justamente la lista correcta.
19. **Si la vuelta queda vacía, no hay turno ese día** (todas sus posiciones son de gente que se fue o que perdió el rol): la actividad no se le exige a nadie y queda registrado el motivo. Es preferible a elegir un reemplazante que el Tutor no decidió.

---

## Parte A — `activity-service`: schema

Todo vive en activity: la secuencia es configuración **del catálogo**, y el catálogo es de este servicio. Los participantes se referencian por id, sin FK contra la base de identity (regla 2).

```prisma
enum ModoTurno {
  ORDEN_FIJO // se recorre la lista tal como la escribió el Tutor
  AZAR       // se barajan las POSICIONES al empezar cada vuelta (decisión 13)
}

enum FrecuenciaTurno {
  SESION  // rota cada día
  SECCION // rota cada semana (decisión 2)
}

/** Configuración de rotación de UNA actividad. Mutable: es config, no ledger. */
model TurnoActividad {
  id             String          @id @default(uuid())
  organizacionId String
  grupoId        String
  // 1:1 con la actividad: una actividad tiene una sola rotación.
  actividadId    String          @unique
  modo           ModoTurno       @default(ORDEN_FIJO)
  frecuencia     FrecuenciaTurno @default(SESION)
  activo         Boolean         @default(true)
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  posiciones     PosicionTurno[]
  vueltas        VueltaTurno[]

  @@index([organizacionId])
  @@index([grupoId])
}

/**
 * Una posición de la secuencia. SIN unique sobre usuarioId a propósito
 * (decisión 12): [José, Luciana, José, Alejandra] son 4 posiciones y 3 personas.
 */
model PosicionTurno {
  id               String         @id @default(uuid())
  turnoActividadId String
  turnoActividad   TurnoActividad @relation(fields: [turnoActividadId], references: [id], onDelete: Cascade)
  orden            Int
  usuarioId        String

  @@unique([turnoActividadId, orden])
  @@index([turnoActividadId])
}

/**
 * La permutación SELLADA de una vuelta (decisión 15). Se escribe una vez, al
 * empezar la vuelta, y no se toca: editar la secuencia afecta a la vuelta
 * SIGUIENTE. En ORDEN_FIJO es la copia literal de las posiciones.
 */
model VueltaTurno {
  id               String         @id @default(uuid())
  organizacionId   String
  turnoActividadId String
  turnoActividad   TurnoActividad @relation(fields: [turnoActividadId], references: [id], onDelete: Cascade)
  numero           Int
  // Los usuarioId en el orden en que les va a tocar, con repeticiones.
  ordenUsuarioIds  String[]
  createdAt        DateTime       @default(now())

  @@unique([turnoActividadId, numero])
  @@index([organizacionId])
}

/** A quién le tocó, en un día (SESION) o en una semana (SECCION). */
model AsignacionTurno {
  id             String   @id @default(uuid())
  organizacionId String
  grupoId        String
  actividadId    String
  // El ámbito de la asignación: sesionId si frecuencia=SESION, seccionId si
  // SECCION. Un solo campo para que el @@unique valga en los dos modos.
  ambitoId       String
  sesionId       String?
  seccionId      String
  // A quién le toca HOY (ya con la reasignación aplicada, si la hubo).
  usuarioId      String
  vueltaNumero   Int
  // Índice dentro de `VueltaTurno.ordenUsuarioIds` que consumió esta asignación.
  indice         Int
  // fase-14-21 decisión 16: rastro de la reasignación manual del Tutor.
  usuarioOriginalId    String?
  reasignadoPorTutorId String?
  reasignadoEn         DateTime?
  motivoReasignacion   String?
  createdAt      DateTime @default(now())

  @@unique([actividadId, ambitoId])
  @@index([organizacionId])
  @@index([grupoId, usuarioId])
}
```

- `Actividad` **no cambia**: la rotación cuelga de `TurnoActividad`, así que toda actividad existente queda sin turnos y se comporta igual (retro-compatible por construcción, sin columnas nuevas).
- **Validación al configurar**: `tipoPuntaje = OBLIGATORIA` (decisión 11 → 400 `TURNO_SOLO_OBLIGATORIA`), `alcance = INDIVIDUAL` (400 `TURNO_SOLO_INDIVIDUAL` — una tarea de equipo ya tiene su jefe), al menos una posición (400 `SECUENCIA_VACIA`), y cada `usuarioId` debe ser miembro del grupo al momento de guardar (400 `USUARIO_NO_ES_DEL_GRUPO`; después puede irse, y ahí manda la decisión 14).

## Parte B — El sellado del turno (el corazón del ítem)

### B.1 — Consumidor de `SesionAbierta`

La cola `activity.q.sesiones` ya existe (creada por el #8). Se le **suma** la routing key `session.sesion_abierta` al array de `@RabbitSubscribe` — no hay cola nueva ni cambio de opciones, así que no hay que redeclarar nada.

Idempotente vía `EventoProcesado` con el mismo patrón del #8: la marca se escribe **en la misma transacción** que las asignaciones. Esto importa especialmente por el **#16**: el scheduler con recuperación puede abrir varias sesiones seguidas al reconciliar una ventana, y cada una tiene que sellar su turno exactamente una vez.

### B.2 — Algoritmo de sellado (por cada actividad con turno activo del grupo)

1. **¿Corre hoy?** Si la actividad tiene `diasSemana` y el día de `fechaInicio` (en la timezone del Grupo) no está, **no se sella nada y el cursor no avanza** (decisión 9). Reusa `estaDisponibleEn`, igual que el cierre del #11.
2. **¿Ya está sellado el ámbito?** Con `frecuencia = SECCION`, la segunda sesión de la semana no vuelve a sellar: el `@@unique([actividadId, ambitoId])` es la garantía, y el chequeo previo evita el error.
3. **Resolver la vuelta vigente**: la última `VueltaTurno` de esa actividad. Si no hay, o si la anterior ya se consumió entera, se **crea la siguiente**: se leen las `PosicionTurno` actuales —por eso una edición entra recién acá (decisiones 10, 14 y 15)— y se escribe `ordenUsuarioIds` (copia literal en `ORDEN_FIJO`, barajada en `AZAR`).
4. **Avanzar el índice** desde la última `AsignacionTurno` de esa actividad (nunca desde una fórmula sobre la fecha — decisión 1).
5. **Saltear posiciones inválidas**: si el `usuarioId` del índice ya no es miembro activo del grupo (decisión 14) o no tiene el rol que la actividad exige (decisión 18), se avanza al siguiente índice. Si se recorre la vuelta entera sin encontrar a nadie válido, **no hay turno ese día** (decisión 19) y se registra el motivo en el log.
6. **Escribir la `AsignacionTurno`** + la marca de `EventoProcesado`, en una transacción.

> La membresía y los roles se resuelven con **dos llamadas internas por evento** —`usuariosDelGrupo` y `roles-asignados`, ambas ya existentes— y solo si el grupo tiene alguna actividad con turno activo. Un grupo sin turnos no paga nada, mismo criterio que el #19.

### B.3 — Efecto en el registro y en el cierre

- **Confirmar**: si la actividad tiene turno activo y el que confirma no es el asignado del ámbito vigente → 403 `NO_ES_TU_TURNO`. Aplica también al Tutor que confirma en nombre de un integrante que no tiene el turno (400 `NO_ES_SU_TURNO`).
- **Cierre automático (`consumo/cierre.service.ts`)**: para una obligatoria con turno, **el único par candidato es (asignado del día, actividad)** — el resto del grupo ni se evalúa (decisiones 6 y 17). Si ese día no hubo turno (decisiones 9 y 19), no se castiga a nadie.
- **El turno avanza igual si no cumplió** (decisión 7): no hay lógica de reintento, el sellado del día siguiente sigue al índice que corresponde.
- **`puntosPorCumplir` del #20** se acredita solo al asignado, por el mismo camino de siempre.

## Parte C — Endpoints (`activity`, prefijo del servicio)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/activity/actividades/:id/turno` | TUTOR/ORG_ADMIN | Configuración + vuelta vigente + próximos turnos previstos, con avisos por posición (`YA_NO_ESTA_EN_EL_GRUPO`, `SIN_EL_ROL`). |
| `PUT` | `/activity/actividades/:id/turno` | TUTOR/ORG_ADMIN | Crea o reemplaza la configuración: `{ modo, frecuencia, activo, posiciones: [{ usuarioId }] }` — el orden del array **es** la secuencia. Idempotente. No toca la vuelta en curso (decisión 15). |
| `DELETE` | `/activity/actividades/:id/turno` | TUTOR/ORG_ADMIN | Apaga la rotación (`activo = false`): la obligatoria vuelve a ser de todos. No borra el historial de asignaciones. |
| `POST` | `/activity/actividades/:id/turno/reasignar` | TUTOR/ORG_ADMIN | `{ usuarioId, motivo? }` — cambia el turno del ámbito vigente dejando el rastro (decisión 16). El nuevo debe ser miembro del grupo. 409 `SIN_TURNO_VIGENTE` si hoy no hay turno sellado. |
| `GET` | `/activity/grupos/:grupoId/turnos-de-hoy` | TUTOR/ORG_ADMIN | A quién le toca cada actividad rotativa hoy — una lectura para el panel operativo. |

En `mi-estado-hoy` (participante), cada actividad con turno suma:

```ts
turno: {
  usuarioIdAsignado: string | null; // null = hoy no le toca a nadie
  nombreAsignado: string | null;    // resuelto por REST interno
  esMio: boolean;
} | null;                            // null = la actividad no rota
```

Con `esMio = false` la tarjeta se muestra **sin botón**, con «hoy le toca a Ana» (decisión 5). El nombre se resuelve con la llamada de usuarios que la pantalla ya hace.

## Parte D — Frontend (`app-web`)

Mostrar propuesta de UI a José antes de scaffoldear (preferencia registrada).

**Tutor**: en el formulario de una OBLIGATORIA individual, sección «Turnos» — interruptor, modo (orden fijo / al azar), frecuencia (por día / por semana) y **el armador de la secuencia**: una lista ordenada donde se agregan integrantes (repitiendo a quien haga falta), se reordena y se quita, con los atajos «todo el grupo» y «todos los del rol X» que la **precargan** y la dejan editable (decisión 4). Debajo, la vista previa de la vuelta («José, Luciana, José, Alejandra — José: 2 de cada 4 días») y los avisos por posición. En el panel operativo, «hoy le toca a…» con el botón de reasignar.

**Participante**: la tarjeta de una obligatoria que no le toca se ve sin botón y con «hoy le toca a Ana»; la que sí le toca se ve como cualquier obligatoria confirmable de hoy.

## Tipos compartidos (`libs/shared-types`)

- Enums `ModoTurno` (`'ORDEN_FIJO' | 'AZAR'`), `FrecuenciaTurno` (`'SESION' | 'SECCION'`).
- `TurnoActividadDto` (config + `posiciones: PosicionTurnoDto[]` + `vueltaVigente` + `proximos`), `PosicionTurnoDto` (`{ orden, usuarioId, nombre, aviso? }`), `AsignacionTurnoDto`.
- `ConfigurarTurnoRequest`/`ConfigurarTurnoResponse`, `ReasignarTurnoRequest`.
- `MiEstadoActividadHoyDto`: agregar `turno` (ver Parte C).

## Eventos (`docs/architecture/event-catalog.md`)

**Ninguno nuevo.** El sellado **consume** `SesionAbierta` (que ya existe) y la reasignación se audita con `AccionAdministrativaRegistrada` (Fase 9): `TURNO_CONFIGURADO`, `TURNO_APAGADO`, `TURNO_REASIGNADO`. Anotar en el catálogo que `activity-service` pasa a consumir `session.sesion_abierta` además de `session.sesion_cerrada`, sobre la misma cola.

## Criterios de aceptación

- [ ] Con la secuencia `[José, Luciana, José, Alejandra]` y frecuencia SESION, cuatro días consecutivos asignan **José, Luciana, José, Alejandra**; el quinto vuelve a José. Es **el** criterio del ítem: José recibe 2 de cada 4 turnos.
- [ ] La vuelta se sella entera al empezarla: editar la secuencia a mitad de vuelta **no** cambia los turnos que restan de esa vuelta, y sí los de la siguiente.
- [ ] En modo `AZAR`, cada vuelta contiene exactamente las mismas posiciones (José 2, Luciana 1, Alejandra 1) en otro orden, y nadie repite dentro de la vuelta más veces de las que su secuencia le da.
- [ ] **Cierre de sesión**: la obligatoria rotativa con castigo −10 genera **un solo** `EventoPuntos` negativo, el del asignado. El resto del grupo termina la sesión sin ningún asiento de esa actividad.
- [ ] **#20 combinado**: `puntosPorCumplir = +2` se acredita solo al asignado, al confirmar.
- [ ] Un integrante que no tiene el turno recibe 403 `NO_ES_TU_TURNO` al intentar confirmar, y su `mi-estado-hoy` trae la actividad con `turno.esMio = false` y el nombre de quien sí la tiene.
- [ ] Si el asignado **no** cumple, el día siguiente el turno avanza igual (decisión 7).
- [ ] Un día en que la actividad no corre por `diasSemana` **no consume turno**: al día siguiente le toca a quien le tocaba (decisión 9).
- [ ] Con `frecuencia = SECCION`, la segunda Sesión de la misma Sección **no** vuelve a sellar ni avanza el turno.
- [ ] Reasignar deja `usuarioOriginalId`, `reasignadoPorTutorId` y la marca de tiempo, publica la acción administrativa, y el castigo del cierre recae en el **nuevo** asignado.
- [ ] Una posición de alguien que ya no está en el grupo se saltea al sellar, y la configuración del Tutor la muestra avisada — sin que el sistema edite la lista (decisión 14).
- [ ] Combinado con el #19: una posición de alguien que perdió el rol exigido se saltea igual; si ninguna posición es válida, ese día no hay turno y nadie es castigado (decisión 19).
- [ ] Reentregar el mismo `SesionAbierta` no duplica asignaciones ni avanza el turno dos veces (verificar `EventoProcesado`), incluido el caso del scheduler del #16 abriendo varias sesiones al reconciliar.
- [ ] Apagar la rotación devuelve la obligatoria a «es de todos», sin borrar el historial.
- [ ] Configurar turnos sobre una OPCIONAL → 400 `TURNO_SOLO_OBLIGATORIA`; sobre una de EQUIPO → 400 `TURNO_SOLO_INDIVIDUAL`; con la secuencia vacía → 400 `SECUENCIA_VACIA`.
- [ ] **Retro-compatible**: ninguna actividad existente tiene `TurnoActividad`, y todas se comportan exactamente como antes.
- [ ] **Costo cero**: un grupo sin ninguna actividad con turno activo no dispara llamadas internas extra al abrir una Sesión.

## Nota para Claude Code

Es el ítem más grande de los cuatro y **el único que agrega maquinaria nueva de verdad**. Orden sugerido: (1) schema + configuración (CRUD del turno, que es lo que se puede probar solo), (2) **el sellado** — consumidor, vueltas, avance del índice y salteos—, (3) su efecto en registro y cierre, (4) `mi-estado-hoy` + tipos, (5) frontend.

Dos advertencias concretas:

- **El bug caro de este ítem está en el cierre**, igual que en el #19: si el castigo no se limita al asignado, cinco personas reciben −10 por algo que la pantalla les mostró sin botón. Escribir ese test antes que el resto.
- **El sellado corre sobre un consumidor, y los consumidores se reentregan.** Toda la lógica de avance tiene que ser idempotente por `EventoProcesado` en la misma transacción, y hay que probar explícitamente el caso del #16 (varias sesiones abiertas de una sola reconciliación) — un turno que avanza dos veces reparte mal el resto de la vuelta y es de los errores que nadie nota hasta que alguien reclama.

Migraciones a mano solo si no hay Postgres levantado, y **aplicarlas contra DB real + `prisma migrate diff` antes de dar el ítem por cerrado** (el #19 dejó ese paso como estándar; el #16 dejó el motivo).
