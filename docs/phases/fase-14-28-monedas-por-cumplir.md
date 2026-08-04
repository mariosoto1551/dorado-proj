# Fase 14 · Ítem 28 — Monedas por cumplir: la segunda fuente de la economía

> Sub-spec detallada del ítem 28 de `fase-14-post-mvp.md`. Este archivo es la especificación decidida con José (2026-08-03); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Fases 5, 6, 7 y 8 completas, más los ítems **#8** (confirmación de obligatorias), **#9** (equipos de trabajo), **#12** (marcas rojas del tutor), **#20** (obligatorias que suman) y **#22** (tienda de monedas) — todos ejecutados.

Reutiliza, sin modificarlos: el ledger `EventoMoneda` y el cálculo de saldo derivado (#22), `ConfiguracionRecompensasGrupo` y `ConfiguracionService.obtenerModo` (#22), el patrón de consumidor idempotente con `EventoProcesado` en la misma transacción (ADR-00 §5), el `ScoringClientService`/`IdentityClientService` de rewards como molde para el cliente nuevo, y los eventos `ActividadCompletada`, `ConductaRegistrada`, `TareaEquipoCompletada` y sus tres eventos de corrección.

## Qué revisa de lo ya decidido

**Revisa una decisión de la Fase 8 heredada por el #22**: que las monedas entren **solo** por el cierre de la Sección (`RendimientoZona`). Este ítem abre una **segunda fuente** — lo que el participante hace durante la semana también paga. `fase-14-22-tienda-de-monedas.md` **no se edita**: el cierre económico, la bancarrota y la tienda quedan exactamente como están; esto agrega asientos al mismo ledger por un camino nuevo.

Es el **cuarto ítem que revisa una decisión ya tomada**, después del #20 sobre el #8, el #22 sobre la Fase 8 y el #25 sobre el #8.

Y **revisa una decisión del #20**: que `ActividadCompletada` solo se publique cuando el registro vale puntos (`registro.service.ts`, tres guards). Ver Parte D — es el único cambio de este ítem sobre código que hoy funciona, y es el que hace posible el pedido entero.

## Motivación (el problema que resuelve)

El #22 montó una economía cuyo **único ingreso es semanal y depende de la zona**. Eso tiene dos consecuencias que se ven apenas se usa:

1. **El ingreso está desacoplado del esfuerzo concreto.** Tender la cama diez veces y tenderla cuatro pueden caer en la misma zona y rendir lo mismo. Los puntos sí distinguen —por eso existe la zona—, pero la billetera, que es lo que el participante mira, no.
2. **No hay forma de ponerle precio a una cosa puntual.** El Tutor puede decir «esta actividad vale 10 puntos», pero no «esta actividad, además, paga 3 monedas». La única palanca económica que el #22 le dio es el precio del producto, que actúa sobre el gasto y nunca sobre el ingreso.

El pedido de José (2026-08-03) es exactamente eso: que una Actividad pueda pagar monedas **además** de puntos, con los dos números independientes —«flexible, que no haya dependencias entre sí»—, y solo si el Grupo tiene la tienda configurada.

## Decisiones de diseño

Cerradas con José el 2026-08-03:

1. **Puntos y monedas son dos números independientes.** Ni uno se deriva del otro ni uno habilita al otro: 10 puntos + 0 monedas, 0 puntos + 5 monedas y 10 + 3 son las tres configuraciones válidas. Es el pedido literal y es la decisión que gobierna todas las demás.
2. **El valor en monedas vive en `rewards-service`, no en `Actividad`.** Es la decisión 11 del #22 aplicada igual: `activity-service` es un motor de registro y no tiene por qué saber que existe una economía. `activity-service` **no cambia ni un campo de schema**, no hay migración en `activity_db` y un Grupo en `DIRECTO` no tiene una sola columna muerta. Se referencia por `actividadId`/`conductaId` (regla 2) y se valida contra el interno de activity.
3. **Cuatro hechos pagan monedas**, y ninguno más: completar una **opcional**, **confirmar una obligatoria**, completar una **tarea de equipo** y registrar una **conducta BUENA**.
4. **Las monedas nunca se restan por lo que se hace.** No existe «no hacer la obligatoria cuesta monedas» ni «la conducta MALA debita». El único camino que puede dejar el saldo en negativo sigue siendo el cierre de la Sección con su bancarrota (#22, decisión 5), que es donde el castigo tiene sentido narrativo —«cerraste la semana en rojo»— y donde ya está probado. `RendimientoAccion.monedas` es `>= 0` y se valida al escribir.
5. **Se acredita al instante, no al cierre.** El participante completa y ve subir el saldo. Es el mismo criterio que la decisión 17 del #22 (comprar no depende del estado de la Sección): la moneda es plata propia, no el resultado de la Sección.
6. **Deshacer una acción compensa con piso en 0.** Si el Tutor quita una completada que pagó 5 y el participante ya gastó todo menos 2, se descuentan 2 y el saldo queda en 0 — nunca negativo. Es la misma regla que el ajuste manual del Tutor, que tiene prohibido endeudar a nadie (#22, Parte D). El movimiento se escribe **siempre**, incluso con monto 0, con el faltante en el `motivo`: un saldo que no bajó lo que debía bajar es justo lo que un Tutor va a preguntar, y un ledger que no lo explica no sirve.
7. **Deshacer el deshacer restituye lo que efectivamente se descontó, no lo que se había acreditado.** Si la reversión solo pudo recuperar 2 de 5, la restitución devuelve 2. Devolver 5 regalaría 3 monedas por el camino de una corrección — el agujero exacto que la decisión 6 abre si no se cierra acá.
8. **La tarea de equipo paga las monedas completas a cada miembro, y el jefe cobra un bono propio.** Espeja lo que ya hace el puntaje (`tareas-equipo.service.ts`: `valorPuntos + (esJefe ? bonoJefePuntos : 0)`, sin dividir), con un `monedasBonoJefe` independiente de `bonoJefePuntos` — que la decisión 1 aplicada al bono.
9. **El integrante nunca pone monedas.** No hay tope configurable ni campo en la propuesta de actividad (#10): el valor en monedas se carga **solo** desde la pantalla del Tutor, y esa pantalla ya está detrás del rol. Cae por construcción, sin una regla más que mantener. El Tutor **sí** puede ponerle monedas a una actividad de `origen = USUARIO` desde su pantalla; lo que no existe es que el autor se las ponga.
10. **Se configura en una pantalla propia, no en el formulario de la actividad.** Calibrar una economía es mirar todos los números juntos, no entrar de a uno; y guardar todo en una llamada elimina el guardado parcial que tendría un formulario que escribe en dos servicios.

Detalles resueltos en esta spec:

11. **Una sola tabla con discriminador, no una por origen.** `RendimientoAccion` con `tipoAccion: ACTIVIDAD | CONDUCTA` — la forma es idéntica (un número por ítem del catálogo) y el precedente del proyecto es `NotaRegistro` del #18, que resuelve tres orígenes con un discriminador y valida la integridad en el endpoint porque una FK polimórfica no se expresa en Prisma.
12. **Se llama `RendimientoAccion` y no `RendimientoItem`** porque en `rewards-service` «ítem del catálogo» ya significa `Recompensa` (#22, decisión 12), ni `RendimientoActividad` porque también cubre conductas. Es el mismo criterio de nombre que llevó a `EtiquetaCatalogo` en el #26.
13. **Dos valores nuevos en `TipoMovimientoMoneda`, no tres.** `RENDIMIENTO_ACCION` (siempre positivo) y `REVERSION_ACCION`, que **lleva el signo**: negativo cuando el Tutor quita, positivo cuando deshace su quita. Es el mismo hecho con signo opuesto — mismo criterio que `TareaEquipoMarcaPayload` del #13, que usa un solo payload para anular y revertir «porque scoring hace la MISMA operación en ambos casos».
14. **En modo `DIRECTO` no se escribe ningún movimiento.** El consumidor chequea el modo y sale, marcando `EventoProcesado` igual, exactamente como hace hoy `ZonasConsumer`. La configuración de rendimientos **sí** se puede cargar en `DIRECTO` (no se pierde al cambiar de modo, decisión 10 del #22), simplemente no tiene efecto.
15. **Una obligatoria `ASUME_HECHA` no puede pagar monedas nunca**, porque nunca genera un registro positivo (#8). No se bloquea la carga: la pantalla la muestra deshabilitada y **dice por qué** — misma línea que el aviso de inflación del #22, que informa sin impedir.
16. **Cada repetición paga.** Una actividad con `repeticionesMaximasSesion = 3` y 2 monedas paga 2 monedas por repetición, igual que paga puntos por repetición. La palanca contra la inflación es el valor unitario, no un tope aparte.
17. **La conducta MALA no aparece en la pantalla.** Con la decisión 4 no tiene nada que configurar, y mostrarla con un campo bloqueado invita a preguntar por qué existe.
18. **El aviso de inflación se invierte.** El #22 avisa al ponerle precio a un producto («≈ N semanas en Verde»); acá el aviso va del otro lado: **cuánto rinde ahora una semana completa** con esta calibración. Sumar ingreso por actividad devalúa todos los precios de la tienda a la vez, y ese es el efecto que el Tutor no puede ver solo.

### Fuera de alcance a propósito

- **Monedas negativas por acción** (decisión 4) y **topes de ingreso semanal**: la palanca es el valor unitario.
- **Monedas en el cierre automático de obligatorias** (`SesionCerrada` → `NO_HIZO` del #8/#25): es el lado negativo, que la decisión 4 descarta entero.
- **Monedas por alcanzar un objetivo de ahorro** (#25) o por rachas: es un ítem distinto, no un modo de este.
- **Que el propio participante vea el valor en monedas antes de completar.** Se decide en la Parte F, no se modela: es una propiedad de la lectura del catálogo, no un dato nuevo.
- **Multiplicadores por zona** («en Dorado las actividades pagan doble»). Es sumar un factor, no rediseñar, si algún día se pide.

---

## Parte A — `rewards-service`: schema

```prisma
/** Qué clase de registro de activity_db paga monedas (decisión 11). */
enum TipoAccionRendimiento {
  ACTIVIDAD
  CONDUCTA
}

/**
 * Cuántas monedas paga completar una Actividad o registrar una Conducta BUENA
 * (decisiones 2 y 3). Es el hermano de `RendimientoZona` para la segunda fuente
 * de la economía, y vive acá por el mismo motivo: activity es un motor de
 * registro y no tiene por qué saber que existe una economía (decisión 11 del
 * #22 aplicada igual). Referencia a activity_db solo por ID (regla 2).
 *
 * Se llama `Accion` y no `Item` porque en este servicio "ítem del catálogo" ya
 * significa `Recompensa` (decisión 12).
 *
 * Es CONFIG mutable, no ledger: se pisa con upsert, igual que `RendimientoZona`.
 */
model RendimientoAccion {
  id             String                @id @default(uuid())
  organizacionId String
  grupoId        String
  tipoAccion     TipoAccionRendimiento
  /// actividadId o conductaId según tipoAccion. Sin FK: otra base.
  origenId       String
  /// Copiado al escribir, para que el ledger y el historial puedan contar la
  /// historia aunque la actividad se archive o se renombre después.
  nombreSnapshot String
  /// Siempre >= 0 (decisión 4): lo que se hace nunca debita.
  monedas        Int
  /// Solo con tipoAccion = ACTIVIDAD y alcance = EQUIPO (decisión 8). Se fuerza
  /// a 0 fuera de ese caso, mismo criterio que `puntosPorCumplir` del #20.
  monedasBonoJefe Int                  @default(0)
  createdAt      DateTime              @default(now())
  updatedAt      DateTime              @updatedAt

  @@unique([tipoAccion, origenId])
  @@index([organizacionId])
  @@index([grupoId])
}
```

Cambios sobre modelos existentes del #22:

```prisma
enum TipoMovimientoMoneda {
  // ...los seis valores actuales sin tocar...
  /// fase-14-28: pagó completar una actividad o registrar una conducta BUENA.
  /// Siempre positivo. `origenId` = el registro de activity_db que lo originó.
  RENDIMIENTO_ACCION
  /// fase-14-28: el Tutor quitó (monto < 0, con piso en 0) o deshizo su quita
  /// (monto > 0). Un solo valor con signo — decisión 13.
  REVERSION_ACCION
}
```

`EventoMoneda` **no cambia de forma**: `origenId` guarda el `registroId` de activity_db (o el `registroTareaEquipoId`), `seccionId` viene del payload y `registradoPorTipo = 'SYSTEM'` porque el asiento lo escribe un consumidor.

Validaciones al escribir rendimientos:

- `monedas < 0` o `monedasBonoJefe < 0` → 400 `MONEDAS_INVALIDAS` (decisión 4).
- `origenId` que no existe en el Grupo, o de otra organización → 400 `ACCION_INEXISTENTE`. Se valida contra el interno de activity (Parte D).
- `tipoAccion = CONDUCTA` sobre una conducta `MALA` → 400 `CONDUCTA_MALA_NO_RINDE` (decisión 17).
- `monedasBonoJefe > 0` sobre algo que no es una actividad de `alcance = EQUIPO` → se **fuerza a 0** sin error, mismo criterio que el #20 con `puntosPorCumplir`.

## Parte B — El consumidor

Cola nueva `rewards.q.acciones` (cuórum, DLX, como todas), suscrita a **seis** routing keys:

| Routing key | Efecto |
|---|---|
| `activity.actividad_completada` | Acredita `monedas` al `usuarioId`. |
| `activity.conducta_registrada` | Acredita solo si `tipo = 'BUENA'`; con `MALA` descarta explícito. |
| `activity.tarea_equipo_completada` | Acredita `monedas` a **cada** miembro de `asignaciones`, más `monedasBonoJefe` al que tiene `esJefe = true` (decisión 8). |
| `activity.actividad_registro_eliminado` | Reversión con piso en 0 (decisión 6). |
| `activity.conducta_registro_eliminado` | Ídem. |
| `activity.tarea_equipo_anulada` | Ídem, **para cada miembro que cobró** — compensar uno solo dejaría la mitad de las billeteras mal en silencio, la advertencia que ya dejó el #13. |

Y dos más para el camino de restitución (decisión 7):

| Routing key | Efecto |
|---|---|
| `activity.actividad_registro_revertido` | Solo con `tipoRegistro = 'COMPLETADA'`: restituye lo que la reversión efectivamente descontó. Con `NO_HIZO` descarta (nunca pagó monedas). |
| `activity.tarea_equipo_revertida` | Restituye a cada miembro lo que se le descontó. |

### B.1 — Algoritmo de acreditación

1. **¿Modo `TIENDA`?** Si no, marcar `EventoProcesado` y salir (decisión 14). Un Grupo en `DIRECTO` se comporta exactamente como antes de este ítem.
2. **Buscar el `RendimientoAccion`** por `(tipoAccion, origenId)`. Si no hay fila o `monedas = 0` → no se escribe movimiento y se marca procesado. Una actividad sin precio en monedas no genera ruido en el ledger.
3. **Escribir `EventoMoneda(RENDIMIENTO_ACCION, +monedas)`** con `origenId = registroId`, `seccionId` del payload, `registradoPorId = 'SYSTEM'`, `registradoPorTipo = 'SYSTEM'`.
4. **Publicar `MonedasPorAccion`** (Parte E) y marcar `EventoProcesado`, todo en la misma transacción salvo la publicación, que va después del commit — mismo criterio que `ZonasConsumer`.

**No hay bancarrota en este camino**: las acreditaciones son siempre positivas (decisión 4), así que el saldo no puede cruzar el 0 hacia abajo.

### B.2 — Algoritmo de reversión (decisión 6)

1. Buscar el `EventoMoneda(RENDIMIENTO_ACCION)` con `origenId = registroId` **y ese `usuarioId`**. Si no existe → marcar procesado y salir.
2. Calcular el saldo actual del participante.
3. `recuperado = min(montoAcreditado, max(saldo, 0))`.
4. Escribir `EventoMoneda(REVERSION_ACCION, −recuperado)` con `origenId = registroId` y `motivo` que diga cuánto no se pudo recuperar cuando `recuperado < montoAcreditado`. **La fila se escribe aunque `recuperado = 0`** (decisión 6).
5. Marcar `EventoProcesado`, todo en una transacción **con `pg_advisory_xact_lock` sobre el `usuarioId`** — el mismo lock que la compra del #22, y por el mismo motivo: leer el saldo y escribir contra él sin lock es la carrera que produce estados imposibles. Ver la advertencia de la Parte C del #22 sobre probarlo contra Postgres real.

La restitución (decisión 7) es el espejo exacto: busca el `REVERSION_ACCION` de ese `origenId`, y escribe `EventoMoneda(REVERSION_ACCION, +|monto|)`. Sin piso: restituir nunca puede dejar el saldo negativo.

## Parte C — Endpoints (prefijo `rewards`)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| `GET` | `/rewards/grupos/:grupoId/rendimientos-acciones` | TUTOR asignado, ORG_ADMIN | El catálogo **completo** del Grupo (actividades `ACTIVA` + conductas `BUENA` `ACTIVA`) con su valor en monedas, **incluidas las que todavía no tienen fila** — mismo criterio que `GET .../rendimientos` del #22 con las zonas. Trae `valorPuntos`, `alcance`, `tipoPuntaje` y `comportamientoAlCierre` de cada una para que la pantalla pueda avisar (decisión 15) sin una segunda llamada. |
| `PUT` | `/rewards/grupos/:grupoId/rendimientos-acciones` | TUTOR asignado, ORG_ADMIN | `{ rendimientos: [{ tipoAccion, origenId, monedas, monedasBonoJefe? }] }`, idempotente. Valida cada `origenId` contra el interno de activity y copia `nombreSnapshot`. |

Nada más. **No hay endpoint de acreditación manual**: para eso ya existe el ajuste del Tutor del #22, y duplicarlo daría dos caminos para el mismo hecho.

Los endpoints del #22 no se tocan. `GET .../mi-billetera` y `GET .../billeteras` devuelven los movimientos nuevos sin ningún cambio de forma — es el mismo ledger.

## Parte D — Lo que cambia fuera de `rewards-service`

### D.1 — `activity-service`: el evento pasa a significar «esto pasó»

Hoy `registro.service.ts` no publica si el registro vale 0 puntos (líneas 313, 765 y 894, decisión del #20). Con eso, una actividad de **0 puntos y 5 monedas nunca le llegaría a rewards** — la decisión 1 sería imposible.

**Se quitan los tres guards**: `ActividadCompletada`, `ActividadRegistroEliminado` y `ActividadRegistroRevertido` se publican siempre. El evento pasa a significar «esto pasó», no «esto valió puntos», que es lo correcto para un fan-out por topic exchange: el productor no decide quién necesita enterarse.

Es un cambio de schema **cero** y de payload **cero**. `ActividadCompletada` hoy lo consume **solo scoring** (verificado: notification y audit no lo escuchan), así que la superficie es exactamente D.2.

> El comentario de `registro.service.ts:309-312` explica el guard actual. Se reemplaza por uno que explique por qué se fue, citando esta spec — no se borra sin más, porque el próximo que lea el código va a querer saber por qué el #20 lo puso.

### D.2 — `scoring-service`: el guard se muda

`ProyeccionService.proyectarRegistro` descarta cuando `puntosSnapshot === 0`: no escribe `EventoPuntos` y marca `EventoProcesado`. **El ledger de puntos queda idéntico a hoy** — lo único que cambia es dónde vive la decisión de no escribirlo.

Se aplica a los tres orígenes que pueden traer 0 (`ACTIVIDAD_COMPLETADA`, `NO_HIZO`, `CONDUCTA`) en un solo punto, no repetido por consumidor.

### D.3 — `activity-service`: interno nuevo

`GET /internal/activity/grupos/:grupoId/catalogo-rendible` (`x-internal-secret`) — actividades `ACTIVA` y conductas `BUENA` `ACTIVA` del Grupo, con `id`, `nombre`, `valorPuntos`, y para actividades además `tipoPuntaje`, `alcance`, `comportamientoAlCierre` y `bonoJefePuntos`. Es lo que alimenta el `GET` de la Parte C.

En rewards, `ActivityClientService` nuevo en `src/clientes/`, moldeado sobre `ScoringClientService`.

## Parte E — Eventos

Uno nuevo en `docs/architecture/event-catalog.md`, producido por Rewards y consumido por Notification y Audit:

```ts
// rewards.monedas_por_accion — pagó una actividad o conducta (B.1).
interface MonedasPorAccionPayload {
  usuarioId: string;
  organizacionId: string;
  grupoId: string;
  seccionId: string;
  tipoAccion: 'ACTIVIDAD' | 'CONDUCTA';
  origenId: string;          // actividadId o conductaId
  nombreAccion: string;
  monedas: number;           // siempre > 0
  saldoResultante: number;
  /** true si vino del reparto de una tarea de equipo. */
  esTareaEquipo: boolean;
}
```

**Las reversiones no publican evento.** Notificar «te sacaron 2 monedas» duplicaría el aviso que el #12 ya manda al deshacer la marca, y la billetera del participante ya muestra el movimiento.

Rewards pasa a consumir seis routing keys de `activity` (Parte B), además de `scoring.zona_alcanzada` y `session.seccion_abierta` que ya consumía.

El `PUT` de rendimientos se audita con `AccionAdministrativaRegistrada` (Fase 9): `RENDIMIENTOS_ACCIONES_CONFIGURADOS`.

## Tipos compartidos (`libs/shared-types/src/lib/rewards.ts`)

- Enum `TipoAccionRendimiento`.
- `TipoMovimientoMoneda`: agregar `RENDIMIENTO_ACCION` y `REVERSION_ACCION`.
- `RendimientoAccionDto` (con `nombre`, `valorPuntos`, `tipoPuntaje`, `alcance`, `comportamientoAlCierre`, `puedeRendir: boolean` y `motivoNoRinde: string | null` — decisión 15 resuelta en el backend, no en la plantilla).
- `ConfigurarRendimientosAccionesRequest`/`ConfigurarRendimientosAccionesResponse` (regla 5 de estilo).
- `MonedasPorAccionPayload` en `libs/shared-events`.

## Parte F — Frontend (`app-web`)

Mostrar propuesta de UI a José antes de scaffoldear (preferencia registrada).

**Tutor** — dentro de la sección «Recompensas» del #22, la pantalla de rendimiento pasa a tener **dos pestañas**: `Por zona` (la que ya existe) y `Por actividad` (esta). Solo visible en modo `TIENDA`.

- Lista completa del catálogo agrupada en **Actividades** y **Conductas buenas**, cada fila con su valor en puntos a la izquierda (solo lectura, es de otra pantalla) y el campo de monedas a la derecha. Un solo `Guardar`.
- Las actividades de `alcance = EQUIPO` muestran una segunda línea indentada para el bono del jefe (decisión 8), con el mismo tratamiento visual que ya tiene el bono en puntos.
- Las obligatorias `ASUME_HECHA` van **deshabilitadas con el motivo escrito** (decisión 15): «esta obligatoria no se confirma, así que nunca se completa — no puede pagar monedas». No se ocultan: un campo ausente sin explicación es la peor versión.
- **Aviso de calibración** al pie, en vivo (decisión 18): «una semana en la que se cumpla todo rinde ≈ N 🪙, contra ≈ M por zona». Es el único número que el Tutor no puede calcular solo y el que le dice si acaba de devaluar la tienda entera. No bloquea nada.

**Participante** — el valor en monedas aparece **junto al de puntos** en la lista de actividades («+10 pts · +3 🪙»), con el ícono y nombre de moneda del Grupo. Es el punto entero del ítem del lado del participante: si no ve el precio antes de hacerla, la moneda no motiva nada. En modo `DIRECTO` no se muestra.

El movimiento nuevo aparece en el historial de la billetera con el nombre de la actividad, sin cambios de forma en esa pantalla.

## Criterios de aceptación

- [ ] **Retro-compatible**: un Grupo en `DIRECTO` (default) no escribe ni un movimiento de monedas por completar nada, y los criterios de Fase 8, del #22 y del #20 siguen pasando sin cambios.
- [ ] **La independencia (decisión 1, el criterio que justifica el ítem)**: una actividad de **0 puntos y 5 monedas** acredita 5 monedas y **no** escribe `EventoPuntos`; una de **10 puntos y 0 monedas** escribe el asiento de puntos y **ningún** movimiento de monedas.
- [ ] Completar una opcional de 3 monedas tres veces en la Sesión deja **tres** movimientos y +9 de saldo (decisión 16).
- [ ] Confirmar una obligatoria `REQUIERE_CONFIRMACION` con monedas configuradas acredita; una `ASUME_HECHA` con monedas cargadas **nunca** acredita (decisión 15).
- [ ] Una tarea de equipo de 5 monedas con bono de 2 sobre un equipo de 3 deja **tres** movimientos: 5, 5 y 7 al jefe (decisión 8).
- [ ] Una conducta **BUENA** acredita; una **MALA** con fila de rendimiento cargada por API **no** acredita, y el `PUT` que intenta cargarla da 400 (decisión 17).
- [ ] **Nada resta monedas por lo que se hace**: un `NO_HIZO` (manual del #12 o automático del cierre del #8/#25) no escribe ningún movimiento (decisión 4).
- [ ] **Reversión con piso en 0** (decisión 6): con 5 acreditadas y saldo 2, quitar la completada deja el saldo en **0** y un `REVERSION_ACCION` de −2 con el faltante en el motivo. Con saldo 0, la fila se escribe igual con monto 0.
- [ ] **Restitución exacta** (decisión 7): deshacer esa quita devuelve **2**, no 5.
- [ ] Anular una tarea de equipo revierte a **todos** los miembros que cobraron, no solo al jefe.
- [ ] **Idempotencia**: reentregar cualquiera de los ocho eventos no acredita ni revierte dos veces (`EventoProcesado`).
- [ ] **Doble gasto en la reversión**: una reversión concurrente con una compra del mismo participante no produce saldo negativo — verificado contra **Postgres real**, no contra la BD en memoria.
- [ ] El saldo nunca sale de una columna: recalcular la suma del ledger da lo mismo que `mi-billetera` (regla 1), con los movimientos nuevos incluidos.
- [ ] Cambiar el Grupo a `DIRECTO` y volver a `TIENDA` deja los rendimientos por acción cargados y el ledger intacto (decisión 10 del #22).
- [ ] Archivar una actividad con rendimiento cargado no rompe nada: deja de aparecer en la pantalla y deja de acreditar, y los movimientos viejos siguen mostrando su nombre por el snapshot.
- [ ] **Aislamiento**: el `PUT` con un `origenId` de otra organización o de otro Grupo da 400 y no escribe nada.

## Nota para Claude Code

Orden sugerido:

1. **D.1 + D.2 primero** (mover el guard de activity a scoring, con sus tests). Es el cambio sobre código que hoy funciona: conviene tenerlo aislado, verde y verificable antes de agregar nada nuevo encima.
2. **D.3** (interno de activity + `ActivityClientService` en rewards).
3. **Schema + `PUT`/`GET` de rendimientos** (Parte A y C). Se prueba solo.
4. **El consumidor** (Parte B), acreditación primero, reversión después. Test antes que código en la reversión.
5. Tipos compartidos y frontend.

Tres advertencias concretas:

- **El guard que se muda es el cambio más riesgoso del ítem.** Si un test del #20 o de Fase 7 cambia de resultado, el error está acá. El invariante a sostener es explícito: *el contenido de `EventoPuntos` no cambia ni una fila*.
- **La reversión con piso en 0 lee el saldo y escribe contra él**: necesita el mismo `pg_advisory_xact_lock` que la compra del #22, y **probado contra Postgres real** — ese `$queryRaw` pasa tests, lint, typecheck y build, y falla en el 100 % de las corridas reales si está mal escrito (advertencia heredada del #16 y repetida en el #22).
- **La tarea de equipo son N movimientos con el mismo `origenId`**, uno por miembro. La reversión tiene que buscarlos **todos**; buscar el primero deja el resto de las billeteras mal en silencio (el error exacto que el #13 documentó para scoring).

Migraciones a mano solo si no hay Postgres levantado, y **aplicarlas contra DB real + `prisma migrate diff` antes de dar el ítem por cerrado** (estándar desde el #19).
