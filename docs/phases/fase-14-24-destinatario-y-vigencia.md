# Fase 14 · Ítem 24 — Destinatario y vigencia de una Actividad

> Sub-spec detallada del ítem 24 de `fase-14-post-mvp.md`. Especificación decidida con José (2026-08-03); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Fases 5 (catálogo), 6 (ciclo Sección/Sesión) y 7 (registro + ledger) completas, más los ítems de Fase 14 ya ejecutados que este toca directamente: **#8** (`comportamientoAlCierre` + consumidor de cierre), **#9** (`alcance` + `Equipo`/`EquipoMiembro` en identity), **#10** (`origen`), **#11** (`diasSemana` + `comun/programacion.ts`), **#17** (plan del día), **#19** (`rolesPermitidos` + `comun/restriccion-rol.ts`) y **#21** (turnos rotativos). Todos existen y están verificados.

Del **#23** depende flojo: la lista agrupada de la Parte D reusa los patrones que la Tanda 2 extrajo a `libs/shared-ui`. Si esos no estuvieran, el ítem sale igual con más copia a mano.

## Motivación (el problema que resuelve)

Tres molestias que José reportó el 2026-08-02 usando la app, las tres sobre el catálogo de actividades:

1. **Una actividad es del Grupo entero o de nadie.** Lo más cerca que hay es `rolesPermitidos` (#19, "los del rol Cocina") y la rotación de turnos (#21, "hoy le toca a Ana"). No hay forma de decir **"esto es de Ana y de Luis, siempre"**: hay que crear un rol de una sola persona, o cargarla para todos y confiar en que el resto no la marque.
2. **Todo es diario.** Con el #11 se puede acotar a días de la semana ("los martes"), pero no a **una fecha o un período** ("el 24 de diciembre", "la campaña de lectura de marzo"). Hoy eso se hace creando la actividad a mano el día antes y archivándola a mano el día después — y si el tutor se olvida de lo segundo, sigue viva y sigue castigando.
3. **La lista del tutor es un bloque plano.** `actividades.page.ts` es un `@for` sobre todas las `ACTIVA` en orden de creación, sin agrupar, sin filtrar y sin buscador. Con pocas actividades se tolera; con muchas es imposible saber de un vistazo qué es general y qué es específico de alguien.

Los tres son el mismo problema visto de tres lados: **la actividad no dice para quién ni hasta cuándo es**, así que la pantalla tampoco puede decirlo.

## Decisiones de diseño (cerradas con José, 2026-08-03)

### Destinatario

1. **Cuatro modos excluyentes, no filtros que se cruzan.** El modal tiene un solo selector "¿Quién la hace?" con **Todo el grupo** / **Los del rol X** / **Estas personas** / **Estos equipos**. Se elige **uno**. La alternativa evaluada —dejar que roles y personas se combinen— se descartó porque obliga a fijar una semántica de cruce (¿intersección o unión?) que **no se puede explicar en una pantalla**: "los del rol Cocina y además Ana" y "los de Cocina que además sean Ana" son la misma frase en castellano y dos conjuntos distintos.
2. **El caso mixto se resuelve con un atajo, no con una regla.** El modo "Estas personas" ofrece *"precargar los del rol Cocina"* / *"precargar todo el grupo"*: llena la lista, que queda **explícita y editable** antes de guardar. Es exactamente el patrón de la decisión 4 del **#21** para el pozo de turnos, y por el mismo motivo — una lista que se ve es auditable, una regla que se cruza no.
3. **Diferencia real entre el modo rol y el modo personas, y por eso conviven los dos**: "los del rol Cocina" es **dinámico** (quien reciba el rol mañana queda incluido solo); "estas personas" es **estático** (quien entre al grupo mañana no entra a la lista). No es redundancia: son dos intenciones distintas, y el #19 pierde su valor si se lo reemplaza por una lista congelada.
4. **Quien no es destinatario NO ve la actividad.** Se oculta, no se muestra apagada — mismo criterio que el #19 (decisión 6) y el opuesto al del #15/#21. La razón ya está escrita en el progreso del #19 y vale igual acá: en turnos y equipos la visibilidad **comunica que el reparto es parejo**; en una asignación nominal comunicaría ruido permanente, porque no rota nunca.
5. **Con `alcance = EQUIPO`, el destinatario es por equipo.** El modo "Estas personas" queda deshabilitado y aparece "Estos equipos" en su lugar. Si la tarea es colectiva, el destinatario también lo es; asignar una tarea de equipo a personas sueltas obligaría a preguntarse qué pasa con los otros miembros de ese equipo, y no hay respuesta buena.
6. **Con turnos rotativos (#21), el pozo se limita a los destinatarios.** El armador solo ofrece a las personas del destinatario, y sacar a alguien del destinatario lo saca del pozo. Una sola verdad sobre quién participa. Las **vueltas ya selladas no se tocan** (decisión 15 del #21): el recorte aplica desde la vuelta siguiente.

### Vigencia

7. **Un solo par de campos, `desde` y `hasta`, ambos opcionales.** "Solo el 24 de diciembre" es `desde = hasta = 2026-12-24`; "a partir del 1 de marzo" es solo `desde`; "hasta fin de mes" es solo `hasta`; los dos vacíos es el default y significa **permanente**, que es el comportamiento de todo lo que existe hoy. Un concepto en vez de dos modos ("fecha única" vs. "rango") que además hay que validar por separado.
8. **La vigencia se cruza con los días de la semana del #11.** "Los lunes y miércoles, entre el 1 y el 30 de marzo" es válido y es el caso interesante: el rango acota el período, los días filtran adentro. Ninguna actividad existente cambia — sin fechas, el cruce es idéntico a lo que el #11 ya hace.
9. **Las fechas son civiles, no instantes**: se guardan como `String` `"YYYY-MM-DD"` en el calendario **local del Grupo**, igual que `deadlineHora` guarda `"HH:mm"` local desde la Fase 7. Guardar un `DateTime` obligaría a decidir a qué hora del día empieza el "1 de marzo" y en qué zona, y ese es exactamente el error que el #11 se cuidó de no cometer al evaluar el día sobre el inicio de la Sesión.
10. **Fuera del rango, el integrante no la ve** — ni antes de empezar ni después de vencer. Es distinto del "hoy no toca" del #11, que sí se muestra en gris **porque mañana vuelve**; un rango que terminó no vuelve nunca y quedaría como ruido permanente en la lista.
11. **Al vencer, la actividad se archiva sola.** Pasa a `ARCHIVADA` sin intervención del tutor, y por lo tanto desaparece de la lista de activas y del catálogo del integrante por el camino que ya existe. El archivado corre **al cerrar la Sesión**, dentro del consumidor que el #8 ya tiene montado: es el único punto del sistema que corre una vez por día por grupo y que **ya resolvió la fecha y la timezone**. Sin cron nuevo.
12. **Archivar por vencimiento no borra nada.** `EstadoCatalogo` ya existe y ya significa esto; el ledger de registros de los días en que la actividad sí corrió queda intacto (regla 6 de `CLAUDE.md`). Desarchivarla a mano la revive, y si sigue vencida se vuelve a archivar al cierre siguiente — el tutor tiene que correr el `hasta` para revivirla de verdad, que es lo correcto.

### Lista del tutor

13. **Agrupada por destinatario, con buscador.** Secciones plegables *De todo el grupo* / *Por rol* / *De personas* / *De equipos*, cada una con su contador, más un buscador por nombre arriba. Es lo que José pidió literalmente ("un tutor debe saber las tareas generales, o específicas") y es lo que escala: con 40 actividades se siguen viendo 4 encabezados.
14. **La vigencia no es un eje de agrupación, es un chip.** Se evaluó agrupar por vigencia y se descartó: el destinatario es una propiedad estable de la actividad y la vigencia cambia sola con el calendario, así que agrupar por ella haría que las tarjetas salten de sección sin que nadie las toque.

### Alcance explícito de este corte

15. **No aplica a Conductas.** El catálogo de conductas queda exactamente como está.
16. **No aplica al contenido creado por integrantes (#10).** Una actividad de `origen = USUARIO` ya es personal de su autor; su request no expone destinatario ni vigencia y quedan vacíos. Mismo criterio que la decisión 4 del #11.
17. **No se toca la lista del integrante más allá de lo que sale gratis** (las que no le corresponden dejan de aparecer). Reordenarla es la segunda vuelta del #23, que ya tiene ese alcance anotado.

---

## Parte A — `activity-service`: los campos

### A.1 Modelo de datos

```prisma
model Actividad {
  // ... campos existentes ...

  // fase-14-24: destinatario nominal. Ids de Usuario (identity) — SIN FK, son
  // de otra base (regla 2), se validan por REST interno al escribir. Vacío = no
  // es el modo activo. Mismo criterio y misma forma que `rolesPermitidos` (#19).
  usuariosPermitidos String[] @default([])
  // fase-14-24: ids de Equipo (identity). Solo con alcance = EQUIPO.
  equiposPermitidos  String[] @default([])
  // fase-14-24: vigencia, fecha civil "YYYY-MM-DD" en el calendario local del
  // Grupo (misma convención que `deadlineHora`, que es "HH:mm" local). Null =
  // sin límite por ese lado; los dos null = permanente, que es el default y el
  // comportamiento de toda actividad anterior al ítem.
  vigenteDesde       String?
  vigenteHasta       String?
}
```

Migración **retro-compatible**: todo lo existente queda con los cuatro campos en su default y se comporta igual. Sin índices nuevos — se filtra en memoria sobre el catálogo del grupo (decenas de filas), igual que `diasSemana` y `rolesPermitidos`.

### A.2 El modo es derivado, no un enum

No se agrega una columna `modoDestinatario`. El modo se lee de los tres arrays:

| `rolesPermitidos` | `usuariosPermitidos` | `equiposPermitidos` | Modo |
|---|---|---|---|
| vacío | vacío | vacío | **Todo el grupo** (default) |
| con datos | vacío | vacío | **Por rol** (#19, intacto) |
| vacío | con datos | vacío | **Por personas** |
| vacío | vacío | con datos | **Por equipos** |

**Cualquier otra combinación es inválida** y la rechaza el request con 400 `DESTINATARIO_AMBIGUO`. Un enum no evitaría el estado inconsistente (habría que validar igual que el array del modo elegido sea el único lleno), y sí obligaría a migrar el valor de toda fila existente. La invariante se escribe una vez, en la validación, y se lee de los datos.

### A.3 La regla, en un solo archivo

`apps/activity-service/src/comun/destinatario.ts` — mismo rol que `visibilidad-actividad.ts` (#10) y `restriccion-rol.ts` (#19), y **punto de entrada único de los tres**:

```ts
/** Contexto del participante, resuelto una vez por request. */
export interface ContextoParticipante {
  usuarioId: string;
  rolGrupoId: string | null;
  equipoIds: string[];
}

/**
 * ¿Esta actividad es para este participante? Compone las tres reglas de
 * destinatario que hoy viven sueltas: origen (#10), rol (#19) y las dos nuevas.
 * Un TUTOR/ORG_ADMIN no pasa por acá: ve todo, porque gestiona.
 */
export function esDestinatario(
  actividad: DestinatarioDeActividad,
  contexto: ContextoParticipante
): boolean;

/** Filtro Prisma equivalente, para las lecturas que pueden empujarlo a la query. */
export function filtroDestinatario(contexto: ContextoParticipante);

/**
 * ¿Hace falta resolver equipos para este catálogo? Mismo patrón que
 * `hayRestriccionesDeRol` (#19): el cruce REST hacia identity se paga SOLO si
 * alguna actividad del grupo usa el modo equipos. En todos los grupos que
 * existen hoy, este ítem no agrega ni una llamada al camino caliente.
 */
export function hayRestriccionesDeEquipo(actividades: DestinatarioDeActividad[]): boolean;
```

`restriccion-rol.ts` **no se elimina ni cambia de comportamiento**: `esDestinatario` lo llama. Lo que se consolida es el punto de llamada, no la regla — el #19 queda tal cual se decidió.

### A.4 La vigencia entra por donde el #11 dejó la puerta

`comun/programacion.ts` documenta desde el #11 que es el **punto único de extensión** para "fechas concretas o rangos, lo que José anticipó". Es exactamente este ítem, así que la vigencia se implementa **ahí y en ningún otro lado**:

```ts
/** Todo lo que decide si una actividad corre hoy. Objeto y no 5 parámetros sueltos. */
export interface ProgramacionActividad {
  diasSemana: number[];
  vigenteDesde: string | null;
  vigenteHasta: string | null;
}

/** Fecha civil "YYYY-MM-DD" del instante, en la timezone dada. */
export function fechaCivilEnTimezone(instante: Date, timezone: string): string;

/**
 * ¿Se puede registrar en la Sesión que arrancó en `fechaInicioSesion`?
 * Cruza vigencia Y días de la semana (decisión 8): tiene que cumplir las dos.
 */
export function estaDisponibleEn(
  programacion: ProgramacionActividad,
  fechaInicioSesion: Date,
  timezone: string
): boolean;
```

Cambia la **firma**, no los llamadores conceptualmente: los **7 puntos de enforcement** que hoy llaman `estaDisponibleEn` heredan la vigencia sin lógica nueva.

| Dónde | Ya llamaba a `estaDisponibleEn` |
|---|---|
| `RegistroService.completar` | sí |
| `RegistroService.iniciarCronometro` | sí |
| `RegistroService.registrarNoHizo` | sí |
| `RegistroService.estadoHoyDe` (el flag `disponibleHoy`) | sí |
| `TareasEquipoService.completar` + su listado | sí |
| `CierreService` (castigo automático del #8) | sí |
| `PlanDiaService` (#17) | sí |
| `SelladoTurnosService` (#21) | sí |

**Ese es el pago del diseño del #11** y conviene verificar que se cobra entero: si algún punto de enforcement necesita lógica propia de fechas, algo se hizo mal.

El **destinatario**, en cambio, **sí necesita una pasada propia** por cada lectura y cada escritura que sirva a un participante — es el mismo riesgo que el #10 y el #19 anotaron (olvidarse de uno significa que alguien ve o completa algo que no es suyo), y por eso `esDestinatario` compone las tres reglas: quien aplica una, aplica las tres.

### A.5 Archivado por vencimiento

En `CierreService`, después del castigo automático y antes de terminar: toda actividad `ACTIVA` del grupo con `vigenteHasta` **anterior** a la fecha civil de la Sesión que se cierra pasa a `ARCHIVADA`. Es un `UPDATE` de `estado` sobre el catálogo — no toca ningún registro ni genera evento de puntaje.

Si `SesionCerrada` llega **sin `fechaInicio`** (mensaje viejo en la cola, caso que el #11 ya contempla): **no se archiva nada**. Ante la duda, no se cambia el catálogo.

### A.6 Validación al escribir (crear/editar actividad)

- A lo sumo **un** array de destinatario no vacío (400 `DESTINATARIO_AMBIGUO`).
- `usuariosPermitidos`: todos los ids tienen que ser participantes **del grupo**, resuelto por el interno de identity que el #19 ya usa (`/internal/identity/grupos/:grupoId/roles-asignados` da la membresía) — 400 `USUARIO_FUERA_DEL_GRUPO`.
- `equiposPermitidos`: todos del grupo, vía `equiposDelGrupo` que el cliente de identity **ya tiene** — 400 `EQUIPO_FUERA_DEL_GRUPO`.
- `equiposPermitidos` no vacío exige `alcance = EQUIPO`, y `usuariosPermitidos` no vacío lo prohíbe (decisión 5) — 400 `DESTINATARIO_INCOMPATIBLE_CON_ALCANCE`.
- `vigenteDesde` / `vigenteHasta`: formato `YYYY-MM-DD` y `desde <= hasta` — 400 `VIGENCIA_INVALIDA`. Una fecha `hasta` **ya pasada** se acepta (no es un error cargar algo que vence hoy); se archiva en el cierre siguiente.
- Al guardar un destinatario por personas en una actividad **con turnos activos**, las `PosicionTurno` que queden fuera se descartan (decisión 6). Las `VueltaTurno` selladas no se tocan.

### A.7 Turnos (#21)

- `PUT` de la secuencia de turnos: rechaza posiciones fuera de `usuariosPermitidos` cuando ese modo está activo — 400 `TURNO_FUERA_DEL_DESTINATARIO`.
- Los atajos del armador ("todo el grupo", "todos los del rol X") pasan a ofrecer, cuando hay destinatario nominal, **solo a los destinatarios**.

---

## Parte B — Tipos compartidos (`libs/shared-types`)

`ActividadDto` suma los cuatro campos, con la misma forma que ya tienen `diasSemana` y `rolesPermitidos`:

```ts
usuariosPermitidos: string[];
equiposPermitidos: string[];
vigenteDesde: string | null;
vigenteHasta: string | null;
```

`CrearActividadRequest` / `ActualizarActividadRequest` los aceptan como opcionales.

`MiEstadoActividadHoyDto` **no cambia**: fuera de vigencia la actividad no viaja (decisión 10), así que no hace falta un flag para apagarla. `disponibleHoy` sigue significando lo del #11 — "hoy no es uno de sus días" — y eso es deliberado: son dos situaciones distintas y mezclarlas en un booleano las volvería indistinguibles en la pantalla.

## Parte C — Otros servicios

**Ninguno cambia.** No hay evento nuevo, ningún payload se amplía, `docs/architecture/event-catalog.md` queda igual. `identity-service` no cambia: los dos internos que hacen falta (membresía del grupo y equipos del grupo) ya existen del #19 y el #9.

## Parte D — Frontend (`app-web`)

### D.1 El modal de crear/editar actividad

Dentro de la sección plegable **"Quién la hace"** que la T4 del #23 ya creó:

- Selector de modo (4 opciones, radio). Al elegir "Estas personas", aparece el multiselector de participantes con los atajos de precarga (decisión 2). Al elegir "Estos equipos" —solo visible con alcance EQUIPO—, el de equipos.
- Debajo, el resumen en lenguaje natural, mismo estilo que el de días del #11: *"la hacen todos"* / *"la hacen los del rol Cocina"* / *"la hacen Ana y Luis"* / *"la hace el equipo Rojo"*.
- Con la sección **plegada**, el encabezado dice el estado (criterio de la T4: plegar no es esconder).

Dentro de **"Cuándo se puede hacer"**, junto a los días de la semana:

- Dos campos de fecha, *Desde* y *Hasta*, ambos vacíos por default con el hint *"sin fechas, la actividad es permanente"*.
- Resumen combinado con los días: *"los lunes y miércoles, del 1 al 30 de marzo"*.

### D.2 La lista de actividades del tutor

Reemplaza el `@for` plano de `actividades.page.ts` por:

- **Buscador por nombre** arriba (filtra dentro de todas las secciones y muestra el total encontrado).
- **Cuatro secciones plegables**, en este orden, cada una con contador: *De todo el grupo* · *Por rol* · *De personas* · *De equipos*. Una sección sin actividades no se muestra.
- En cada tarjeta, los chips que ya existen (días, rol, turnos) más los nuevos: **destinatario** ("Ana, Luis") y **vigencia** ("hasta el 30/03", "desde el 01/03", "vence hoy").
- La decisión de en qué sección va cada actividad y de cómo se arma cada chip vive en **`core/destinatario-actividad.ts`**, testeada aparte — mismo criterio que `core/turnos.ts` (T1), `core/home-grupo.ts` (T3) y `core/registro-tutor.ts` (T4). El componente no decide.

### D.3 Integrante

No hay pantalla nueva. Lo que cambia sale del servidor: deja de recibir las actividades que no le corresponden y las que están fuera de vigencia.

---

## Criterios de aceptación

- [ ] **Default intacto**: una actividad sin destinatario ni fechas se comporta exactamente como antes, para todos y todos los días. Los tests existentes de `mi-estado-hoy`, cierre, plan del día y turnos **pasan sin modificarse**.
- [ ] El Tutor crea "Practicar piano" con destinatario **Ana**: Ana la ve y la completa; Luis **no la ve** en su lista y su `POST /completar` devuelve 404/403 (no un 200 silencioso).
- [ ] Una **obligatoria** asignada a Ana castiga **solo a Ana** al cerrar la Sesión: Luis no recibe `NO_HIZO` automático.
- [ ] El modo **rol** sigue funcionando igual que antes del ítem (#19 intacto), y guardar rol + personas a la vez devuelve 400 `DESTINATARIO_AMBIGUO`.
- [ ] El atajo *"precargar los del rol Cocina"* llena la lista de personas y la deja **editable**; lo guardado es la lista, no el rol.
- [ ] Una actividad con `alcance = EQUIPO` y `equiposPermitidos = [Rojo]`: los miembros del equipo Rojo la ven, los del Azul no; el jefe del Azul no la puede completar.
- [ ] Asignar personas a una actividad de alcance EQUIPO devuelve 400 `DESTINATARIO_INCOMPATIBLE_CON_ALCANCE`.
- [ ] **Vigencia**: `desde = hasta = 24/12` aparece el 24 y no el 23 ni el 25; solo `desde` arranca ese día; solo `hasta` vence ese día; sin fechas es permanente.
- [ ] **Vigencia × días (decisión 8)**: días `[1, 3]` con rango 1→30 de marzo se puede hacer un lunes de marzo, **no** un martes de marzo, **no** un lunes de abril.
- [ ] Fuera de vigencia la actividad **no aparece** en la lista del integrante (a diferencia del "hoy no toca" del #11, que sigue apareciendo en gris).
- [ ] **Archivado automático**: al cerrar la Sesión del 31/03, una actividad con `vigenteHasta = 30/03` queda `ARCHIVADA`; una con `31/03` **no** (todavía era su día); una sin `hasta` tampoco.
- [ ] Si `SesionCerrada` llega sin `fechaInicio`, no se archiva nada y el castigo automático se comporta como definió el #11.
- [ ] Las fechas se evalúan en la **timezone del Grupo** y sobre el **día de inicio de la Sesión**: una sesión que arranca el 30/03 a las 22:00 hora del Grupo (31/03 02:00 UTC) cuenta como **30/03**.
- [ ] **Turnos (#21)**: cargar en el pozo a alguien fuera del destinatario devuelve 400 `TURNO_FUERA_DEL_DESTINATARIO`; sacar a alguien del destinatario lo saca del pozo **desde la vuelta siguiente**, sin tocar la vuelta sellada.
- [ ] **Lista del tutor**: 4 secciones con contador, buscador que filtra, secciones vacías ocultas, chips de destinatario y vigencia en la tarjeta.
- [ ] El contenido creado por integrantes (#10) sigue sin destinatario ni vigencia: su request no acepta los campos.
- [ ] **Costo cero para quien no usa el ítem**: un grupo sin actividades con destinatario por equipo no hace ni una llamada nueva a identity (`hayRestriccionesDeEquipo`).
- [ ] Aislamiento multi-tenant: los ids de usuario y equipo se validan **contra el grupo del JWT**, nunca contra el que venga en el body.

## Nota para Claude Code

Dos mitades de tamaño muy distinto y conviene no confundirlas.

**La vigencia es barata y ya está diseñada**: entra entera por `comun/programacion.ts`, que el #11 dejó escrito como punto único de extensión para exactamente esto. Si al implementarla aparece lógica de fechas fuera de ese archivo, es señal de que se está tomando el camino largo. Los tests de timezone se copian del estilo de `deadline.spec.ts`, que ya cubre la sesión nocturna y el DST.

**El destinatario es el riesgo real**, y es el mismo que el #10 y el #19 anotaron cada uno en su momento: la regla hay que aplicarla en **cada** lectura y **cada** escritura que sirva a un participante, y olvidarse de una no la agarra ningún test preexistente — se manifiesta como "el integrante ve la tarea de otro", que en un sistema de puntaje es peor que un error visible. Por eso las tres reglas se componen en `esDestinatario`: el objetivo es que sea imposible aplicar una y olvidar las otras dos.

El caso que más duele si se escapa sigue siendo `CierreService`: una obligatoria asignada a Ana que castiga a todo el grupo resta puntos por no hacer algo que no era de nadie más, y eso no se ve en ninguna pantalla hasta el día siguiente.
