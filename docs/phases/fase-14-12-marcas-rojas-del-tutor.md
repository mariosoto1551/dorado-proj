# Fase 14 · Ítem 12 — Marcas rojas del tutor (denegar una obligatoria, quemar una repetición)

> Sub-spec detallada del ítem 12 de `fase-14-post-mvp.md`. Especificación decidida con José (2026-07-26); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Fases 5 (catálogo), 6 (ciclo Sección/Sesión) y 7 (registro + ledger) completas, más los ítems de Fase 14 ya ejecutados: confirmación de obligatorias y `mi-estado-hoy` (#8), equipos (#9), contenido por integrantes (#10) y actividades programadas (#11). Todos existen.

## Motivación (el problema que resuelve)

El tutor **ya puede** corregir: marcar una obligatoria como "no hizo" (`POST /activity/actividades/:id/no-hizo`) y quitar repeticiones de más de una opcional (`DELETE /activity/registros-actividad/:id`). Lo que falta es que **el integrante se entere**, y que la corrección tenga peso.

Hoy pasan dos cosas malas, las dos del mismo origen — la pantalla del usuario solo sabe contar completadas vivas:

1. **La corrección es invisible.** Al tutor quitarle una repetición, `mi-estado-hoy` devuelve `vecesHechas: 2` en vez de 3 y la barrita simplemente retrocede. Para el integrante es indistinguible de no haberla hecho nunca: no hay señal de que alguien revisó y dijo que no.
2. **La pantalla miente sobre lo que se puede hacer.** `RegistroService.completar` cuenta las completadas **sin filtrar las eliminadas**, así que el cupo ya estaba quemado del lado del servidor; pero `mi-estado-hoy` sí las filtra, así que el botón «Completar» quedaba habilitado y el usuario recibía un 409 `LIMITE_REPETICIONES_ALCANZADO` al tocarlo. El backend ya hacía lo correcto y la UI lo contradecía.

Y falta lo inverso: **el tutor no tiene forma de deshacerse**. Un "no hizo" mal puesto o una repetición quitada de más son definitivos hoy.

## Decisiones de diseño (cerradas con José, 2026-07-26)

1. **La barrita perdida quema el cupo.** Con `repeticionesMaximasSesion = 3`, si el integrante marcó 3 y el tutor ajusta a 2, quedan **2 verdes + 1 roja** y el tope de hoy pasa a 2: no puede recuperar ese slot. No es un aviso decorativo — es un intento gastado. El tope efectivo es `repeticionesMaximasSesion − vecesPerdidas`.
2. **Una obligatoria marcada "no hizo" queda bloqueada.** Contorno rojo, leyenda explícita y sin botón. Invierte el comportamiento del ítem 8: hoy el `no-hizo` da de baja la confirmación previa y el usuario puede volver a confirmar como si nada.
3. **Solo el Tutor/ORG_ADMIN revierte, y revertir devuelve los puntos.** Es la acción "me equivoqué": la barrita vuelve a verde y el asiento se compensa en el ledger. No existe una variante "devolvele el intento sin los puntos" — se descartó por no duplicar UI para un caso raro.
4. **La marca vive dentro de la Sesión actual.** Al cerrar la Sesión y abrir la del día siguiente todo arranca limpio. No se arrastra a la Sección: el tope siempre fue por Sesión y esto no lo cambia.
5. **Motivo opcional y visible para el integrante.** Un texto corto que el tutor puede dejar al marcar; si lo deja, el integrante lo lee debajo del nombre de la actividad. Sin motivo se muestra la leyenda fija.

Detalles resueltos en esta spec:

6. **No hay tabla nueva.** Una repetición perdida **ya es** una fila `RegistroActividad` con `tipo = COMPLETADA` y `eliminado = true` de la Sesión abierta; una obligatoria denegada **ya es** una fila `tipo = NO_HIZO`. Lo único que falta es leerlas y exponerlas, más tres columnas de metadatos.
7. **Revertir no borra el rastro.** Al restaurar una completada **no** se limpian `eliminadoPorTutorId`/`eliminadoEn`: se agregan `revertidoPorTutorId`/`revertidoEn`. La fila cuenta la historia entera (quién quitó, quién deshizo) en vez de volver a un estado que finge que nunca pasó. Mismo espíritu que la regla 6 de `CLAUDE.md` aplicado a los metadatos de corrección.
8. **Un solo endpoint para deshacer**, `POST /activity/registros-actividad/:id/revertir`, que resuelve según el tipo de la fila: restaura una `COMPLETADA` eliminada, o da de baja un `NO_HIZO`. Para el tutor las dos son la misma acción ("sacá esa marca roja"), y partirlo en dos rutas obligaría a la UI a saber cuál llamar.
9. **La compensación en scoring niega el último asiento de la cadena.** Una reversión no siempre compensa el asiento original: al restaurar una completada hay que negar la *corrección* que la había descontado, no la completada. Se resuelve caminando `corregidoDeId` hasta el final de la cadena y creando un asiento de signo opuesto al último. La misma regla sirve para las dos formas de marca y para quitar → revertir → quitar de nuevo. El ledger nunca se edita: siempre filas nuevas.
10. **Una confirmación (0 pts) no genera evento.** Igual que hoy: no tiene asiento en el ledger, así que revertirla no publica nada.
11. **Solo se revierte con la Sesión abierta**, y solo una marca de esa Sesión. Coherente con la decisión 4 y con que una Sección en `EVALUACION` ya no admite registros.

### Fuera de alcance a propósito

- **Notificar al integrante** cuando le marcan algo en rojo. Queda pendiente para la implementación completa de notificaciones a usuarios (decisión de José): hoy la marca se ve al cargar la pantalla, no llega push.
- **Tareas de equipo** (`alcance = EQUIPO`, ítem 9). El tutor no puede marcarlas en rojo: el reparto a los miembros exigiría compensar N asientos y decidir si el bono del jefe también se pierde. Queda pendiente.

---

## Parte A — `activity-service`: metadatos, cupo y reversión

### Modelo de datos

```prisma
model RegistroActividad {
  // ... campos existentes ...
  // fase-14-12: nota corta y opcional del tutor al marcar en rojo (NO_HIZO) o
  // al quitar una repetición (soft-delete de una COMPLETADA). La ve el integrante.
  motivoTutor         String?
  // fase-14-12: el tutor deshizo su propia marca. NO se limpian eliminadoPorTutorId
  // ni eliminadoEn — la fila conserva la historia completa (quitó y después deshizo).
  revertidoPorTutorId String?
  revertidoEn         DateTime?
}
```

Sin índice nuevo: `@@index([usuarioId, actividadId, sesionId])` ya cubre todas las lecturas de este ítem.

### Reglas

| Dónde | Regla |
|---|---|
| `RegistroService.completar` | Rechaza con 409 `ACTIVIDAD_DENEGADA_POR_TUTOR` si hay un `NO_HIZO` vivo del usuario para esa actividad en la Sesión. El conteo de repeticiones **sigue incluyendo las eliminadas** (comportamiento actual, ahora explícito y con un comentario que dice por qué). |
| `RegistroService.registrarNoHizo` | Acepta `motivo` opcional. Sin cambios en el resto. |
| `RegistroService.eliminarRegistroActividad` | Acepta `motivo` opcional (query param — el `DELETE` no lleva body). |
| `RegistroService.revertirMarca` | **Nuevo.** Ver abajo. |
| `RegistroService.miEstadoHoy` | Suma los campos rojos al DTO. |
| `RegistroService.listarMarcasRojas` | **Nuevo.** Lo que el tutor necesita para deshacer. |

`iniciarCronometro` también rechaza si la actividad está denegada — mismo criterio que el ítem 11: no se arranca un cronómetro que no se va a poder cerrar.

### `POST /activity/registros-actividad/:id/revertir` (TUTOR, ORG_ADMIN)

Body: `{}` (nada). Response: `RegistroActividadDto`.

1. 404 si la fila no existe o es de otra organización (mismo 404 en los dos casos, no revela nada).
2. 409 `MARCA_NO_REVERSIBLE` si la fila no es una marca roja viva: una `COMPLETADA` **no** eliminada, o un `NO_HIZO` ya dado de baja.
3. 409 `NO_HAY_SESION_ABIERTA` si no hay Sesión abierta, o si la marca es de otra Sesión.
4. Según el tipo:
   - `COMPLETADA` eliminada → `eliminado = false`, `revertidoPorTutorId`, `revertidoEn`.
   - `NO_HIZO` → `eliminado = true`, `eliminadoPorTutorId`, `eliminadoEn`, `revertidoPorTutorId`, `revertidoEn` (un `NO_HIZO` no tiene otro estado de baja; se reusa el soft-delete que ya existe).
5. Publica `ActividadRegistroRevertido` si `valorPuntosSnapshot !== 0` (decisión 10).

### `GET /activity/grupos/:grupoId/usuarios/:usuarioId/marcas` (TUTOR, ORG_ADMIN)

Las marcas rojas vivas de ese usuario en la Sesión abierta, más nuevas primero. Sin Sesión abierta devuelve `[]` (no es un error, mismo criterio que `completadas`).

### Lectura para el frontend

`MiEstadoActividadHoyDto` (ítem 8) suma cuatro campos:

```ts
interface MiEstadoActividadHoyDto {
  // ... campos existentes ...
  /** Repeticiones que el tutor quitó en esta Sesión: las barritas rojas. */
  vecesPerdidas: number;
  /** Tope real de hoy: repeticionesMaximasSesion − vecesPerdidas. */
  topeEfectivo: number;
  /** Hay un NO_HIZO vivo del tutor: la actividad quedó denegada. */
  denegada: boolean;
  /** Nota del tutor de la marca más reciente; null si no dejó ninguna. */
  motivoTutor: string | null;
}
```

---

## Parte B — `scoring-service`: compensar una reversión

Evento nuevo `ActividadRegistroRevertido` (routing key `activity.actividad_registro_revertido`), consumido por la cola `scoring.q.registros-actividad` que ya existe.

```ts
interface ActividadRegistroRevertidoPayload {
  registroId: string;
  usuarioId: string;
  revertidoPorTutorId: string;
  /** Qué clase de marca se deshizo (decide de qué asiento arranca la cadena). */
  tipoRegistro: 'COMPLETADA' | 'NO_HIZO';
}
```

Procesamiento (decisión 9): buscar el asiento original por `origenId = registroId` con `tipoOrigen` `ACTIVIDAD_COMPLETADA` o `NO_HIZO` según `tipoRegistro`, caminar `corregidoDeId` hasta el último asiento de la cadena y crear uno nuevo de signo opuesto a ese último, con `tipoOrigen = CORRECCION` y `corregidoDeId` apuntando a él. Nunca se edita ni se borra una fila.

`procesarActividadRegistroEliminado` pasa a usar la **misma** función de cadena. Para el caso de una sola quita el resultado es idéntico al de hoy (la cadena tiene un solo eslabón, el original); la diferencia aparece recién cuando hubo una reversión antes, donde la lógica vieja habría negado el asiento original en vez del último y dejado el puntaje mal.

Verificación numérica de la cadena, con una actividad de 5 puntos:

| Acción | Asiento nuevo | Neto |
|---|---|---|
| El integrante la completa | `+5` (ACTIVIDAD_COMPLETADA) | `+5` |
| El tutor la quita | `−5` (CORRECCION) | `0` |
| El tutor deshace | `+5` (CORRECCION) | `+5` |
| El tutor la quita de nuevo | `−5` (CORRECCION) | `0` |

Y para un "no hizo" de una obligatoria de 15 puntos: `−15` al marcar, `+15` al revertir, neto `0`.

---

## Parte C — Frontend (`app-web`)

**Integrante** (`home-usuario.page.ts`):
- Barrita de repeticiones con **tres** estados por segmento: hecha, perdida (roja, rayada) y libre. Las perdidas se pintan al final. Contador `2 de 3 · 1 perdida`.
- Botón deshabilitado cuando `vecesHechas ≥ topeEfectivo`, no cuando llega al máximo nominal.
- Actividad denegada: contorno rojo en la tarjeta, chip "No hecha", leyenda "Tu tutor marcó que no la hiciste", botón deshabilitado.
- El motivo del tutor, si lo hay, debajo del nombre.
- Una opcional no repetible a la que le quitaron su única completada cae en el mismo tratamiento de tarjeta roja: su tope efectivo es 0.

**Tutor** (`panel-operativo.page.ts`):
- Campo de motivo opcional en «Registrar no hizo» y en el bloque de corrección de completadas.
- Bloque nuevo «Marcas de hoy» con las marcas rojas vivas del usuario elegido y un botón **Deshacer** por fila.

---

## Criterios de aceptación

- [ ] **Default intacto**: sin ninguna marca del tutor, la home del integrante y el registro se comportan exactamente como antes.
- [ ] Opcional con `repeticionesMaximasSesion = 3`: el integrante la completa 3 veces, el tutor quita una → la pantalla muestra 2 verdes + 1 roja, "2 de 3 · 1 perdida" y el botón deshabilitado.
- [ ] Con esa barrita roja viva, un `POST completar` directo a la API devuelve 409 `LIMITE_REPETICIONES_ALCANZADO` (el cupo quemado se valida en el servidor, no solo en el botón).
- [ ] El tutor deshace esa quita → vuelven las 3 verdes, el integrante recupera los puntos y el botón sigue deshabilitado (ya llegó al tope real).
- [ ] Obligatoria `REQUIERE_CONFIRMACION` que el integrante ya confirmó: el tutor marca "no hizo" → la tarjeta queda roja y bloqueada, y un `POST completar` devuelve 409 `ACTIVIDAD_DENEGADA_POR_TUTOR`.
- [ ] El tutor deshace ese "no hizo" → la tarjeta vuelve a la normalidad, el castigo se compensa en el ledger y el integrante puede confirmar de nuevo.
- [ ] El motivo que escribe el tutor llega a `mi-estado-hoy` y se ve en la tarjeta del integrante; sin motivo se muestra la leyenda fija.
- [ ] Revertir una marca de una Sesión ya cerrada devuelve 409; revertir algo que no es una marca roja viva devuelve 409 `MARCA_NO_REVERSIBLE`.
- [ ] Al abrir la Sesión del día siguiente el integrante arranca sin ninguna marca roja.
- [ ] El ledger nunca se edita: cada quita y cada reversión son filas nuevas de `EventoPuntos` con `corregidoDeId`, y la secuencia completar → quitar → deshacer → quitar deja el puntaje en 0 (tabla de la Parte B).
- [ ] Una confirmación (0 pts) revertida no publica evento ni toca el ledger.
- [ ] Aislamiento multi-tenant: un tutor de otra organización recibe 404 al intentar revertir una marca ajena.
- [ ] Las tareas de equipo siguen sin marcas rojas (fuera de alcance declarado).

## Nota para Claude Code

El error fácil acá es tratar esto como cosmético y pintar la barrita roja leyendo `vecesHechas`. El corazón del ítem es el **tope efectivo** y que el servidor sea el que manda: si `completar` no rechaza, el rojo es decoración. El segundo error fácil es la compensación en scoring — negar el asiento *original* al revertir da el número equivocado en cuanto hay más de una corrección encadenada; por eso la regla es negar el **último** eslabón, y por eso la tabla numérica de la Parte B está en la spec y no solo en los tests.
