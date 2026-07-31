# Fase 14 · Ítem 20 — Las obligatorias también suman al cumplirse

> Sub-spec detallada del ítem 20 de `fase-14-post-mvp.md`. Especificación decidida con José (2026-07-30); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Fases 5 (catálogo), 6 (ciclo Sección/Sesión) y 7 (registro + ledger) completas, más los ítems de Fase 14 ya ejecutados: confirmación de obligatorias (#8), actividades programadas (#11), marcas rojas del tutor (#12) e historial de la sesión (#18). Todos existen.

## Qué decisión revisa este ítem

El ítem #8 fijó, como **decisión 2** de `fase-14-08-confirmacion-obligatorias.md`:

> **Confirmar una obligatoria vale 0 puntos** — solo evita el descuento, no otorga puntos (hacer lo obligatorio es el deber, no un bonus).

José la revisó el 2026-07-30 y decidió que una obligatoria **también pueda premiar**. Este ítem **supersede esa decisión**. Siguiendo el protocolo de `docs/progreso/README.md`, el archivo del ítem #8 **no se edita**: queda como la decisión que se tomó entonces, y este documento es el que la cambia, con su fecha y su motivo.

## Motivación (el problema que resuelve)

Con la regla actual, la pantalla del integrante tiene un agujero motivacional: toca «Ya lo hice» en una obligatoria y **no pasa nada visible**. El puntaje no se mueve. Lo único que hizo fue evitar un castigo que solo aparecería a la noche, cuando cierre la sesión — un refuerzo negativo diferido, que es exactamente lo contrario de cómo funciona el resto del sistema.

La consecuencia práctica es que las obligatorias se sienten como trampas en vez de tareas: solo se pueden perder puntos con ellas. Poder darles un premio chico (**+2**) frente a un castigo grande (**−10**) mantiene la asimetría que las hace obligatorias, pero le devuelve al integrante la respuesta inmediata que tiene con cualquier opcional.

## Decisiones de diseño (cerradas con José, 2026-07-30)

1. **Dos valores independientes**, no uno simétrico: `puntosPorCumplir` (nuevo) y `valorPuntos` (el castigo, que ya existe). El caso realista es **+2 / −10**: el castigo pesa más que el premio, y eso es lo que la mantiene obligatoria en vez de convertirla en una opcional disfrazada. Un valor único (+5/−5) se descartó por eso.
2. **Los puntos se acreditan al instante al confirmar**, no al cerrar la sesión. El refuerzo inmediato es el punto de la gamificación; si el Tutor después la marca en rojo, la compensación del ítem #12 ya existe y se los quita.
3. **Retro-compatible**: `puntosPorCumplir` arranca en **0** para toda actividad existente, así que ninguna cambia de comportamiento con la migración.

Detalles resueltos en esta spec:

4. **Solo tiene efecto con `OBLIGATORIA` + `REQUIERE_CONFIRMACION`.** Con `ASUME_HECHA` no hay ninguna acción del integrante que registrar, así que un `puntosPorCumplir > 0` sería un premio que nadie puede cobrar: se **fuerza a 0** al crear y al editar. Con `OPCIONAL` también se fuerza a 0 — ahí el premio ya es `valorPuntos`. Es la misma mecánica de recálculo que ya tienen `siempreVisible` (#17) y `bonoJefePuntos` (#9): el campo se normaliza contra el resto de la fila aunque el request no lo mande.
5. **La confirmación deja de ser invisible para `scoring-service`.** Hoy `completar` **no publica ningún evento** cuando es una confirmación, justamente porque vale 0 (`fase-14-08`, Parte A). Con este ítem publica `ActividadCompletada` como cualquier otro registro. La condición cambia de *"no es una confirmación"* a *"el snapshot no es 0"*: una confirmación que vale 0 sigue sin publicar nada, que es **exactamente** el comportamiento de hoy. Este es el grueso del trabajo del ítem — no el campo nuevo.
6. **El override del «no hizo» ahora tiene que compensar.** Cuando el Tutor marca «no hizo» sobre una obligatoria que el integrante ya había confirmado, `registrarNoHizo` da de baja esa confirmación **sin publicar nada**, porque valía 0. Si valía +2, esa baja tiene que publicar `ActividadRegistroEliminado`, o el integrante se queda con el +2 **y** el −10. Es el punto más fácil de olvidar de todo el ítem, y el único que produce un puntaje incorrecto en vez de una molestia visual.
7. **Revertir una marca roja ya funciona sin cambios**: `revertirMarca` (#12) publica `ActividadRegistroRevertido` si `valorPuntosSnapshot !== 0`, así que una confirmación con puntos entra sola en la cadena de compensación.
8. **El castigo automático del cierre no cambia**: el consumidor de `SesionCerrada` (#8) sigue registrando `−valorPuntos`. `puntosPorCumplir` no participa: no cumplir nunca fue "no cobrar el premio", es cobrar el castigo.
9. **`puntosPorCumplir` no puede ser negativo** (`@Min(0)`, mismo criterio que `bonoJefePuntos`) y **no tiene tope propio**: el tope de lo que puede valer una actividad ya lo pone el catálogo del Tutor. El contenido creado por integrantes (#10) no se ve afectado — solo puede crear `OPCIONAL`, donde este campo se fuerza a 0.
10. **Sin campo nuevo en `MiEstadoActividadHoyDto`.** La pantalla del integrante ya lee el valor desde `ActividadDto` (`mi-estado-hoy` lleva estado, no catálogo); alcanza con exponerlo ahí.

### Fuera de alcance a propósito

- **Puntos por cumplir en tareas de equipo** (`alcance = EQUIPO`). Una tarea de equipo es siempre `OPCIONAL` (#9), así que no toca este ítem.
- **Escalar el castigo por reincidencia** (no hacerla dos días seguidos cuesta más). Es un ítem propio si alguna vez se quiere.
- **Migrar obligatorias existentes a un valor > 0**: la decisión 3 dice que arrancan en 0 y es el Tutor quien decide, actividad por actividad, si quiere premiar.

---

## Parte A — `activity-service`

### Modelo de datos

```prisma
model Actividad {
  // ... campos existentes ...
  // fase-14-20: lo que SUMA cumplir una obligatoria confirmable. `valorPuntos`
  // sigue siendo el castigo por no hacerla. Default 0 ⇒ toda actividad
  // preexistente conserva el comportamiento del ítem 8 (confirmar vale 0).
  // Se fuerza a 0 fuera de OBLIGATORIA + REQUIERE_CONFIRMACION (decisión 4).
  puntosPorCumplir Int @default(0)
}
```

Sin índice nuevo: el campo se lee siempre junto con la fila de la actividad.

### Reglas

| Dónde | Regla |
|---|---|
| `ActividadesService.crear` / `.editar` | Normaliza `puntosPorCumplir`: se conserva solo si `tipoPuntaje = OBLIGATORIA` **y** `comportamientoAlCierre = REQUIERE_CONFIRMACION`; en cualquier otro caso se guarda 0, aunque el request mande otra cosa. Se recalcula en **cada** PATCH contra los valores finales de la fila, no contra los del request. |
| `RegistroService.completar` | `valorPuntosSnapshot` de una confirmación pasa de `0` a `actividad.puntosPorCumplir`. |
| `RegistroService.completar` (publicación) | Publica `ActividadCompletada` cuando `registro.valorPuntosSnapshot !== 0` (antes: cuando no era confirmación). |
| `RegistroService.registrarNoHizo` (override) | Antes de dar de baja las confirmaciones vivas, las lee; por cada una con `valorPuntosSnapshot !== 0` publica `ActividadRegistroEliminado` para que scoring compense (decisión 6). |
| Consumidor de `SesionCerrada` (#8) | **Sin cambios**: el castigo automático sigue siendo `−valorPuntos`. |

### DTO de entrada

`CrearActividadRequest` y `EditarActividadRequest` suman:

```ts
// fase-14-20: lo que suma cumplirla. Solo se conserva en OBLIGATORIA +
// REQUIERE_CONFIRMACION; en el resto el service lo fuerza a 0.
@IsOptional()
@IsInt()
@Min(0)
puntosPorCumplir?: number;
```

`ActividadDto` (shared-types) suma `puntosPorCumplir: number`.

### Lo que NO cambia

- Ningún evento **nuevo**: se reusa `ActividadCompletada` y `ActividadRegistroEliminado`, con sus payloads tal cual están.
- `scoring-service` **no se toca**: ya sabe procesar los dos eventos y ya arma la cadena de compensación (`corregidoDeId`) desde el #12.
- El Gateway, `session-service` e `identity-service` no participan.

---

## Parte B — Frontend (`app-web`)

**Tutor** (`actividades.page.ts`): campo «Puntos por cumplirla» en el formulario de actividad, **visible solo** cuando la actividad es `OBLIGATORIA` con confirmación — la misma condición que ya gobierna al selector de `comportamientoAlCierre`. Con ayuda corta: *«Lo que gana si la hace. Dejalo en 0 si cumplir es solo evitar el descuento.»* Y el resumen de la tarjeta muestra los dos números cuando el premio no es 0: **`+2 / −10`**.

**Integrante** (`home-usuario.page.ts`): una obligatoria confirmable con premio muestra `+N` en la tarjeta, igual que una opcional. Con premio 0 la tarjeta queda **exactamente como hoy** (sin número), que es lo que hace invisible el cambio para los grupos que no lo usen.

**Historial** (#18): una confirmación con puntos ya no cae en la rama «Confirmada» sin número — `etiquetaDeEvento` la nombra por sus puntos. Es consecuencia automática de que el snapshot deje de ser 0; **no hay que tocar el componente**, pero sí hay que verificarlo (criterio de aceptación).

---

## Criterios de aceptación

- [ ] **Default intacto**: una obligatoria confirmable con `puntosPorCumplir = 0` se comporta exactamente como antes — confirmar no publica evento, no toca el ledger y la tarjeta del integrante no muestra número.
- [ ] Con `puntosPorCumplir = 2` y `valorPuntos = 10`: el integrante confirma → su puntaje sube **+2** en el ledger de scoring, al instante.
- [ ] Ese mismo integrante, si **no** confirma, recibe **−10** al cerrar la sesión (el castigo no cambió).
- [ ] El Tutor marca «no hizo» sobre una confirmación que valía +2 → el neto del integrante queda en **−10**, no en **−8**: la baja de la confirmación se compensa en el ledger (decisión 6).
- [ ] El Tutor deshace esa marca → vuelve a **+2** neto.
- [ ] `puntosPorCumplir` se fuerza a 0 al crear/editar una `OPCIONAL`, una `OBLIGATORIA` con `ASUME_HECHA`, y una tarea de `EQUIPO`.
- [ ] Cambiar una obligatoria confirmable con premio a `ASUME_HECHA` por PATCH **apaga el premio** aunque el request no mande el campo.
- [ ] `puntosPorCumplir` negativo → 400.
- [ ] El historial (#18) muestra la confirmación con sus `+2` y no como «Confirmada» sin número.
- [ ] La migración es retro-compatible: aplicarla no cambia el puntaje de ningún grupo existente.
- [ ] `activity` sigue verde en tests y lint; la migración aplica contra Postgres real.

## Nota para Claude Code

El campo nuevo es la parte fácil y es media hora. El ítem son **dos líneas de publicación de eventos**:

1. `completar` tiene que publicar cuando el snapshot no es 0 — no cuando "no es una confirmación". Si se deja la condición vieja, el integrante ve la tarjeta con +2 y el puntaje no se mueve: el bug clásico de este proyecto, la pantalla prometiendo algo que el servidor no hizo.
2. `registrarNoHizo` tiene que compensar la confirmación que da de baja. Ese es el único camino del ítem que produce un **número equivocado** en vez de una molestia visual, y no lo cubre ningún test existente porque hasta hoy esa baja siempre valía 0.

Y un recordatorio de protocolo: este ítem revisa la decisión 2 del #8. `fase-14-08-confirmacion-obligatorias.md` **no se toca** — la revisión vive acá.
