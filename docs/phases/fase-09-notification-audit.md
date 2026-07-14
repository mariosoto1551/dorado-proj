# Fase 9 — Notification & Audit Services

> Objetivo: notificaciones in-app (bell icon) y auditoría inmutable de acciones administrativas. Se construyen en paralelo entre sí. Basado en `proyecto-dorado-plan-desarrollo-general.md` sección 10 y `proyecto-dorado-arquitectura-base.md` sección 4.8.

## Prerrequisitos
Fases 2, 5, 6, 7, 8 completas — este es el primer momento en que existen eventos de dominio reales de todos los servicios para consumir. Esta fase también requiere **volver a tocar los servicios anteriores** para agregarles la emisión de `AccionAdministrativaRegistrada` en sus endpoints administrativos que todavía no publican ningún evento — esto es intencional (ver `proyecto-dorado-plan-desarrollo-general.md` sección 0, punto 6: Notification/Audit son transversales y se construyen "una vez que existen eventos reales que consumir, no antes").

---

## Parte A — Retrofit obligatorio a servicios anteriores

Agregar la publicación de `AccionAdministrativaRegistrada` (payload en `docs/architecture/event-catalog.md`) en estos endpoints, que hoy no publican ningún evento:

**`identity-service`** (Fase 2): `POST/PATCH /identity/grupos`, `DELETE /identity/invitaciones/:id`, `DELETE /identity/usuarios/:id`, `DELETE /identity/tutores/:id`.

**`activity-service`** (Fase 5): `POST/PATCH/DELETE /activity/grupos/:grupoId/actividades` y `.../conductas`.

**`scoring-service`** (Fase 7): `POST/PATCH/DELETE /scoring/grupos/:grupoId/umbrales`, `POST /scoring/eventos-puntos/:id/corregir` (particularmente importante — es el que resuelve disputas de puntaje).

**`rewards-service`** (Fase 8): `POST/PATCH/DELETE /rewards/grupos/:grupoId/recompensas`, `PATCH /rewards/canjes/:id/entregar`.

`session-service` (Fase 6) **no necesita este retrofit**: sus transiciones de estado ya publican eventos propios (`SesionCerrada`, `SeccionCerrada`, etc.) suficientemente descriptivos — Audit consume esos directamente (ver tabla de consumidores abajo), no hace falta duplicar con el evento genérico.

`billing-service` (Fase 4) tampoco: el único cambio administrativo (cambio de plan) es edición manual en base, fuera de la API — no hay endpoint que instrumentar.

---

## Parte B — `notification-service` (nuevo, base `notification_db`)

### Modelo de datos

```prisma
model Notificacion {
  id                String   @id @default(uuid())
  organizacionId    String
  grupoId           String
  destinatarioId    String
  destinatarioTipo  String   // 'TUTOR' | 'USUARIO'
  tipo              String   // ver catálogo de tipos abajo
  mensaje           String
  leida             Boolean  @default(false)
  createdAt         DateTime @default(now())

  @@index([destinatarioId, leida])
}

model EventoProcesado {
  eventId     String   @id
  consumidor  String
  procesadoEn DateTime @default(now())
}
```

### Eventos consumidos y a quién se notifica

| Evento | Destinatario(s) | Mensaje (plantilla) |
|---|---|---|
| `InvitacionGenerada` | Tutores del grupo (excepto quien la generó) | "Se generó una invitación de {tipoInvitado} para el grupo." |
| `UsuarioUnido` | Tutores del grupo | "{nombre} se unió al grupo." |
| `NoHizoRegistrado` | El Usuario afectado | "Se registró que no hiciste: {nombreActividad}." |
| `ConductaRegistrada` | El Usuario afectado, **solo si `registradoPorTipo=TUTOR`** (si fue autoreporte, el usuario ya lo sabe) | "Se registró una conducta {tipo}: {nombreConducta}." |
| `ConductaRegistroEliminado` | El Usuario afectado | "Un tutor eliminó un registro de conducta tuyo." |
| `SeccionEntroEvaluacion` | Todos los Usuarios del grupo | "¡Terminó la semana! Ya podés ver tu resultado." |
| `SeccionEntroEvaluacion` | Tutores del grupo | "La Sección entró en evaluación, revisá los resultados." |
| `ZonaAlcanzada` (solo `esEvaluacionFinal=true`) | El Usuario | "Llegaste a la zona {nombreZona} esta Sección." |
| `UsuarioDescalificado` | El Usuario, y Tutores del grupo | "Fuiste descalificado de esta Sección: {motivo}." / "{nombreUsuario} fue descalificado: {motivo}." |
| `RecompensaCanjeada` | Tutores del grupo | "{nombreUsuario} canjeó una recompensa, pendiente de entrega." |

> Deliberadamente **no** se notifica `ActividadCompletada` individual (sería demasiado ruido para el caso de uso familiar). Si en el futuro se quiere un resumen diario, es una función nueva, no parte del MVP.

Para resolver nombres legibles (`nombreActividad`, `nombreUsuario`, etc.) en las plantillas, Notification hace llamadas internas puntuales a `identity-service` (`GET /internal/identity/usuarios/:id`) y a los servicios dueños del dato cuando el payload del evento no trae el nombre (los payloads actuales solo traen IDs, ver `event-catalog.md` — no se agregan nombres a los payloads para no acoplar; se resuelven en Notification al momento de generar el mensaje).

### Endpoints

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/notification/mis-notificaciones` | cualquiera autenticado | Paginado, `?leida=true\|false`, ordenado `createdAt desc`. Solo las propias (`destinatarioId = sub` del JWT). |
| GET | `/notification/no-leidas/count` | cualquiera autenticado | `{ count: number }` — para el badge del ícono de campana. |
| PATCH | `/notification/:id/leer` | dueño de la notificación | Marca `leida=true`. |
| PATCH | `/notification/leer-todas` | cualquiera autenticado | Marca todas las propias como leídas. |

---

## Parte C — `audit-service` (nuevo, base `audit_db`)

### Modelo de datos

```prisma
model RegistroAuditoria {
  id           String   @id @default(uuid())
  organizacionId String
  grupoId      String?  // null si la acción es a nivel Organización (ej. creación de la org)
  actorId      String
  actorTipo    String   // 'TUTOR' | 'USUARIO' | 'PLATFORM_ADMIN' | 'SYSTEM'
  accion       String
  entidadTipo  String
  entidadId    String
  detalle      Json
  createdAt    DateTime @default(now())

  @@index([organizacionId])
  @@index([grupoId])
  @@index([entidadTipo, entidadId])
}

model EventoProcesado {
  eventId     String   @id
  consumidor  String
  procesadoEn DateTime @default(now())
}
```

### Eventos consumidos

Todos los que representan una acción administrativa o de disputa: `OrganizacionCreada`, `InvitacionCanjeada`, `UsuarioUnido`, `ConductaRegistroEliminado`, `UsuarioDescalificado`, `RecompensaCanjeada`, `AccionAdministrativaRegistrada` (genérico), y adicionalmente los cinco eventos de ciclo de vida de Sesión/Sección (`SesionAbierta`, `SesionCerrada`, `SeccionAbierta`, `SeccionEntroEvaluacion`, `SeccionCerrada`) para tener una línea de tiempo completa de cada Sección. Cada uno se mapea a una fila de `RegistroAuditoria` con `detalle` = el payload completo del evento tal cual llegó.

### Endpoints

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/audit/grupos/:grupoId` | TUTOR asignado, ORG_ADMIN | Lista paginada, filtros `?entidadTipo=&entidadId=&desde=&hasta=`. Es de solo lectura — no hay ningún endpoint de escritura directa, todo llega por eventos. |
| GET | `/audit/entidades/:entidadTipo/:entidadId` | TUTOR asignado, ORG_ADMIN | Timeline completo de una entidad puntual (ej. todas las acciones sobre un `Usuario` específico — útil para responder "¿por qué me descalificaron?"). |

## Criterios de aceptación de esta fase

- [ ] Cada endpoint listado en la Parte A publica `AccionAdministrativaRegistrada` y aparece en `RegistroAuditoria` en segundos.
- [ ] Marcar una notificación como leída no afecta las demás.
- [ ] El badge de no leídas baja a 0 después de `leer-todas`.
- [ ] `GET /audit/entidades/Usuario/:id` de un usuario descalificado muestra, en orden cronológico, el evento `UsuarioDescalificado` con su `motivo`.
- [ ] Ningún endpoint de `audit-service` permite escribir directamente — se verifica que no exista ningún `POST`/`PATCH`/`DELETE` en su controller.

## Nota para Claude Code

`audit-service` es de solo lectura desde la API — toda su escritura ocurre exclusivamente vía consumo de eventos. Si te piden un endpoint de escritura acá, es una señal de que la acción debería modelarse como evento en el servicio de origen, no como excepción en Audit.
