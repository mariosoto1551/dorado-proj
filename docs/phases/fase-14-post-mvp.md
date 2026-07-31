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

### 18. Historial de la sesión para el Tutor (línea de tiempo del grupo) — *agregado el 2026-07-30 a pedido de José*
- **Ya especificado en detalle** (decidido con José, 2026-07-30): ver `docs/phases/fase-14-18-historial-de-la-sesion.md`.
- Hoy el tutor no tiene ninguna pantalla que responda «¿qué pasó hoy en el grupo?»: los datos existen completos y dispersos (`RegistroActividad`, `RegistroConducta`, `RegistroTareaEquipo` en activity; `EventoPuntos` en scoring) y las acciones sobre ellos (anular/deshacer/motivo, ítems #12 y #13) se ejecutan buscando participante por participante. Este ítem **expone** lo que ya está guardado y **reubica** esas acciones donde tienen sentido.
- Decisiones cerradas: (1) **timeline cronológico del grupo** —hora · participante · qué pasó · puntos · quién lo registró—, con filtro por participante y por tipo; (2) **solo la sesión actual** (una Sección cerrada es de solo lectura, regla 6); (3) **lo sirve `activity-service`**, no audit — activity es dueño de las filas y de las acciones, y separarlos dejaría la vista en un servicio y sus botones en otro; audit sigue siendo el ledger de acciones administrativas, sin cambios; (4) desde el historial se puede **registrar una conducta rápida** a cualquier participante (solo conductas: no tienen cupo de repeticiones, deadline ni días permitidos, así que no hay ninguna regla del motor que saltearse); (5) **hilo de notas internas** por registro, con autor y hora, **no visibles para el integrante** (distintas del `motivoTutor`, que sí se le muestra), borrables solo por su autor; (6) **solo Tutor y ORG_ADMIN** — sin cambios en la app del participante.
- Depende de: registro (Fase 7), marcas rojas (#12) y anulación de tareas de equipo (#13) — los tres existen. Necesita resolver nombres por REST interno de identity (regla 2), igual que ya hace notification.

### 19. Roles del participante dentro del Grupo — *agregado el 2026-07-30 a pedido de José*
- **Idea de José (2026-07-30), decisiones de alcance cerradas en esa sesión; falta la spec detallada.** Un participante puede tener un **rol dentro de su Grupo** (por defecto **sin rol**), y el Tutor puede restringir una Actividad a ciertos roles. Estructuralmente es el mismo patrón que los equipos del ítem #9, un escalón más simple.
- Decisiones cerradas: (1) el catálogo de roles y la asignación viven en **`identity-service`**, colgados de `UsuarioGrupo` — el rol es **por Grupo**, no por Organización (el mismo participante puede tener rol en un grupo y ninguno en otro, y el resto del catálogo del proyecto también es por grupo); (2) **un solo rol por participante** (mismo criterio que el jefe de equipo: sin reglas de conflicto entre roles); (3) **NO viaja en el JWT** — el token dura minutos, el Tutor cambia roles en vivo y un usuario está en varios grupos; se resuelve por REST interno, agrupable con la llamada que activity ya hace para equipos; (4) por ahora el rol **solo filtra actividades** (`Actividad` con lista de roles permitidos; vacío = todos, que es el comportamiento actual y hace la migración retro-compatible); conductas y recompensas quedan **fuera de alcance a propósito**; (5) el rol es **visible para todos** dentro del grupo, como etiqueta junto al nombre.
- **Nombre**: `RolGrupo` / `UsuarioRolGrupo`, nunca `Rol` a secas — `Rol` ya es el rol de plataforma (`TUTOR`/`USUARIO`/`ORG_ADMIN`/`PLATFORM_ADMIN`) en `shared-types`. Dos conceptos distintos con el mismo nombre es un bug esperando.
- Depende de: `UsuarioGrupo` (Fase 14), catálogo de actividades (Fase 5), internos de identity (Fase 2) — todos existen.

### 20. Las obligatorias también suman al cumplirse — *agregado el 2026-07-30 a pedido de José*
- **Revisa una decisión ya tomada** (por eso se anota como ítem propio y **no** se edita `fase-14-08-confirmacion-obligatorias.md`, ver protocolo de `docs/progreso/README.md`): la decisión 2 de ese ítem fijó que **confirmar una obligatoria vale 0 puntos** («hacer lo obligatorio es el deber, no un bonus»). José la revisó el 2026-07-30 y decidió que también pueda premiar.
- Decisiones cerradas: (1) la Actividad `OBLIGATORIA` pasa a tener **dos valores independientes** — puntos por cumplir y puntos por no hacer (ej. **+2 / −10**): el castigo puede pesar más que el premio, que es lo que la mantiene obligatoria en vez de convertirla en una opcional disfrazada; (2) los puntos positivos se acreditan **al instante al confirmar**, no al cerrar la sesión (el refuerzo inmediato es el punto de la gamificación; si el Tutor después la marca en rojo, la compensación del ítem #12 ya existe); (3) **retro-compatible**: las obligatorias existentes quedan con puntos por cumplir = 0 y no cambian de comportamiento.
- **Impacto real a tener en cuenta al especificar**: hoy la confirmación **no publica ningún evento** y vive entera dentro de `activity-service` (justamente porque vale 0). Con este cambio, confirmar pasa a ser un asiento del ledger de scoring como cualquier otro registro — es el grueso del trabajo de este ítem, no el campo nuevo.
- Depende de: confirmación de obligatorias (#8), ledger (Fase 7) y marcas rojas (#12) — los tres existen.

### 21. Turnos rotativos: a quién le toca la obligatoria — *agregado el 2026-07-30 a pedido de José*
- **Idea de José (2026-07-30), decisiones de alcance cerradas en esa sesión; falta la spec detallada.** Una Actividad `OBLIGATORIA` puede asignarse **por turnos** entre los participantes (hoy le toca a Ana, mañana a Luis), con el orden definido por el Tutor **o** al azar. Es el ítem más grande de los cuatro: es el único que agrega maquinaria nueva de verdad.
- Decisiones cerradas: (1) **el turno se persiste, sellado al abrir la Sesión** (consumiendo `SesionAbierta`), nunca se deriva al vuelo de una fórmula sobre la fecha — si se derivara, cambiar la lista de integrantes reescribiría el pasado y sería imposible auditar por qué se castigó a alguien; (2) **frecuencia configurable por actividad**: rota por Sesión (día) o por Sección (semana); (3) el modo al azar es **azar sin repetir hasta completar la vuelta** (shuffle bag), no azar puro — con un castigo de por medio, que a uno le toque tres veces seguidas se percibe como injusticia del sistema; (4) el pozo es una **lista que arma el Tutor**, con atajos que la precargan («todo el grupo», «todos los del rol X» — engancha con el #19) pero que siempre queda explícita y visible antes de guardar; (5) **quien no tiene el turno igual ve la tarea**, sin botón y con «hoy le toca a Ana» (mismo patrón visual que las tareas de equipo del #15: hace visible que el reparto es parejo); (6) premio y castigo van **solo a quien tiene el turno**; (7) si el asignado no cumple, **el turno avanza igual** al día siguiente — la rotación es un calendario, el castigo ya es la consecuencia; (8) el Tutor puede **reasignar el turno del día a mano** (queda registrado quién reasignó); (9) los días en que la actividad no corre por el ítem #11 **no consumen turno**; (10) quien entra al Grupo a mitad de vuelta se suma **en la vuelta siguiente**; (11) la rotación aplica **a obligatorias** — extenderla a opcionales después es una validación, no un rediseño.
- Depende de: confirmación de obligatorias (#8), actividades programadas (#11), `SesionAbierta` + scheduler con recuperación (#16, garantiza que la apertura no se pierde por un reinicio y por lo tanto los turnos tampoco) y los dos valores del **#20** (dependencia dura: los turnos heredan el modelo de puntos de la obligatoria, y hacerlo al revés obliga a retocar el reparto dos veces). Del **#19** depende **flojo**: el atajo «todos los del rol X» para precargar el pozo es una comodidad, no un bloqueo — este ítem puede salir con lista manual si se lo adelanta.

---

## Orden de ejecución sugerido para los ítems 18–21 (evaluado el 2026-07-30)

**18 → 20 → 19 → 21.**

1. **#18 primero** porque es el más barato de los cuatro y porque es *observabilidad*: los otros tres cambian cómo se comporta el sistema y el historial es lo que permite ver si esos cambios hacen lo esperado. Se pone la ventana antes de mover los muebles. Además es el único que no toca el motor de puntaje.
2. **#20 segundo** porque es chico (dos campos + que la confirmación publique evento) y su valor se percibe de inmediato: el integrante confirma y ve subir el puntaje. Es retro-compatible, así que ningún grupo cambia hasta que un Tutor cargue un valor positivo.
3. **#19 tercero** porque es bastante más obra que el #20 —entidad nueva en identity, un cruce por REST más en el camino caliente de `mi-estado-hoy`, pantallas de catálogo y de asignación— y su valor recién aparece cuando ya hay actividades restringidas por rol cargadas.
4. **#21 último** porque es el único que agrega maquinaria de verdad y porque hereda decisiones de los otros dos (ver sus dependencias arriba).

> Tensión registrada a propósito, por si en el futuro conviene revisarla: hay un argumento razonable para hacer el **#20 antes que el #18**, y es que el historial va a mostrar confirmaciones de obligatorias, que con el #20 pasan de valer 0 a valer puntos reales — construir el #18 primero implica volver a tocar cómo se renderiza esa fila. Se eligió igual #18 primero porque conviene tener la herramienta de observación **antes** de cambiar la economía de puntos del piloto, y porque el retoque es aditivo (una fila más de timeline), no un rediseño.

> Los ítems 11, 12, 13, 14 y 15 **no existían** en la redacción original de este archivo: se sumaron al índice el 2026-07-26 cuando José los pidió, con su nota de fecha para que quede claro que es alcance nuevo y no una reescritura de lo ya decidido. Los ítems 16 y 17 se sumaron el 2026-07-27 con el mismo criterio, y los ítems 18, 19, 20 y 21 el 2026-07-30 — estos cuatro quedaron con sus decisiones de alcance ya cerradas con José. El **#18 ya tiene su spec ejecutable** (`fase-14-18-historial-de-la-sesion.md`, escrita el 2026-07-30); los **#19, #20 y #21 todavía no**: cada uno necesita su `fase-14-NN-*.md` antes de tocar código, como todos los anteriores.

## Nota para Claude Code

No empieces ninguno de estos ítems por iniciativa propia ni los mezcles con trabajo de Fases 0–13. Cada uno de estos necesita su propia sesión de planificación detallada (mismo nivel de detalle que las fases anteriores) antes de tocar código — este archivo es un índice de alcance, no una especificación ejecutable todavía.
