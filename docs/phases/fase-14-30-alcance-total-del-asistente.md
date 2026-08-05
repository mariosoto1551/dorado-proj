# Fase 14 · Ítem 30 — Alcance total del asistente sobre la configuración del Grupo

> Sub-spec detallada del ítem 30 de `fase-14-post-mvp.md`. Este archivo es la especificación decidida con José (2026-08-05); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

El **ítem #29 completo y verificado**. Este ítem no construye nada nuevo: agrega herramientas al catálogo que aquel dejó armado, y hereda entera su arquitectura — el loop, la cuota, el ledger de `Mensaje`, el modelo `Propuesta`, el SSE, la tarjeta del frontend y las once medidas de la Parte E de seguridad.

Reutiliza, sin modificarlos: `cliente-interno.base.ts` como molde de cada lectura nueva, el par `definiciones.ts` / `definiciones-propuesta.ts` como formato de declaración, `esquemas.ts` con su chequeo `SinFaltantes`, `invariantes.ts`, y `core/propuesta-ia.ts` del frontend.

## Qué revisa de lo ya decidido

**Ninguna de las 16 decisiones del #29.** Sobreviven intactas y este ítem depende de las tres estructurales: la IA no tiene credenciales de escritura (decisión 6), el tenant nunca es argumento de una herramienta (decisión 9), y un humano ve todo antes de que exista (decisión 2). Cada herramienta que se agrega acá se agrega *dentro* de esas tres.

Sí **corrige un defecto** de lo entregado en aquel ítem. Ver la motivación.

## Motivación (el problema que resuelve)

### La asimetría entre lo que la IA ve y lo que puede proponer

El #29 le dio al modelo ocho herramientas de lectura y cuatro de propuesta. Esa proporción no fue una decisión: fue el alcance de una primera versión. El resultado, después de usarla, es un asistente que **ve el grupo entero y puede tocar un cuarto de él**.

Ve las conductas y no puede crear una. Ve las recompensas, los castigos y sus etiquetas, y no puede proponer ninguna. Lee los umbrales de zona para calibrar cada valor en puntos que propone —es literalmente la escala contra la que razona— y no puede sugerir mover un rango. Conoce los roles y los equipos porque los necesita para dirigir una actividad, y no puede proponer ni un rol ni un equipo.

La promesa del #29 era que un Grupo nuevo dejara de ser veinte formularios. Se cumplió para las actividades. Para todo lo demás —las conductas, la tienda, las zonas, los roles, los equipos— el Tutor sigue en la misma pantalla en blanco que antes, ahora con un asistente al lado que sabe exactamente lo que hay que poner ahí y no tiene manera de ofrecerlo.

### El defecto: una herramienta que no puede funcionar

`proponer_precios_tienda` acepta un `productoId`, lo valida como uuid, y **ninguna de las ocho herramientas de lectura devuelve un id de producto**. `listar_recompensas` devuelve recompensas, que son otra entidad: el precio no vive en la `Recompensa` sino en el `ProductoTienda`. El modelo no tiene de dónde sacar ese id, así que solo puede inventarlo, y la propuesta muere cuando el Tutor aprieta «Aplicar».

Es un caso más del modo de falla que la Fase 14 ya encontró cinco veces y que el propio #29 anotó en su nota de testeo: **la unidad verifica la pieza y lo que falla es el cable**. La herramienta está bien escrita, su validación está bien escrita, su endpoint destino existe, y entre la lectura y la propuesta no hay nadie.

Lo que importa no es el arreglo —es una lectura nueva— sino que **no había ninguna regla que hiciera imposible el agujero**. Este ítem la escribe, y es su decisión 1.

### El segundo defecto: el id de organización sí sale hacia el proveedor

La medida 7 de la Parte E del #29 dice qué sale y qué no hacia OpenAI, y en la lista de lo que **no** sale está el *id de organización en claro*. Sale.

`listar_actividades`, `listar_conductas`, `listar_umbrales_zona` y `listar_recompensas` devuelven **el DTO tal como viene del endpoint interno**, y `ActividadDto`, `ConductaDto`, `UmbralZonaDto` y `RecompensaDto` llevan todos `organizacionId` y `grupoId` como sus dos primeros campos después del `id`. Las otras dos lecturas con datos de entidades —`listar_participantes` y `resumen_puntajes`— **no lo filtran**: se arman a mano, campo por campo, y por eso nunca tuvieron el problema.

Esa es exactamente la diferencia, y es la misma clase de cosa que el defecto anterior: no falló una decisión, falló que **pasar un DTO entero es el camino corto y nadie lo cerró**. El costo real es bajo —un uuid opaco que no es reversible a nada— pero contradice por escrito lo que la spec le promete al `ORG_ADMIN` en el aviso que acepta para prender el asistente, y ese aviso es el fundamento del opt-in de la decisión 5 del #29. Se arregla acá, y con una regla, no con cuatro `delete`. Ver la decisión 10.

## Decisiones de diseño

Cerradas con José el 2026-08-05:

1. **Ninguna herramienta de propuesta puede aceptar un id que ninguna herramienta de lectura devuelva.** Es la regla nueva y es el corazón del ítem. Cada propiedad uuid de una definición de propuesta declara **de qué herramienta de lectura sale**, con el nombre puesto en la descripción que lee el modelo y en la estructura que lee el test. Un test estructural —hermano del de la decisión 9 del #29, y en el mismo archivo— falla si una propiedad uuid no declara origen o declara uno que no existe. La regla no es documentación: es lo que hace que el agujero del `productoId` no se pueda volver a escribir.

2. **Toda referencia se valida contra el estado real del grupo antes de persistir la `Propuesta`.** Hoy `validarReferencias` cubre roles, usuarios y equipos; se generaliza a productos, bolsas, etiquetas, recompensas, conductas, actividades y umbrales. Es la decisión 11 del #29 —«una propuesta que no valida no se guarda: se le devuelve el error al modelo»— aplicada a las referencias y no solo al shape. Sin esto, la decisión 1 evita que el modelo *no tenga* el id, pero no que lo confunda con uno de otra entidad.

3. **Solo altas y ediciones. Ninguna operación de ninguna propuesta usa `DELETE`.** Se verifica como test sobre las operaciones que arma el servicio, no como criterio de revisión. Corolario que importa porque no es obvio: **los campos `estado` de rol y de equipo quedan fuera del esquema** aunque sus endpoints los acepten — poner un rol en `INACTIVO` es archivarlo por otro camino, y la regla no distingue entre el verbo y el efecto. «Limpiame el catálogo» la IA lo sigue contestando en texto, con los datos de `resumen_cumplimiento`, y el Tutor archiva a mano.

4. **La IA configura el grupo; no da de alta ni de baja personas.** Puede proponer roles, asignaciones de rol, equipos, miembros y jefes: eso es organizar a quien ya está. Quedan afuera las invitaciones, el alta y la baja de usuarios y de tutores. La línea no es de riesgo técnico —los endpoints están igual de probados que los otros— sino de qué clase de cosa es una propuesta: sumar una persona a un grupo es un acto que empieza fuera de la app, en una conversación que el modelo no vio.

5. **Una propuesta sigue siendo de un solo tipo.** Se evaluó una `Propuesta` compuesta, con operaciones heterogéneas aplicadas en orden, para que «armame el grupo entero» fuera un solo «Aplicar todo». Se descartó: obliga a un orden de aplicado con dependencias entre operaciones (los umbrales antes que las actividades que se calibran contra ellos), y la decisión 13 del #29 —«una operación que falla no aborta el resto»— deja de ser sana en cuanto la fila 8 depende de que la fila 2 haya salido bien. Una conversación puede producir cinco tarjetas seguidas; son cinco clics y ningún invariante nuevo.

6. **Los umbrales de zona cambian el pasado, y la tarjeta lo tiene que decir.** Por la regla 1 del proyecto el puntaje se deriva al leer, así que mover un rango **recalcula la zona de todos en el acto**, incluidas las secciones ya cerradas que se vuelvan a mirar. Es la única propuesta de este ítem cuyo efecto no se limita a lo que pase de acá en adelante. La tarjeta lleva un aviso explícito con el conteo de participantes que cambian de zona, calculado con lo que ya devuelve `resumen_puntajes`.

7. **`proponer_precios_tienda` se amplía a `proponer_editar_productos`.** El precio era un subconjunto arbitrario: el mismo `PATCH` acepta nombre, descripción, imagen, fuente, mecánica y el ítem o la bolsa que entrega. Renombrar la herramienta es gratis —el nombre solo viaja hacia el proveedor dentro de un request, no está persistido en ningún lado— pero **el valor `PRECIOS_TIENDA` del enum `TipoPropuesta` se conserva**, porque sí está persistido en filas existentes. Que el nombre de la herramienta y el del tipo no coincidan es deliberado y esta línea es su explicación.

8. **Se agregan los dos campos de actividad que faltaban.** `repeticionesMaximasSeccion` no tenía motivo para estar afuera. `siempreVisible` sí lo tenía y está escrito en el #29: solo hace algo con el plan del día activo, y el modelo no sabía si ese grupo lo tenía prendido. La lectura nueva de configuración del grupo lo destraba — el campo entra **junto con** esa lectura, no antes.

9. **Ninguna herramienta de lectura devuelve un DTO crudo: todas moldean su respuesta campo por campo.** Es la regla que arregla el segundo defecto, y otra vez la regla importa más que el arreglo: cuatro `delete` sobre los DTOs de hoy dejarían el camino corto abierto para la lectura número trece. Moldear a mano tiene además dos beneficios que ya se estaban cobrando sin decirlo en `listar_participantes` — se manda solo lo que el modelo necesita (menos tokens de entrada en cada llamada) y se nombra cada campo pensando en que lo lea un modelo. El test: para cada herramienta de lectura, la respuesta no contiene ninguna clave que matchee `/organizacionId|grupoId|tenant/`, hermano exacto del test estructural de la decisión 9 del #29 pero sobre la **salida** en vez de sobre la entrada.

10. **El costo en tokens del catálogo es parte del diseño, no un efecto colateral.** Se pasa de 12 definiciones a 26 en cada llamada. Se acota por tres lados: las descripciones nuevas se escriben al nivel de detalle de las existentes y no más, el moldeado de la decisión 9 recorta lo que devuelve cada lectura, y `prompt_cache_key` (medida 7 de la Parte E del #29) ya hace que el bloque de herramientas —idéntico entre llamadas— entre por caché. Al implementar se mide el prompt de sistema antes y después y **el número queda anotado en `docs/progreso/`**: si el salto es mayor al esperado, el que sobra es un catálogo mal escrito, no un costo inevitable.

### Fuera de alcance a propósito

- **Archivar, borrar y desactivar cualquier cosa** (decisión 3).
- **Invitar, dar de alta o dar de baja personas y tutores** (decisión 4).
- **La propuesta compuesta** (decisión 5). Si vuelve a pedirse, entra como ítem propio: necesita orden de aplicado con dependencias y una revisión de la decisión 13 del #29.
- **Registrar actividades, cerrar secciones, otorgar puntos, entregar recompensas, comprar en la tienda, corregir eventos y descalificar.** Siguen fuera por la decisión 4 del #29: son las escrituras que tocan un ledger.
- **La configuración de contenido creado por integrantes** (#10) y el **modo de recompensas `DIRECTO`/`TIENDA`** (#22): se **leen** para que el modelo entienda el grupo, no se proponen. Cambiar el modo de recompensas de un grupo en marcha reconfigura la economía entera; no es una propuesta, es una decisión del Tutor.
- **Eventos de dominio nuevos.** Igual que el #29: `ai-service` no publica ni consume RabbitMQ.

---

## Parte A — Lecturas nuevas

Cuatro herramientas. Cada una necesita su endpoint interno `GET` y su método en el cliente correspondiente, con el molde de `cliente-interno.base.ts`. **Ninguna recibe `organizacionId` ni `grupoId`** (decisión 9 del #29) y todas son `GET` (decisión 6 del #29): el test de `clientes-solo-lectura.spec.ts` las cubre sin cambios.

| Herramienta | Endpoint interno nuevo | Qué devuelve | Por qué existe |
|---|---|---|---|
| `listar_tienda` | `GET /internal/rewards/grupos/:grupoId/tienda` | Productos (`id`, nombre, descripción, precio, `fuente`, `mecanica`, `recompensaId`, `bolsaId`, estado) y bolsas (`id`, nombre, `recompensaIds`). | **Cierra el defecto del `productoId`.** Es el prerrequisito de `proponer_editar_productos` y de `proponer_crear_productos`. |
| `listar_etiquetas` | `GET /internal/rewards/grupos/:grupoId/etiquetas` | Etiquetas del catálogo con `id`, nombre, `colorHex` y estado. | Sin los ids no se puede asignar ninguna. |
| `configuracion_del_grupo` | `GET /internal/activity/grupos/:grupoId/configuracion`, `GET /internal/scoring/grupos/:grupoId/configuracion` y `GET /internal/rewards/grupos/:grupoId/configuracion` — una herramienta, tres llamadas en paralelo, una respuesta | `planDelDiaActivo` y la configuración de contenido por integrantes (activity), `puntosIniciales` (scoring), modo de recompensas, nombre e ícono de la moneda (rewards). | Es el contexto que hace que varios campos signifiquen algo. Habilita `siempreVisible` (decisión 8) y evita que el modelo proponga precios sin saber si la tienda está prendida. |
| `listar_turnos` | `GET /internal/activity/grupos/:grupoId/turnos` | Por actividad con rotación: `modo`, `frecuencia`, `activo` y el orden de posiciones con sus `usuarioId`. | Prerrequisito de `proponer_configurar_turnos`, por la decisión 1. |

Los ids de rol y de equipo **ya salen** por `listar_participantes` y los de actividad y conducta por `listar_actividades` y `listar_conductas`: la familia Personas y la de catálogo no necesitan lecturas nuevas. Los de recompensa salen por `listar_recompensas` y los de umbral por `listar_umbrales_zona`.

### El mecanismo de la decisión 1

`uuidDe(que)` en `definiciones-propuesta.ts` hoy dice *«tal como vino de una herramienta de lectura»*. Pasa a exigir cuál:

```ts
uuidDe(que: string, origen: NombreHerramientaLectura)
```

- La descripción que lee el modelo nombra la herramienta (*«…tal como vino de `listar_tienda`»*), que además es una mejora para el modelo: le dice qué llamar antes.
- `NombreHerramientaLectura` es el tipo derivado de `NOMBRES_HERRAMIENTAS_LECTURA`, así que un origen inventado **no compila**.
- El test estructural recorre las definiciones de propuesta y falla si alguna propiedad de formato uuid no lleva origen.
- El test de servicio verifica el otro extremo: para cada origen declarado, `validarReferencias` consulta efectivamente ese conjunto (decisión 2).

## Parte B — Propuestas nuevas

Once herramientas (diez nuevas más la ampliación de la decisión 7). **Ningún endpoint destino hay que crearlo**: los once ya existen y están probados desde su fase de origen. Ninguno es `DELETE`.

### Familia catálogo — `activity-service`

| Herramienta | Destino | `TipoPropuesta` | Campos |
|---|---|---|---|
| `proponer_crear_conductas` | `POST /activity/grupos/:grupoId/conductas` | `CREAR_CONDUCTAS` | `nombre`, `tipo` (`BUENA`/`MALA`), `valorPuntos` (≥1, siempre positivo — el signo lo aplica el registro), `permiteAutoreporte` (solo con `MALA`). |
| `proponer_editar_conductas` | `PATCH /activity/conductas/:id` | `EDITAR_CONDUCTAS` | Los mismos, todos opcionales, más `conductaId` (origen `listar_conductas`). |
| `proponer_configurar_turnos` | `PUT /activity/actividades/:id/turno` | `TURNOS` | `actividadId` (origen `listar_actividades`), `modo` (`ORDEN_FIJO`/`AZAR`), `frecuencia` (`SESION`/`SECCION`), `activo`, `posiciones` (lista ordenada de `usuarioId`, origen `listar_participantes`). |

Además, `camposActividad()` suma **`repeticionesMaximasSeccion`** y **`siempreVisible`** (decisión 8). El esquema Zod de `esquemas.ts` ya los acepta: el cambio es exponerlos al modelo y describirlos. `siempreVisible` lleva en su descripción que solo hace algo con el plan del día activo, y que eso se consulta con `configuracion_del_grupo`.

### Familia economía — `rewards-service`

| Herramienta | Destino | `TipoPropuesta` | Campos |
|---|---|---|---|
| `proponer_crear_recompensas` | `POST /rewards/grupos/:grupoId/recompensas` | `CREAR_RECOMPENSAS` | `tipo` (`PREMIO`/`CASTIGO`), `umbralZonaId` (origen `listar_umbrales_zona`), `nombre`, `descripcion`, `permiteSeleccion`, `permiteAzar`. `imagenUrl` **no** se expone: el modelo no tiene de dónde sacar una URL válida y la inventaría. |
| `proponer_editar_recompensas` | `PATCH /rewards/recompensas/:id` | `EDITAR_RECOMPENSAS` | Los mismos opcionales, más `recompensaId` (origen `listar_recompensas`). |
| `proponer_crear_productos` | `POST /rewards/grupos/:grupoId/bolsas` y `POST /rewards/grupos/:grupoId/productos` | `PRODUCTOS_TIENDA` | Bolsas: `nombre`, `recompensaIds`. Productos: `nombre`, `descripcion`, `precio` (≥1), `fuente` (`ITEM`/`BOLSA`), `mecanica` (`AZAR`/`ELECCION`, se ignora con `ITEM`), `recompensaId` o `bolsaId` según la fuente. |
| `proponer_editar_productos` | `PATCH /rewards/productos/:id` | `PRECIOS_TIENDA` (conservado, decisión 7) | `productoId` (origen `listar_tienda`) más los campos de arriba, opcionales. |
| `proponer_etiquetas` | `POST /rewards/grupos/:grupoId/etiquetas` y `PUT /rewards/recompensas/:id/etiquetas` | `ETIQUETAS` | Crear: `nombre`, `colorHex` (`#RRGGBB`). Asignar: `recompensaId` (origen `listar_recompensas`) y `etiquetaIds` (origen `listar_etiquetas`). |

**Una bolsa y sus productos no se pueden proponer juntos**: la bolsa recién existe cuando el Tutor aplica, así que su id no se puede referenciar en la misma propuesta. `proponer_crear_productos` acepta las dos cosas y el servicio ordena las operaciones —bolsas primero— pero un producto que apunte a una bolsa de la misma propuesta se **rechaza** con un error que le dice al modelo que proponga la bolsa primero y los productos después, en dos tandas. Es el mismo límite que la decisión 5 evitó a nivel propuesta, acá adentro de una.

### Familia escala — `scoring-service`

| Herramienta | Destino | `TipoPropuesta` | Campos |
|---|---|---|---|
| `proponer_umbrales_zona` | `POST /scoring/grupos/:grupoId/umbrales`, `PATCH /scoring/umbrales/:id` y `PUT /scoring/grupos/:grupoId/configuracion` | `UMBRALES_ZONA` | Umbral: `nombreZona`, `orden` (≥1), `puntosMin`, `puntosMax` (null = sin techo, la zona más alta), `colorHex`. Configuración: `puntosIniciales` (≥0). |

Es la única herramienta que arma operaciones de tres endpoints distintos, y la única que puede proponer **crear y editar en la misma propuesta**: cambiar la escala de un grupo casi siempre es mover los rangos que hay y agregar uno, no una cosa o la otra.

Validación propia, además de la de shape: **los rangos tienen que cubrir la recta sin huecos ni solapes**, ordenados por `orden`, con exactamente una zona sin techo. Se valida sobre el estado resultante —los umbrales que quedan después de aplicar la propuesta entera, no los que ella trae— porque una edición parcial que sola parece rota puede ser correcta junto a las otras. Un conjunto inválido no se guarda: el error vuelve al modelo (decisión 11 del #29).

### Familia personas — `identity-service`

| Herramienta | Destino | `TipoPropuesta` | Campos |
|---|---|---|---|
| `proponer_roles_grupo` | `POST /identity/grupos/:grupoId/roles`, `PATCH /identity/roles/:rolGrupoId` y `PUT /identity/grupos/:grupoId/usuarios/:usuarioId/rol` | `ROLES_GRUPO` | Crear/editar: `nombre`, `colorHex`. Asignar: `usuarioId` y `rolGrupoId`. **`estado` no se expone** (decisión 3). |
| `proponer_equipos` | `POST /identity/grupos/:grupoId/equipos`, `PATCH /identity/equipos/:equipoId`, `POST /identity/equipos/:equipoId/miembros` y `POST /identity/equipos/:equipoId/jefe` | `EQUIPOS` | Crear: `nombre`, `jefeUsuarioId`, `miembrosIds`. Editar: `nombre`. Sumar miembro: `usuarioId`. Cambiar jefe: `nuevoJefeUsuarioId`. **`estado` no se expone**, y **quitar un miembro no está**: es `DELETE` (decisión 3). |

Mismo límite que las bolsas: un rol recién creado no se puede asignar en la misma propuesta, y un equipo recién creado ya trae sus miembros y su jefe en el `POST`, así que no lo necesita.

### Migración

Aditiva sobre el enum `TipoPropuesta`: `CREAR_CONDUCTAS`, `EDITAR_CONDUCTAS`, `TURNOS`, `CREAR_RECOMPENSAS`, `EDITAR_RECOMPENSAS`, `PRODUCTOS_TIENDA`, `ETIQUETAS`, `UMBRALES_ZONA`, `ROLES_GRUPO`, `EQUIPOS`. Sin backfill: las filas existentes conservan sus cuatro valores, `PRECIOS_TIENDA` incluido.

## Parte C — Contratos en `shared-types`

La decisión 11 del #29 exige que cada esquema Zod haga `implements` contra el contrato real del endpoint destino, con el chequeo `SinFaltantes` de `esquemas.ts` — es lo que hace que renombrar un campo en un servicio **rompa el build de `ai-service`** en vez de deteriorar la propuesta en silencio. La regla vale igual para todo lo que se agrega acá.

**Ya existen y se reusan tal cual**: `CrearEquipoRequest`, `EditarEquipoRequest`, `AgregarMiembroEquipoRequest`, `SustituirJefeEquipoRequest`, `CrearRolGrupoRequest`, `ActualizarRolGrupoRequest`, `AsignarRolGrupoRequest` (`identity.ts`), `ConfigurarTurnoRequest` (`activity.ts`) y `EditarProductoRequest` (`rewards.ts`).

**Hay que escribirlos**, y en cada caso el DTO del servicio pasa a llevar su `implements`: conductas (crear y editar), recompensas (crear y editar), umbrales (crear y editar), configuración de scoring, etiquetas (crear, editar y asignar), bolsa y producto-crear.

Esos `implements` son trabajo en el servicio destino, no en `ai-service`, y son la parte del ítem que más código toca en servicios ya cerrados. **No cambian ni un comportamiento**: son una anotación de tipo sobre clases que ya tienen esos campos.

## Parte D — Frontend (`app-web`)

`core/propuesta-ia.ts` crece en tres lugares y en ninguno más — la forma del archivo ya está preparada para esto:

- El mapa `ETIQUETAS`, con los campos nuevos y su nombre legible.
- El mapa `VALORES`, con los enums nuevos (`BUENA`, `MALA`, `PREMIO`, `CASTIGO`, `ITEM`, `BOLSA`, `AZAR`, `ELECCION`, `ORDEN_FIJO`, `SESION`, `SECCION`).
- El `switch` de `armarFilas`, con un caso por `TipoPropuesta` nuevo.

`ContextoPropuesta` suma `conductas`, `recompensas`, `productos` (ya está), `bolsas`, `etiquetas` y `umbrales`, para poder decir el «antes» de cada edición. Sin contexto la tarjeta se dibuja igual con menos información, que es el criterio que ya tiene.

La tarjeta de `UMBRALES_ZONA` lleva **el aviso de la decisión 6**, con el conteo de participantes que cambian de zona calculado contra `resumen_puntajes`. Es el único aviso nuevo: el resto de las tarjetas son filas de diff como las que ya hay.

Las entradas de contexto («Pedirle ayuda a la IA») se suman en las pantallas de Conductas, Recompensas, Tienda y Zonas, con el mismo patrón que ya tienen Actividades y Rendimientos.

## Parte E — Seguridad

No hay medidas nuevas: las once de la Parte E del #29 cubren este ítem sin cambios, porque no se agrega ninguna clase de capacidad — se agregan instancias de una clase que ya estaba analizada. Lo que sí cambia es que **hay más superficie de la misma clase**, así que tres de esas once se vuelven a verificar explícitamente en los criterios de aceptación:

- La 1 (la IA no tiene credenciales de escritura): el test de clientes solo-lectura tiene que seguir pasando con los cuatro endpoints internos nuevos.
- La 2 (el tenant no es parámetro): el test estructural tiene que cubrir las once definiciones nuevas.
- La 7 (datos personales): las lecturas nuevas **no agregan ni un dato personal** — productos, bolsas, etiquetas, configuración y turnos. Los turnos llevan `usuarioId`, que ya viajaba por `listar_participantes`; ningún email, en ninguna. Y por la decisión 9, esta medida pasa de ser una promesa a ser un test: **las doce lecturas** —las ocho de antes y las cuatro nuevas— dejan de mandar el id de organización en claro, que es lo que la medida decía y no se cumplía.

Y se suman las tres reglas propias de este ítem, las tres como test: **ninguna operación usa `DELETE`** (decisión 3), **ninguna propiedad uuid carece de origen declarado** (decisión 1) y **ninguna lectura devuelve una clave de tenant** (decisión 9).

## Parte F — Orden de ejecución

Cada tanda se termina y se verifica antes de la siguiente. El orden va de lo que desbloquea a lo que depende.

1. **Las dos reglas, sobre lo que ya existe.** La decisión 1 (`uuidDe` con origen, el tipo `NombreHerramientaLectura`, el test estructural) más `listar_tienda`, que es el arreglo del primer defecto; y la decisión 9 (moldear las cuatro lecturas que hoy pasan el DTO crudo, con su test), que es el arreglo del segundo. Al terminar esta tanda `proponer_editar_productos` **funciona por primera vez** y el id de organización **deja de salir hacia el proveedor**, todo sobre el catálogo viejo y antes de que entre una sola herramienta nueva. Es la tanda que hay que hacer aunque el resto del ítem se posponga.
2. **Contratos en `shared-types` y sus `implements`.** Toca siete DTOs de tres servicios y no cambia ningún comportamiento; conviene aislada, porque es la tanda que puede romper builds ajenos.
3. **Las tres lecturas restantes** (`listar_etiquetas`, `configuracion_del_grupo`, `listar_turnos`) con sus endpoints internos y sus clientes.
4. **Familia catálogo**: conductas, turnos y los dos campos de actividad.
5. **Familia economía**: recompensas, productos, bolsas y etiquetas.
6. **Familia escala**: umbrales, con su validación de cobertura.
7. **Familia personas**: roles y equipos.
8. **Frontend**: los tres mapas, el `switch`, el contexto ampliado, el aviso de umbrales y las cuatro entradas nuevas.
9. **E2E**: se amplía `asistente-ia.e2e.ts` con el proveedor stubbeado. No se testea que el modelo proponga cosas buenas; se testea el ruteo, la validación de referencias, el aplicado parcial y el aislamiento.

Las tandas 4 a 7 son independientes entre sí: si hay que cortar el ítem por la mitad, se corta ahí, y cada familia entregada funciona sola.

## Parte G — Criterios de aceptación

1. **La decisión 1 es estructural**: agregar una herramienta de propuesta con una propiedad uuid sin origen declarado, o con un origen que no es una herramienta de lectura existente, **no compila o falla el test** — verificado agregando una a propósito.
2. `proponer_editar_productos` con un `productoId` que no es del grupo **no crea `Propuesta`**: el error vuelve al modelo nombrando el campo. Lo mismo con `recompensaId`, `bolsaId`, `etiquetaId`, `conductaId`, `actividadId`, `umbralZonaId`, `rolGrupoId` y `usuarioId`.
3. **Ninguna operación de ninguna propuesta usa `DELETE`** — test sobre el `metodo` de todas las operaciones que arma el servicio, para las catorce herramientas de propuesta (las cuatro de antes y las diez nuevas).
4. Ningún esquema de propuesta acepta un campo `estado` (decisión 3), verificado sobre las definiciones.
5. Una propuesta de umbrales que deja un hueco, un solape, ninguna zona sin techo o más de una, **no se guarda**: el error vuelve al modelo con el rango conflictivo.
6. Un producto que apunta a una bolsa creada en la misma propuesta se rechaza con el error que explica el orden en dos tandas.
7. Aislamiento con dos tenants reales sobre las **cuatro lecturas nuevas**: una herramienta ejecutada en el contexto de A nunca devuelve una fila de B.
8. El test de clientes solo-lectura sigue verde con los cuatro endpoints internos nuevos, y el test estructural del tenant cubre las once definiciones nuevas.
9. Aplicar una propuesta de 3 conductas donde la segunda falla deja **2 creadas**, la propuesta en `APLICADA_PARCIAL` y el `resultado` con las 3 filas — la decisión 13 del #29 sigue valiendo para los tipos nuevos.
10. La tarjeta de umbrales muestra el conteo de participantes que cambian de zona antes de aplicar, y el número coincide con el estado después de aplicar.
11. **Ninguna de las doce lecturas devuelve una clave que matchee `/organizacionId|grupoId|tenant/`** ni un email — verificado sobre la respuesta real de cada herramienta, no sobre su tipo. Incluye las ocho que ya existían.
12. El tamaño del prompt de sistema queda medido antes y después, y anotado en `docs/progreso/` (decisión 10).
13. Suite E2E propia verde dos corridas seguidas, y la suite completa sin regresiones.
14. Con `ai-service` apagado, las pantallas del Tutor siguen funcionando — se revalida el criterio 9 del #29 con las cuatro entradas de contexto nuevas.

## Nota sobre los dos defectos del #29

Los dos arreglos entran por acá y **`fase-14-29-asistente-ia.md` no se toca** (protocolo de specs de `CLAUDE.md`). Las desviaciones se registran en `docs/progreso/`, junto con lo que las hizo posibles, que en los dos casos es lo mismo y vale la pena dejarlo escrito:

- El **`productoId`**: una herramienta de propuesta y una de lectura escritas en tandas distintas, cada una correcta, sin nada que verificara el cable entre las dos.
- El **`organizacionId`**: cuatro lecturas que devuelven el DTO entero porque es el camino corto, contra dos que se moldean a mano y nunca tuvieron el problema. La medida de seguridad estaba escrita y era correcta; lo que faltaba era que algo la ejecutara.

Ninguno se detectó con un test rojo: los dos se detectaron **leyendo el código con una pregunta nueva encima** —«¿de dónde saca el modelo este id?», «¿qué viaja exactamente en esta respuesta?»—. Es el mismo modo de falla que la Fase 14 viene encontrando desde el #23: *la unidad verifica la pieza y lo que falla es el cable*. Las decisiones 1 y 9 de este ítem convierten esas dos preguntas en dos tests, que es la única forma de que no haya que volver a acordarse de hacerlas.
