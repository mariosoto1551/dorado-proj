# Fase 14 · Ítem 17 — El plan del día: las opcionales se eligen, no se muestran todas

> Sub-spec del ítem 17 de `fase-14-post-mvp.md`. Decidido con José (2026-07-27). **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Ítem 8 (`mi-estado-hoy`), ítem 10 (`ConfiguracionContenidoGrupo` y `origen`), ítem 11 (`disponibleHoy`), ítem 14 (orden y tramos de la lista) e ítem 15 (bloque de equipo). Los cinco existen.

## Motivación

Hoy la lista del integrante muestra **todo el catálogo ACTIVA del grupo, todos los días**. Con 20 opcionales cargadas, el integrante ve 20 tarjetas aunque piense hacer 3: las obligatorias —lo que sí es innegociable— quedan ahogadas entre opciones, y el orden del ítem 14 acomoda el ruido pero no lo saca.

El catálogo y la agenda son dos cosas distintas y hasta acá eran la misma pantalla. Una opcional es un **menú** ("esto podés hacer si querés"); la lista de hoy debería ser un **compromiso** ("esto voy a hacer hoy").

Pedido de José (2026-07-27): *"para evitar ruido visual, ¿no se podría hacer que todas las tareas opcionales individuales estén ocultas o inhabilitadas por defecto, para que el participante pueda seleccionar la tarea que quiere hacer para habilitarla y ponerla?"*.

## Decisiones de diseño

1. **Solo las OPCIONALES INDIVIDUALES del catálogo del Tutor** entran al mecanismo: `tipoPuntaje = OPCIONAL` **y** `alcance = INDIVIDUAL` **y** `origen = TUTOR`. Quedan siempre visibles, como hoy:
   - las **OBLIGATORIAS** — no son un menú, no se eligen;
   - las de **EQUIPO** (bloque «De tu equipo», ítem 15) — este usuario no las marca;
   - **«Mis metas»** (`origen = USUARIO`) — el integrante ya las creó a propósito; obligarlo a elegirlas de nuevo cada día sería un paso vacío.
2. **El plan dura un día**, o sea **una Sesión**: la selección se guarda contra `sesionId`. Al abrir la Sesión siguiente el plan arranca vacío y el integrante vuelve a armarlo. Es lo que convierte la lista en una agenda; si durara para siempre, la lista volvería a crecer sola hasta el estado actual.
3. **Se activa por Grupo, default apagado**: `ConfiguracionContenidoGrupo.planDelDiaActivo = false`. Mismo criterio que el ítem 10: ningún grupo existente cambia de comportamiento con la migración. Con el flag apagado, **esta spec no cambia absolutamente nada** de lo que se ve hoy.
4. **Ocultas, no apagadas.** Con el flag activo, las opcionales no elegidas **no se renderizan** en la lista; se agregan desde una hoja («＋ Elegir») que abre el catálogo completo. Dejarlas en pantalla en gris no resolvía el problema: el largo de la pantalla es el ruido.
5. **El Tutor puede fijar algunas**: `Actividad.siempreVisible`. Una opcional marcada así aparece en la lista sin que el integrante la elija (y no se ofrece en la hoja: ya está). Le da al Tutor una palanca para destacar 2 o 3 sin tener que volverlas obligatorias.
6. **Sin tope de cuántas puede elegir.** El objetivo es bajar el ruido, no racionar el puntaje — y elegirlas todas deja la pantalla exactamente como está hoy, que es el comportamiento actual. (Ver *Fuera de alcance*: el tope configurable queda anotado para más adelante.)
7. **Se puede sacar del plan mientras no la haya empezado.** "Empezada" = tiene alguna `RegistroActividad` de tipo `COMPLETADA` en esta Sesión (viva **o** quitada por el tutor — el intento se gastó igual, ítem 12) o tiene un `CronometroActivo` corriendo. Si ya la empezó, el botón de quitar no aparece y el servidor responde 409.
8. **`SeleccionPlanDia` NO es un ledger** — es estado operativo, como `CronometroActivo`: no vale puntos, no viaja a scoring, no publica evento de dominio. Por eso **sí se borra físicamente** al sacarla del plan. La regla 6 de `CLAUDE.md` protege lo que sostiene el puntaje; esto no lo sostiene.
9. **`completar` e `iniciar-cronometro` dan de alta el plan solos** (upsert idempotente) si la actividad era elegible y no estaba. Dos razones: (a) una actividad que se completa **no puede desaparecer** de la lista —tiene que quedar en el tramo "Ya está"—, y (b) el Tutor completa en nombre del integrante (`datos.usuarioId`) sin saber nada de su plan.
10. **El servidor NO rechaza completar algo fuera del plan.** El plan es una preferencia de visualización, no una regla de negocio: convertirlo en validación crearía un quinto caso de "el servidor rechaza lo que la pantalla ofrecía" (la familia de los ítems 12, 14 y 15) sin ganar nada, porque los puntos y los topes ya están validados por otro lado.
11. **La hoja no ofrece lo que hoy no se puede hacer**: una opcional programada para otro día (`disponibleHoy = false`, ítem 11) no aparece en «Elegir». Elegir algo que el servidor va a rechazar es exactamente el bug de la familia anterior.
12. **El estado del plan viaja en `mi-estado-hoy`**, no en un GET nuevo: la home ya hace esa llamada y necesita el plan en el mismo instante que el resto del estado. Un endpoint aparte abriría una ventana en la que la lista y el plan discrepan.

### Fuera de alcance a propósito

- **Tope configurable de tareas por día** (ej. "máximo 5 en tu plan"). José lo pidió explícitamente como *más adelante*, no ahora. Cuando llegue: un `maxActividadesPlanDia Int?` en `ConfiguracionContenidoGrupo` (nullable = sin tope, que es el comportamiento de este ítem), validado en `PlanDiaService.agregar` y expuesto en `MiEstadoHoyDto` para que la hoja deshabilite el tilde al llegar al tope. Nada de lo que se escribe acá lo bloquea.
- **Que el Tutor vea el plan del día de cada integrante.** El panel operativo hoy no lo necesita: lo que le importa es lo hecho y lo no hecho, y eso no cambia.
- **Sugerencias automáticas** ("armá tu plan con lo de ayer", "las 3 que más hacés"). Es otro problema (recomendación), no este.
- **Notificación de "todavía no armaste tu plan"**. Depende de notification-service y de una hora de corte por grupo; no es parte de este ítem.

---

## Parte A — Schema (`activity-service`)

Migración `20260727150000_plan_del_dia_fase14`.

```prisma
model Actividad {
  // …
  // fase-14-17: la opcional aparece en la lista sin que el integrante la elija.
  // Solo relevante con planDelDiaActivo; default false = todas se eligen.
  siempreVisible Boolean @default(false)
}

model ConfiguracionContenidoGrupo {
  // …
  // fase-14-17: con true, las OPCIONALES individuales del catálogo del tutor
  // se ocultan hasta que el integrante las mete en su plan del día.
  // Default false ⇒ ningún grupo existente cambia de comportamiento.
  planDelDiaActivo Boolean @default(false)
}

// fase-14-17: qué opcionales eligió hacer HOY un integrante. Estado operativo,
// no ledger (misma naturaleza que CronometroActivo): no vale puntos, no viaja a
// scoring y se borra físicamente al sacarla del plan. Lleva organizacionId igual
// (regla 3) porque es una fila por usuario de un grupo.
model SeleccionPlanDia {
  id             String   @id @default(uuid())
  organizacionId String
  grupoId        String
  usuarioId      String
  actividadId    String
  sesionId       String
  createdAt      DateTime @default(now())

  @@unique([usuarioId, actividadId, sesionId])
  @@index([organizacionId])
  @@index([usuarioId, sesionId])
}
```

La `@@unique` es la que hace idempotente el alta automática de la decisión 9.

## Parte B — Backend (`activity-service`)

### Endpoints

| Método | Ruta | Rol | Qué hace |
|---|---|---|---|
| `POST` | `/activity/grupos/:grupoId/plan-dia` | `USUARIO` | Agrega `{ actividadId }` al plan de hoy del usuario del JWT. Idempotente. |
| `DELETE` | `/activity/grupos/:grupoId/plan-dia/:actividadId` | `USUARIO` | Lo saca, si no lo empezó. |

Las dos devuelven `PlanDelDiaDto { sesionId, actividadIds }` con el plan completo ya actualizado, para que la pantalla no tenga que re-consultar.

El `usuarioId` **siempre** sale del JWT (`tenant.principalId`), nunca del body (regla 3). No hay ruta de Tutor: el plan es del integrante.

### Errores nuevos

| Code | HTTP | Cuándo |
|---|---|---|
| `PLAN_DEL_DIA_INACTIVO` | 400 | El grupo tiene `planDelDiaActivo = false`. |
| `ACTIVIDAD_NO_ELEGIBLE_PARA_EL_PLAN` | 400 | No es OPCIONAL+INDIVIDUAL+TUTOR, o es `siempreVisible` (ya está en la lista). |
| `ACTIVIDAD_YA_EMPEZADA` | 409 | Al quitar algo con una COMPLETADA de esta Sesión o un cronómetro corriendo. |

Se reusan `NO_HAY_SESION_ABIERTA` (409) y `ACTIVIDAD_NO_DISPONIBLE_HOY` (409, ítem 11 — no se mete al plan algo que hoy no toca).

### Cambios en `mi-estado-hoy`

`MiEstadoHoyDto` suma `planDelDiaActivo: boolean`. Cada `MiEstadoActividadHoyDto` suma:

- `requiereSeleccion: boolean` — la actividad está sujeta al mecanismo (opcional + individual + del tutor + no `siempreVisible`) **y** el grupo lo tiene activo. Con el flag apagado es `false` para todas y la home se comporta como antes.
- `enPlan: boolean` — hay fila de `SeleccionPlanDia` para hoy. Con `requiereSeleccion = false` siempre viaja `true`: así el cliente tiene una regla única (*se muestra si `enPlan`*) en vez de dos condiciones combinadas en cada punto de la plantilla.

### Cambios en `completar` / `iniciar-cronometro`

Tras el registro exitoso, `upsert` de `SeleccionPlanDia` si la actividad es elegible y el grupo tiene el modo activo (decisión 9). Va **fuera** de la transacción del registro y con el error tragado: que falle el alta del plan no puede tumbar una completada que ya vale puntos.

### Config del Grupo

`ConfiguracionContenidoGrupoDto` y `ActualizarConfiguracionContenidoRequest` suman `planDelDiaActivo`. Cambiarlo publica la auditoría `CONFIG_CONTENIDO_ACTUALIZADA` que ya existe (con `antes`/`despues`), sin evento nuevo.

**Apagar el modo no borra las filas de `SeleccionPlanDia`**: dejan de leerse y mueren solas con la Sesión. Volver a encenderlo el mismo día recupera el plan que el integrante ya había armado.

## Parte C — Frontend (`app-web`)

### Home del integrante (`home-usuario.page.ts`)

- El bloque «Actividades de hoy» filtra por `enPlan` (regla única de la decisión 12). Los bloques «De tu equipo» y «Mis metas» no cambian.
- Con `planDelDiaActivo`, el encabezado del bloque lleva **«＋ Elegir»**, que abre una hoja (mismo patrón de modal-hoja que el resto de la app) con las opcionales elegibles y **disponibles hoy** que todavía no están en el plan. Tildar una la agrega; la hoja muestra puntos, límite de tiempo y repeticiones para poder decidir.
- En la tarjeta de una actividad `requiereSeleccion` que está en el plan y **no empezada**, un botón chico «✕» la saca. Empezada, no aparece.
- Vacío distinto: con el plan activo y sin nada elegido, el bloque dice *«Elegí qué vas a hacer hoy»* con el botón, no *«No hay actividades activas»*.
- La regla de visibilidad vive en `core/plan-del-dia.ts` (función pura, con su spec), no adentro del componente — igual que `prioridad-actividades.ts` del ítem 14.

### Pantalla del Tutor (`actividades.page.ts`)

- En el modal de configuración del grupo (el del ítem 10), un toggle **«Plan del día»** con su explicación de una línea.
- En el form de actividad, checkbox **«Siempre a la vista»**, visible solo si `alcance = INDIVIDUAL` **y** `tipoPuntaje = OPCIONAL` (las demás no lo usan).
- En la tarjeta del catálogo, chip **«📌 Siempre a la vista»** cuando corresponde.

## Criterios de aceptación

- [ ] Con `planDelDiaActivo = false` (default), la home del integrante se ve **exactamente** como antes de este ítem, y ningún grupo existente cambia tras la migración.
- [ ] Con el modo activo, una OPCIONAL individual del catálogo del tutor **no aparece** en la lista hasta que el integrante la elige.
- [ ] Las OBLIGATORIAS, las de EQUIPO y «Mis metas» aparecen siempre, sin elegirlas.
- [ ] Una opcional con `siempreVisible = true` aparece sin elegirla y **no** se ofrece en la hoja «Elegir».
- [ ] Elegir una la agrega a la lista al instante y sobrevive a recargar la página.
- [ ] Al abrir la Sesión siguiente, el plan arranca vacío.
- [ ] Una elegida y no empezada se puede sacar; una con una completada (o con el cronómetro corriendo) no, y el servidor responde 409 `ACTIVIDAD_YA_EMPEZADA`.
- [ ] Completar una actividad la deja en la lista (tramo "Ya está"), no la hace desaparecer.
- [ ] Un Tutor completando en nombre del integrante funciona aunque el integrante no la tuviera en su plan.
- [ ] La hoja «Elegir» no ofrece actividades programadas para otro día.
- [ ] `POST /plan-dia` con el modo apagado responde 400 `PLAN_DEL_DIA_INACTIVO`; con una obligatoria, 400 `ACTIVIDAD_NO_ELEGIBLE_PARA_EL_PLAN`.
- [ ] Un integrante no puede meter en su plan la actividad personal de otro (404/403 por el filtro de visibilidad del ítem 10).
- [ ] El orden y los tramos del ítem 14 siguen valiendo dentro de la lista ya filtrada.

## Nota para Claude Code

El riesgo de este ítem no es la lógica —es chica— sino **romper por omisión el default**: cada lectura nueva tiene que respetar que con `planDelDiaActivo = false` no cambia nada. Por eso `enPlan` viaja en `true` cuando `requiereSeleccion = false` (decisión 12): si el cliente tuviera que combinar dos flags en cada punto de la plantilla, el primer olvido escondería una actividad que debería verse, y esconder algo es mucho peor que mostrarlo de más.
