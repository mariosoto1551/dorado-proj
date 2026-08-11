# Fase 14 · Ítem 33 — Editar cualquier Sesión de la Sección vigente

> Sub-spec detallada del ítem 33 de `fase-14-post-mvp.md`. Especificación decidida con José (2026-08-11); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Fases 5 (catálogo), 6 (ciclo Sección/Sesión) y 7 (registro + ledger) completas, más los ítems de Fase 14 ya ejecutados que este toca directamente: confirmación de obligatorias y `mi-estado-hoy` (#8), equipos de trabajo (#9), actividades programadas (#11), marcas rojas del tutor (#12), anulación de tareas de equipo (#13), plan del día (#17), historial de la sesión (#18), turnos rotativos (#21) y el alcance operativo del asistente (#31).

No requiere ningún endpoint interno nuevo en ningún servicio. `GET /internal/session/grupos/:grupoId/secciones/actual` **ya devuelve la Sección vigente con todas sus Sesiones** (`SeccionActualInterna = SeccionDto & { sesiones: SesionDto[] }`), que es exactamente el universo que este ítem habilita a editar. La información ya viajaba; lo único que faltaba era poder apuntarle.

## Motivación (el problema que resuelve)

Todo lo que el Tutor puede hacer, hoy **solo lo puede hacer sobre la Sesión abierta**, y ese límite no está escrito en una regla de negocio: está escrito en una función.

`RegistroService.resolverSesionAbierta()` (y su gemela `comun/sesion-abierta.ts`, que usan tareas de equipo, turnos y reportes) resuelve *la* Sesión `ABIERTA` de *la* Sección `ABIERTA` y tira 409 `NO_HAY_SESION_ABIERTA` si no la hay. Como todas las escrituras pasan por ahí, el efecto es que **el día se cierra y con él se cierra la posibilidad de corregirlo**:

1. **El olvido del día anterior no tiene entrada.** El martes el Tutor se acuerda de que el lunes su hijo sí ordenó el cuarto. El lunes ya está cerrado: el registro no entra a ningún lado. La única salida hoy es el ajuste manual de puntos (#31), que suma el número pero **miente sobre qué pasó** — no queda que la actividad se hizo, queda "+10 por algo".
2. **El castigo automático es irreversible en la práctica.** El cierre de Sesión (#8) escribe `NO_HIZO` automáticos por cada obligatoria sin confirmar. `revertirMarca` exige que la fila sea de la Sesión abierta, así que al minuto siguiente del cierre ese castigo **ya no se puede deshacer**, ni siquiera cuando fue injusto (el chico avisó por WhatsApp, el Tutor no llegó a marcarlo).
3. **El historial es de solo lectura al día siguiente.** El ítem #18 muestra la Sesión actual, y fuera de horario muestra la última en modo lectura (decisión 14). El Tutor ve lo que pasó ayer y no puede tocar nada de lo que ve — la pantalla que mejor expone los errores es justamente la que no deja arreglarlos.
4. **El asistente hereda el techo.** La IA propone y el humano aplica contra los endpoints que ya existen (#29, decisión estructural); si los endpoints solo escriben en la Sesión abierta, «anotá que el lunes sí lo hizo» no es proponible.

La Sección es la unidad que se evalúa (los umbrales de zona se calculan sobre su total, `SOLO_AL_CIERRE_SECCION` por default). **Mientras la Sección no cerró, su contenido todavía no es historia: es el trabajo en curso.** Este ítem alinea el permiso de escritura con esa unidad.

## Decisiones de diseño (cerradas con José, 2026-08-11)

1. **Todo lo que se puede hacer hoy sobre la Sesión abierta se puede hacer sobre cualquier Sesión de la Sección vigente**: registrar una completada en nombre de un integrante, marcar «no hizo», anular, deshacer una marca, registrar una conducta, ajustar puntos, anotar notas internas y operar tareas de equipo. No es un subconjunto de "correcciones": es el mismo panel apuntando a otro día.
2. **El límite es la Sección, no la Sesión.** Se puede editar mientras la Sección esté `ABIERTA` **o** en `EVALUACION`. Al pasar a `CERRADA` todo queda congelado — ahí sí rige la regla 6 de `CLAUDE.md` sin excepciones, y una corrección posterior sería otro ítem con `corregidoDeId`. Una Sección `CERRADA` **nunca** se toca desde este ítem.
3. **El cronómetro no se inicia en el pasado.** `POST /actividades/:id/iniciar-cronometro` con una Sesión que no es la abierta devuelve 400: un cronómetro es un instrumento del momento presente, y "empezá a contar 40 minutos en el martes pasado" no significa nada. Al **completar** retroactivamente una actividad de tipo `CRONOMETRO`, en cambio, la validación de cronómetro se saltea (ver decisión 5).
4. **Las reglas que dependen del día se evalúan contra el día de la Sesión elegida, no contra hoy.** Días programados (#11), vigencia por fechas (#24) y turno rotativo (#21) se resuelven con la fecha de inicio de esa Sesión y con su ámbito (`sesionId` o `seccionId` según la frecuencia del turno). Registrar en el lunes se comporta exactamente como si fuera lunes.
5. **Las reglas que dependen del instante se saltean en una escritura retroactiva.** Deadline (#14) y cronómetro (Fase 5) siempre estarían vencidos en una Sesión pasada: mantenerlos convertiría la función en una pantalla que rechaza todo. El Tutor los saltea; el integrante nunca (él solo escribe en la Sesión abierta, donde las reglas rigen enteras).
6. **El cupo de repeticiones SÍ se respeta.** `repeticionesMaximasSesion` se cuenta sobre la Sesión elegida. No es una regla del momento: es la definición de la actividad, y saltearla produciría estados que el motor nunca habría generado (cinco "lavó los platos" en un día que admite dos).
7. **Todo registro cargado a una Sesión que no era la abierta queda marcado, con motivo obligatorio.** Dos columnas nuevas por tabla de registro: `cargadoRetroactivamenteEn` (instante real de la carga) y `motivoRetroactivo` (por qué). El historial lo muestra con un chip «Cargado después» y el motivo. Sin motivo el endpoint devuelve 400: una fila que aparece en un día ya cerrado, sin explicación, es exactamente lo que la regla 6 existe para evitar.
8. **El `NO_HIZO` automático del cierre (`registradoPorTipo = 'SYSTEM'`) se levanta solo cuando el Tutor carga la completada.** Hoy un `NO_HIZO` vivo bloquea la actividad (`asegurarNoDenegada`, #12 decisión 2); sin esta excepción, la corrección más frecuente de todas —«el castigo automático estuvo mal»— sería imposible. Se da de baja en la misma operación, con su evento de compensación, y queda en el historial como deshecho. **Un `NO_HIZO` puesto por un Tutor NO se levanta solo**: ese fue un juicio humano y se deshace a mano, con el botón que ya existe.
9. **La evaluación de umbrales de una Sesión ya cerrada no se re-dispara.** Con `evaluarUmbralesEn = CADA_SESION`, la zona de esa Sesión se calculó al cerrarla y ya se notificó; recalcularla llegaría como una notificación de un día que el integrante ya vivió. El asiento retroactivo sí entra al ledger, así que **el total de la Sección al cierre lo incluye** — que es donde se decide la recompensa. Se anota como consecuencia conocida, no como bug.
10. **Sin `sesionId`, el comportamiento es idéntico al de hoy, byte por byte.** El parámetro es opcional en todos los endpoints y su ausencia resuelve la Sesión abierta por el mismo camino de siempre. Ningún cliente viejo cambia de comportamiento, y la app del integrante no se entera de que este ítem existe.
11. **Un `USUARIO` que mande `sesionId` lo ve ignorado, no rechazado.** Mismo criterio que `usuarioId` en `completar` (Fase 7): el campo del cliente no decide nada, se descarta en silencio y se usa el principal del JWT con la Sesión abierta. Un 403 revelaría que el parámetro existe y hace algo.
12. **El selector de Sesión gobierna las dos pestañas del panel operativo.** Elegir «Sesión 3» en «Registrar» y ver «Qué pasó hoy» de la Sesión 5 sería la peor versión de esto. Una sola elección, en la URL (`?sesion=<uuid>`), compartida por ambas vistas, con default en la Sesión abierta.
13. **La IA puede leer y proponer sobre cualquier Sesión de la Sección, y sigue sin manos.** `estado_de_hoy` acepta `sesionId`; se agrega `listar_sesiones_de_la_seccion` para que el modelo pueda resolver «el lunes» a un uuid sin adivinarlo. Las propuestas viajan con `sesionId` y `motivo`, y **las aplica el frontend con el JWT del Tutor** contra estos mismos endpoints — el modelo de seguridad del #29 no se toca: `ai-service` sigue sin conocer ningún secreto que le permita mutar otra base.

### Qué decisiones anteriores revisa (y cómo)

Tres, y las tres en la misma dirección — ninguna se borra:

| Ítem | Decisión que decía | Pasa a decir |
|---|---|---|
| **#31**, decisión 5 | «Un ajuste cae en la Sección y Sesión **abiertas** o no cae (409)». | Cae en cualquier Sesión de la Sección **vigente**, o no cae (409). |
| **#18**, decisión 2 | «Solo la Sesión actual. Una Sección cerrada es de solo lectura (regla 6)». | Cualquier Sesión de la Sección vigente. La segunda mitad de la frase queda **igual**: una Sección cerrada sigue siendo de solo lectura. |
| **#12**, decisión 4 | «La marca vive dentro de su Sesión: una vez cerrada, lo registrado queda como quedó». | La marca vive dentro de su **Sección**. |

Las tres decían **Sesión** donde la unidad que se evalúa es la **Sección**: los umbrales de zona se calculan sobre el total de la Sección (`SOLO_AL_CIERRE_SECCION` por default, Fase 6), así que mientras la Sección no cerró, nada de lo que contiene está decidido todavía. Eso es lo que las tres decisiones no estaban viendo, y por eso el arreglo es el mismo en las tres.

**La regla 6 de `CLAUDE.md` no se revisa en ningún punto** — al contrario: es la que define el borde nuevo. Lo que este ítem descubre es que se la estaba aplicando una unidad más abajo de donde está escrita.

### Fuera de alcance a propósito

- **Editar Secciones cerradas.** Es la regla 6 y no se negocia acá. Si algún día hace falta, es un ítem propio con `corregidoDeId`, recálculo de zonas y una política sobre las recompensas ya entregadas.
- **Re-evaluar zonas de Sesiones cerradas** (decisión 9).
- **Notificar al integrante** de una carga retroactiva. Mismo diferimiento que el #12 y el #18: cuando exista la política de notificaciones del Tutor, entra ahí.
- **Que el integrante vea o edite Sesiones pasadas.** Su app no cambia en nada. `mi-estado-hoy` sigue siendo la Sesión abierta y nada más.
- **Deshacer una conducta anulada.** Sigue siendo la asimetría conocida que el #18 dejó anotada: `DELETE /activity/registros-conducta/:id` no tiene reversión. Este ítem la hereda tal cual; emparejarla es el ítem que ya estaba pendiente, no un agregado silencioso a este.
- **Reabrir una Sesión cerrada.** No hace falta: escribir en ella no la reabre. El estado `CERRADA` se mantiene y el scheduler no se entera. Un endpoint de "reabrir" traería la pregunta de qué pasa con el cierre automático que ya corrió, y no se necesita para nada de lo que este ítem resuelve.

---

## Parte A — El resolvedor: `resolverSesionDeTrabajo`

El corazón del ítem es una sola función, en `activity-service/src/comun/sesion-abierta.ts` (junto a la que ya está, que no se borra: la usan los caminos que no aceptan Sesión ajena).

```ts
export interface SesionDeTrabajo {
  seccionId: string;
  sesionId: string;
  /** El día de la Sesión: decide programación, vigencia y turno (decisión 4). */
  fechaInicioSesion: Date;
  /**
   * true si NO es la Sesión ABIERTA de una Sección ABIERTA. Gobierna las tres
   * cosas que cambian: motivo obligatorio, marca en la fila, y el salteo de
   * deadline/cronómetro (decisiones 5 y 7).
   */
  retroactiva: boolean;
}

export function resolverSesionDeTrabajo(
  seccion: SeccionActualInterna | null,
  sesionIdPedido?: string
): SesionDeTrabajo;
```

Reglas, en orden:

1. Sin Sección vigente → 409 `NO_HAY_SESION_ABIERTA` (igual que hoy).
2. **Sin `sesionIdPedido`** → la Sesión `ABIERTA` de una Sección `ABIERTA`; 409 `NO_HAY_SESION_ABIERTA` si no la hay. Camino idéntico al actual (decisión 10). `retroactiva = false`.
3. **Con `sesionIdPedido`** → tiene que ser una Sesión de `seccion.sesiones` (la Sección vigente ya viene con todas). Si no está → 409 `SESION_NO_EDITABLE`, con el mismo cuerpo para "no existe", "es de otra Sección" y "es de una Sección cerrada": no se revela nada.
4. La Sección vigente puede estar `ABIERTA` o en `EVALUACION` (decisión 2). `CERRADA` no puede llegar acá porque el interno de session solo devuelve la no-`CERRADA` más reciente — pero se valida igual, explícito, porque de eso depende la regla 6.
5. `retroactiva = seccion.estado !== ABIERTA || sesion.estado !== ABIERTA`.

`SESION_NO_EDITABLE` es un `ConflictException` con `code` propio, en `comun/excepciones.ts`, al lado de `NoHaySesionAbiertaException`.

### Quién resuelve el `sesionId` del request

**Nunca el body sin filtrar.** El controlador pasa `sesionId` solo si `tenant.rol !== USUARIO` (decisión 11); el servicio recibe `undefined` en cualquier otro caso. El `organizacionId` y el `grupoId` siguen saliendo del JWT como siempre (regla 3) — este ítem no agrega ningún campo de tenant al body.

---

## Parte B — `activity-service`

### Modelo de datos

Dos columnas nuevas, **nullable, aditivas**, en las tres tablas de registro (`RegistroActividad`, `RegistroConducta`, `RegistroTareaEquipo`):

```prisma
  // fase-14-33: la fila se cargó a una Sesión que no era la abierta. NULL en
  // todo lo anterior a este ítem y en todo lo que se registra en el día — no
  // es un default que haya que backfillear, es la ausencia de la marca.
  cargadoRetroactivamenteEn DateTime?
  // Obligatorio cuando el anterior no es null (lo valida el endpoint, no la
  // base: la base no sabe quién escribió). Máximo 200, igual que motivoTutor.
  motivoRetroactivo         String?
```

No se agregan a `NotaRegistro`: una nota interna ya nace fuera del flujo del día y su `createdAt` la ubica sola.

**Migración aditiva pura**, sin backfill y sin `NOT NULL`: ninguna fila existente cambia. (Trampa ya conocida en este repo desde el #29 T1: una columna nullable nueva deja las filas viejas en `NULL`, y ese `NULL` **es** el dato correcto acá — significa "se cargó en su día".)

### Escrituras que aceptan `sesionId`

Todas suman `sesionId?: string` y `motivoRetroactivo?: string` al body (o al query, donde ya era query), y **ninguna cambia de shape para quien no los mande** (decisión 10).

| Endpoint | Qué cambia |
|---|---|
| `POST /activity/actividades/:id/completar` | Registra en la Sesión pedida. Saltea deadline y cronómetro si `retroactiva`. Levanta el `NO_HIZO` de `SYSTEM` si lo hay (decisión 8). |
| `POST /activity/actividades/:id/no-hizo` | Registra el castigo en la Sesión pedida. `motivo` (el que ve el integrante) sigue siendo opcional; `motivoRetroactivo` no. |
| `POST /activity/conductas/:id/registrar` | Ídem. Un `USUARIO` autorreportando ignora `sesionId` (decisión 11). |
| `POST /activity/actividades/:id/iniciar-cronometro` | **400 `CRONOMETRO_NO_RETROACTIVO`** si se pide una Sesión que no es la abierta (decisión 3). |
| `POST /activity/registros-actividad/:id/revertir` | Deja de exigir «de la Sesión abierta»: ahora exige **de la Sección vigente**. Acepta `motivoRetroactivo` y lo exige si la fila es de una Sesión pasada. |
| `DELETE /activity/registros-actividad/:id` | Hoy no valida Sesión en absoluto (hueco preexistente, ver nota al pie). Pasa a exigir **de la Sección vigente** — es un endurecimiento, no una apertura. |
| `DELETE /activity/registros-conducta/:id` | Ídem. |
| `POST /activity/historial/:registroTipo/:registroId/notas` | El 409 pasa de «no es de la Sesión abierta» a «no es de la Sección vigente». |
| `POST /activity/equipos/:equipoId/tareas/:actividadId/completar` y anular/revertir (#13) | Mismo tratamiento vía `resolverSesionDeTrabajo`. |

> **Nota sobre el endurecimiento de `DELETE /registros-actividad/:id`.** Al escribir esta spec se encontró que anular una completada **no valida la Sesión** (solo la organización), mientras que deshacer esa misma anulación sí exige Sesión abierta. Es decir: hoy se puede anular una fila de hace tres Secciones y no se puede deshacer. Este ítem lo empareja hacia el criterio nuevo (ambas, Sección vigente). Queda anotado acá porque **es un cambio de comportamiento preexistente**, no una consecuencia de habilitar Sesiones pasadas.

### Validaciones, en orden, para una escritura retroactiva

1. Rol: `TUTOR` asignado al grupo u `ORG_ADMIN` (sin cambios).
2. `resolverSesionDeTrabajo` → 409 si la Sesión no es de la Sección vigente.
3. `motivoRetroactivo` presente y ≤ 200 → 400 `MOTIVO_RETROACTIVO_REQUERIDO` si falta.
4. Visibilidad de la actividad: autoría (#10), destinatario/rol (#19, #24) y **turno resuelto con el ámbito de esa Sesión** (#21).
5. Programación y vigencia **contra `fechaInicioSesion`** (ya funciona así: `asegurarProgramacionVigente` recibe la Sesión, no `now`).
6. Deadline y cronómetro: **salteados** (decisión 5).
7. Cupo de repeticiones **sobre esa Sesión** (decisión 6).
8. `NO_HIZO` vivo: si es de `SYSTEM`, se da de baja y se sigue; si es de un Tutor, 409 como hoy (decisión 8).

### Lecturas del Tutor que aceptan `?sesionId=`

`GET .../usuarios/:usuarioId/estado-hoy`, `GET .../usuarios/:usuarioId/completadas`, `GET .../usuarios/:usuarioId/marcas` y `GET /activity/grupos/:grupoId/historial`. Sin el parámetro devuelven lo de siempre (la Sesión abierta, o la última de la Sección en el caso del historial, decisión 14 del #18).

`GET /activity/grupos/:grupoId/mi-estado-hoy` (el del integrante) **no cambia** y no acepta el parámetro.

Las respuestas suman, donde ya viajaba información de la fila:

```ts
/** fase-14-33: null si se cargó en su día (todo lo anterior a este ítem). */
cargadoRetroactivamenteEn: string | null;
motivoRetroactivo: string | null;
```

Y `MiEstadoHoyDto` suma dos campos de contexto para que la pantalla del Tutor sepa qué está mirando sin cruzarlo con otra llamada:

```ts
/** fase-14-33: la Sesión que se está viendo, y si admite escritura. */
sesionEstado: 'ABIERTA' | 'CERRADA' | null;
sesionNumero: number | null;
```

### Eventos de dominio

Los payloads ya llevan `sesionId` y `seccionId` y **ya se llenan con la Sesión resuelta**, así que un asiento retroactivo cae en la Sesión correcta sin tocar el catálogo de eventos. Se agrega un solo campo opcional a los cuatro payloads de registro (`ActividadCompletada`, `NoHizoRegistrado`, `ConductaRegistrada`, `TareaEquipoCompletada`):

```ts
/** fase-14-33: presente solo si la fila se cargó fuera de su día. */
cargadoRetroactivamenteEn?: string;
```

No lo consume nadie todavía — viaja para que `audit-service` y los reportes lo tengan disponible sin una migración de eventos después. **Ningún routing key nuevo, ningún exchange nuevo, ningún consumidor nuevo.**

---

## Parte C — `scoring-service`

`POST /scoring/grupos/:grupoId/usuarios/:usuarioId/ajuste` (#31) suma `sesionId?` y usa el mismo resolvedor (una copia local en `scoring-service/src/comun/`, no una lib compartida: son dos servicios con dos clientes internos distintos y compartir esto obligaría a compartir el tipo del cliente — ver regla 2).

`EventoPuntos` suma `cargadoRetroactivamenteEn DateTime?`. El ajuste manual retroactivo exige `motivo` (ya era obligatorio) y **no** un segundo motivo: uno alcanza, y pedir dos textos para el mismo movimiento es fricción sin información.

**Lo que no cambia y hay que cuidar**: el puntaje se sigue derivando al leer (regla 1). Este ítem escribe filas en el ledger con un `sesionId` distinto; no toca ningún acumulado porque no hay ninguno. Los consumidores de eventos ya proyectan por el `sesionId` del payload — no hace falta tocarlos.

**Lo que sí hay que verificar explícitamente**: que `ProyeccionService` no filtre asientos por "sesión abierta" en ningún lado. Si lo hiciera, un asiento retroactivo entraría al ledger y no sumaría — el peor bug posible de este ítem, porque es silencioso.

---

## Parte D — Frontend (`app-web`)

**`panel-operativo.page.ts`** suma un **selector de Sesión** arriba de las pestañas: chips `S1 … Sn` con la abierta destacada, la elegida en la URL (`?sesion=<uuid>`), default en la abierta (o la última empezada si no hay abierta, mismo criterio que el #18). El selector se ve **solo si la Sección tiene más de una Sesión** — en un grupo de una sesión por sección no aparece nada nuevo.

**Banner de Sesión pasada** (ámbar, `role="status"`, arriba del contenido de las dos pestañas) cuando la elegida no es la abierta:

> Estás editando la **Sesión 3** (cerrada el martes 5). Lo que cargues acá queda marcado como cargado después y pide un motivo.

**Diálogo de motivo**: toda acción retroactiva pasa por el modal de confirmación que ya existe, con el campo de motivo **obligatorio** (contador de 200) y el botón deshabilitado hasta que tenga texto. En la Sesión abierta el diálogo se comporta exactamente como hoy.

**Historial**: chip «Cargado después» en las filas con `cargadoRetroactivamenteEn`, con el motivo debajo, en el mismo lugar donde ya se muestra el `motivoTutor`. Se distingue del chip «Anulada» por color e icono, no solo por texto.

**Cliente API**: `activity.api.ts` y `scoring.api.ts` suman el parámetro opcional en los métodos que ya existen. Sin cliente nuevo, sin servicio nuevo.

**App del integrante**: cero cambios (decisión: fuera de alcance).

---

## Parte E — `ai-service`

1. **`estado_de_hoy`** suma `sesionId` opcional a su esquema. Sin él se comporta igual que hoy.
2. **Herramienta nueva `listar_sesiones_de_la_seccion`**: número, estado, fecha de inicio y fin de cada Sesión de la Sección vigente, para que «anotá que el lunes sí lo hizo» se pueda resolver a un uuid. Sin esto el modelo tendría que adivinar un id, que es la peor forma posible de fallar.
3. **Las propuestas de escritura** (`proponer_anotar`, `proponer_quitar`, `proponer_ajuste`) suman `sesionId` y `motivoRetroactivo` a su esquema Zod, tipado contra el contrato real de `shared-types` (decisión 11 del #29: si mañana se renombra el campo, rompe el build del que arma el request, no la aplicación de la propuesta).
4. **El prompt del sistema** gana una regla explícita: *si el usuario menciona un día que no es hoy, resolvé la Sesión con `listar_sesiones_de_la_seccion` antes de proponer nada, y explicá en la propuesta a qué Sesión apunta.* Una propuesta que no dice a qué día apunta es una propuesta que el Tutor no puede revisar.
5. **La IA sigue sin manos.** Sus clientes internos siguen siendo todos `GET`; aplicar lo sigue haciendo el frontend con el JWT del Tutor. El tenant sigue sin ser argumento de ninguna herramienta.

---

## Criterios de aceptación

- [ ] **Nada preexistente cambia sin `sesionId`**: registrar, anular, deshacer y ajustar sin el parámetro se comportan exactamente como antes (verificado con los tests que ya existen, sin tocarlos).
- [ ] La app del integrante no cambia en nada: `mi-estado-hoy` no acepta `sesionId` y un `USUARIO` que lo mande en `completar` o en `registrar` conducta lo ve **ignorado** (el registro cae en la Sesión abierta), no rechazado.
- [ ] Un Tutor registra una completada en una Sesión `CERRADA` de la Sección vigente: la fila queda con `sesionId` de esa Sesión, `cargadoRetroactivamenteEn` con el instante real y su motivo; scoring suma los puntos en el ledger de **esa** Sesión.
- [ ] Sin `motivoRetroactivo`, la misma llamada devuelve 400 `MOTIVO_RETROACTIVO_REQUERIDO`.
- [ ] Con el `sesionId` de una Sección **ya cerrada**, cualquier escritura devuelve 409 `SESION_NO_EDITABLE` — y lo mismo con un uuid inventado y con el de otra organización (mismo cuerpo en los tres casos).
- [ ] Con la Sección en `EVALUACION` se puede seguir editando cualquiera de sus Sesiones (decisión 2).
- [ ] Una actividad con `DEADLINE` vencido se registra igual en una Sesión pasada (decisión 5); la misma actividad en la Sesión **abierta** sigue rechazándose si el deadline pasó.
- [ ] Una actividad programada solo para lunes **no** se puede registrar en la Sesión del martes, ni siquiera retroactivamente (decisión 4).
- [ ] Una actividad con turno rotativo resuelve el turno **de esa Sesión** (frecuencia `SESION`) o de la Sección (frecuencia `SECCION`), no el de hoy.
- [ ] El cupo de repeticiones se respeta en la Sesión pasada: la repetición N+1 devuelve 409 `LIMITE_REPETICIONES_ALCANZADO` (decisión 6).
- [ ] `iniciar-cronometro` con `sesionId` de una Sesión pasada devuelve 400 `CRONOMETRO_NO_RETROACTIVO`.
- [ ] Un `NO_HIZO` automático (`SYSTEM`) no bloquea la carga retroactiva de la completada: se da de baja, se publica su compensación y el ledger queda neto (verificado sumando puntos antes y después).
- [ ] Un `NO_HIZO` puesto por un **Tutor** sigue bloqueando con 409 `ACTIVIDAD_DENEGADA_POR_TUTOR` — hay que deshacerlo explícitamente (decisión 8).
- [ ] Deshacer una marca de una Sesión pasada de la Sección vigente ahora funciona; deshacer una de una Sección cerrada sigue dando 409.
- [ ] El historial con `?sesionId=` muestra la línea de tiempo de esa Sesión, con sus acciones habilitadas, y las filas retroactivas con su chip y su motivo.
- [ ] Las notas internas se pueden agregar sobre un registro de cualquier Sesión de la Sección vigente, y siguen sin llegarle nunca al integrante.
- [ ] `scoring`: `ProyeccionService` no descarta ningún asiento por estado de Sesión — verificado leyendo el código, no por omisión.
- [ ] Frontend: el selector de Sesión gobierna las dos pestañas, sobrevive un refresh por la URL, y no aparece si la Sección tiene una sola Sesión.
- [ ] Frontend: con una Sesión pasada elegida, ninguna acción se puede confirmar sin motivo.
- [ ] IA: «anotá que el lunes Bruno sí ordenó» produce una propuesta que nombra la Sesión y lleva su `sesionId`; aplicarla desde el frontend deja la fila en esa Sesión.
- [ ] IA: el asistente **no** puede escribir por sí mismo (sus clientes internos siguen siendo `GET`) — verificado explícitamente.
- [ ] Aislamiento multi-tenant: un Tutor de otra organización recibe 409/404 en todos los caminos nuevos, y un Tutor no asignado al grupo, 403.
- [ ] `activity`, `scoring`, `ai` y `app-web` verdes en tests y lint; las migraciones aplican contra Postgres real.

## Nota para Claude Code

Cuatro errores fáciles acá, en orden de gravedad:

1. **Dejar que el `sesionId` del cliente entre sin validar contra la Sección vigente.** Es la regla 3 con otra ropa: si el body puede nombrar cualquier Sesión, puede nombrar la de otro grupo o la de una Sección cerrada. La validación es contra la lista que devuelve el interno de session, siempre, y el mismo 409 para todos los casos que fallan.
2. **Saltear el cupo de repeticiones "ya que es el tutor".** Deadline y cronómetro se saltean porque son del momento; el cupo es de la actividad. Confundirlos produce datos que el motor nunca habría generado y que después nadie sabe explicar.
3. **Levantar el `NO_HIZO` de un Tutor junto con el de `SYSTEM`.** Son dos cosas distintas: uno es un default automático que puede estar mal, el otro es una decisión de una persona. Automatizar el segundo le borra el juicio al Tutor sin que se entere.
4. **Tocar el estado de la Sesión al escribir en ella.** Escribir en una Sesión `CERRADA` **no la reabre**. Si aparece un `update` sobre `Sesion.estado` en este ítem, es un error de diseño: el scheduler es el único dueño de esa máquina de estados (Fase 6), y reabrir una Sesión haría que el cierre automático del #8 vuelva a correr sobre ella.

Y un recordatorio de secuencia: `#30` quedó en 7/9 tandas y `#31` en 8/9 según `docs/progreso/README.md`. Este ítem toca los mismos archivos que `#31` (ajuste de puntos, propuestas del asistente). Conviene cerrarlos antes, o al menos leer lo que dejaron a medias antes de tocar `propuestas.service.ts`.
