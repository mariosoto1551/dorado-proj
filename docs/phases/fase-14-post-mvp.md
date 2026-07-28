# Fase 14 — Post-MVP / roadmap

> No ejecutar nada de esta fase hasta que Fase 13 esté estable con uso real. Basado en `proyecto-dorado-plan-desarrollo-general.md` sección 15.

## Prerrequisitos
Fase 13 completa y estable.

## Ítems de esta fase (cada uno se detalla en una sesión aparte cuando llegue el momento — acá solo se deja el alcance y las dependencias)

### 1. White-label real
- Aplicar dinámicamente logo/colores por Organización en `app-web` (y opcionalmente `public-site` si se ofrece landing personalizada por cliente Pro).
- Depende de: `entitlements.whiteLabel` (ya existe desde Fase 4) y de agregar campos de branding a `Organizacion` (`identity-service`) — no existen todavía, hay que agregarlos en esta fase, no antes.

### 2. Reportes/analíticas avanzadas
- Nuevo consumidor o extensión de `scoring-service`/`audit-service` para agregaciones históricas (tendencias de puntaje, comparativas entre usuarios, exportables).
- Gate por `entitlements.reportesAvanzados`.

### 3. Integración de pasarela de pagos real
- Reemplaza la asignación manual de plan (`ADR-00` sección 9) por un flujo real en `billing-service`: checkout, webhooks del proveedor, actualización automática de `Suscripcion`.
- Proveedor pendiente de definir (`arquitectura-base.md` sección 3) — es la primera decisión a tomar en esta fase, no una implementación técnica en sí misma.

### 4. Cumplimiento de privacidad/consentimiento de menores
- Bloqueante real antes de abrir el registro público a organizaciones fuera del círculo de confianza directo (`arquitectura-base.md` sección 10).
- Alcance a definir: consentimiento parental verificable, retención/eliminación de datos de `Usuario` menores de edad, términos de servicio específicos.

### 5. Panel de `PLATFORM_ADMIN`
- Hoy `Rol.PLATFORM_ADMIN` existe en el enum compartido (`shared-types.md`) pero no hay tabla de cuentas ni flujo que lo produzca (ver nota en `fase-04-billing.md`).
- Esta fase agrega el modelo de cuenta de plataforma (probablemente una tabla separada en `identity-service`, no reutilizar `Tutor`, porque no está atado a una Organización) y el panel de gestión de organizaciones/planes.

### 6. Reevaluación de infraestructura
- Migrar a Kubernetes (o similar) solo si el volumen de organizaciones lo justifica — no es un objetivo en sí, es una decisión condicionada a métricas reales de uso post-Fase 13.

### 7. Punto suelto de `ADR-00` sección 10 (condicional)
- Si José confirma que todavía necesita el flujo de "propuesta de actividad por Usuario" (mencionado en `memory.md` pero ausente de `arquitectura-base.md`), se diseña y agrega acá como sub-fase, con su propio modelo (`PropuestaActividad`, estados `BORRADOR/APROBADA/RECHAZADA`) y evento `PropuestaActividadCreada`. Si no se confirma, este ítem se descarta definitivamente.

### 8. Confirmación de obligatorias por el usuario + estado de hoy (barrita de repeticiones)
- **Ya especificado en detalle** (decidido con José, 2026-07-21): ver `docs/phases/fase-14-08-confirmacion-obligatorias.md`.
- Modelo "B2": el Usuario puede confirmar una obligatoria (`comportamientoAlCierre = REQUIERE_CONFIRMACION`, por actividad); si no la confirma, `activity-service` genera un `no-hizo` automático al cerrar la sesión (primer consumidor de eventos de ese servicio). Confirmar vale 0 puntos (solo evita el descuento). De paso, endpoint `GET /activity/grupos/:grupoId/mi-estado-hoy` que expone el conteo real de repeticiones y cierra la deuda técnica del `Set` local de la home (Fase 10) + habilita la barrita "X de N".
- Depende de: `SesionCerrada` (Fase 6), `NoHizoRegistrado` (Fase 7), interno de usuarios de identity (Fase 2) — todos existen. No implementar hasta que Fase 13 esté estable.

### 9. Equipos de trabajo (jefe de equipo + tareas colectivas)
- **Ya especificado en detalle** (decidido con José, 2026-07-24): ver `docs/phases/fase-14-09-equipos-de-trabajo.md`.
- Agrupar participantes de un Grupo en **equipos** con un **jefe** que completa **tareas colectivas** (`Actividad.alcance = EQUIPO`); scoring **reparte** los puntos a cada miembro como `EventoPuntos` propio etiquetado con `equipoId` (ledger derivado, sin campo mutable — regla 1). El jefe puede **reportar** a un integrante que no coopera; el descuento se aplica **solo si el Tutor lo aprueba** (registrado como conducta MALA por el Tutor). Sustitución del jefe: manual por el Tutor. Transversal a identity, activity, scoring y notification.
- Depende de: `UsuarioGrupo` (multi-grupo, Fase 14), `ConductaRegistrada` (Fase 7), internos de identity (Fase 2), ciclo de sesión (Fase 6) — todos existen. No implementar hasta que Fase 13 esté estable.

### 10. Contenido creado por los integrantes, gated por configuración del Grupo
- **Idea de José (2026-07-24), pendiente de spec detallada.** El Grupo debe poder **configurar** si sus integrantes (participantes) pueden **crear su propio contenido**: actividades `OPCIONAL`, conductas `BUENA` y `MALA`. Hoy solo el Tutor/ORG_ADMIN crea catálogo; esto lo habilita **condicionalmente** a los usuarios, solo si un flag de configuración del Grupo lo permite (default: desactivado, comportamiento actual).
- Alcance a definir en la sub-spec: nueva config por Grupo (¿en identity o en activity?), qué tipos puede crear el integrante y con qué límites/moderación (¿crea directo `ACTIVA` o queda `PENDIENTE` de aprobación del Tutor?), y cómo se relaciona con el reporte de conducta MALA del jefe de equipo (ítem 9) — un integrante creando una conducta MALA para reportar es un caso a acotar con cuidado (riesgo de abuso). **No mezclar con el ítem 9**: es un punto propio.
- Depende de: catálogo de actividades/conductas (Fase 5) y la diferenciación de roles en la UI (Fase 14). No implementar hasta que Fase 13 esté estable.

### 11. Actividades programadas (solo ciertos días) — *agregado el 2026-07-26 a pedido de José*
- **Ya especificado en detalle**: ver `docs/phases/fase-14-11-actividades-programadas.md`.
- Una Actividad puede limitarse a **ciertos días de la semana** (`Actividad.diasSemana`, `0 = domingo … 6 = sábado`, vacío = todos los días). Fuera de sus días no se completa, no se arranca su cronómetro, no se marca "no hizo" y —lo importante— **el castigo automático de las obligatorias confirmables (ítem 8) no se aplica**. Lo configura el Tutor en el mismo modal de crear/editar actividad.
- José anticipó que después va a querer **fechas concretas** ("solo el 24 de diciembre"): la spec deja toda la evaluación de disponibilidad en una función única para que eso sea agregar un campo, no rediseñar.
- Depende de: catálogo (Fase 5), ciclo de Sesión (Fase 6), registro (Fase 7) y el consumidor de cierre del ítem 8 — todos existen.

### 12. Marcas rojas del tutor (denegar una obligatoria, quemar una repetición) — *agregado el 2026-07-26 a pedido de José*
- **Ya especificado en detalle**: ver `docs/phases/fase-14-12-marcas-rojas-del-tutor.md`.
- Cuando el Tutor/ORG_ADMIN marca que un integrante **no hizo** algo, esa corrección se le muestra al integrante y tiene peso: una **obligatoria** queda con contorno rojo y bloqueada (no puede volver a confirmarla), y una **repetición quitada** de una opcional queda como una **barrita roja perdida** que le quema el cupo del día (`topeEfectivo = repeticionesMaximasSesion − vecesPerdidas`). El tutor puede dejar un motivo corto y es el único que puede **deshacer** la marca, lo que devuelve los puntos vía compensación en el ledger.
- La marca vive dentro de la Sesión actual: al día siguiente se arranca limpio.
- Quedan **fuera de alcance a propósito**: notificar al integrante (espera la implementación completa de notificaciones a usuarios) y las tareas de equipo del ítem 9.
- Depende de: registro + ledger (Fase 7), `mi-estado-hoy` y el soft-delete de completadas (ítem 8) — todos existen.

### 13. Anular una tarea de equipo (marcas rojas, parte 2) — *agregado el 2026-07-26 a pedido de José*
- **Ya especificado en detalle**: ver `docs/phases/fase-14-13-anular-tareas-de-equipo.md`.
- Cierra lo que el ítem 12 había dejado **fuera de alcance a propósito**: el Tutor/ORG_ADMIN puede **anular** una tarea de equipo completada y **deshacer** esa anulación, con la misma mecánica de marca roja, motivo opcional, intento quemado y compensación en el ledger. Se pierde el reparto entero, **incluido el bono del jefe**, y se le saca a quien recibió puntos (no a quien es miembro hoy). El jefe completa pero **no** anula.
- De paso cierra la deuda del ítem 9: `mi-equipo` no mostraba si la tarea ya se había hecho hoy — sin ese estado, una anulación sería invisible para el equipo.
- No hay "no hizo" de equipo: una tarea de equipo es siempre OPCIONAL, así que la única marca posible es la completada anulada.
- Depende de: equipos (#9) y marcas rojas del tutor (#12) — los dos existen.

### 14. Prioridad visual de la lista del integrante — *agregado el 2026-07-26 a pedido de José*
- **Ya especificado en detalle**: ver `docs/phases/fase-14-14-prioridad-visual-de-la-lista.md`.
- La lista de hoy venía ordenada por `createdAt` — el orden en que el tutor creó las actividades, que no significa nada para quien la mira. Ahora: **las obligatorias siempre arriba**, y dentro de cada grupo primero las de hora límite (la más temprana primero), después cronómetro, después sin límite. Lo que ya no requiere acción (hecho, denegado, cupo quemado, deadline vencido, "otro día") baja a un tramo atenuado al final.
- Jerarquía por **peso visual** (sin encabezados de tramo) + **cuenta regresiva viva** con color por urgencia en las de hora límite.
- Arregla de paso una mentira de la UI del mismo tipo que el ítem 12: una opcional con deadline vencido mostraba «Completar» habilitado y devolvía 409.
- `mi-estado-hoy` suma `deadlineEn` (instante absoluto): el navegador no conoce la timezone del Grupo, así que el instante lo manda el servidor. La validación de `completar` no cambia.
- Depende de: `mi-estado-hoy` (#8), actividades programadas (#11) y marcas rojas (#12) — los tres existen.

### 15. Las tareas de equipo, visibles pero no marcables en la lista del integrante — *agregado el 2026-07-26 a pedido de José*
- **Ya especificado en detalle**: ver `docs/phases/fase-14-15-tareas-de-equipo-visibles-en-la-lista.md`.
- Arregla un bug: una tarea de equipo aparecía en la lista individual **con botón «Completar»**, y ese botón siempre devolvía 400 `ES_TAREA_DE_EQUIPO`. Ahora van en un bloque propio **«De tu equipo»**, sin botón, con chip «Equipo», acento teal, los puntos como "+N c/u" y enlace a «Mi equipo». No cuentan en los pendientes propios.
- Ítem chico: solo frontend, sin schema, sin endpoints y sin eventos (`ActividadDto.alcance` ya viajaba desde el ítem 9).
- Depende de: equipos (#9), estado de tareas de equipo (#13) y orden de la lista (#14) — los tres existen.

### 16. Scheduler con recuperación: ninguna transición se pierde por un reinicio — *agregado el 2026-07-27 a pedido de José*
- **Ya especificado en detalle**: ver `docs/phases/fase-14-16-scheduler-con-recuperacion.md`.
- Arregla una limitación de diseño heredada de la **Fase 6**: el scheduler disparaba por **igualdad de minuto**, así que si el proceso no estaba vivo en ese minuto exacto (un deploy, un reinicio del VPS, 90 s de Postgres caído) la transición **se perdía para siempre**. Un grupo que perdiera su lunes 00:00 se quedaba en `EVALUACION` una semana.
- El scheduler pasa de temporizador a **reconciliador**: cada tick aplica todo lo vencido en la ventana `(evaluadoHasta, ahora]`, en orden y **sellado con el instante programado**, no con el de la recuperación. `UltimoTickProcesado.minutoEpoch` → `evaluadoHasta`.
- Suma dos topes (ventana máxima de 7 días configurable, y 500 ocurrencias por tick que continúan en el siguiente) y un **advisory lock por grupo**, que además cierra el riesgo de duplicación si algún día session-service corre con más de una réplica.
- Backend puro, sin frontend, sin endpoints y sin eventos nuevos. Depende de: Fase 6.

### 17. El plan del día: las opcionales se eligen, no se muestran todas — *agregado el 2026-07-27 a pedido de José*
- **Ya especificado en detalle**: ver `docs/phases/fase-14-17-plan-del-dia.md`.
- Resuelve el ruido visual de la lista del integrante: hoy se muestra **todo el catálogo ACTIVA, todos los días**, así que con 20 opcionales cargadas las obligatorias quedan ahogadas entre opciones. El catálogo (un menú) y la lista de hoy (un compromiso) pasan a ser dos cosas distintas.
- Con el modo activo, las **OPCIONALES individuales del catálogo del tutor** se ocultan hasta que el integrante las mete en su **plan del día** (dura una Sesión) desde una hoja «＋ Elegir». Obligatorias, tareas de equipo y «Mis metas» siguen siempre visibles. El Tutor puede fijar algunas con `Actividad.siempreVisible`.
- Se activa **por Grupo y viene apagado** (`ConfiguracionContenidoGrupo.planDelDiaActivo = false`): ningún grupo existente cambia de comportamiento con la migración.
- Schema nuevo (`SeleccionPlanDia`, estado operativo — **no** ledger), dos endpoints (`POST`/`DELETE /activity/grupos/:grupoId/plan-dia`), sin eventos nuevos. Depende de: ítems 8, 10, 11, 14 y 15 — los cinco existen.

> Los ítems 11, 12, 13, 14 y 15 **no existían** en la redacción original de este archivo: se sumaron al índice el 2026-07-26 cuando José los pidió, con su nota de fecha para que quede claro que es alcance nuevo y no una reescritura de lo ya decidido. Los ítems 16 y 17 se sumaron el 2026-07-27 con el mismo criterio.

## Nota para Claude Code

No empieces ninguno de estos ítems por iniciativa propia ni los mezcles con trabajo de Fases 0–13. Cada uno de estos necesita su propia sesión de planificación detallada (mismo nivel de detalle que las fases anteriores) antes de tocar código — este archivo es un índice de alcance, no una especificación ejecutable todavía.
