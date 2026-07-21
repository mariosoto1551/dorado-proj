# Fase 14 · Ítem 8 — Confirmación de obligatorias por el usuario + estado de hoy (barrita de repeticiones)

> Sub-spec detallada del ítem 8 de `fase-14-post-mvp.md`. **No ejecutar hasta que Fase 13 esté estable con uso real** (misma regla que el resto de Fase 14). Este archivo es la especificación decidida con José (2026-07-21); las desviaciones de implementación se registran en `docs/progreso/`, no acá.

## Prerrequisitos
Fases 5, 6 y 7 completas (catálogo, sesión/sección, scoring + registro). Requiere los eventos `SesionCerrada` (session-service, Fase 6) y `NoHizoRegistrado` (activity-service, Fase 7), y el endpoint interno `GET /internal/identity/grupos/:grupoId/usuarios` (Fase 2) — todos ya existen.

## Motivación (el problema que resuelve)

Hoy una actividad `OBLIGATORIA` se **asume cumplida**: no hay registro positivo, no hay castigo automático, y solo un Tutor puede marcar `no-hizo` a mano para restar puntos (ver `fase-07`, validación #2 de `completar`: `OBLIGATORIA_NO_SE_COMPLETA`). José pidió el modelo inverso opt-in ("B2"): que el **Usuario pueda confirmar** que hizo la obligatoria, y que **si no la confirma, se le descuente automáticamente al cierre de la sesión**. El default de castigo es **configurable por actividad**.

Se aprovecha el mismo trabajo para cerrar una deuda técnica de Fase 10: la home del usuario hoy usa un `Set` local optimista (`completadas`) que se resetea al recargar y **no soporta actividades repetibles** (`repeticionesMaximasSesion > 1`) — tras una repetición esconde el botón. Este ítem expone el estado real del servidor y habilita la **barrita "X de N" repeticiones**.

## Decisiones de diseño (cerradas con José)

1. **Configuración por actividad**, no global — se setea en la misma pantalla donde el Tutor crea/edita la actividad (igual que `repeticionesMaximasSesion`).
2. **Confirmar una obligatoria vale 0 puntos** — solo evita el descuento, no otorga puntos (hacer lo obligatorio es el deber, no un bonus).
3. **El castigo automático corre al cerrar la SESIÓN (diario)**, no al cerrar la sección — se descuentan las obligatorias no confirmadas de ese día.

---

## Parte A — `activity-service`: modelo de datos

### Nuevo enum + campo en `Actividad`

```prisma
enum ComportamientoAlCierre {
  ASUME_HECHA            // comportamiento actual: sin registro positivo, sin castigo automático
  REQUIERE_CONFIRMACION  // el Usuario debe confirmar; si no, no-hizo automático al cerrar la sesión
}

model Actividad {
  // ... campos existentes ...
  comportamientoAlCierre ComportamientoAlCierre @default(ASUME_HECHA)
}
```

- **Solo tiene sentido si `tipoPuntaje = OBLIGATORIA`.** Para `OPCIONAL` se ignora (validación de aplicación: al crear/editar, si `tipoPuntaje = OPCIONAL` se fuerza `ASUME_HECHA`). El `@default(ASUME_HECHA)` garantiza que **toda actividad ya existente conserva el comportamiento actual** tras la migración — cambio retro-compatible.

### `EventoProcesado` (idempotencia de consumidor) — NUEVO en este servicio

```prisma
model EventoProcesado {
  eventId     String   @id
  consumidor  String
  procesadoEn DateTime @default(now())
}
```

`activity-service` hoy **solo publica** eventos; este ítem lo convierte también en **consumidor** (ver Parte C). Misma tabla y patrón que `scoring-service` (Fase 7).

### `RegistroActividad` — sin cambios de schema

La confirmación del Usuario y el no-hizo automático reutilizan el modelo existente:
- **Confirmación**: `tipo = COMPLETADA`, `valorPuntosSnapshot = 0`, `registradoPorTipo = 'USUARIO'`.
- **No-hizo automático**: `tipo = NO_HIZO`, `valorPuntosSnapshot = -valorPuntos` (snapshot al cierre), `registradoPorId = 'SYSTEM'`, `registradoPorTipo = 'SYSTEM'`.

---

## Parte B — `activity-service`: endpoints

### `POST /activity/actividades/:id/completar` — extendido

Se agrega una rama para el Usuario confirmando una obligatoria confirmable. La lógica de `OPCIONAL` **no cambia**.

Validaciones nuevas / modificadas:
1. Si `tipoPuntaje = OPCIONAL` → comportamiento actual intacto (suma `+valorPuntos`, publica `ActividadCompletada`).
2. Si `tipoPuntaje = OBLIGATORIA` **y** `comportamientoAlCierre = ASUME_HECHA` → **sigue devolviendo 400 `OBLIGATORIA_NO_SE_COMPLETA`** (no cambia).
3. Si `tipoPuntaje = OBLIGATORIA` **y** `comportamientoAlCierre = REQUIERE_CONFIRMACION` → **confirmación**:
   - Requiere Sesión `ABIERTA` (misma resolución vía `GET /internal/session/grupos/:grupoId/secciones/actual`; 409 `NO_HAY_SESION_ABIERTA` si no).
   - Respeta `repeticionesMaximasSesion` (una obligatoria normal es 1): si ya hay una confirmación de ese usuario+actividad+sesión, 409 `LIMITE_REPETICIONES_ALCANZADO`.
   - Respeta `DEADLINE`/`CRONOMETRO` si aplica (mismas reglas que `OPCIONAL`).
   - Crea `RegistroActividad(tipo=COMPLETADA, valorPuntosSnapshot=0)`.
   - **No publica ningún evento de dominio** (0 puntos → no toca el ledger de scoring). La confirmación vive solo en `activity-service` y la lee el consumidor de cierre para saltear el castigo.

> Decisión de diseño: se reutiliza `completar` en vez de crear `POST .../confirmar` para no ampliar la superficie del Gateway ni del frontend — el botón del usuario es el mismo ("Ya lo hice"). La diferencia de semántica (0 pts, sin evento) queda encapsulada en el servicio.

### `GET /activity/grupos/:grupoId/mi-estado-hoy` — NUEVO

| Rol | Descripción |
|---|---|
| USUARIO del grupo (self) | Estado de cada actividad `ACTIVA` del grupo **en la Sesión abierta actual**, para pintar la home. |

- Resuelve la Sesión/Sección actual vía el interno de session (`.../secciones/actual`). Si no hay Sesión `ABIERTA`, devuelve `{ sesionId: null, actividades: [] }`.
- Por cada actividad devuelve un `MiEstadoActividadHoyDto`:

```ts
interface MiEstadoActividadHoyDto {
  actividadId: string;
  tipoPuntaje: 'OPCIONAL' | 'OBLIGATORIA';
  comportamientoAlCierre: 'ASUME_HECHA' | 'REQUIERE_CONFIRMACION';
  repeticionesMaximasSesion: number;
  vecesHechas: number;      // count RegistroActividad tipo=COMPLETADA del usuario+actividad+sesión actual
  confirmada: boolean;      // obligatoria confirmable: vecesHechas > 0. Para OPCIONAL/ASUME_HECHA: irrelevante (false)
}
```

- `vecesHechas` es el conteo real del servidor (el mismo número que ya calcula la validación #4 de `completar`). Sirve para la **barrita `vecesHechas / repeticionesMaximasSesion`** de las opcionales y para el estado ✓/pendiente de las obligatorias confirmables.

### `POST`/`PATCH` de actividades — validación del nuevo campo

- Aceptan `comportamientoAlCierre`.
- Validación: `REQUIERE_CONFIRMACION` solo se permite con `tipoPuntaje = OBLIGATORIA`; con `OPCIONAL` se fuerza/valida `ASUME_HECHA` (400 si el cliente manda `REQUIERE_CONFIRMACION` para una opcional).
- `PATCH` **no afecta registros ya existentes** (misma regla de no-retroactividad de Fase 7).

---

## Parte C — `activity-service`: consumidor de `SesionCerrada` (el castigo automático)

Nuevo consumidor RabbitMQ (cola cuórum + `@RabbitSubscribe`, patrón de `scoring-service`), suscrito a routing key `session.sesion_cerrada`.

Payload (`SesionEventoPayload`): `{ sesionId, seccionId, organizacionId, grupoId, numero }`.

Handler (idempotente vía `EventoProcesado`, `consumidor = 'activity-service'`):

1. Si el `eventId` ya está en `EventoProcesado` → no-op (reentrega).
2. Listar `Actividad` `ACTIVA` del `grupoId` con `tipoPuntaje = OBLIGATORIA` **y** `comportamientoAlCierre = REQUIERE_CONFIRMACION`.
3. Listar `Usuario` `ACTIVO` del grupo (`GET /internal/identity/grupos/:grupoId/usuarios`).
4. Por cada par (usuario × obligatoria confirmable), mirar `RegistroActividad` de ese usuario+actividad+**esta** sesión:
   - Si existe una `COMPLETADA` (el usuario la confirmó) → **saltear** (cumplida).
   - Si existe un `NO_HIZO` (un Tutor ya lo marcó a mano) → **saltear** (ya penalizado, no duplicar).
   - Si no hay ninguno → crear `RegistroActividad(tipo=NO_HIZO, valorPuntosSnapshot = -actividad.valorPuntos, registradoPorTipo='SYSTEM')` y publicar `NoHizoRegistrado` → scoring resta.
5. Registrar el `eventId` en `EventoProcesado` **en la misma transacción** que los registros creados.

Notas:
- **Snapshot al cierre**: la penalización usa `valorPuntos` de la actividad al momento del cierre (si el Tutor lo editó durante la semana, vale el valor vigente al cerrar — consistente con el resto del scoring, que snapshotea al registrar).
- **Tenant**: el consumidor corre sin JWT (`SYSTEM`); usa `organizacionId`/`grupoId` del payload y debe **saltear el filtro automático de tenant** (ALS) igual que scoring en sus consumidores — o setear un contexto de sistema. Verificar que el `tenantScopeMiddleware`/extension de Prisma no bloquee escrituras del consumidor.
- **Descalificados**: no se hace ninguna excepción — se generan los no-hizo igual; la descalificación se resuelve en la evaluación de la sección (scoring), no acá.
- **Orden con la evaluación de sección**: como el castigo corre en `SesionCerrada` (diario) y la evaluación final corre en `SeccionEntroEvaluacion` (fin de semana), los `EventoPuntos` de no-hizo automáticos ya están en el ledger antes de la evaluación final. Para `evaluarUmbralesEn = CADA_SESION`, ojo: `scoring` consume el **mismo** `SesionCerrada`; ambos consumidores son independientes, pero si el no-hizo automático debe contar en la evaluación por-sesión, hay que asegurar que el `NoHizoRegistrado` se procese antes que scoring evalúe esa sesión. **Para Destino:Dorado (`SOLO_AL_CIERRE_SECCION`) esto no aplica** y no hay carrera. Si algún grupo usa `CADA_SESION`, documentar/resolver el ordenamiento en la implementación (posible: scoring evalúa por-sesión con un pequeño retraso, o el no-hizo automático se dispara en `SesionCerrada` y la evaluación por-sesión en un evento posterior). Señalado como riesgo a decidir al implementar, no ahora.

---

## Parte D — Frontend (`app-web`, home del usuario + form del tutor)

### Home del usuario (`home-usuario.page.ts`)

- Reemplazar el `Set` local optimista (`completadas`) por el estado real de `GET /activity/grupos/:grupoId/mi-estado-hoy` (se recarga tras cada acción). Cierra la deuda técnica de Fase 10.
- **Opcional repetible** (`repeticionesMaximasSesion > 1`): barrita `vecesHechas / repeticionesMaximasSesion` debajo del ítem; el botón "Completar" se deshabilita al llegar al tope (hoy se esconde tras la primera — bug). Diseño de la barrita: mostrar a José una propuesta antes (preferencia de UI registrada).
- **Obligatoria `REQUIERE_CONFIRMACION`**: botón "Ya lo hice" → `completar`; estado ✓ (confirmada) / "pendiente".
- **Obligatoria `ASUME_HECHA`**: badge informativo "Obligatoria" **sin botón** (arregla el bug latente actual: hoy la home muestra "Completar" para toda obligatoria y tocarlo devuelve 400).

### Form del tutor (`actividades.page.ts`)

- Cuando `tipoPuntaje = OBLIGATORIA`, mostrar un toggle "¿Requiere que el usuario confirme?" → `comportamientoAlCierre`. Oculto/deshabilitado para `OPCIONAL`.

---

## Tipos compartidos (`libs/shared-types`)

- `ActividadDto`: agregar `comportamientoAlCierre: 'ASUME_HECHA' | 'REQUIERE_CONFIRMACION'`.
- Nuevo `MiEstadoActividadHoyDto` (arriba) + su response `MiEstadoHoyDto { sesionId: string | null; actividades: MiEstadoActividadHoyDto[] }`.
- Enum `ComportamientoAlCierre`.

## Eventos

- **Ningún evento nuevo.** La confirmación no publica nada (0 pts). El castigo automático reutiliza `NoHizoRegistrado` (ya existente, ya consumido por scoring/notification).
- `activity-service` pasa a **consumir** `SesionCerrada` (antes no consumía nada).

## Criterios de aceptación

- [ ] Una actividad `OPCIONAL` con `repeticionesMaximasSesion = 3`: se puede completar 3 veces desde la home; la barrita avanza 1/3 → 3/3; al llegar a 3/3 el botón queda deshabilitado; el 4º intento da 409 `LIMITE_REPETICIONES_ALCANZADO`. El estado sobrevive a recargar la página (viene de `mi-estado-hoy`, no de un `Set` local).
- [ ] `completar` sobre una `OBLIGATORIA` con `ASUME_HECHA` sigue devolviendo 400 `OBLIGATORIA_NO_SE_COMPLETA` (no se rompió el comportamiento existente).
- [ ] `completar` sobre una `OBLIGATORIA` con `REQUIERE_CONFIRMACION` crea la confirmación (0 pts, sin evento de scoring); el puntaje del usuario **no cambia**.
- [ ] Al cerrar la sesión (forzar-cierre de Fase 6 o cron): por cada obligatoria `REQUIERE_CONFIRMACION` **no confirmada**, aparece un `EventoPuntos` de no-hizo (`-valorPuntos`, `registradoPorTipo=SYSTEM`) y el puntaje baja; las **confirmadas** no reciben descuento; las que un Tutor ya marcó no-hizo **no se duplican**.
- [ ] Reentregar el mismo `SesionCerrada` dos veces no duplica los no-hizo automáticos (verificar `EventoProcesado` de `activity-service`).
- [ ] Migración: una actividad obligatoria preexistente queda en `ASUME_HECHA` y se comporta exactamente como antes (sin castigo automático).
- [ ] Aislamiento multi-tenant: el consumidor solo genera no-hizo para usuarios/actividades del grupo del evento; no filtra de más ni de menos.

## Nota para Claude Code

Este ítem introduce el **primer consumidor de eventos en `activity-service`** — hasta ahora era productor puro. Copiar el patrón de `scoring-service` (cola cuórum declarada `durable`, `EventoProcesado`, publicar-después-del-commit) y revisar que el filtro de tenant por ALS no bloquee las escrituras `SYSTEM` del consumidor (mismo cuidado que scoring). No implementar hasta que Fase 13 esté estable (regla de Fase 14).
