# Fase 8 — Rewards Service

> Objetivo: catálogo de recompensas por zona, mecánicas de selección y azar, seguimiento de entrega. Basado en `proyecto-dorado-plan-desarrollo-general.md` sección 9 y `proyecto-dorado-arquitectura-base.md` sección 4.4.

## Prerrequisitos
Fase 7 completa (Scoring publica `ZonaAlcanzada` con `esEvaluacionFinal` y expone `/internal/scoring/...`).

## Modelo de datos (`rewards-service`, base `rewards_db`)

```prisma
enum EstadoCatalogo {
  ACTIVA
  ARCHIVADA
}

enum MecanicaRecompensa {
  SELECCION
  AZAR
}

enum EstadoCanje {
  PENDIENTE_ENTREGA
  ENTREGADA
}

model Recompensa {
  id                  String         @id @default(uuid())
  organizacionId      String
  grupoId             String
  umbralZonaId        String         // referencia a UmbralZona de scoring-service, solo ID, sin join
  nombreZonaSnapshot  String         // copiado al crear/editar, para no depender de una llamada en cada lectura
  nombre              String
  descripcion         String?
  imagenUrl           String?        // uso de white-label (Pro) se aplica en frontend, ver nota abajo
  permiteSeleccion    Boolean        @default(false)
  permiteAzar         Boolean        @default(false)
  estado              EstadoCatalogo @default(ACTIVA)
  creadaPorTutorId    String
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt

  @@index([organizacionId])
  @@index([grupoId])
  @@index([umbralZonaId])
}

model CanjeRecompensa {
  id                    String              @id @default(uuid())
  organizacionId        String
  grupoId               String
  usuarioId             String
  seccionId             String
  recompensaId          String
  mecanica              MecanicaRecompensa
  estado                EstadoCanje         @default(PENDIENTE_ENTREGA)
  entregadaPorTutorId   String?
  entregadaEn           DateTime?
  createdAt             DateTime            @default(now())

  @@unique([usuarioId, seccionId]) // un canje por usuario por Sección en el MVP
  @@index([organizacionId])
}

model EventoProcesado {
  eventId     String   @id
  consumidor  String
  procesadoEn DateTime @default(now())
}
```

> Nota white-label: el campo `imagenUrl` (y a futuro logo/colores custom) existe desde el MVP, pero **su aplicación visual solo se activa si `entitlements.whiteLabel = true`** (chequeo hecho en el frontend, Fase 10, contra el `plan` embebido en el JWT). El backend de Rewards no necesita lógica de gating acá — solo guarda el dato.

## Evento consumido

- `ZonaAlcanzada` (de Scoring, **solo cuando `esEvaluacionFinal = true`** — descartar explícitamente los de `esEvaluacionFinal = false`, esos son solo informativos). No dispara ninguna escritura en Rewards por sí solo: la elegibilidad se calcula en el momento en que el usuario/tutor consulta o intenta canjear (vía llamada síncrona a Scoring), no se precomputa. Este evento solo se usa para que Notification avise "ya podés elegir tu recompensa" — Rewards en sí no necesita persistir nada al consumirlo, pero **sí debe consumirlo e idempotentemente ignorarlo** para dejar la infraestructura de consumo lista (`EventoProcesado`), por si en el futuro se decide precomputar.

## Endpoints

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/rewards/grupos/:grupoId/recompensas` | TUTOR asignado, ORG_ADMIN | Valida `umbralZonaId` llamando `GET /internal/scoring/umbrales/:id`; si no existe o no pertenece al mismo `grupoId`, 400. Copia `nombreZonaSnapshot`. |
| GET | `/rewards/grupos/:grupoId/recompensas` | cualquier rol del grupo | Lista, filtro `?umbralZonaId=&estado=`. |
| PATCH | `/rewards/recompensas/:id` | TUTOR asignado, ORG_ADMIN | Edita. |
| DELETE | `/rewards/recompensas/:id` | TUTOR asignado, ORG_ADMIN | Soft delete (`ARCHIVADA`). |
| GET | `/rewards/usuarios/:usuarioId/secciones/:seccionId/elegibles` | el propio Usuario, TUTOR del grupo, ORG_ADMIN | Llama `GET /internal/scoring/usuarios/:usuarioId/secciones/:seccionId/resultado`; si `descalificado=true` o no existe todavía (Sección no evaluada), devuelve lista vacía con motivo. Si existe, devuelve las `Recompensa ACTIVA` de ese `umbralZonaId`, separadas en `disponiblesSeleccion` y `disponiblesAzar`. |
| POST | `/rewards/usuarios/:usuarioId/secciones/:seccionId/seleccionar` | el propio Usuario, TUTOR (en su nombre) | `{ recompensaId }`. Falla si ya existe `CanjeRecompensa` para ese usuario+sección (409), si la recompensa no está en la lista de elegibles, o si `permiteSeleccion=false`. Crea `CanjeRecompensa(mecanica=SELECCION)`. Publica `RecompensaCanjeada`. |
| POST | `/rewards/usuarios/:usuarioId/secciones/:seccionId/sortear` | el propio Usuario, TUTOR (en su nombre) | Sin body. Falla si ya existe canje previo, o si no hay recompensas elegibles con `permiteAzar=true`. Elige una al azar (`Math.random()` sobre el array de elegibles — no hace falta ponderación en el MVP). Crea `CanjeRecompensa(mecanica=AZAR)`. Publica `RecompensaCanjeada`. |
| GET | `/rewards/grupos/:grupoId/secciones/:seccionId/canjes` | TUTOR asignado, ORG_ADMIN | Todos los canjes de la Sección, para el panel de evaluación (Fase 10, vista "domingo"). |
| PATCH | `/rewards/canjes/:id/entregar` | TUTOR asignado, ORG_ADMIN | Marca `estado=ENTREGADA`, `entregadaPorTutorId`, `entregadaEn`. |

## Eventos publicados

`RecompensaCanjeada`.

## Reglas de negocio

- Un usuario descalificado en una Sección (`DescalificacionSeccion` en Scoring) nunca aparece con recompensas elegibles para esa Sección — el endpoint de elegibles debe chequear esto explícitamente vía el `resultado` de Scoring, no asumir que "sin `UmbralZona`" ya lo cubre.
- Máximo un `CanjeRecompensa` por usuario por Sección (constraint `@@unique`), sin importar la mecánica.
- No se puede canjear (ni seleccionar ni sortear) mientras la Sección está `ABIERTA` — solo aplica una vez que Scoring generó el `ResultadoSeccion` (Sección en `EVALUACION` o `CERRADA`). El endpoint de elegibles lo garantiza porque `/internal/scoring/.../resultado` devuelve 404 hasta ese momento.

## Criterios de aceptación de esta fase

- [ ] Un usuario que llega a zona Dorado en una Sección de prueba ve en `elegibles` solo las recompensas configuradas para esa zona.
- [ ] Seleccionar una recompensa dos veces en la misma Sección da 409 en el segundo intento.
- [ ] Un usuario descalificado no puede canjear nada en esa Sección (403 o lista vacía explícita, no un error genérico).
- [ ] El sorteo (`/sortear`) nunca devuelve una recompensa que no tenga `permiteAzar=true`.

## Nota para Claude Code

No implementes lógica de white-label real (aplicar colores/logo dinámicamente) en esta fase — solo guardar el campo. La aplicación visual es Fase 14.
