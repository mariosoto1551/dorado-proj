# Catálogo de eventos de dominio — `libs/shared-events`

> Bus: RabbitMQ, exchange topic `dorado.events`. Ver `ADR-00-decisiones-fundacionales.md` sección 5 para envelope y convenciones de routing key. Todo evento va envuelto en `EventEnvelope<T>`; acá solo se documenta el tipo `T` (payload).
>
> Columna "Origen": `MÍNIMO` = viene literal de `proyecto-dorado-plan-desarrollo-general.md` Fase 0. `EXTENSIÓN` = agregado en este plan para que el flujo de datos entre servicios sea completo y consistente (necesario porque el documento fuente lista un mínimo, no el catálogo completo).

| Evento | Routing key | Productor | Consumidores | Origen |
|---|---|---|---|---|
| `OrganizacionCreada` | `identity.organizacion_creada` | Identity | Billing (crea Suscripción FREE), Audit | MÍNIMO |
| `InvitacionGenerada` | `identity.invitacion_generada` | Identity | Notification | MÍNIMO |
| `InvitacionCanjeada` | `identity.invitacion_canjeada` | Identity | Audit | EXTENSIÓN |
| `UsuarioUnido` | `identity.usuario_unido` | Identity | Notification, Audit | MÍNIMO |
| `ActividadCompletada` | `activity.actividad_completada` | Activity Catalog | Scoring, Notification | MÍNIMO |
| `NoHizoRegistrado` | `activity.no_hizo_registrado` | Activity Catalog | Scoring, Notification | MÍNIMO |
| `ConductaRegistrada` | `activity.conducta_registrada` | Activity Catalog | Scoring, Notification | MÍNIMO |
| `ConductaRegistroEliminado` | `activity.conducta_registro_eliminado` | Activity Catalog | Scoring, Audit | EXTENSIÓN |
| `ActividadRegistroEliminado` | `activity.actividad_registro_eliminado` | Activity Catalog | Scoring, Audit | EXTENSIÓN |
| `TareaEquipoCompletada` | `activity.tarea_equipo_completada` | Activity Catalog | Scoring, Notification | EXTENSIÓN — fase-14-09 (equipos de trabajo) |
| `ReporteMiembroCreado` | `activity.reporte_miembro_creado` | Activity Catalog | Notification | EXTENSIÓN — fase-14-09 (equipos de trabajo) |
| `SesionAbierta` | `session.sesion_abierta` | Session/Section | Notification | EXTENSIÓN |
| `SesionCerrada` | `session.sesion_cerrada` | Session/Section | Scoring (si `evaluarUmbralesEn = CADA_SESION`), Notification | EXTENSIÓN |
| `SeccionAbierta` | `session.seccion_abierta` | Session/Section | Notification | EXTENSIÓN |
| `SeccionEntroEvaluacion` | `session.seccion_entro_evaluacion` | Session/Section | Scoring, Notification | EXTENSIÓN |
| `SeccionCerrada` | `session.seccion_cerrada` | Session/Section | Scoring, Rewards, Notification | MÍNIMO |
| `ZonaAlcanzada` | `scoring.zona_alcanzada` | Scoring Engine | Rewards, Notification | MÍNIMO |
| `UsuarioDescalificado` | `scoring.usuario_descalificado` | Scoring Engine | Rewards, Notification, Audit | MÍNIMO |
| `RecompensaCanjeada` | `rewards.recompensa_canjeada` | Rewards | Notification, Audit | MÍNIMO |
| `AccionAdministrativaRegistrada` | `<servicio>.accion_administrativa` | Cualquier servicio con escrituras admin (Identity, Billing, Activity, Session, Scoring, Rewards) | Audit | EXTENSIÓN — evento genérico para no tener que enumerar un evento por cada acción administrativa posible |

## Payloads

```ts
interface OrganizacionCreadaPayload {
  organizacionId: string;
  nombre: string;
  emailContacto: string;
  creadaPorTutorId: string; // el ORG_ADMIN recién creado
}

interface InvitacionGeneradaPayload {
  invitacionId: string;
  organizacionId: string;
  grupoId: string;
  tipoInvitado: 'TUTOR' | 'USUARIO';
  codigo: string;
  expiraEn: string; // ISO 8601
  creadoPorTutorId: string;
}

interface InvitacionCanjeadaPayload {
  invitacionId: string;
  organizacionId: string;
  grupoId: string;
  canjeadaPorId: string; // id del Tutor o Usuario creado
  tipoInvitado: 'TUTOR' | 'USUARIO';
}

interface UsuarioUnidoPayload {
  usuarioId: string;
  organizacionId: string;
  grupoId: string;
  nombre: string;
  invitacionId: string;
}

interface ActividadCompletadaPayload {
  registroId: string;       // id del RegistroActividad en Activity Catalog
  usuarioId: string;
  actividadId: string;
  sesionId: string;
  seccionId: string;
  valorPuntosSnapshot: number; // positivo
  registradoPorId: string;
  registradoPorTipo: 'TUTOR' | 'USUARIO';
}

interface NoHizoRegistradoPayload {
  registroId: string;
  usuarioId: string;
  actividadId: string;
  sesionId: string;
  seccionId: string;
  valorPuntosSnapshot: number; // negativo
  registradoPorId: string;      // siempre un Tutor
  registradoPorTipo: 'TUTOR';
}

interface ConductaRegistradaPayload {
  registroId: string;
  usuarioId: string;
  conductaId: string;
  tipo: 'BUENA' | 'MALA';
  sesionId: string;
  seccionId: string;
  valorPuntosSnapshot: number; // signo según tipo
  registradoPorId: string;
  registradoPorTipo: 'TUTOR' | 'USUARIO'; // USUARIO solo si tipo = MALA (autoreporte)
}

interface ConductaRegistroEliminadoPayload {
  registroId: string;
  usuarioId: string;
  eliminadoPorTutorId: string;
}

// fase-14: un tutor quitó una completada de actividad (opcional, o la
// confirmación de una obligatoria overrideada por "no hizo"). Scoring compensa
// el asiento original vía origenId = registroId (mismo patrón que conducta).
interface ActividadRegistroEliminadoPayload {
  registroId: string;
  usuarioId: string;
  eliminadoPorTutorId: string;
}

// fase-14-09: el jefe completó una tarea de equipo; scoring reparte creando un
// EventoPuntos por asignación, etiquetado con equipoId (asignaciones ya trae el
// valor resuelto: base + bono del jefe).
interface TareaEquipoCompletadaPayload {
  registroTareaEquipoId: string;
  actividadId: string;
  equipoId: string;
  organizacionId: string;
  grupoId: string;
  sesionId: string;
  seccionId: string;
  completadaPorId: string;
  completadaPorTipo: 'USUARIO' | 'TUTOR';
  asignaciones: Array<{ usuarioId: string; puntos: number; esJefe: boolean }>;
}

// fase-14-09: el jefe reportó a un integrante por una conducta MALA concreta.
// Solo notifica al Tutor; el descuento se aplica al aprobar (vía ConductaRegistrada).
interface ReporteMiembroCreadoPayload {
  reporteId: string;
  organizacionId: string;
  grupoId: string;
  equipoId: string;
  reportadoUsuarioId: string;
  jefeUsuarioId: string;
  conductaId: string;
}

interface SesionEventoPayload {
  sesionId: string;
  seccionId: string;
  organizacionId: string;
  grupoId: string;
  numero: number;
}

interface SeccionEventoPayload {
  seccionId: string;
  organizacionId: string;
  grupoId: string;
  numero: number;
}

interface ZonaAlcanzadaPayload {
  usuarioId: string;
  seccionId: string;
  organizacionId: string;
  grupoId: string;
  puntajeTotal: number;
  umbralZonaId: string;
  nombreZona: string;
  esEvaluacionFinal: boolean; // true = disparado por SeccionEntroEvaluacion (el que usa Rewards para habilitar canje). false = disparado por SesionCerrada cuando evaluarUmbralesEn=CADA_SESION (solo informativo/notificación, no habilita recompensas)
}

interface UsuarioDescalificadoPayload {
  usuarioId: string;
  seccionId: string;
  organizacionId: string;
  grupoId: string;
  motivo: string;
  registradaPorTutorId: string;
}

interface RecompensaCanjeadaPayload {
  canjeId: string;
  usuarioId: string;
  seccionId: string;
  recompensaId: string;
  mecanica: 'SELECCION' | 'AZAR';
  organizacionId: string;
  grupoId: string;
}

interface AccionAdministrativaRegistradaPayload {
  actorId: string;
  actorTipo: 'TUTOR' | 'USUARIO' | 'PLATFORM_ADMIN' | 'SYSTEM';
  accion: string;          // ej. 'ACTIVIDAD_EDITADA', 'UMBRAL_CREADO'
  entidadTipo: string;     // ej. 'Actividad'
  entidadId: string;
  detalle: Record<string, unknown>; // snapshot antes/después, libre por servicio
}
```

## Regla de idempotencia

Todo consumidor implementa la tabla `EventoProcesado(eventId String @id, consumidor String, procesadoEn DateTime)` en su propia base y hace `upsert`/chequeo antes de aplicar efectos. Esto es obligatorio desde el primer consumidor que se escriba (Fase 5 en adelante) — no es un "nice to have" post-MVP, porque RabbitMQ con ack manual puede reentregar mensajes.
