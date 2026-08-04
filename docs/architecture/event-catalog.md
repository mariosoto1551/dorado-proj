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
| `ActividadCompletada` | `activity.actividad_completada` | Activity Catalog | Scoring, **Rewards** (fase-14-28: paga monedas), Notification | MÍNIMO |
| `NoHizoRegistrado` | `activity.no_hizo_registrado` | Activity Catalog | Scoring, Notification | MÍNIMO |
| `ConductaRegistrada` | `activity.conducta_registrada` | Activity Catalog | Scoring, **Rewards** (fase-14-28: solo BUENA), Notification | MÍNIMO |
| `ConductaRegistroEliminado` | `activity.conducta_registro_eliminado` | Activity Catalog | Scoring, Audit | EXTENSIÓN |
| `ActividadRegistroEliminado` | `activity.actividad_registro_eliminado` | Activity Catalog | Scoring, Audit, **Rewards** (fase-14-28: revierte con piso en 0) | EXTENSIÓN |
| `ActividadRegistroRevertido` | `activity.actividad_registro_revertido` | Activity Catalog | Scoring, Audit, **Rewards** (fase-14-28: restituye lo descontado) | EXTENSIÓN — fase-14-12 (marcas rojas del tutor) |
| `TareaEquipoCompletada` | `activity.tarea_equipo_completada` | Activity Catalog | Scoring, Notification, **Rewards** (fase-14-28: paga a cada miembro) | EXTENSIÓN — fase-14-09 (equipos de trabajo) |
| `TareaEquipoAnulada` | `activity.tarea_equipo_anulada` | Activity Catalog | Scoring, Audit, **Rewards** (fase-14-28: revierte a cada miembro) | EXTENSIÓN — fase-14-13 (anular tareas de equipo) |
| `TareaEquipoRevertida` | `activity.tarea_equipo_revertida` | Activity Catalog | Scoring, Audit, **Rewards** (fase-14-28: restituye a cada miembro) | EXTENSIÓN — fase-14-13 (anular tareas de equipo) |
| `ReporteMiembroCreado` | `activity.reporte_miembro_creado` | Activity Catalog | Notification | EXTENSIÓN — fase-14-09 (equipos de trabajo) |
| `ActividadPropuestaCreada` | `activity.actividad_propuesta_creada` | Activity Catalog | Notification | EXTENSIÓN — fase-14-10 (contenido por integrantes) |
| `ActividadPropuestaResuelta` | `activity.actividad_propuesta_resuelta` | Activity Catalog | Notification | EXTENSIÓN — fase-14-10 (contenido por integrantes) |
| `SesionAbierta` | `session.sesion_abierta` | Session/Section | Notification, **Activity** (fase-14-21: sella el turno rotativo del día) | EXTENSIÓN |
| `SesionCerrada` | `session.sesion_cerrada` | Session/Section | Scoring (si `evaluarUmbralesEn = CADA_SESION`), Notification, Activity (fase-14-08: castigo automático) | EXTENSIÓN |
| `SeccionAbierta` | `session.seccion_abierta` | Session/Section | Notification, **Rewards** (fase-14-22: aplica el cambio de modo diferido) | EXTENSIÓN |
| `SeccionEntroEvaluacion` | `session.seccion_entro_evaluacion` | Session/Section | Scoring, Notification | EXTENSIÓN |
| `SeccionCerrada` | `session.seccion_cerrada` | Session/Section | Scoring, Rewards, Notification | MÍNIMO |
| `ZonaAlcanzada` | `scoring.zona_alcanzada` | Scoring Engine | Rewards (en modo `TIENDA`, fase-14-22: dispara el cierre económico), Notification | MÍNIMO |
| `UsuarioDescalificado` | `scoring.usuario_descalificado` | Scoring Engine | Rewards, Notification, Audit | MÍNIMO |
| `RecompensaCanjeada` | `rewards.recompensa_canjeada` | Rewards | Notification, Audit | MÍNIMO |
| `MonedasAcreditadas` | `rewards.monedas_acreditadas` | Rewards | Notification, Audit | EXTENSIÓN — fase-14-22 (tienda de monedas). Un solo evento cubre "cobraste N monedas" y "te tocó un castigo": son el mismo hecho. |
| `CompraRealizada` | `rewards.compra_realizada` | Rewards | Notification, Audit | EXTENSIÓN — fase-14-22 (tienda de monedas) |
| `MonedasPorAccion` | `rewards.monedas_por_accion` | Rewards | Notification, Audit | EXTENSIÓN — fase-14-28 (monedas por cumplir). La SEGUNDA fuente de la economía: acredita al instante por completar una actividad o registrar una conducta BUENA. Las reversiones NO publican evento (ver payload). |
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

// fase-14-28 (D.1): este evento significa **"esto pasó"**, no "esto valió
// puntos". Hasta fase-14-20, activity no lo publicaba cuando el registro valía
// 0 (la confirmación de una obligatoria sin premio); desde fase-14-28 se
// publica SIEMPRE, porque una actividad de 0 puntos y N monedas es una
// configuración válida y rewards tiene que enterarse. El descarte del 0 vive
// ahora en scoring, que es el único a quien le sobra.
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
  // fase-14-28: lo que valía el registro que se quita. 0 = scoring nunca
  // escribió asiento por él, así que no hay nada que compensar. Desde que
  // activity publica siempre (D.1) es la ÚNICA forma de distinguir eso de un
  // evento llegado desordenado, que sí tiene que fallar e ir a la DLQ.
  // Opcional: un mensaje viejo en vuelo no lo trae.
  valorPuntosSnapshot?: number;
}

// fase-14-12: un tutor deshizo su propia marca roja — restauró una completada
// que había quitado, o dio de baja un "no hizo". Scoring devuelve los puntos
// negando el ÚLTIMO asiento de la cadena de correcciones del registro (no el
// original): ver docs/phases/fase-14-12-marcas-rojas-del-tutor.md, Parte B.
interface ActividadRegistroRevertidoPayload {
  registroId: string;
  usuarioId: string;
  revertidoPorTutorId: string;
  tipoRegistro: 'COMPLETADA' | 'NO_HIZO';
  // fase-14-28: ver ActividadRegistroEliminadoPayload.
  valorPuntosSnapshot?: number;
}

// fase-14-13: el Tutor anuló una tarea de equipo (`TareaEquipoAnulada`) o
// deshizo la anulación (`TareaEquipoRevertida`). Mismo payload y MISMA
// operación en scoring: negar el último eslabón de cada cadena. Ojo — el
// reparto son N asientos con el mismo origenId (uno por miembro que recibió
// puntos, con el bono ya sumado en el del jefe): compensar uno solo dejaría el
// puntaje del resto mal. La fila de compensación arrastra `equipoId`, porque el
// puntaje de equipo se deriva sumando por ese campo.
interface TareaEquipoMarcaPayload {
  registroTareaEquipoId: string;
  equipoId: string;
  tutorId: string;
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

// fase-14-10: un integrante creó/propuso una actividad propia. Solo notifica a
// los tutores del grupo — los puntos no entran por acá: una vez ACTIVA, la
// actividad se completa por el camino normal (ActividadCompletada).
interface ActividadPropuestaCreadaPayload {
  propuestaId: string;
  organizacionId: string;
  grupoId: string;
  creadaPorUsuarioId: string;
  nombre: string;
  valorPuntos: number;
  estado: string; // 'PENDIENTE' (BAJO_APROBACION) | 'APROBADA' (LIBRE)
  requiereAprobacion: boolean;
  actividadId: string | null;
}

// fase-14-10: el Tutor aprobó o rechazó la propuesta; notifica al autor.
// resueltoPorTipo = 'SYSTEM' es la auto-aprobación del modo LIBRE (no se notifica).
interface ActividadPropuestaResueltaPayload {
  propuestaId: string;
  organizacionId: string;
  grupoId: string;
  creadaPorUsuarioId: string;
  nombre: string;
  estado: string; // 'APROBADA' | 'RECHAZADA'
  resueltoPorId: string;
  resueltoPorTipo: string; // 'TUTOR' | 'SYSTEM'
  actividadId: string | null;
  motivoRechazo: string | null;
}

interface SesionEventoPayload {
  sesionId: string;
  seccionId: string;
  organizacionId: string;
  grupoId: string;
  numero: number;
  // fase-14-11 (aditivo, opcional): ISO del inicio de la Sesión. El consumidor de
  // cierre de activity lo usa para saber a qué DÍA pertenecía la Sesión y no
  // castigar una obligatoria programada fuera de sus días. Los consumidores que
  // no lo necesitan (scoring, notification) lo ignoran.
  fechaInicio?: string;
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

// fase-14-22: el cierre económico de la Sección. UN solo evento cubre las dos
// notificaciones ("cobraste 12 Doradas" y "te tocó un castigo") porque son el
// mismo hecho.
interface MonedasAcreditadasPayload {
  usuarioId: string;
  organizacionId: string;
  grupoId: string;
  seccionId: string;
  nombreZona: string;
  monedas: number;        // lo que rindió la zona, con signo
  saldoResultante: number;
  castigo: { recompensaId: string; nombre: string } | null;
}

// fase-14-28: la SEGUNDA fuente de la economía — pagó completar una actividad o
// registrar una conducta BUENA. Acredita AL INSTANTE, no al cierre.
//
// Las reversiones (el Tutor quita la marca, o deshace su quita) NO publican
// evento a propósito: notificar "te sacaron 2 monedas" duplicaría el aviso que
// fase-14-12 ya manda al deshacer la marca, y la billetera del participante ya
// muestra el movimiento.
interface MonedasPorAccionPayload {
  usuarioId: string;
  organizacionId: string;
  grupoId: string;
  seccionId: string;
  tipoAccion: 'ACTIVIDAD' | 'CONDUCTA';
  origenId: string;          // actividadId o conductaId
  nombreAccion: string;
  monedas: number;           // siempre > 0: lo que se hace nunca debita
  saldoResultante: number;
  esTareaEquipo: boolean;    // true si vino del reparto de una tarea de equipo
}

// fase-14-22: una compra en la tienda.
interface CompraRealizadaPayload {
  compraId: string;
  usuarioId: string;
  organizacionId: string;
  grupoId: string;
  productoId: string;
  nombreProducto: string;
  precio: number;
  obtenidoPorAzar: boolean; // "te salió" vs "lo elegiste"
  recompensaId: string;
  nombreRecompensa: string;
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
