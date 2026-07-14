# Fase 7 — Scoring Engine (+ registro de actividades/conductas en Activity Catalog)

> Objetivo: el corazón del juego — poder marcar actividades como hechas/no hechas, registrar conductas, y que el puntaje y la zona se calculen siempre en tiempo real a partir de un ledger inmutable. Esta fase toca **dos servicios**: agrega los endpoints de registro a `activity-service` (pospuestos desde Fase 5) y construye `scoring-service` completo. Basado en `proyecto-dorado-plan-desarrollo-general.md` sección 8 y `proyecto-dorado-arquitectura-base.md` secciones 4.3, 4.5, 4.7, 4.8.

## Prerrequisitos
Fase 5 (Activity Catalog CRUD) y Fase 6 (Session/Section) completas. Requiere el endpoint interno `GET /internal/session/grupos/:grupoId/secciones/actual` (agregado a `session-service` en Fase 6) y `GET /internal/identity/grupos/:grupoId/usuarios` (agregado a `identity-service` en Fase 2).

---

## Parte A — `activity-service`: endpoints de registro

### Modelo de datos adicional

```prisma
enum TipoRegistroActividad {
  COMPLETADA
  NO_HIZO
}

model RegistroActividad {
  id                    String                 @id @default(uuid())
  organizacionId        String
  grupoId               String
  usuarioId             String
  actividadId           String
  sesionId              String
  seccionId             String
  tipo                  TipoRegistroActividad
  valorPuntosSnapshot   Int                    // positivo si COMPLETADA, negativo si NO_HIZO
  registradoPorId       String
  registradoPorTipo     String                 // 'TUTOR' | 'USUARIO'
  createdAt             DateTime               @default(now())

  @@index([organizacionId])
  @@index([usuarioId, actividadId, sesionId])
}

model RegistroConducta {
  id                    String   @id @default(uuid())
  organizacionId        String
  grupoId               String
  usuarioId             String
  conductaId            String
  sesionId              String
  seccionId             String
  valorPuntosSnapshot   Int      // positivo si conducta BUENA, negativo si MALA
  registradoPorId       String
  registradoPorTipo     String   // 'TUTOR' | 'USUARIO'
  eliminado             Boolean  @default(false)
  eliminadoPorTutorId   String?
  eliminadoEn           DateTime?
  createdAt             DateTime @default(now())

  @@index([organizacionId])
  @@index([usuarioId, conductaId, sesionId])
}

model CronometroActivo {
  id            String   @id @default(uuid())
  usuarioId     String
  actividadId   String
  sesionId      String
  iniciadoEn    DateTime @default(now())

  @@unique([usuarioId, actividadId, sesionId])
}
```

### Endpoints nuevos (bajo `/activity/*`)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/activity/actividades/:id/iniciar-cronometro` | USUARIO (self) | Solo si `actividad.tipoLimiteTiempo = CRONOMETRO`. Crea/reemplaza fila en `CronometroActivo`. |
| POST | `/activity/actividades/:id/completar` | USUARIO (self), TUTOR (`{ usuarioId }` en el body) | Ver validaciones abajo. Publica `ActividadCompletada`. |
| POST | `/activity/actividades/:id/no-hizo` | TUTOR asignado, ORG_ADMIN | `{ usuarioId }`. Solo si `actividad.tipoPuntaje = OBLIGATORIA`. Publica `NoHizoRegistrado`. |
| POST | `/activity/conductas/:id/registrar` | USUARIO (self, solo si `permiteAutoreporte && tipo=MALA`), TUTOR asignado, ORG_ADMIN | `{ usuarioId? }` (obligatorio si TUTOR, ignorado/forzado a self si USUARIO). Publica `ConductaRegistrada`. |
| DELETE | `/activity/registros-conducta/:id` | TUTOR asignado, ORG_ADMIN | Regla `arquitectura-base.md` 4.2: "los usuarios pueden autoreportar mala conducta pero no eliminarla; solo un tutor puede agregar o quitar". Marca `eliminado=true`. Publica `ConductaRegistroEliminado`. |

### Validaciones de `completar`

1. `actividad.estado = ACTIVA`, si no → 404.
2. `actividad.tipoPuntaje = OPCIONAL` — si es `OBLIGATORIA`, 400 (`code: 'OBLIGATORIA_NO_SE_COMPLETA'`; las obligatorias solo se marcan cuando NO se hicieron, vía `no-hizo`. No hacer nada es el estado esperado de "cumplida").
3. Resolver Sesión/Sección actual vía `GET /internal/session/grupos/:grupoId/secciones/actual` (interno). Si no hay Sección `ABIERTA` con Sesión `ABIERTA`, 409 (`code: 'NO_HAY_SESION_ABIERTA'`).
4. Contar `RegistroActividad` `tipo=COMPLETADA` de ese usuario+actividad+sesión actual; si `>= repeticionesMaximasSesion`, 409 (`code: 'LIMITE_REPETICIONES_ALCANZADO'`).
5. Si `tipoLimiteTiempo = DEADLINE`: comparar hora actual (timezone del Grupo) contra `deadlineHora` del día de la Sesión; si pasó, 409 (`code: 'DEADLINE_VENCIDO'`).
6. Si `tipoLimiteTiempo = CRONOMETRO`: debe existir fila en `CronometroActivo` para ese usuario+actividad+sesión, y `now - iniciadoEn <= duracionCronometroMinutos`; si no, 409 (`code: 'CRONOMETRO_VENCIDO'` o `'CRONOMETRO_NO_INICIADO'`). Al completar con éxito, borrar la fila de `CronometroActivo`.
7. Crear `RegistroActividad`, publicar `ActividadCompletada` (payload en `event-catalog.md`).

### Validaciones de `no-hizo`

- `actividad.tipoPuntaje = OBLIGATORIA` (400 si no).
- Requiere Sesión `ABIERTA` (misma regla que arriba).
- **No hay límite de repeticiones** — un Tutor puede registrar "no hizo" más de una vez para la misma actividad/usuario/sesión si corresponde (cada registro resta independientemente, regla explícita del proyecto original).
- Solo lo puede registrar un Tutor (nunca autoreporte de Usuario).

### Validaciones de `registrar` conducta

- Si `USUARIO`: solo si `conducta.tipo = MALA` y `conducta.permiteAutoreporte = true`; el `usuarioId` es siempre el propio (ignorar cualquier valor recibido en el body).
- Si `TUTOR`/`ORG_ADMIN`: puede registrar cualquier conducta (`BUENA` o `MALA`) para cualquier usuario del grupo.
- Requiere Sesión `ABIERTA`.
- Signo: `+valorPuntos` si `BUENA`, `-valorPuntos` si `MALA`.

## Eventos publicados por `activity-service` (agregado en esta fase)

`ActividadCompletada`, `NoHizoRegistrado`, `ConductaRegistrada`, `ConductaRegistroEliminado`.

---

## Parte B — `scoring-service` (nuevo, base `scoring_db`)

### Modelo de datos

```prisma
enum TipoOrigenPuntos {
  ACTIVIDAD_COMPLETADA
  NO_HIZO
  CONDUCTA
  CORRECCION
}

model EventoPuntos {
  id                   String           @id @default(uuid())
  organizacionId       String
  grupoId              String
  usuarioId            String
  seccionId            String
  sesionId             String
  tipoOrigen           TipoOrigenPuntos
  origenId             String           // id de Actividad, Conducta, o del EventoPuntos original si es CORRECCION
  puntosSnapshot        Int              // con signo ya aplicado
  registradoPorId       String
  registradoPorTipo     String           // 'TUTOR' | 'USUARIO' | 'SYSTEM'
  corregidoDeId          String?          // referencia a otro EventoPuntos si esto es una corrección explícita
  motivoCorreccion       String?
  createdAt              DateTime         @default(now())
  // SIN updatedAt: este modelo nunca se edita, solo se agregan filas nuevas.

  @@index([organizacionId])
  @@index([usuarioId, seccionId])
}

model UmbralZona {
  id             String   @id @default(uuid())
  organizacionId String
  grupoId        String
  nombreZona     String
  orden          Int      // 1 = más bajo
  puntosMin      Int      // inclusive
  puntosMax      Int?     // inclusive, null = sin tope (zona más alta)
  colorHex       String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([grupoId, orden])
  @@index([grupoId])
}

model DescalificacionSeccion {
  id                      String   @id @default(uuid())
  organizacionId          String
  grupoId                 String
  usuarioId               String
  seccionId               String
  motivo                  String
  registradaPorTutorId    String
  createdAt               DateTime @default(now())

  @@unique([usuarioId, seccionId])
}

model ResultadoSeccion {
  id             String   @id @default(uuid())
  organizacionId String
  grupoId        String
  usuarioId      String
  seccionId      String
  puntajeTotal   Int
  umbralZonaId   String?  // null si descalificado
  nombreZona     String?  // snapshot del nombre, por si el UmbralZona se edita después
  descalificado  Boolean  @default(false)
  calculadoEn    DateTime @default(now())

  @@unique([usuarioId, seccionId])
}

model EventoProcesado {
  eventId     String   @id
  consumidor  String
  procesadoEn DateTime @default(now())
}
```

`ResultadoSeccion` es un snapshot inmutable escrito una única vez, al momento de la evaluación final de la Sección (consumo de `SeccionEntroEvaluacion`). Existe para que el historial de resultados no cambie si después se edita un `UmbralZona` — y para que la consulta de "resultados de la Sección pasada" no tenga que reconstruir el ledger completo cada vez.

### Eventos consumidos

| Evento | Origen | Efecto |
|---|---|---|
| `ActividadCompletada` | activity-service | Crea `EventoPuntos(tipoOrigen=ACTIVIDAD_COMPLETADA, puntosSnapshot=+valorPuntosSnapshot)`. |
| `NoHizoRegistrado` | activity-service | Crea `EventoPuntos(tipoOrigen=NO_HIZO, puntosSnapshot=valorPuntosSnapshot)` (ya viene negativo). |
| `ConductaRegistrada` | activity-service | Crea `EventoPuntos(tipoOrigen=CONDUCTA, puntosSnapshot=valorPuntosSnapshot)`. |
| `ConductaRegistroEliminado` | activity-service | Busca el `EventoPuntos` original por `origenId = registroId`; crea uno nuevo de compensación: `puntosSnapshot = -original.puntosSnapshot`, `corregidoDeId = original.id`, `registradoPorTipo='SYSTEM'`. **Nunca borra ni edita la fila original** (ledger inmutable). |
| `SesionCerrada` | session-service | Si `ConfiguracionSesion.evaluarUmbralesEn = CADA_SESION` (consultado vía `GET /internal/session/grupos/:grupoId/configuracion`, agregar este endpoint interno a session-service si no existe): recalcula puntaje+zona de cada usuario del grupo y publica `ZonaAlcanzada` con `esEvaluacionFinal=false`. **No** escribe `ResultadoSeccion` (ese es solo para la evaluación final). |
| `SeccionEntroEvaluacion` | session-service | Evaluación final: para cada `UsuarioDto` `ACTIVO` del grupo (`GET /internal/identity/grupos/:grupoId/usuarios`), calcula `puntajeTotal` (suma de `EventoPuntos.puntosSnapshot` para ese usuario+sección), determina `UmbralZona` (o `descalificado=true` si existe `DescalificacionSeccion` para ese usuario+sección), escribe `ResultadoSeccion`, publica `ZonaAlcanzada` (`esEvaluacionFinal=true`) por cada usuario no descalificado. |

Todos idempotentes vía `EventoProcesado`.

### Cálculo de puntaje y zona (regla central, `arquitectura-base.md` 4.7)

```
puntajeTotal(usuarioId, seccionId) = SUM(EventoPuntos.puntosSnapshot WHERE usuarioId AND seccionId)
zona(puntajeTotal, grupoId) = el UmbralZona de ese grupo donde puntosMin <= puntajeTotal AND (puntosMax IS NULL OR puntajeTotal <= puntosMax)
```

Nunca se persiste `puntajeTotal` como campo mutable en ningún lado excepto el snapshot inmutable `ResultadoSeccion` (que se escribe una sola vez, no se recalcula ni actualiza después).

### Endpoints

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/scoring/usuarios/:usuarioId/secciones/:seccionId/puntaje` | el propio Usuario, TUTOR del grupo, ORG_ADMIN | Si existe `ResultadoSeccion`, lo devuelve tal cual (snapshot). Si no (Sección todavía `ABIERTA`), calcula en vivo desde el ledger — es una vista "preview", puede cambiar. |
| GET | `/scoring/grupos/:grupoId/secciones/:seccionId/puntajes` | TUTOR asignado, ORG_ADMIN | Igual que arriba pero para todos los usuarios del grupo, ordenado de mayor a menor puntaje. Base del panel de evaluación de Fase 10. |
| POST | `/scoring/grupos/:grupoId/umbrales` | TUTOR asignado, ORG_ADMIN | Crea `UmbralZona`. Valida que los rangos de todos los umbrales del grupo no se superpongan y sean contiguos por `orden` (sin huecos). |
| GET | `/scoring/grupos/:grupoId/umbrales` | cualquier rol del grupo | Lista ordenada por `orden`. |
| PATCH | `/scoring/umbrales/:id` | TUTOR asignado, ORG_ADMIN | Edita. Mismo chequeo de solapamiento. No afecta `ResultadoSeccion` ya escritos (snapshot). |
| DELETE | `/scoring/umbrales/:id` | TUTOR asignado, ORG_ADMIN | Solo si no rompe la contigüidad de los restantes (o se borra y se re-crean todos — decisión de UI, no de API). |
| POST | `/scoring/secciones/:seccionId/usuarios/:usuarioId/descalificar` | TUTOR asignado, ORG_ADMIN | `{ motivo }`. Crea `DescalificacionSeccion` (única por usuario+sección). Publica `UsuarioDescalificado`. Alcance: solo esa Sección (`arquitectura-base.md` 4.5) — no requiere reincorporación manual, en la siguiente Sección el usuario participa normal porque no hay fila para esa nueva `seccionId`. |
| GET | `/scoring/secciones/:seccionId/descalificaciones` | TUTOR asignado, ORG_ADMIN | Lista. |
| POST | `/scoring/eventos-puntos/:id/corregir` | TUTOR asignado, ORG_ADMIN | `{ motivo, puntosAjuste }`. Crea un `EventoPuntos` nuevo (`tipoOrigen=CORRECCION`, `puntosSnapshot=puntosAjuste`, `corregidoDeId=id original`, `motivoCorreccion`). **Se permite incluso si la Sección ya está `CERRADA`** — la regla de `arquitectura-base.md` 4.7/4.3 no prohíbe corregir después de cerrado, prohíbe que la corrección sea silenciosa. Si la Sección ya tiene `ResultadoSeccion` escrito, este endpoint **no lo actualiza automáticamente** (el snapshot histórico se mantiene; la corrección queda visible en el detalle del ledger pero no cambia el resultado ya distribuido — evita reabrir recompensas ya entregadas). |

### Endpoints internos

| Método | Ruta | Consumido por | Descripción |
|---|---|---|---|
| GET | `/internal/scoring/umbrales/:id` | Rewards (Fase 8) | `UmbralZonaDto` puntual, para validar que una Recompensa referencia una zona real del grupo. |
| GET | `/internal/scoring/usuarios/:usuarioId/secciones/:seccionId/resultado` | Rewards (Fase 8) | `ResultadoSeccion` puntual — Rewards lo usa para saber a qué zona quedó habilitado un usuario y si está descalificado. 404 si todavía no se evaluó esa Sección. |
| GET | `/internal/health` | Gateway | Health check. |

## Reglas de negocio clave (no negociables, ya decididas en la arquitectura base)

- El puntaje **nunca** es un campo `UPDATE`. Toda esta fase gira en torno a sumar filas de `EventoPuntos`, nunca editarlas.
- La descalificación es siempre manual (nunca automática por cruzar un umbral) y su alcance es únicamente la Sección en curso.
- Correcciones posteriores a un cierre quedan registradas explícitamente (`tipoOrigen=CORRECCION`, `corregidoDeId` seteado) — nunca como edición silenciosa de la fila original.

## Criterios de aceptación de esta fase

- [ ] Flujo completo: completar 2 actividades opcionales + registrar 1 conducta mala (autoreportada) + un Tutor registra 1 "no hizo" de una obligatoria → `GET /scoring/usuarios/:id/secciones/:id/puntaje` devuelve la suma correcta.
- [ ] Editar el `valorPuntos` de una Actividad después de tener registros no cambia el puntaje de los registros ya hechos (verificar snapshot).
- [ ] Al forzar el cierre de una Sección (Fase 6) con `evaluarUmbralesEn=SOLO_AL_CIERRE_SECCION`, se genera un `ResultadoSeccion` por cada usuario `ACTIVO` del grupo y se publica `ZonaAlcanzada esEvaluacionFinal=true` por cada uno no descalificado.
- [ ] Un usuario descalificado en la Sección N no aparece descalificado en la Sección N+1 sin ninguna acción manual adicional.
- [ ] `POST .../corregir` sobre un `EventoPuntos` de una Sección ya `CERRADA` funciona y queda auditable, pero no altera el `ResultadoSeccion` ya escrito.
- [ ] Repetir el mismo evento de RabbitMQ dos veces (simular reentrega) no duplica el `EventoPuntos` (verificar tabla `EventoProcesado`).

## Nota para Claude Code

Si en algún momento sentís la tentación de agregar una columna `puntajeActual` a `Usuario` o a cualquier tabla para "no tener que sumar cada vez", pará — es exactamente la regla que este proyecto prohíbe explícitamente. El costo de recalcular en cada lectura es aceptado a propósito.
