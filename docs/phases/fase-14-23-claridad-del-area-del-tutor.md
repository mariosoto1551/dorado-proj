# Fase 14 · Ítem 23 — Claridad del área del Tutor

> Sub-spec detallada del ítem 23 de `fase-14-post-mvp.md`. Este archivo es la especificación decidida con José (2026-08-01); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).
>
> **Ítem por tandas.** Este archivo se escribe tanda por tanda: cada una se especifica cuando se llega a ella, partiendo de lo aprendido mirando la app en uso. Hoy contiene la **tanda 1** completa. Las tandas 2–5 tienen acá solo su alcance, igual que un ítem del índice de la fase.

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
| T2 | Extraer a `libs/shared-ui` los patrones hoy copiados a mano en cada página | Alcance solamente |
| T3 | Arquitectura de navegación del área Tutor | Alcance solamente |
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
