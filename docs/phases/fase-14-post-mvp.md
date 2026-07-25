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

## Nota para Claude Code

No empieces ninguno de estos ítems por iniciativa propia ni los mezcles con trabajo de Fases 0–13. Cada uno de estos necesita su propia sesión de planificación detallada (mismo nivel de detalle que las fases anteriores) antes de tocar código — este archivo es un índice de alcance, no una especificación ejecutable todavía.
