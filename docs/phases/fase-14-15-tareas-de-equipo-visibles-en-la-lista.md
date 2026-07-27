# Fase 14 · Ítem 15 — Las tareas de equipo, visibles pero no marcables en la lista del integrante

> Sub-spec del ítem 15 de `fase-14-post-mvp.md`. Ítem chico: solo frontend, sin schema, sin endpoints y sin eventos nuevos. Decidido con José (2026-07-26). **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Ítem 9 (equipos: `Actividad.alcance`), ítem 13 (`mi-equipo` con el estado de las tareas) e ítem 14 (orden y tramos de la lista). Los tres existen.

## Motivación (el bug que resuelve)

Ni `mi-estado-hoy` ni la home filtran por `alcance`, así que una **tarea de equipo aparece hoy en la lista individual del integrante con el botón «Completar»** — y ese botón siempre falla: `RegistroService.completar` la rechaza con 400 `ES_TAREA_DE_EQUIPO` porque va por la ruta del equipo.

Es el **tercer** caso de la misma familia que los ítems 12 y 14 ya arreglaron: la pantalla ofreciendo una acción que el servidor rechaza. Los otros dos fueron el cupo quemado (12) y el deadline vencido (14).

Pedido de José (2026-07-26): *"se debería poder ver en la lista qué tareas son de grupo y no se puede marcar directamente ahí, solo visual, que sepa el usuario"*. O sea: no ocultarlas —el integrante tiene que saber que existen— pero que quede claro que no se tocan desde ahí.

## Decisiones de diseño

1. **Bloque propio «De tu equipo»** (elegido por José entre tres opciones), después de «Actividades de hoy» y antes de «Mis metas». No se mezclan con las individuales ni se entierran en el tramo de terminadas: son de otra naturaleza, no son "algo ya resuelto".
2. **No cuentan en los pendientes propios.** El chip de cantidad de «Actividades de hoy» deja de incluirlas: el trabajo del equipo no es la carga individual del integrante. El bloque de equipo tiene su propio contador.
3. **Sin botón, con chip «Equipo» y enlace a «Mi equipo».** Se muestra "La marca el jefe desde «Mi equipo»" y el encabezado del bloque lleva un enlace directo. La redacción es neutra a propósito: sirve igual para el jefe (que ahí sí puede marcarla) y para el resto.
4. **Acento teal, no ámbar.** El ámbar ya significa "obligatoria" en esta lista (ítem 14); reusarlo haría leer como urgente algo que este usuario no puede tocar. Nota: `mi-equipo` usa ámbar para sus tarjetas de tarea, así que el color de "equipo" no es consistente entre las dos pantallas — se prioriza que dentro de la lista el ámbar signifique una sola cosa.
5. **`valorPuntos` se muestra como "+N c/u"**, no "+N pts": en una tarea de equipo el valor es **por integrante** (ítem 9, decisión 10 — no se divide).
6. **Sin barrita de repeticiones.** Las completadas de equipo viven en `RegistroTareaEquipo`, así que el `vecesHechas` de `mi-estado-hoy` es siempre 0 para ellas: la barrita se vería vacía aunque el jefe ya la hubiera marcado. El estado real está en «Mi equipo» (ítem 13).
7. **El orden y los tramos del ítem 14 se aplican igual dentro del bloque**: una tarea de equipo programada para otro día, o con el deadline vencido, baja al tramo de terminadas de su propio bloque.

### Fuera de alcance a propósito

- **Mostrar en la home si el jefe ya la marcó hoy.** Requeriría resolver el equipo del integrante y llamar a `tareas-de-hoy` (ítem 13) desde la home — una llamada más en la pantalla más caliente de la app, para un dato que está a un toque de distancia en «Mi equipo». Si José lo pide, es agregar ese fetch y reusar `TareaEquipoDeHoyDto`.

---

## Parte única — Frontend (`app-web`, `home-usuario.page.ts`)

No hay cambios de backend: `ActividadDto.alcance` ya viaja al cliente desde el ítem 9.

- `bloques()` separa `alcance = EQUIPO` antes de partir el resto en "del tutor" y "mis metas".
- `esDeEquipo(a)` gobierna: el subtítulo ("+N c/u" + la leyenda), el chip «Equipo» en lugar del botón, el acento teal de la tarjeta y la exclusión de la barrita.
- El encabezado del bloque lleva el enlace `→ Mi equipo`.

## Criterios de aceptación

- [ ] Una actividad con `alcance = EQUIPO` aparece en su propio bloque «De tu equipo», **no** en «Actividades de hoy».
- [ ] Esa tarjeta **no** tiene botón: muestra el chip «Equipo» y la leyenda de que la marca el jefe.
- [ ] El contador de «Actividades de hoy» no la cuenta.
- [ ] El enlace del encabezado lleva a `/mi-equipo`.
- [ ] Los puntos se muestran como "+N c/u".
- [ ] Una tarea de equipo con `repeticionesMaximasSesion > 1` **no** dibuja la barrita de repeticiones.
- [ ] Sin tareas de equipo en el grupo, el bloque no aparece y la lista se ve exactamente como antes de este ítem.
- [ ] Una tarea de equipo programada para otro día cae en el tramo de terminadas de su bloque, con el chip «Otro día».
- [ ] Las actividades individuales no cambian en nada.

## Nota para Claude Code

Es un ítem de tres líneas de lógica y un bloque de plantilla, pero cierra un bug real: hasta ahora ese botón devolvía 400 siempre. Si aparece un cuarto caso de "la pantalla ofrece lo que el servidor rechaza", vale la pena revisar de una vez **todas** las validaciones de `completar` contra lo que la home habilita, en vez de ir de a uno: las cuatro encontradas hasta acá (`ES_TAREA_DE_EQUIPO`, `LIMITE_REPETICIONES_ALCANZADO`, `DEADLINE_VENCIDO`, `ACTIVIDAD_DENEGADA_POR_TUTOR`) salieron de la misma causa — el cliente no sabía lo que el servidor sí.
