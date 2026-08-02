# Fase 14 · Ítem 23 — Claridad del área del Tutor

> Sub-spec detallada del ítem 23 de `fase-14-post-mvp.md`. Este archivo es la especificación decidida con José (2026-08-01); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).
>
> **Ítem por tandas.** Este archivo se escribe tanda por tanda: cada una se especifica cuando se llega a ella, partiendo de lo aprendido mirando la app en uso. Hoy contiene las **tandas 1, 2 y 3** completas. Las tandas 4 y 5 tienen acá solo su alcance, igual que un ítem del índice de la fase.

## Prerrequisitos

Fase 10 (frontend completo) y, de Fase 14, todos los ítems que agregaron pantallas o controles al área Tutor: #8, #9, #10, #11, #12, #13, #17, #18, #19, #20, #21 y #22. Todos ejecutados.

No agrega dependencias nuevas.

## Motivación (el problema que resuelve)

El área del Tutor creció por acumulación: quince ítems de Fase 14 le fueron sumando controles, y cada uno se integró donde tenía sentido **para ese ítem**, sin que nadie mirara el conjunto después. El resultado no es que falten funciones: es que las que hay no se encuentran, no se entienden o no se sabe si quedaron aplicadas.

José lo reportó el 2026-08-01 con tres síntomas, en sus palabras: no saber si ciertas configuraciones están guardadas, no encontrar dónde está cada cosa, y pantallas sobrecargadas.

**El caso que destapó el diagnóstico son los turnos (#21).** José lo describió con precisión: *«no se sabe si la actividad es por turnos o es uno cualquiera»* — y aclaró que no era un problema de redacción. Al revisar el código, no lo era: la información **no está en la pantalla**. Ver la sección de la tanda 1.

Este ítem es también un registro de un modo de falla del proceso mismo: construir ítem por ítem produce funciones correctas y conjuntos incoherentes. La revisión transversal no es opcional, es la contraparte del método.

## Decisiones de alcance (2026-08-01)

1. **Solo el área Tutor/ORG_ADMIN.** Las 16 pantallas del grupo más el panel de organización. Las 6 del participante quedan para una segunda vuelta: mezclarlas duplicaría el frente sin que ninguno de los dos quede terminado.
2. **Pulido dentro de la identidad actual por default**, con libertad de rediseñar donde el rediseño sea lo que resuelve el problema. El criterio es la comodidad de uso, no la estética: un rediseño que no resuelve una molestia concreta no entra.
3. **Transversal antes que pantalla por pantalla.** Los patrones que se repiten (estado de guardado, estados vacíos, carga, errores) se resuelven una vez y se replican; entrar pantalla por pantalla primero implicaría resolver lo mismo dieciséis veces y de dieciséis maneras distintas.
4. **Ninguna regla de negocio de un ítem anterior se toca.** Lo que cambia es qué muestra la interfaz y cuándo persiste. Si en el camino aparece algo que parece un error de producto y no de interfaz, se anota y se consulta — no se arregla de paso.

## Las tandas

| # | Tanda | Estado |
|---|---|---|
| T1 | Turnos visibles y guardado único | **Especificada acá** |
| T2 | Extraer a `libs/shared-ui` los patrones hoy copiados a mano en cada página | **Especificada acá** |
| T3 | Arquitectura de navegación del área Tutor | **Especificada acá** |
| T4 | Pantalla por pantalla, de la más recargada a la más simple | Alcance solamente |
| T5 | Pulido final (transiciones, teclado, responsive, textos) | Alcance solamente |

### T2 — Patrones a `shared-ui` (alcance)

Hoy `libs/shared-ui` tiene tres componentes (`ConfirmDialog`, `ZonaBadge`, `EstadoSeccionBadge`) y **todo el resto está escrito a mano con clases Tailwind copiadas página por página**: tarjetas, campos, botones, interruptores, pestañas, modales, estados vacíos y de carga. Es la causa estructural de que las pantallas se vean «casi iguales pero no iguales» y de que cada arreglo haya que hacerlo N veces. Va **después** de la T1 a propósito: el contrato de guardado que sale de la T1 define qué forma tiene que tener el componente de formulario, y cristalizarlo antes sería adivinarlo.

### T3 — Navegación (alcance)

Una pantalla de **configuración del grupo** que reúna lo que hoy vive repartido en al menos seis lugares (configuración de sesión, zonas, roles, modo de recompensas, plan del día, contenido de integrantes), mostrando el estado de cada interruptor de un vistazo. Menú reordenado separando lo de uso diario de lo que se configura una vez. Resumen del grupo convertido en un home real.

### T4 — Pantalla por pantalla (alcance)

Orden por carga: Actividades (1182 líneas), Panel operativo (675), Historial de sesión (561), Equipos (538), Recompensas (seis sub-pantallas), resto.

### T5 — Pulido (alcance)

Transiciones, foco y navegación por teclado, comportamiento responsive, revisión de textos.

---

## Tanda 1 — Turnos visibles y guardado único

### El diagnóstico

Cuatro hallazgos, todos verificados en el código el 2026-08-01:

1. **La lista de actividades nunca dice que una actividad rota.** La tarjeta pinta chips para equipo (`👥`), siempre-a-la-vista (`📌`), roles (`🏷`), días (`🗓`) y autor — para turnos, ninguno. Y no es un olvido de maquetado: **el dato no está disponible en esa pantalla**. El turno se pide de a una actividad por vez (`obtenerTurno(a.id)`) y solo al abrir el modal de edición. La única forma de saber si una actividad rota es abrirlas una por una.
2. **El endpoint que resuelve esto existe y no lo usa nadie.** `GET /activity/grupos/:grupoId/turnos-de-hoy` se construyó en el #21 «para el panel operativo», devuelve exactamente a quién le toca cada actividad rotativa hoy, tiene su cliente en `activity-api.service.ts` y su cobertura en `turnos-rotativos.e2e.ts` — y **ninguna pantalla lo llama**. La función está entera; lo que faltó fue el cable.
3. **En el modal conviven dos modelos de guardado incompatibles.** Todo el formulario persiste con el botón de submit; el bloque de turnos tiene **su propio «Guardar turnos»** que pega contra la API al instante. Las dos consecuencias, ambas reproducibles: armar la secuencia y apretar el «Guardar» principal **no guarda los turnos**; apretar «Guardar turnos» y después **Cancelar** los deja guardados igual.
4. **Destildar «Por turnos» borra la configuración en el acto**, sin confirmación y sin deshacer: el `DELETE` sale en el mismo `change` del checkbox.

Y una consecuencia de diseño que se sigue de los anteriores: **la opción de turnos no aparece al crear una actividad**, solo al editarla, porque necesita el id para su llamada propia. Nadie lo dice en pantalla: hay que crear, guardar, reabrir, y ahí recién existe.

### Decisiones (cerradas con José el 2026-08-01)

1. **El chip dice a quién le toca hoy**, no solo que la actividad rota: `🔁 Hoy: Luciana`. Se eligió sobre la alternativa «`🔁 Por turnos · cada día`» porque responde de una vez las dos preguntas —si rota, y a quién— y la segunda es la que el Tutor se hace en el día a día.
2. **La ausencia del chip significa «es de todos».** No se agrega un chip `De todos` a las actividades sin turno: la tarjeta ya llega a cinco chips y el silencio, una vez que el chip de turno existe y es confiable, alcanza.
3. **Sin sesión abierta, el chip no inventa un nombre.** Cuando `asignacionVigente` es `null` —que es un estado normal, no un error (decisión 19 del #21)— el chip dice `🔁 Por turnos` a secas. Mostrar el nombre de ayer sería peor que no mostrar ninguno.
4. **Un solo Guardar en el modal.** El componente de turnos deja de llamar a la API por su cuenta: expone su estado hacia el formulario que lo contiene y la persistencia ocurre en el submit, junto con el resto. **Cancelar descarta todo**, turnos incluidos. Esto se lleva puesto el borrado instantáneo del hallazgo 4: apagar la rotación pasa a aplicarse al guardar.
5. **Turnos disponible también al crear.** Con el guardado diferido, la secuencia se arma en memoria y se persiste después de crear la actividad. Deja de existir el paso invisible «guardá y volvé a abrir».
6. **La reasignación del día NO se unifica.** Reasignar el turno de hoy (decisión 8 del #21) es una acción operativa sobre un hecho ya sellado, no una edición de configuración: sigue siendo inmediata y explícita, y no vive en este formulario. Meterla en el submit la volvería un cambio pendiente, que es exactamente lo que no es.

### Alcance del cambio

**Backend: ninguno.** Ni endpoint, ni DTO, ni migración. Los cuatro hallazgos se resuelven en `app-web`. Es el resultado más importante del diagnóstico y conviene dejarlo escrito: la sensación de «esto no está guardado» no venía de un dato que faltara, sino de una pantalla que no lo pedía y de un formulario con dos dueños.

**Frontend** (`apps/app-web`):

| Archivo | Cambio |
|---|---|
| `paginas/tutor/actividades.page.ts` | Carga `turnosDeHoy(grupoId)` junto con el listado y arma el mapa `actividadId → asignación`. Chip nuevo en la tarjeta. El submit persiste también los turnos. Turnos disponible al crear. |
| `paginas/tutor/turnos-actividad.component.ts` | Deja de inyectar `ActivityApiService`: pasa a ser un componente controlado que emite su estado. Se le va el botón «Guardar turnos», el `apagar()` inmediato y el toast propio. |
| `core/turnos.ts` | Suma la regla de presentación del chip (qué texto según haya o no asignación vigente), testeable aparte como ya lo está `resumenDeReparto`. |

### Criterios de aceptación

1. En la lista de actividades, una obligatoria con turnos activos muestra `🔁 Hoy: <nombre>` sin abrir nada; una sin turnos no muestra chip de turno.
2. Con turnos activos pero sin sesión abierta, el chip dice `🔁 Por turnos` y no muestra ningún nombre.
3. Armar una secuencia y apretar **Guardar** (el único botón) persiste la actividad **y** los turnos.
4. Armar una secuencia y apretar **Cancelar** no persiste nada: al reabrir, la secuencia está como estaba.
5. Destildar «Por turnos» y cancelar **no** apaga la rotación. Destildar y guardar, sí.
6. El bloque de turnos aparece al **crear** una obligatoria individual, y la secuencia armada ahí queda guardada al crearla.
7. Una actividad sin turnos sigue sin pagar ninguna llamada extra: la carga de `turnos-de-hoy` es **una sola** por pantalla, no una por actividad.
8. Los tests de `activity-service` siguen verdes sin modificarse: este cambio no toca el backend.

---

## Tanda 2 — Patrones a `shared-ui`

### El diagnóstico

`libs/shared-ui` tiene tres componentes (`ConfirmDialog`, `ZonaBadge`, `EstadoSeccionBadge`) y una hoja de tokens (`theme.css`, con `.btn-primario`/`.btn-secundario` para los CTA de marca que comparten `app-web` y `public-site`). Todo lo demás está escrito a mano, cadena de clases por cadena de clases, en cada página.

Inventario del 2026-08-02 sobre `apps/app-web/src/app` (contando la cadena literal):

| Patrón | Ocurrencias | Archivos | Variantes distintas |
|---|---|---|---|
| Tarjeta / panel | 44 | 29 | 10 |
| Campo de formulario | 64 | 18 | 6 |
| Etiqueta de campo (`<span>` sobre el input) | 63 | 18 | 1 |
| Botón primario | 36 | — | 9 |
| Botón neutro (borde) | 30 | — | 9 |
| Estado vacío | 30 | 25 | 12 |
| **Modal / hoja** | **19 fondos, 11 paneles** | 15 | 2 (`max-w-md` ×7, `max-w-sm` ×4) |
| Botonera del modal | 14 | — | 2 |

Dos hallazgos que cambian el encuadre respecto del inventario preliminar del 2026-08-01:

1. **El modal no estaba contado y es la duplicación más cara.** Quince pantallas reescriben las mismas doce líneas —fondo `fixed inset-0`, botón de cierre invisible que cubre la pantalla, panel `rounded-t-2xl` en móvil y `rounded-2xl` en escritorio, `animate-slide-up`, título, botonera— y **once de ellas con las clases del panel idénticas carácter por carácter**. Es también el patrón con más superficie de accesibilidad (`role="dialog"`, `aria-modal`, foco, `Escape`), y hoy solo `ConfirmDialog` la tiene: las quince copias a mano no declaran ni `role` ni `aria-modal`.
2. **Dieciséis de los sesenta y cuatro campos no tienen anillo de foco.** No es una variante de diseño: es la cadena completa menos `focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none`. En esos campos, navegando con Tab no se ve dónde está el cursor. Es un incumplimiento de WCAG 2.4.7 que ninguna pantalla eligió, producido por copiar la cadena equivocada.

Y la lectura de fondo: **casi todas las variantes difieren solo en espaciado**. Las 10 formas de tarjeta son una sola tarjeta con `p-4`/`p-3`/`p-3.5`/sin padding; los 9 botones primarios son dos tamaños con el padding tipeado distinto cada vez; los 12 estados vacíos son uno solo con `mt-6`/`mt-5`/`mt-4`/`mt-3`. No hay decisiones de diseño detrás de la divergencia — hay tipeo.

### Decisiones (cerradas con José el 2026-08-02)

1. **Forma mixta, según lo que el patrón tenga adentro.** Lo que es **solo piel** (tarjeta, campo, botón, etiqueta, botonera) va como clase en `@layer components` de `theme.css`. Lo que tiene **estructura repetida** (modal, estado vacío, campo con su etiqueta) va como componente de `libs/shared-ui`. El criterio: un componente Angular que solo existe para pegar una cadena de clases obliga a inventar un `input` por cada variante de layout; una clase CSS que quiere tener título, contenido y botonera no puede.
2. **Migración del área Tutor completa, las tres grandes incluidas.** Las 16 pantallas, entrando por las chicas y bajando después a `actividades.page.ts` (1399 líneas), `panel-operativo.page.ts` (751) y `configuracion-sesion.page.ts` (333). Dejar las grandes para la T4 haría convivir dos estilos justo en las pantallas donde más se nota.
3. **La extracción corrige el foco en los dieciséis campos.** Es un cambio visible —aparece un anillo donde no había— y va en la dirección del ítem. No se conserva una variante «sin foco» para no perpetuar el defecto con una clase que lo bendiga.
4. **El área Usuario queda afuera**, según la decisión de alcance 1 del ítem. Los componentes nuevos son de `shared-ui` y quedan disponibles para ella, pero sus seis pantallas no se migran en esta tanda: su identidad es deliberadamente más lúdica y merece su propia vuelta.

### Las clases (`libs/shared-ui/src/theme.css`, `@layer components`)

Los nombres van en español, como el resto del código del repo. `.btn-primario` y `.btn-secundario` **no se tocan**: son los CTA grandes de marca que comparte `public-site`, y son otra cosa que el botón de un panel de gestión.

| Clase | Reemplaza | Nota |
|---|---|---|
| `.tarjeta` | 44 usos, 10 variantes | Incluye `p-4`, el padding dominante. En Tailwind v4 la capa `utilities` gana sobre `components`, así que las cuatro tarjetas sin padding escriben `class="tarjeta p-0"` y las de `p-3` lo pisan igual — la variante queda explícita en el markup en vez de escondida en otra cadena. |
| `.campo` | 64 usos, 6 variantes | Incluye `w-full` (57 de 64) y **el anillo de foco siempre**. |
| `.etiqueta-campo` | 63 usos | El `<span>` de arriba del input. |
| `.boton` + `.boton-primario` / `.boton-neutro` / `.boton-peligro` | 66 usos entre primarios y neutros | Tamaño por defecto `text-sm px-4 py-2.5`; `.boton-sm` para el `text-xs px-3 py-1.5` de las acciones de fila. |
| `.botonera` | 14 usos | `flex-col-reverse` en móvil (el primario abajo, al alcance del pulgar) y `flex-row justify-end` en escritorio. |

### Los componentes (`libs/shared-ui`)

**`<ui-modal>`** — fondo, panel, título y cierre. Reemplaza las 15 copias.

```
<ui-modal [abierto]="…" titulo="Nuevo rol" ancho="sm" (cerrar)="…">
  <form (submit)="guardar($event)"> … </form>
</ui-modal>
```

- `ancho`: `'sm' | 'md' | 'lg'` (los dos primeros son los que existen hoy; `lg` para las pantallas grandes que hoy desbordan).
- El formulario lo pone la página **adentro** del modal, no lo provee el componente: es lo que permite que el submit siga siendo del formulario (contrato de la T1) sin que el modal tenga que reenviar eventos.
- Suma lo que las copias a mano no tienen: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` apuntando al título, cierre con **Escape** y foco llevado al panel al abrir.

**`<ui-estado-vacio>`** — reemplaza los 30 recuadros punteados.

```
<ui-estado-vacio icono="🏷" titulo="Todavía no hay roles en este grupo">
  Sin roles, todas las actividades las ven todos los integrantes.
</ui-estado-vacio>
```

El texto largo va proyectado, así cada pantalla sigue redactando lo suyo; lo que se unifica es la forma, no el mensaje.

**`<ui-campo>`** — etiqueta + campo, los 63 pares.

```
<ui-campo etiqueta="Nombre" ayuda="Máximo 30 caracteres">
  <input class="campo" [(ngModel)]="nombre" name="nombre" />
</ui-campo>
```

Renderiza un `<label>` que envuelve al control proyectado (click en la etiqueta enfoca el campo, que hoy funciona por accidente en unas pantallas y no en otras) y deja lugar para `ayuda` y `error` debajo.

### Alcance del cambio

**Backend: ninguno.** Igual que la T1.

| Archivo | Cambio |
|---|---|
| `libs/shared-ui/src/theme.css` | Clases nuevas en `@layer components`. |
| `libs/shared-ui/src/lib/modal/`, `estado-vacio/`, `campo/` | Componentes nuevos + sus specs. |
| `libs/shared-ui/src/index.ts` | Tres exports nuevos. |
| `apps/app-web/src/app/paginas/tutor/**` (16 pantallas + 7 sub-componentes) | Migración a las clases y componentes. Sin cambios de comportamiento salvo los tres que la decisión 3 y el `<ui-modal>` traen a propósito (foco visible, `Escape` cierra, `role="dialog"`). |
| `apps/app-web/src/app/componentes/` | Sin cambios: `EncabezadoPagina`, `Icono` y el host de toasts ya son componentes y no están duplicados. |

### Criterios de aceptación

1. La cadena `rounded-2xl border border-slate-200 bg-white` no aparece más en `apps/app-web/src/app/paginas/tutor`; ni `rounded-lg border border-slate-300 px-3 py-2`, ni `border-dashed border-slate-300`, ni `fixed inset-0 z-50 flex items-end`.
2. Los 64 campos del área Tutor tienen anillo de foco visible al llegar con Tab.
3. Los 15 modales del área Tutor cierran con **Escape** y declaran `role="dialog"` con `aria-modal="true"`.
4. Cancelar un modal sigue descartando todo, y el submit sigue siendo del formulario: el contrato de la T1 no se toca.
5. Ninguna pantalla del área Usuario cambia de aspecto (no se migran, y las clases nuevas no pisan las que ya usan).
6. Los tests de los servicios backend siguen verdes sin modificarse: esta tanda no toca el backend.
7. `nx lint` y `nx build` verdes en los proyectos afectados, y los tests de `app-web` verdes con los casos nuevos de los tres componentes.

---

## Tanda 3 — Navegación

### El diagnóstico

Relevado el 2026-08-02 sobre las 16 pantallas, con capturas de todas ellas contra un grupo cargado (`apps/e2e/src/capturas-tutor.e2e.ts`, herramienta que se escribió para esto).

1. **La configuración del grupo vive en seis lugares y tres están escondidos adentro de otra pantalla.** Con pantalla propia: configuración de sesión, Zonas, Roles. Sin pantalla propia: el **modo de recompensas** (tarjeta arriba de todo en `/recompensas`), el **contenido de los integrantes** (#10) y el **plan del día** (#17), los dos apilados en `/actividades`. Nadie que no supiera que existen los encuentra, y **ninguno de los seis dice en qué estado están los otros cinco**.
2. **Las dos de `/actividades` ocupan el primer tercio de la pantalla.** Se entra a esa pantalla a ver el catálogo y lo primero que hay son dos bloques de configuración que se tocan una vez en la vida del grupo. Es el caso más claro de «pantalla sobrecargada» de los tres síntomas que José reportó.
3. **El menú mezcla lo diario con lo que se define una vez.** El grupo «Sistema de puntos» junta **Zonas** (se configura al empezar y no se vuelve) con **Entregas** (se usa todas las semanas). Son 14 ítems en 3 grupos, y los títulos de grupo no ayudan a decidir dónde buscar.
4. **El Resumen no es un home.** Es la pantalla de aterrizaje del grupo y, sin Sección activa, muestra **una sola tarjeta vacía**. Con Sección activa ya trae el ranking de participantes, pero no dice en qué día va la semana, qué toca hacer ahora, ni qué está esperando al Tutor.
5. **«Primeros pasos» aparece tres veces en la misma pantalla**: ítem del menú (arriba de todo), tarjeta grande dentro del Resumen y píldora flotante abajo a la derecha. Las tres llevan al mismo lado.

### Decisiones (cerradas con José el 2026-08-02)

1. **La configuración del grupo es un HUB que edita lo chico y linkea lo que es CRUD.** Los cuatro interruptores (sesión, modo de recompensas, plan del día, contenido de integrantes) se editan ahí mismo; **Zonas y Roles siguen siendo pantallas propias** y desde el hub se ve su estado y se entra. Se eligió sobre «todo adentro» (metía dos listas con modales en una pantalla ya larga) y sobre «índice de solo lectura» (dejaba los tres interruptores escondidos donde están, solo agregando un lugar donde enterarse de que existen).
2. **El menú pasa a cuatro grupos**: *Día a día* / *Catálogo* / *Gente* / *Ajustes*. **Entregas y Reportes suben a «Día a día»** (hoy Entregas está entre la configuración) y **Zonas baja a «Ajustes»**.
3. **El Resumen muestra las cuatro cosas, pero con jerarquía, no en paralelo.** José preguntó explícitamente si no era demasiado; la respuesta de diseño es que **no tengan el mismo peso y que una de ellas casi siempre no esté**:
   - **una sola cosa grande**: en qué va la semana y el botón de lo que toca hacer ahora;
   - **«te esperan» es condicional**: si no hay pendientes, el bloque no existe, y el home tiene tres bloques y no cuatro;
   - **«Hoy» son tres líneas** con «ver todo», no el historial entero (que ya vive completo en la pestaña del #18);
   - **«Cómo van» es una fila por persona**, no una tarjeta por persona.
4. **Ninguna regla de negocio cambia** (decisión de alcance 4 del ítem): lo que se mueve es dónde está cada control, no qué hace.

### La pantalla de configuración del grupo

Ruta nueva `/grupos/:grupoId/configuracion`. Tres bloques, agrupados por la pregunta que responden y no por el servicio que los guarda:

| Bloque | Qué trae | Cómo |
|---|---|---|
| **Cómo corre la semana** | modo (manual/automático), sesiones por sección, cuándo evaluar zonas, y en automático el horario y los días | se edita ahí (es lo que hoy es `/configuracion-sesion`, absorbido entero) |
| **Qué se gana** | modo de recompensas (directo/tienda) + nombre e ícono de la moneda; **Zonas** con su cantidad y los puntos iniciales | el modo se edita ahí; **Zonas** muestra estado y linkea |
| **Qué ve el integrante** | plan del día (on/off), contenido de los integrantes (modo + topes); **Roles** con su cantidad | los dos primeros se editan ahí; **Roles** muestra estado y linkea |

`/configuracion-sesion` deja de ser una pantalla y **su ruta redirige** a `/configuracion` (no se rompe ningún enlace guardado, y el «Configurar sesión» del Resumen sigue funcionando).

Las tres tarjetas que hoy están embebidas —modo de recompensas en `/recompensas`, contenido y plan del día en `/actividades`— **se van de esas pantallas**. En su lugar, cada una queda con una línea discreta al pie que dice el estado vigente y linkea al hub (ej. en Actividades: *«Plan del día: apagado · Contenido: restrictivo — Ajustes»*), para que quien ya sabía dónde estaban no se quede sin rastro.

### El menú

| Grupo | Ítems |
|---|---|
| **Día a día** | Resumen · Semana actual · Entregas · Reportes |
| **Catálogo** | Actividades · Conductas · Recompensas |
| **Gente** | Usuarios · Equipos · Tutores *(solo ORG_ADMIN)* · Invitaciones |
| **Ajustes** | Configuración del grupo · Zonas · Roles |

Siguen siendo 14 ítems de grupo —«Configuración» pasa a ser «Configuración del grupo» y apunta al hub en vez de a la config de sesión— y lo que se va del menú es «Primeros pasos». Lo que cambia no es la cantidad sino que **cada grupo responde a una pregunta distinta**: *qué hago hoy* / *qué se puede hacer y cuánto vale* / *quiénes son* / *cómo está armado el grupo*. Las tres mudanzas que lo logran son Entregas y Reportes hacia «Día a día», y Zonas hacia «Ajustes».

**«Primeros pasos» deja de estar tres veces**: se queda como **la tarjeta del Resumen** —que es donde tiene sentido, porque el home es lo primero que se ve— y se van el ítem del menú y la píldora flotante. Mientras la guía no esté completa, la tarjeta del Resumen va arriba de todo; una vez completa, desaparece.

### El Resumen como home

De arriba abajo:

1. **La semana** (tarjeta grande): número de Sección y sesión, estado, cuándo cierra, y **un botón primario con lo que toca hacer ahora** — `Registrar lo de hoy` con sesión abierta, `Abrir la sesión de hoy` en modo manual sin sesión, `Ir a evaluación` en EVALUACION, `Iniciar la primera semana` si no hay Sección. Sin Sección activa esta tarjeta reemplaza a la tarjeta vacía de hoy.
2. **«Te esperan» (condicional)**: aparece solo si hay reportes por aprobar o entregas por dar; una línea por tipo, cada una linkeando a su pantalla. Si no hay nada, el bloque no se renderiza.
3. **«Cómo van»**: una fila por participante con nombre, puntaje, badge de zona y una barra de progreso hacia la zona siguiente. Es lo que ya existe, con la barra agregada.
4. **«Hoy»**: las **tres** últimas marcas del día con hora, quién y qué, y un «ver todo →» a la pestaña de historial de Semana actual. Si no pasó nada hoy, una línea sola.

### Alcance del cambio

**Backend: ninguno.** Los cuatro datos del home ya tienen cliente en `app-web` (`session.seccionActual`, `scoring.puntajesDeGrupo` + `identity.listarUsuarios`, `activity.historial`, `activity.listarReportes` + `rewards.pendientesDeEntrega`), y los interruptores del hub son los mismos endpoints que hoy usan las pantallas de donde salen.

| Archivo | Cambio |
|---|---|
| `paginas/tutor/configuracion-grupo.page.ts` | **Nuevo**: el hub de tres bloques. |
| `paginas/tutor/configuracion-sesion.page.ts` | Su contenido pasa a ser el bloque «Cómo corre la semana» del hub. |
| `paginas/tutor/actividades.page.ts` | Se le van las dos tarjetas de configuración; queda la línea de estado al pie. |
| `paginas/tutor/recompensas.page.ts` + `recompensas/modo-recompensas.component.ts` | El interruptor de modo pasa al hub; queda la línea de estado. |
| `paginas/tutor/resumen-grupo.page.ts` | Reescrito como home (los cuatro bloques). |
| `paginas/shell/shell.component.ts` | Menú de cuatro grupos; se va el ítem «Primeros pasos». |
| `paginas/shell/guia-flotante.component.ts` | Se elimina la píldora flotante. |
| `app.routes.ts` | Ruta `configuracion` nueva; `configuracion-sesion` redirige. |

### Criterios de aceptación

1. Existe `/grupos/:grupoId/configuracion` y muestra, sin entrar a ningún lado, el estado de las seis cosas: modo de sesión, zonas, modo de recompensas, plan del día, contenido de integrantes y roles.
2. Los cuatro interruptores se editan desde el hub y quedan guardados; Zonas y Roles se abren desde ahí y siguen funcionando como hoy.
3. `/grupos/:grupoId/configuracion-sesion` redirige a `/configuracion` — ningún enlace guardado se rompe.
4. `/actividades` ya no tiene bloques de configuración arriba del catálogo, y `/recompensas` ya no tiene el interruptor de modo arriba del catálogo; las dos conservan una línea de estado que linkea al hub.
5. El menú tiene los cuatro grupos de la tabla, con Entregas y Reportes en «Día a día» y Zonas en «Ajustes».
6. «Primeros pasos» aparece **una sola vez** en pantalla (la tarjeta del Resumen), y desaparece cuando la guía está completa.
7. El Resumen muestra la semana con su acción principal, cómo van los participantes y las últimas tres marcas de hoy; «te esperan» aparece solo si hay pendientes.
8. Con un grupo sin nada configurado, el Resumen no muestra una tarjeta vacía: muestra qué falta y cómo empezar.
9. Los tests de los servicios backend siguen verdes sin modificarse: esta tanda no toca el backend.
