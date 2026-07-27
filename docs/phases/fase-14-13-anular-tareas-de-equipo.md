# Fase 14 · Ítem 13 — Anular una tarea de equipo (marcas rojas, parte 2)

> Sub-spec detallada del ítem 13 de `fase-14-post-mvp.md`. Especificación decidida con José (2026-07-26); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Ítem 9 (equipos de trabajo: `Actividad.alcance`, `RegistroTareaEquipo`, reparto en scoring) e **ítem 12** (marcas rojas del tutor sobre actividades individuales). Los dos existen.

## Motivación (el problema que resuelve)

El ítem 12 dejó las tareas de equipo **fuera de alcance a propósito**, con esta razón escrita: *"el reparto a los miembros exigiría compensar N asientos y decidir si el bono del jefe también se pierde"*. José pidió cerrarlo (2026-07-26): *"quiero que ahora se pueda anular también las tareas de grupo, por el tutor, que sea posible con la misma lógica"*.

Hoy una tarea de equipo completada es **irreversible**: si el jefe marca "Marcar como hecha" y no era cierto, el equipo entero se queda con los puntos y no hay forma de sacárselos. Es exactamente el agujero que el ítem 12 cerró para las individuales.

Hay un segundo problema que sale a la luz al implementar esto, y que ya estaba anotado como deuda del ítem 9: **`mi-equipo` no muestra si la tarea ya se hizo hoy**. Sin ese estado, una tarea anulada sería invisible para el equipo — que es justamente lo que el ítem 12 vino a arreglar para las individuales ("la corrección es invisible"). No se puede hacer bien lo primero sin lo segundo.

## Decisiones de diseño

Las cinco decisiones del ítem 12 se aplican **tal cual** (es lo que José pidió con "la misma lógica"), y esta spec resuelve lo que es propio de equipos:

1. **Se anula la completada entera, no por miembro.** La tarea se hizo o no se hizo; no existe "la hizo para tres de los cuatro". Cada miembro que recibió puntos por esa completada los pierde.
2. **El bono del jefe también se pierde.** Era el bono *por esa tarea*: si la tarea no cuenta, el bono no cuenta. Es la respuesta a la pregunta que el ítem 12 dejó abierta.
3. **Se compensa a quien recibió puntos, no a quien es miembro hoy.** Si alguien salió del equipo entre la completada y la anulación, igual pierde lo que ganó; si alguien entró después, no le sacan nada que no recibió. Sale gratis: scoring compensa por `origenId`, así que alcanza exactamente a los asientos que existen. No hace falta releer `miembrosSnapshot` ni consultar a identity.
4. **Solo el Tutor/ORG_ADMIN anula y deshace — el jefe no.** El jefe es quien completa, y dejarlo anular sería dejarlo borrar su propio error sin que nadie se entere. Es la misma asimetría del ítem 12 (el integrante marca, el tutor corrige) y la misma razón por la que el reporte del jefe necesita aprobación del Tutor (ítem 9, decisión 2).
5. **El intento se quema, igual que en las individuales.** `TareasEquipoService.completar` ya cuenta los `RegistroTareaEquipo` **sin filtrar** los anulados, así que una tarea de equipo con `repeticionesMaximasSesion = 1` anulada no se puede volver a marcar hoy. Es el comportamiento correcto y ya estaba; solo se documenta y se expone como `topeEfectivo`.
6. **No hay "no hizo" para equipos.** Una tarea de equipo es siempre `OPCIONAL` (ítem 9, decisión de alcance), así que la única marca roja posible es la completada anulada. No se agrega un castigo de equipo: sería alcance nuevo, no "la misma lógica".
7. **Nombres de columna espejados con los otros dos registros.** El soft-delete se llama `eliminado`/`eliminadoPorTutorId`/`eliminadoEn` en `RegistroActividad` y en `RegistroConducta`; `RegistroTareaEquipo` usa **los mismos**, aunque la acción en la UI se llame "Anular". Tres modelos con el mismo concepto y tres nombres distintos sería peor que la pequeña disonancia entre el campo y el botón.

### Fuera de alcance a propósito

- **Notificar al equipo** cuando se anula. Sigue esperando la implementación completa de notificaciones a usuarios, igual que en el ítem 12.
- **Anular un reporte de miembro aprobado** (ítem 9). Es otro objeto (`ReporteMiembro` + su `RegistroConducta`) y otra conversación.

---

## Parte A — `activity-service`

### Modelo de datos

```prisma
model RegistroTareaEquipo {
  // ... campos existentes ...
  // fase-14-13: el Tutor anuló la completada del equipo. Mismos nombres que el
  // soft-delete de RegistroActividad/RegistroConducta (decisión 7).
  eliminado           Boolean   @default(false)
  eliminadoPorTutorId String?
  eliminadoEn         DateTime?
  motivoTutor         String?
  revertidoPorTutorId String?
  revertidoEn         DateTime?
}
```

Retro-compatible: toda completada de equipo previa queda `eliminado = false`, que es su estado actual.

### Endpoints

| Método | Ruta | Rol | Qué hace |
|---|---|---|---|
| `GET` | `/activity/equipos/:equipoId/tareas-de-hoy` | USUARIO (miembro), TUTOR, ORG_ADMIN | Las tareas de equipo `ACTIVA` del grupo con su estado en la Sesión abierta. |
| `DELETE` | `/activity/registros-tarea-equipo/:id?motivo=` | TUTOR, ORG_ADMIN | Anula la completada; scoring le saca los puntos a todos los que los recibieron. |
| `POST` | `/activity/registros-tarea-equipo/:id/revertir` | TUTOR, ORG_ADMIN | Deshace la anulación; scoring devuelve los puntos. |

Reglas de `DELETE` y `revertir`, calcadas del ítem 12: 404 si no existe o es de otra organización; 409 `MARCA_NO_REVERSIBLE` al revertir algo que no está anulado, y `CONFLICT` al anular algo ya anulado; 409 `NO_HAY_SESION_ABIERTA` si no hay Sesión abierta o la completada es de otra Sesión. El motivo del `DELETE` viaja por query param, por lo mismo que en el ítem 12 (un `DELETE` con body atraviesa intermediarios que pueden descartarlo).

### Lectura para el frontend

```ts
interface TareaEquipoDeHoyDto {
  actividadId: string;
  nombre: string;
  valorPuntos: number;
  bonoJefePuntos: number;
  repeticionesMaximasSesion: number;
  /** Completadas vivas del equipo en la Sesión (las barritas verdes). */
  vecesHechas: number;
  /** Completadas que el Tutor anuló: intentos quemados (barritas rojas). */
  vecesAnuladas: number;
  /** repeticionesMaximasSesion − vecesAnuladas. */
  topeEfectivo: number;
  /** Motivo de la anulación más reciente; null si no dejó ninguno. */
  motivoTutor: string | null;
  /** false si está programada y hoy no es su día (ítem 11). */
  disponibleHoy: boolean;
  diasSemana: number[];
  /** Filas vivas y anuladas, para que el Tutor pueda anular/deshacer. Vacío para el USUARIO. */
  registros: RegistroTareaEquipoDto[];
}

interface RegistroTareaEquipoDto {
  registroTareaEquipoId: string;
  eliminado: boolean;
  motivoTutor: string | null;
  completadaEn: string;
}
```

`registros` viaja **vacío para el USUARIO**: el jefe y los miembros ven el estado agregado (cuántas hechas, cuántas rojas, el motivo), no los ids con los que se opera. Es el mismo criterio del ítem 12, donde el integrante ve `vecesPerdidas` y el tutor la lista de `MarcaRojaDto`.

Sin Sesión abierta el endpoint devuelve las actividades con todos los contadores en 0 — no es un error (mismo criterio que `mi-estado-hoy`).

---

## Parte B — `scoring-service`: N cadenas en vez de una

Dos eventos nuevos, los dos consumidos por la cola `scoring.q.registros-actividad` que ya existe:

| Evento | Routing key |
|---|---|
| `TareaEquipoAnulada` | `activity.tarea_equipo_anulada` |
| `TareaEquipoRevertida` | `activity.tarea_equipo_revertida` |

```ts
interface TareaEquipoMarcaPayload {
  registroTareaEquipoId: string;
  equipoId: string;
  /** El Tutor que anuló o deshizo. */
  tutorId: string;
}
```

**Los dos hacen exactamente la misma operación**: negar el último eslabón de la cadena de correcciones **de cada asiento** con `origenId = registroTareaEquipoId`. Un reparto a 3 miembros son 3 asientos independientes, y por lo tanto 3 cadenas paralelas. Solo cambia el texto de `motivoCorreccion`.

Esto generaliza la función del ítem 12: `compensarCadena` (que buscaba **un** asiento con `findFirst`) pasa a `compensarCadenas`, que los busca con `findMany` y compensa cada uno. El caso individual es el caso de N = 1, así que las cuatro operaciones —quitar una completada, restaurarla, anular una tarea de equipo, deshacerla— comparten una sola función. Todas las compensaciones de un evento van en **una** transacción idempotente.

Verificación numérica, tarea de 10 puntos con bono de jefe 3 y un equipo de 3:

| Acción | Asientos nuevos | Puntaje del equipo |
|---|---|---|
| El jefe la completa | `+13` jefe, `+10`, `+10` | `33` |
| El Tutor la anula | `−13`, `−10`, `−10` | `0` |
| El Tutor deshace | `+13`, `+10`, `+10` | `33` |

Y cada miembro por separado vuelve exactamente a lo que tenía. El ledger nunca se edita.

---

## Parte C — Frontend (`app-web`)

**Equipo (`mi-equipo.page.ts`)** — cierra de paso la deuda del ítem 9:
- Cada tarea de equipo muestra su estado de hoy: barrita de repeticiones cuando tiene más de una, tilde cuando está hecha y no es repetible, y el botón "Marcar como hecha" deshabilitado al llegar al **tope efectivo**.
- Una tarea con completadas anuladas muestra los segmentos rojos rayados y el contador "1 de 2 · 1 anulada", igual que las individuales.
- Si el Tutor dejó motivo, se lee debajo. Lo ven **todos los miembros**, no solo el jefe: el equipo entero perdió los puntos.

**Tutor (`equipos.page.ts`)**: por equipo, un bloque "Tareas de hoy" con las completadas de la Sesión abierta, un campo de motivo opcional, **Anular** en cada fila viva y **Deshacer** en cada fila anulada.

---

## Criterios de aceptación

- [ ] **Default intacto**: sin ninguna anulación, completar una tarea de equipo y el reparto funcionan exactamente como antes.
- [ ] El jefe completa una tarea de 10 pts con bono 3 en un equipo de 3 → puntaje de equipo 33 (jefe 13, los otros 10). El Tutor la anula → **0**, y cada miembro vuelve a su puntaje previo. Deshacer → 33 otra vez.
- [ ] El **bono del jefe** se pierde al anular y vuelve al deshacer (decisión 2).
- [ ] Un miembro que salió del equipo después de la completada **igual** pierde los puntos al anular (decisión 3).
- [ ] El **jefe no puede anular**: `DELETE` con su token da 403 (decisión 4).
- [ ] Anular quema el intento: con `repeticionesMaximasSesion = 1`, el jefe no puede volver a marcarla hoy (409 `LIMITE_REPETICIONES_ALCANZADO`).
- [ ] `tareas-de-hoy` devuelve `vecesHechas`/`vecesAnuladas`/`topeEfectivo` correctos, y `registros` **vacío** cuando lo pide un USUARIO.
- [ ] Anular algo ya anulado o revertir algo no anulado devuelven 409; una completada de otra Sesión no se toca; una de otra organización da 404.
- [ ] El ledger no se edita: cada anulación y cada reversión son N filas nuevas con `corregidoDeId`, y la secuencia completar → anular → deshacer → anular deja el puntaje del equipo en 0.
- [ ] Al abrir la Sesión del día siguiente el equipo arranca sin marcas.
- [ ] Las actividades **individuales** siguen comportándose igual que en el ítem 12 (la generalización de `compensarCadenas` no cambió el caso N = 1).

## Nota para Claude Code

El error fácil de este ítem es asumir que compensar una tarea de equipo es como compensar una individual y usar `findFirst`: el reparto son **N asientos con el mismo `origenId`**, y con `findFirst` se le devolverían los puntos a un solo miembro, en silencio, sin que ningún test de las individuales se ponga rojo. Por eso la función pasa a plural y por eso el criterio de aceptación mira el puntaje de **cada** miembro, no solo el del equipo.

El segundo punto de atención es que `mi-equipo` no tenía estado ninguno: sin la Parte C, la anulación funciona en la base y en el ledger pero el equipo nunca se entera, que es el problema que el ítem 12 vino a resolver.
