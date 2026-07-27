# Fase 14 · Ítem 11 — Actividades programadas (solo ciertos días)

> Sub-spec detallada del ítem 11 de `fase-14-post-mvp.md`. Fase 13 está **ESTABLE** (ver `docs/progreso/fase-13-piloto-deploy.md`), así que la condición de arranque de Fase 14 está cumplida. Especificación decidida con José (2026-07-26); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Fases 5 (catálogo), 6 (ciclo Sección/Sesión), 7 (registro + ledger) completas, más los ítems de Fase 14 ya ejecutados: confirmación de obligatorias (#8, `comportamientoAlCierre` + consumidor de cierre en activity), equipos (#9, `alcance`) y contenido por integrantes (#10, `origen`). Todos existen.

## Motivación (el problema que resuelve)

Hoy toda actividad `ACTIVA` está disponible **todos los días** que haya Sesión abierta. José necesita que algunas se puedan hacer **solo ciertos días** ("sacar la basura los martes y viernes", "regar las plantas los domingos"): hoy la única forma de lograrlo es archivarla y recrearla, o dejarla siempre disponible y confiar en la memoria de cada uno.

Además —y esto es lo que hace que no sea solo cosmético— una **obligatoria confirmable** (ítem 8) que no toca hoy hoy castiga igual al cerrar la sesión: el sistema resta puntos por no hacer algo que no correspondía hacer.

## Decisiones de diseño (cerradas con José, 2026-07-26)

1. **Alcance de este corte: solo días de la semana.** José anticipó que después va a querer **fechas concretas** ("solo el 24 de diciembre") y/o rangos. No se implementan ahora, pero toda la lógica de disponibilidad vive en **una sola función** (`comun/programacion.ts`), así sumar fechas es agregar un campo y editar ese archivo — no rediseñar el enforcement en cinco lugares.
2. **Convención de días: `0 = domingo … 6 = sábado`**, la misma que ya usa el proyecto para los cron de `ConfiguracionSesion` y el selector de días de `configuracion-sesion.page.ts` (que muestra Lun→Dom pero guarda con domingo en 0). No se inventa una segunda numeración.
3. **Vacío = todos los días.** `diasSemana = []` es el default y significa "sin restricción". Toda actividad preexistente queda así: la migración no cambia el comportamiento de nada.
4. **Lo configura solo el Tutor/ORG_ADMIN**, en el mismo modal de crear/editar actividad. El contenido creado por integrantes (ítem 10) **no** lleva programación en este corte: su request no expone el campo, así que queda `[]`.
5. **El integrante ve la actividad apagada, no oculta**: en gris, sin botón, con un chip "solo los martes". Sabe que existe y cuándo le toca, en vez de preguntarse por qué desapareció.

Detalles resueltos en esta spec:

6. **El día se evalúa sobre el día de inicio de la SESIÓN, no sobre "ahora"**, y en la **timezone del Grupo** (ADR-00 §6) — mismo criterio que `deadlineVencido` (Fase 7). Razón: una Sesión de Destino:Dorado abre 00:00 y cierra 00:00 del día siguiente; si se mirara el reloj del servidor al momento del cierre, la sesión del martes se evaluaría como miércoles y el castigo caería en el día equivocado. El día de la Sesión es el día del registro, punto.
7. **`SesionCerrada` suma `fechaInicio` a su payload** (cambio **aditivo**, campo opcional en el tipo compartido). El consumidor de cierre de activity necesita saber a qué día pertenecía la sesión que se cerró, y el payload no lo traía. Si el campo **falta** (mensaje viejo en la cola durante el despliegue), el cierre **no castiga** las actividades programadas — ante la duda no se restan puntos; las no programadas (`diasSemana = []`) siguen exactamente igual.
8. **Programar no reemplaza a archivar**: una actividad programada sigue `ACTIVA` todos los días; simplemente no es registrable fuera de sus días. No se toca `EstadoCatalogo`.

---

## Parte A — `activity-service`: el campo y la regla

### Modelo de datos

```prisma
model Actividad {
  // ... campos existentes ...
  // fase-14-11: días de la semana en que la actividad se puede registrar.
  // 0 = domingo … 6 = sábado (misma convención que los cron de session).
  // Vacío = todos los días (default: comportamiento previo).
  diasSemana Int[] @default([])
}
```

Sin índice: se filtra en memoria sobre el catálogo del grupo (decenas de filas), no en la query.

### La regla, en un solo lugar

`apps/activity-service/src/comun/programacion.ts`:

```ts
/** Día de la semana (0=domingo…6=sábado) del instante, en la timezone dada. */
export function diaSemanaEnTimezone(instante: Date, timezone: string): number;

/**
 * ¿La actividad se puede registrar en la Sesión que arrancó en `fechaInicioSesion`?
 * `diasSemana` vacío = siempre. Punto único de extensión: cuando se agreguen
 * fechas concretas (ítem futuro), se amplía ESTA función y nada más.
 */
export function estaDisponibleEn(
  diasSemana: number[],
  fechaInicioSesion: Date,
  timezone: string
): boolean;
```

### Enforcement (los cinco lugares)

Igual que el filtro de visibilidad del ítem 10, el riesgo acá es **olvidar uno**:

| Dónde | Qué pasa si no toca hoy |
|---|---|
| `RegistroService.completar` | 409 `ACTIVIDAD_NO_DISPONIBLE_HOY` (incluye los días en el body del error). |
| `RegistroService.iniciarCronometro` | Mismo 409 — no tiene sentido arrancar un cronómetro que no se va a poder cerrar. |
| `RegistroService.registrarNoHizo` (Tutor) | Mismo 409: no se castiga a mano por algo que no correspondía. |
| `TareasEquipoService.completar` | Mismo 409 (una tarea de equipo también puede estar programada). |
| `CierreService` (castigo automático, ítem 8) | **Se saltea** la obligatoria: no genera `NO_HIZO`. Es el caso que motiva el ítem. |

En los tres primeros el chequeo va **después** de resolver la Sesión abierta (necesita su `fechaInicio`) y **antes** de contar repeticiones. La timezone del Grupo se resuelve por el interno de identity que ya se usa para el deadline.

### Lectura para el frontend

`MiEstadoActividadHoyDto` (ítem 8) suma dos campos:

```ts
interface MiEstadoActividadHoyDto {
  // ... campos existentes ...
  /** false si la actividad está programada y hoy no es uno de sus días. */
  disponibleHoy: boolean;
  /** Los días configurados (0=domingo…6=sábado); vacío = todos. */
  diasSemana: number[];
}
```

`ActividadDto` suma `diasSemana: number[]` (lo necesita el modal del tutor y el chip del integrante).

---

## Parte B — `session-service`: `fechaInicio` en el evento

`SesionEventoPayload` suma `fechaInicio?: string` (ISO). Lo publican `SesionAbierta` y `SesionCerrada` (el helper `eventoDeSesion` es común a ambos). Es aditivo: scoring y notification ignoran el campo y no cambian.

`docs/architecture/event-catalog.md` se actualiza con el campo nuevo.

---

## Parte C — Frontend (`app-web`)

**Tutor**, en el modal de crear/editar actividad (donde ya están alcance, tipo y límite de tiempo):
- Selector "¿Qué días se puede hacer?" con los 7 chips **Lun → Dom** (mismo orden y estilo que el de configuración de sesión, para que se sienta la misma app).
- Debajo, el resumen en lenguaje natural: "todos los días" / "los martes y jueves" / "de lunes a viernes".
- Ninguno marcado = todos los días (se explica en el hint, no es un error).
- En la lista de actividades, chip con los días cuando está programada.

**Integrante**:
- En la lista de hoy, la actividad que no toca aparece **atenuada**, sin botón, con un chip "solo los martes" (usa `disponibleHoy` y `diasSemana` de `mi-estado-hoy`, no recalcula el día en el cliente — la verdad del día es del servidor, que sabe la timezone del Grupo).
- Las que sí tocan no cambian en nada.

---

## Criterios de aceptación

- [ ] **Default intacto**: una actividad sin días configurados (`[]`) se comporta exactamente como antes, todos los días.
- [ ] El Tutor crea "Sacar la basura" con días `[2, 5]` (martes y viernes): en una Sesión de un martes el integrante la completa normal; en una de un lunes recibe 409 `ACTIVIDAD_NO_DISPONIBLE_HOY` y la pantalla la muestra apagada.
- [ ] `iniciarCronometro` y el `no-hizo` del Tutor devuelven el mismo 409 fuera de los días.
- [ ] Una tarea de **equipo** programada no la puede completar el jefe fuera de sus días.
- [ ] **El caso que motiva el ítem**: una OBLIGATORIA `REQUIERE_CONFIRMACION` programada solo para el martes **no** genera `NO_HIZO` automático al cerrar la sesión del lunes, y **sí** lo genera al cerrar la del martes si nadie confirmó.
- [ ] El día se evalúa en la **timezone del Grupo** y sobre el **día de inicio de la Sesión**: una sesión que arranca lunes 22:00 hora del Grupo (martes 02:00 UTC) cuenta como **lunes**.
- [ ] `mi-estado-hoy` devuelve `disponibleHoy` correcto por actividad, y `diasSemana` para el chip.
- [ ] Si `SesionCerrada` llega sin `fechaInicio` (mensaje viejo), el cierre no castiga las programadas y sí las normales.
- [ ] El contenido creado por integrantes (ítem 10) sigue sin programación: su request no acepta el campo y queda `[]`.
- [ ] Aislamiento multi-tenant: sin cambios (el campo viaja dentro de la `Actividad`, ya tenant-scoped).

## Nota para Claude Code

Ítem chico en superficie (un campo) y grande en **puntos de enforcement**: los cinco de la tabla de la Parte A. El que importa de verdad es `CierreService` — si se olvida, el sistema resta puntos por no hacer algo que no tocaba, y eso es un bug de puntaje, no cosmético. Toda la evaluación de disponibilidad va en `comun/programacion.ts` con tests propios de timezone (copiar el estilo de `deadline.spec.ts`, que ya cubre el caso de sesión nocturna): cuando se agreguen **fechas concretas**, ese archivo y los DTOs son lo único que se toca. No inventar una segunda numeración de días: `0 = domingo`, como los cron de `session-service`.
