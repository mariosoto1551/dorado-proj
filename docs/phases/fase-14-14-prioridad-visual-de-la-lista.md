# Fase 14 · Ítem 14 — Prioridad visual de la lista del integrante

> Sub-spec detallada del ítem 14 de `fase-14-post-mvp.md`. Especificación decidida con José (2026-07-26); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Ítem 8 (`mi-estado-hoy`), ítem 11 (actividades programadas, `disponibleHoy`) e ítem 12 (marcas rojas, `denegada`/`topeEfectivo`). Los tres existen.

## Motivación (el problema que resuelve)

La lista de hoy del integrante viene ordenada por `createdAt asc` — es decir, **por el orden en que el tutor creó las actividades**, que no significa nada para quien la mira. Una obligatoria que vence a las 14:00 puede aparecer sexta, debajo de tres opcionales de 3 puntos y de una tarea que ya hizo.

Pedido de José (2026-07-26): *"en el panel de usuario, las tareas obligatorias son de mayor importancia, así que siempre van más arriba; si hay hora límite, entonces esos van más arriba"*.

Al implementarlo aparece un segundo problema del mismo tipo que el ítem 12 resolvió: **una opcional con el deadline ya vencido muestra el botón «Completar» habilitado**, y al tocarlo el servidor devuelve 409 `DEADLINE_VENCIDO`. La pantalla promete algo que el backend rechaza. Se arregla acá porque es el mismo dato que hace falta para la cuenta regresiva.

## Decisiones de diseño (cerradas con José, 2026-07-26)

1. **El tipo manda sobre la hora.** Las obligatorias van **siempre** arriba de todas las opcionales. La hora límite ordena **dentro** de cada grupo. Una opcional que vence a las 18:00 queda debajo de una obligatoria sin hora: la obligatoria no es negociable, la opcional sí.
2. **Lo accionable arriba; lo que ya no requiere acción baja al final**, atenuado y detrás de un separador. La lista se va "vaciando" a medida que el integrante avanza, y lo primero que ve es siempre lo que le queda por hacer.
3. **Jerarquía por peso visual, sin encabezados de tramo.** Elegido por Claude a pedido de José ("¿puedes ver qué es lo más recomendado? hazlo"). Razón: la lista de un día son unas pocas tarjetas; tres encabezados sobre cuatro ítems agregan más cromo que contenido, y la decisión 2 ya obliga a **un** separador (pendientes / terminadas). Con un separador y peso visual distinto la jerarquía se siente sin leer nada. Si algún día la lista crece a 15 ítems, los encabezados se suman sin rehacer nada: el orden ya está calculado.

Detalles resueltos en esta spec:

4. **El orden se calcula en el cliente.** Los cuatro criterios salen de datos que el cliente ya tiene (`tipoPuntaje`, `tipoLimiteTiempo`, `deadlineEn`, más el estado de `mi-estado-hoy`). Ordenar en el servidor obligaría a que el backend conozca reglas de presentación y a re-pedir la lista cada vez que el integrante completa algo. El orden es presentación, y vive en la pantalla.
5. **`mi-estado-hoy` devuelve `deadlineEn`: el instante absoluto en que vence el deadline de hoy.** El cliente **no** puede calcularlo: `deadlineHora` es `"HH:mm"` en la timezone del Grupo, que el navegador no conoce, y usar la hora local del dispositivo violaría la regla de que el servidor es el dueño de la timezone (ADR-00 §6, ítem 11 decisión 6). Con el instante absoluto el cliente solo resta.
6. **La aritmética de offsets se aísla en una función con tests propios.** `comun/deadline.ts` evitaba deliberadamente construir el instante absoluto ("estable ante DST"); esa comparación por partes de calendario **no se toca** — sigue siendo la que valida `completar`. La función nueva es solo para lo que el frontend necesita mostrar, y su docstring dice exactamente eso.
7. **Un deadline vencido deshabilita el botón y hunde la tarjeta** (el problema del segundo párrafo). El servidor sigue siendo el que decide: la pantalla solo deja de prometer lo que ya sabe que va a fallar.
8. **La estabilidad del orden la da `Array.prototype.sort`**, que es estable por especificación: dos actividades con la misma prioridad conservan el orden de la API (`createdAt asc`). No se inventa un quinto criterio de desempate.

### El orden, completo

| # | Criterio | Por qué |
|---|---|---|
| 1 | Pendiente antes que terminada | Decisión 2. "Terminada" = hecha al tope, denegada por el tutor, con el cupo quemado, con el deadline vencido, o programada para otro día. |
| 2 | `OBLIGATORIA` antes que `OPCIONAL` | Decisión 1. |
| 3 | `DEADLINE` → `CRONOMETRO` → `SIN_LIMITE` | Lo que tiene reloj corriendo apura; el cronómetro apura menos porque lo arranca el integrante cuando quiere. |
| 4 | `deadlineEn` ascendente | Lo que vence antes, primero. |

Una **obligatoria `ASUME_HECHA`** (la que no se confirma nunca) **no** se considera terminada: no tiene acción posible, pero es un recordatorio de algo que hay que hacer hoy, así que se queda en la zona de prioridad.

---

## Parte A — `activity-service`: el instante del deadline

`comun/deadline.ts` suma:

```ts
/**
 * Instante absoluto en que vence el deadline de la Sesión: `deadlineHora` del
 * día en que arrancó la Sesión, en la timezone del Grupo. Existe solo para que
 * el frontend pueda mostrar una cuenta regresiva — la VALIDACIÓN sigue siendo
 * `deadlineVencido`, que compara por partes de calendario y no necesita offsets.
 */
export function instanteDeDeadline(
  fechaInicioSesion: Date,
  deadlineHora: string,
  timezone: string
): Date;
```

Resolución del offset en dos pasadas (el offset depende del instante que se busca — el huevo y la gallina del horario de verano): la primera lo estima interpretando la hora local como si fuera UTC, la segunda lo corrige con el offset real de esa fecha. Converge para todos los casos reales, incluidos los saltos de DST.

`MiEstadoActividadHoyDto` suma:

```ts
interface MiEstadoActividadHoyDto {
  // ... campos existentes ...
  /**
   * Instante absoluto (ISO) en que vence el deadline de HOY; null si la
   * actividad no es DEADLINE o si no se pudo resolver la timezone del Grupo.
   */
  deadlineEn: string | null;
}
```

La timezone del Grupo ya se resolvía en `miEstadoHoy` cuando había actividades programadas (ítem 11); ahora también se pide si hay alguna con `DEADLINE`. Sigue siendo **una** llamada por request, y el caso sin deadlines ni programación no paga ninguna.

Si la timezone no se pudo resolver, `deadlineEn` queda `null` y la pantalla se comporta como hoy (muestra `deadlineHora` como texto, sin cuenta regresiva y sin deshabilitar nada) — mismo criterio que `disponibleHoy` en el ítem 11: una falla ajena no apaga botones.

---

## Parte B — Frontend (`app-web`, `home-usuario.page.ts`)

**Orden**: el comparador de la tabla de arriba, aplicado dentro de cada bloque ("Actividades de hoy" y "Mis metas"). Los bloques no se reordenan entre sí.

**Separador**: entre las pendientes y las terminadas aparece una línea con la cuenta de lo que queda ("2 pendientes" / "¡Todo listo!" cuando no queda ninguna). Las terminadas van atenuadas.

**Peso visual**:
- Obligatoria: borde más marcado en ámbar, chip "Obligatoria".
- Opcional: borde fino neutro, los puntos en color de marca.
- Las dos conservan lo que ya tenían del ítem 12 (rojo de denegada, barrita de repeticiones) y del ítem 11 (chip de días).

**Cuenta regresiva** en las de `DEADLINE`, con color por urgencia:

| Falta | Color | Texto |
|---|---|---|
| > 3 h | neutro | `hasta 14:00` |
| ≤ 3 h | ámbar | `vence en 2 h 10 m` |
| ≤ 1 h | rojo | `vence en 25 m` |
| vencido | gris tachado | `venció 14:00` |

Se refresca con un `signal` de "ahora" que tickea cada 30 s, con el intervalo limpiado al destruir el componente. Nada de recalcular el día en el cliente: la única aritmética es `deadlineEn − ahora`.

---

## Criterios de aceptación

- [ ] Con dos obligatorias (14:00 y 20:00), una obligatoria sin hora y tres opcionales (una con hora, una con cronómetro, una sin límite), el orden es exactamente: obligatoria 14:00, obligatoria 20:00, obligatoria sin hora, opcional con hora, opcional con cronómetro, opcional sin límite.
- [ ] Una opcional que vence a las 18:00 queda **debajo** de una obligatoria sin hora (decisión 1).
- [ ] Al completar una actividad, esa tarjeta baja al tramo de terminadas y el contador de pendientes baja en uno.
- [ ] Una obligatoria **denegada** por el tutor (ítem 12) baja al tramo de terminadas; una obligatoria `ASUME_HECHA` **no** baja.
- [ ] Una actividad programada para otro día (ítem 11) va al tramo de terminadas.
- [ ] Una opcional con el deadline vencido: botón deshabilitado, chip "venció" y en el tramo de terminadas. Antes de este ítem el botón estaba habilitado y devolvía 409.
- [ ] `mi-estado-hoy` devuelve `deadlineEn` correcto: para una Sesión del 13/07 con `deadlineHora = "14:00"` y Grupo en `America/La_Paz` (UTC−4), el instante es `2026-07-13T18:00:00Z`.
- [ ] `deadlineEn` es `null` para actividades sin DEADLINE, y también si identity no respondió (la pantalla no se rompe: cae al texto de siempre).
- [ ] Dos actividades con la misma prioridad conservan el orden de la API (sort estable).
- [ ] El intervalo de la cuenta regresiva se limpia al salir de la pantalla (sin timers colgados).
- [ ] La validación de `completar` **no cambió**: sigue usando `deadlineVencido` por partes de calendario.

## Nota para Claude Code

Dos trampas. La primera: **no calcular el deadline con la hora local del navegador**. Funciona en el piloto (la familia y el Grupo están en la misma timezone) y rompe en silencio el día que no sea así; por eso el instante lo manda el servidor. La segunda: **no tocar `deadlineVencido`**. Esa función valida y está escrita a propósito sin aritmética de offsets; la función nueva es solo para presentación y convive con ella.

Y una nota de alcance: el orden es **presentación**, así que vive en el cliente. Si mañana se quiere el mismo orden en otra pantalla, se extrae el comparador a `core/`, no se mueve al backend.
