# Fase 5 — Activity Catalog Service

> Objetivo: CRUD completo de Actividades y Conductas por Grupo. **Esta fase NO incluye los endpoints de registro** (`completar`, `no-hizo`, `conducta/registrar`) — esos requieren contexto de Sesión/Sección (Fase 6) y se agregan a este mismo servicio en Fase 7, junto con el Scoring Engine. Basado en `proyecto-dorado-plan-desarrollo-general.md` sección 6.

## Prerrequisitos
Fase 4 completa (Billing con entitlements reales).

## Por qué el registro no va en esta fase

El plan general ordena Activity Catalog (Fase 5) antes de Session/Section (Fase 6), pero aclara: *"Repeticiones máximas a nivel Sesión, con override a nivel Sección (aunque Sección se implemente en la fase siguiente, el dato se modela ya aquí)"*. Es decir: acá se modela el dato, no se aplica la regla todavía. Marcar una actividad como "completada" requiere saber en qué Sesión/Sección ocurre — eso no existe hasta Fase 6. Por eso los endpoints de registro (que son los que publican `ActividadCompletada`, `NoHizoRegistrado`, `ConductaRegistrada`) se implementan en Fase 7, aunque viven físicamente en este mismo servicio (`activity-service`) porque son dueños de `RegistroActividad`/`RegistroConducta`.

## Modelo de datos (`activity-service`, base `activity_db`)

```prisma
enum TipoPuntaje {
  OPCIONAL     // suma puntos al completarse
  OBLIGATORIA  // resta puntos si se marca "no hizo"
}

enum TipoLimiteTiempo {
  DEADLINE     // fecha/hora límite fija dentro de la Sesión
  CRONOMETRO   // duración desde que el usuario la inicia
  SIN_LIMITE
}

enum TipoConducta {
  BUENA
  MALA
}

enum EstadoCatalogo {
  ACTIVA
  ARCHIVADA
}

model Actividad {
  id                          String            @id @default(uuid())
  organizacionId              String
  grupoId                     String
  nombre                      String
  descripcion                 String?
  tipoPuntaje                 TipoPuntaje
  valorPuntos                 Int               // siempre positivo; el signo se aplica al registrar
  tipoLimiteTiempo             TipoLimiteTiempo
  deadlineHora                String?           // "HH:mm", solo si tipoLimiteTiempo = DEADLINE, hora local del Grupo
  duracionCronometroMinutos   Int?              // solo si tipoLimiteTiempo = CRONOMETRO
  repeticionesMaximasSesion   Int               @default(1)
  repeticionesMaximasSeccion  Int?              // null = sin override, se calcula como repeticionesMaximasSesion * cantidad de Sesiones de la Sección (ver Fase 7)
  estado                      EstadoCatalogo    @default(ACTIVA)
  creadaPorTutorId            String
  createdAt                   DateTime          @default(now())
  updatedAt                   DateTime          @updatedAt

  @@index([organizacionId])
  @@index([grupoId])
}

model Conducta {
  id                  String         @id @default(uuid())
  organizacionId      String
  grupoId             String
  nombre              String
  tipo                TipoConducta
  valorPuntos         Int            // siempre positivo; signo aplicado según tipo al registrar
  permiteAutoreporte  Boolean        @default(false) // solo relevante si tipo = MALA
  estado              EstadoCatalogo @default(ACTIVA)
  creadaPorTutorId    String
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt

  @@index([organizacionId])
  @@index([grupoId])
}
```

> Validación de aplicación (no a nivel DB): si `tipoLimiteTiempo = DEADLINE`, `deadlineHora` es obligatorio y `duracionCronometroMinutos` debe ser `null`. Si `= CRONOMETRO`, al revés. Si `= SIN_LIMITE`, ambos `null`. Si `tipo = BUENA` en `Conducta`, `permiteAutoreporte` se fuerza a `false` (la regla de autoreporte de `arquitectura-base.md` sección 4.2 es específica de mala conducta).

## Endpoints

Todos bajo `/activity/*`, autenticados vía Gateway.

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/activity/grupos/:grupoId/actividades` | TUTOR asignado, ORG_ADMIN | Crea Actividad. Antes de crear: `GET /internal/billing/organizaciones/:organizacionId/entitlements`, contar actividades `ACTIVA` del grupo, comparar contra `limites.actividadesPorGrupo`; si excede, 403 `{ code: 'LIMITE_PLAN_ALCANZADO', recurso: 'actividades' }`. |
| GET | `/activity/grupos/:grupoId/actividades` | TUTOR asignado, ORG_ADMIN, USUARIO del grupo | Lista. `USUARIO` solo ve `estado=ACTIVA` (query param `estado` ignorado para ese rol); tutores ven todo con filtro opcional `?estado=`. |
| GET | `/activity/actividades/:id` | igual que arriba | Detalle. |
| PATCH | `/activity/actividades/:id` | TUTOR asignado, ORG_ADMIN | Edita cualquier campo. **No afecta retroactivamente** registros ya existentes (ver regla de snapshot en Fase 7). |
| DELETE | `/activity/actividades/:id` | TUTOR asignado, ORG_ADMIN | Soft delete: `estado = ARCHIVADA`. No se puede volver a activar una actividad con este endpoint (crear una nueva si hace falta) — mantiene simple el MVP. |
| POST | `/activity/grupos/:grupoId/conductas` | TUTOR asignado, ORG_ADMIN | Igual patrón de límite de plan (comparte `limiteActividadesPorGrupo`? **No** — no hay límite de plan específico para conductas en `docs/architecture/shared-types.md` `EntitlementsDto`; no aplicar chequeo de límite acá). |
| GET | `/activity/grupos/:grupoId/conductas` | TUTOR asignado, ORG_ADMIN, USUARIO del grupo | Igual regla de visibilidad que actividades. |
| PATCH | `/activity/conductas/:id` | TUTOR asignado, ORG_ADMIN | Edita. |
| DELETE | `/activity/conductas/:id` | TUTOR asignado, ORG_ADMIN | Soft delete (`ARCHIVADA`). |

## Eventos

Ninguno en esta fase (ni publica ni consume). Los eventos `ActividadCompletada`, `NoHizoRegistrado`, `ConductaRegistrada`, `ConductaRegistroEliminado` se agregan en Fase 7 junto con los endpoints de registro.

## Reglas de negocio de esta fase

- Solo Tutores (asignados al Grupo) u ORG_ADMIN pueden crear/editar/archivar Actividades y Conductas. Un `USUARIO` nunca puede escribir en este servicio en esta fase (la única escritura de Usuario, autoreporte de mala conducta, es un endpoint de *registro*, Fase 7).
- Archivar (`ARCHIVADA`) una Actividad/Conducta no la borra ni afecta el historial — solo la oculta de las listas activas y evita que se pueda registrar contra ella en el futuro (chequeo que se aplica en Fase 7, cuando exista el endpoint de registro).

## Criterios de aceptación de esta fase

- [ ] CRUD completo probado para Actividad y Conducta, incluyendo el chequeo de límite de plan (crear actividades hasta el límite FREE de `activity_db` seed y confirmar el 403 en la siguiente).
- [ ] Un `USUARIO` autenticado puede `GET` actividades/conductas de su propio grupo pero recibe 403 en cualquier `POST`/`PATCH`/`DELETE`.
- [ ] Un `USUARIO` no ve actividades `ARCHIVADA` en la lista.
- [ ] Validación de campos condicionales de `tipoLimiteTiempo` cubierta con tests (los 3 casos: DEADLINE, CRONOMETRO, SIN_LIMITE).

## Nota para Claude Code

No implementes `POST .../completar`, `.../no-hizo` ni `.../conductas/:id/registrar` en esta fase aunque parezca natural agregarlos junto al CRUD — están deliberadamente pospuestos a Fase 7. Si los agregás acá vas a tener que rehacerlos cuando exista contexto de Sesión/Sección.
