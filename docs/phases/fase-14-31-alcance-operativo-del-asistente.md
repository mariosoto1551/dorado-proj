# Fase 14 · Ítem 31 — Alcance operativo del asistente: borrar, ajustar y anotar

> Sub-spec detallada del ítem 31 de `fase-14-post-mvp.md`. Este archivo es la especificación decidida con José (2026-08-06); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Los ítems **#29 y #30 completos y verificados**. Este ítem hereda entera la arquitectura del #29 —el loop, la cuota, el ledger de `Mensaje`, el modelo `Propuesta`, el SSE y la tarjeta del frontend— y las dos reglas que el #30 dejó como estructura: cada id de propuesta declara de qué lectura sale (decisión 1) y ninguna lectura devuelve un DTO crudo (decisión 9).

A diferencia del #30, **este ítem sí construye algo nuevo fuera de `ai-service`**: el endpoint de ajuste manual de puntos que scoring nunca tuvo, con su pantalla de Tutor. Ver la Parte A.

## Qué revisa de lo ya decidido

Dos cosas, las dos a propósito y las dos del propio asistente:

- **La decisión 3 del #30** — *«solo altas y ediciones, ninguna operación de ninguna propuesta usa `DELETE`»*. Es el primer ítem del asistente que revisa una decisión de otro ítem del asistente. Se revisa la **capacidad**, no la arquitectura: un borrado sigue siendo una operación con método, ruta y body exactos que ejecuta el frontend con el JWT del Tutor.
- **El fuera de alcance del #29** — *«las escrituras que tocan un ledger»*. Entran las tres que el pedido nombra: ajustar puntos, ajustar monedas y anotar qué hizo o no hizo alguien.

**No revisa** ninguna de las tres decisiones estructurales del #29: la IA no tiene credenciales de escritura (decisión 6), el tenant nunca es argumento de una herramienta (decisión 9), y un humano ve todo antes de que exista (decisión 2). Tampoco revisa la **decisión 4 del #30** —la IA no da de alta ni de baja personas—, que sobrevive entera y sigue siendo el borde de este ítem.

Ni `fase-14-29-asistente-ia.md` ni `fase-14-30-alcance-total-del-asistente.md` se editan.

## Motivación (el problema que resuelve)

### Un asistente que construye y no mantiene

El #30 cerró la asimetría entre lo que la IA **ve** y lo que puede **proponer**. Queda otra, y es la que aparece recién cuando el grupo ya está armado: la asimetría entre lo que la IA puede **crear** y lo que puede **deshacer**.

Puede proponer veinticinco actividades de una y no puede archivar la que sobra. Puede calibrar la tienda entera y no puede sacar el producto que nadie compra. Lee `resumen_cumplimiento` —la herramienta que existe justamente para contestar *«qué actividad no hace nadie nunca»*— y lo único que puede hacer con esa respuesta es contarla en voz alta y pedirle al Tutor que abra el catálogo.

Un asistente que solo agrega es un asistente que solo ensucia.

### El día a día del Tutor no es configurar: es anotar

Configurar un grupo se hace una vez. Marcar quién hizo qué se hace todos los días, y es el 90% del tiempo que el Tutor pasa en la app. El asistente, hasta acá, no toca nada de eso: sabe quiénes son los integrantes, qué actividades tienen, cuánto valen y en qué zona está cada uno, y no puede anotar una sola cosa.

Lo mismo con el número suelto. *«Ayudó con la mudanza, ponele 10»* es la operación más común que existe fuera de las actividades del catálogo, y hoy termina en *«abrí Billeteras y ajustá a mano»* — o, si son puntos, en que no hay dónde.

### El hueco que el ítem encontró: no hay ajuste manual de puntos

Buscando el endpoint destino de *«ponele 10 puntos a Juan»* apareció que **no existe**. `TipoOrigenPuntos` tiene cuatro valores —`ACTIVIDAD_COMPLETADA`, `NO_HIZO`, `CONDUCTA`, `CORRECCION`— y el único endpoint que escribe una fila a mano es `POST /scoring/eventos-puntos/:id/corregir`, que **exige el id de un evento previo**: sirve para arreglar un asiento que existe, no para sumar puntos por algo que pasó fuera del catálogo.

O sea que **el Tutor tampoco puede hacerlo desde su pantalla**. Para las monedas hay ajuste manual desde el #22 (`POST /rewards/grupos/:g/usuarios/:u/ajuste`, monto con signo y motivo obligatorio); para los puntos —que son el número principal del producto, el que decide la zona y la recompensa— no hay nada equivalente.

Es un hueco del producto que el ítem encuentra, no un hueco de la IA. Por eso el endpoint se construye **con su pantalla de Tutor en la misma tanda** y no como una API para que la llame el asistente: la IA no puede poder algo que el humano no puede.

## Decisiones de diseño

Cerradas con José el 2026-08-06:

1. **La IA puede borrar, y borrar sigue siendo un `DELETE` que ejecuta el frontend con el JWT del Tutor.** Revisa la decisión 3 del #30 en la capacidad y no en la arquitectura: `OperacionPropuesta.metodo` suma `'DELETE'` y nada más cambia en el camino de aplicado. El test de aquella decisión **no se borra: se invierte.** Pasa de *«ninguna operación usa `DELETE`»* a *«solo los `TipoPropuesta` de la lista blanca declarada usan `DELETE`»*, que es una propiedad más fuerte que quedarse sin test — un borrado que aparezca mañana en la familia de crear actividades sigue estando prohibido.

2. **Una propuesta que contiene una sola operación destructiva se trata entera como destructiva.** La tarjeta se pinta por su fila más peligrosa: encabezado rojo, **sin botón «Aplicar todo»**, confirmación fila por fila, y cada fila diciendo qué se pierde *y qué no*. Lo último no es decoración: casi todos los `DELETE` del monorepo son **soft** (`estado = ARCHIVADA`), así que archivar una actividad la saca de la lista y **deja intactos su historial y los puntos que ya dio**. Un Tutor que cree que borrar una actividad borra sus puntos no aprieta nunca; uno que cree lo contrario aprieta de más. Las dos excepciones —`DELETE /scoring/umbrales/:id`, que borra de verdad, y quitar una marca, que la da de baja del puntaje— la fila las dice con esas palabras.

3. **Se borra catálogo y marcas. Personas nunca.** Entran: actividad, conducta, premio/castigo, producto, bolsa, etiqueta, zona de la escala, la rotación de una actividad, y los registros de la sesión abierta. Quedan afuera usuarios, tutores, invitaciones y miembros de equipo — la decisión 4 del #30 sobrevive entera y por el mismo motivo: sacar a alguien de un grupo es un acto que empieza fuera de la app, en una conversación que el modelo no vio. Archivar una actividad se desarchiva; sacar a un integrante, no.

4. **Ajustar puntos necesita un endpoint nuevo y una pantalla nueva, en ese orden.** `POST /scoring/grupos/:grupoId/usuarios/:usuarioId/ajuste` escribe **una fila nueva** en `EventoPuntos` con `tipoOrigen: AJUSTE_MANUAL` (valor nuevo del enum). El ledger no cambia de naturaleza: fila nueva, inmutable, nunca `UPDATE`, y el puntaje se sigue derivando al leer (regla 1 del proyecto). La pantalla del Tutor entra en la misma tanda, espejando `billeteras.component.ts`. Ver la Parte A.

5. **Un ajuste de puntos cae en la Sección y la Sesión abiertas, o no cae.** scoring resuelve la sesión actual contra `internal/session` igual que hace activity al registrar, y **falla cerrado** si no hay ninguna abierta: sin sesión no hay dónde escribir el asiento. Ajustar el pasado no entra en este ítem — corregir una sección cerrada ya tiene su camino (`corregir`) y su regla (fila nueva con `corregidoDeId`, regla 6 del proyecto).

6. **Anotar es sobre la sesión abierta de hoy, y se puede deshacer.** Marcar hecho, marcar no hecho con motivo, registrar una conducta, y quitar o revertir esas mismas marcas dentro de la sesión en curso. Nada de secciones cerradas.

7. **Lo que agrega y lo que quita nunca comparten tarjeta.** Marcar y desmarcar son dos herramientas distintas aunque sean el mismo dominio, precisamente para que la decisión 2 tenga dónde agarrarse: si una sola herramienta hiciera las dos cosas, toda anotación arrastraría la ceremonia del borrado y la ceremonia dejaría de significar algo. La única excepción es la escala, y está explicada en la decisión 8.

8. **Borrar una zona vive dentro de `proponer_umbrales_zona`, no en la herramienta de archivar.** No es una comodidad: **sacar una zona del medio casi siempre exige ensanchar a una vecina en el mismo movimiento**, y el #30 ya demostró que un paso intermedio con un hueco falla aunque el resultado final cierre (scoring valida la escala completa en cada escritura). Separarlas produciría propuestas correctas e inaplicables. La consecuencia se acepta y es la que la decisión 2 resuelve: una propuesta de umbrales con `borrar` no vacío **es una propuesta destructiva** y se pinta como tal.

9. **Dos lecturas nuevas y ninguna más.** `estado_de_hoy` y `listar_billeteras`. La primera es la que hace posible la familia de anotar: por la decisión 1 del #30, un `registroId` que ninguna lectura devuelve es un id que el modelo solo puede inventar. La segunda evita proponer un descuento que deje el saldo en negativo, que el endpoint destino rechaza al aplicar. Los puntajes ya salen por `resumen_puntajes`.

10. **Un ajuste y una marca son actos, no configuración: van con nombre, número y motivo.** El motivo es obligatorio en las cuatro operaciones donde el endpoint lo admite (`no-hizo`, quitar una completada, ajuste de monedas, ajuste de puntos). El de monedas ya lo exige desde el #22 y el de puntos lo va a exigir: un movimiento manual sin explicación es inauditable, y con un modelo de lenguaje redactándolo, doblemente. Los cuatro dejan rastro en `audit-service` por el camino que ya existe (`AccionAdministrativaRegistrada`).

11. **El aviso de consentimiento se amplía y se vuelve a pedir.** Las lecturas nuevas mandan hacia el proveedor dos clases de dato que antes no salían: **el saldo en monedas y el estado de cumplimiento del día, por persona**. La decisión 5 del #29 hizo del aviso el fundamento del opt-in, así que quien aceptó una lista más corta no aceptó ésta. `ConfiguracionIaOrganizacion` suma `avisoVersion`; los consentimientos del #29 valen como versión 1 y el asistente queda **apagado hasta que un `ORG_ADMIN` acepte la versión 2**. Es la única parte del ítem que puede interrumpirle el uso a alguien, y es a propósito.

12. **Nada de esto es autónomo.** No hay ninguna capacidad nueva de *«la IA marca sola al cierre»*, ni nada agendado, ni nada que corra sin que alguien escriba un mensaje. Sigue siendo una propuesta por conversación que un humano aplica.

### Fuera de alcance a propósito

- **Personas**: invitar, dar de alta o de baja usuarios y tutores, sacar a alguien de un equipo (decisión 3, hereda la 4 del #30).
- **El pasado**: corregir eventos de secciones cerradas y descalificar (decisión 5).
- **El ciclo de la sección**: abrir, cerrar, forzar cierre o forzar evaluación. Siguen siendo del Tutor.
- **La entrega**: entregar recompensas, seleccionar, sortear y comprar en la tienda. Un canje es del participante o del cierre, no de una propuesta.
- **Desarchivar** (`PATCH /rewards/etiquetas/:id/desarchivar` y equivalentes). El ítem agrega el borrar; el ciclo completo no lo pidió nadie y agregarlo «ya que estamos» es cómo crece un catálogo de herramientas sin que nadie lo decida.
- **La propuesta compuesta** (decisión 5 del #30, intacta): archivar tres actividades y ajustarle los puntos a Juan son dos tarjetas.
- **Eventos de dominio nuevos.** `ai-service` sigue sin publicar ni consumir RabbitMQ. El ajuste manual de puntos publica el `AccionAdministrativaRegistrada` que ya existe, por el mismo camino que la corrección.

---

## Parte A — El endpoint que falta (`scoring-service`)

Es la única capacidad de backend nueva del ítem y **no es del asistente**: es del producto.

### Endpoint

| Método | Ruta | Roles | Request | Response |
|---|---|---|---|---|
| `POST` | `/scoring/grupos/:grupoId/usuarios/:usuarioId/ajuste` | `TUTOR`, `ORG_ADMIN` | `AjustarPuntosRequest` | `EventoPuntosDto` (la fila nueva) |

```ts
export class AjustarPuntosRequest {
  /** Con signo: positivo suma, negativo resta. Nunca 0. */
  puntos!: number;   // Int, distinto de 0
  /** Obligatorio: un movimiento manual sin explicación es inauditable. */
  motivo!: string;   // 1..200
}
```

Espeja deliberadamente `AjustarMonedasRequest` del #22, campo por campo, salvo el nombre del número: son dos cosas independientes (decisión 1 del #28) y llamar `monto` a los puntos las confundiría en la primera lectura.

### Schema

Migración **aditiva**, tres cambios:

- `TipoOrigenPuntos` suma **`AJUSTE_MANUAL`**. El puntaje se deriva con un `aggregate` sobre `puntosSnapshot` sin filtrar por origen, así que el valor nuevo **suma solo, sin tocar ninguna consulta**.
- `EventoPuntos.origenId` pasa a **`String?`**. Un ajuste manual no tiene fila de origen: no hay `RegistroActividad` ni `EventoPuntos` anterior al que apuntar, y meterle un id prestado sería mentir en el único ledger del sistema. Todas las consultas por `origenId` filtran por un valor concreto, así que ninguna cambia de resultado.
- El motivo se guarda en **`motivoCorreccion`**, que ya existe, ya es nullable y ya significa *«por qué un humano tocó el ledger a mano»* — que es exactamente lo que es un ajuste manual. Renombrarlo a `motivo` sería mejor nombre y peor idea: es una columna persistida con filas vivas, y el #30 ya sentó ese criterio en su decisión 7.

### Reglas

1. La Sección y la Sesión salen de `internal/session` (`SessionClientService` ya existe en scoring; suma el método `obtenerSeccionActual`). **Sin sesión abierta, `409`** con un mensaje que lo diga — no se inventa dónde escribir.
2. `usuarioId` se valida como integrante del grupo contra `internal/identity`, igual que hace el resto del servicio.
3. `registradoPorId` / `registradoPorTipo` salen del JWT, nunca del body (regla 3 del proyecto).
4. Se publica `AccionAdministrativaRegistrada` con `accion: 'PUNTOS_AJUSTADOS'` y detalle `{ motivo, puntos, usuarioId, seccionId, eventoId }`, por el mismo camino que `EVENTO_PUNTOS_CORREGIDO`.
5. **No hay piso en 0.** Es la diferencia deliberada con el ajuste de monedas: un puntaje negativo es un estado legítimo del producto (la zona Rojo existe y `puntosMin` puede ser negativo), un saldo negativo no.

### Pantalla del Tutor

Modal de ajuste sobre la lista de integrantes del área de puntajes, espejo de `billeteras.component.ts`: número con signo, motivo obligatorio, y el puntaje actual a la vista para que el ajuste se decida contra algo. Es la mitad de la decisión 4 y **no se pospone**.

## Parte B — Lecturas nuevas

Dos. Las dos con endpoint interno `GET`, las dos moldeadas campo por campo (decisión 9 del #30), ninguna recibe el tenant (decisión 9 del #29).

| Herramienta | Endpoint interno nuevo | Qué devuelve | Por qué existe |
|---|---|---|---|
| `estado_de_hoy` | `GET /internal/activity/grupos/:grupoId/estado-de-hoy` | `sesionAbierta` (bool) y, por participante: sus actividades de hoy con `actividadId`, nombre, tipo, valor, si ya está marcada y cómo (`PENDIENTE` / `HECHA` / `NO_HIZO`) y el **`registroId` de la marca viva**; más las conductas registradas hoy con su `registroId`. | Es la lectura sin la cual la familia de anotar no puede existir: por la decisión 1 del #30, un `registroId` que ninguna lectura devuelve es un id que el modelo solo puede inventar. Y sin el estado de la marca, la IA propone marcar lo que ya está marcado. |
| `listar_billeteras` | `GET /internal/rewards/grupos/:grupoId/billeteras` | Por participante: saldo, nombre e ícono de la moneda, y el objetivo de ahorro si tiene. | Un descuento que deja el saldo bajo 0 lo rechaza el endpoint al aplicar (#22). Sin ver el saldo, la IA propone una fila roja. |

Reusa la misma función de servicio que `GET /activity/grupos/:grupoId/usuarios/:usuarioId/estado-hoy` (fase-14-23 T4), en lote para todo el grupo: **el Tutor tiene que poder marcar sobre lo que el integrante realmente ve** —días programados, plan del día, rol y turno incluidos—, y la IA también.

`sesionAbierta: false` es una respuesta legítima y el modelo tiene que saber qué hacer con ella: sin sesión no se anota nada, y la descripción de la herramienta lo dice.

## Parte C — Propuestas nuevas

Cuatro herramientas nuevas, más el `borrar` que crece dentro de una existente. **Ningún endpoint destino hay que crearlo salvo el de la Parte A**: los demás existen desde su fase de origen.

### Familia destructiva

| Herramienta | `TipoPropuesta` | Operaciones que arma |
|---|---|---|
| `proponer_archivar` | `ARCHIVAR_CATALOGO` | `DELETE /activity/actividades/:id` · `DELETE /activity/conductas/:id` · `DELETE /rewards/recompensas/:id` · `DELETE /rewards/productos/:id` · `DELETE /rewards/bolsas/:id` · `DELETE /rewards/etiquetas/:id` · `DELETE /activity/actividades/:id/turno` |
| `proponer_quitar_marcas` | `QUITAR_MARCAS` | `DELETE /activity/registros-actividad/:id?motivo=…` · `POST /activity/registros-actividad/:id/revertir` · `DELETE /activity/registros-conducta/:id` |

`proponer_archivar` toma filas `{ tipo, id, motivo? }` con `tipo` en `ACTIVIDAD | CONDUCTA | RECOMPENSA | PRODUCTO | BOLSA | ETIQUETA | TURNO`, y el `id` declara su origen múltiple (`listar_actividades`, `listar_conductas`, `listar_recompensas`, `listar_tienda`, `listar_etiquetas`) con la forma que ya usa `proponer_rendimientos_monedas`. El armador valida **contra el conjunto de esa entidad** (decisión 2 del #30): un `id` de actividad declarado como `RECOMPENSA` se rechaza antes de guardar nada.

`proponer_quitar_marcas` toma `{ tipo, registroId, motivo? }` con `tipo` en `COMPLETADA | MARCA_ROJA | CONDUCTA`, y los `registroId` salen de `estado_de_hoy` — el único lugar de donde pueden salir. El motivo viaja como **query param** en el `DELETE` de completada, porque un `DELETE` con body pasa por demasiados intermediarios que tienen derecho a descartarlo (fase-14-12).

### Familia de ajustes

| Herramienta | `TipoPropuesta` | Operaciones que arma |
|---|---|---|
| `proponer_ajustes_manuales` | `AJUSTES_MANUALES` | `POST /scoring/grupos/:g/usuarios/:u/ajuste` · `POST /rewards/grupos/:g/usuarios/:u/ajuste` |

Una fila por persona: `{ participanteId, puntos?, monedas?, motivo }`. Los dos números son opcionales pero **al menos uno tiene que venir**, y un mismo motivo cubre los dos: *«ayudó con la mudanza»* explica igual de bien el +10 y el +5. Que sea una herramienta y dos endpoints es lo que hace que la tarjeta muestre el acto y no la plomería; que sean dos números independientes es la decisión 1 del #28 y sigue intacta — el modelo manda el que corresponde, nunca uno derivado del otro.

Se valida antes de guardar: el participante es del grupo, `puntos ≠ 0` y `monedas ≠ 0` si vienen, hay motivo, y **un descuento en monedas no puede dejar el saldo bajo 0** contra lo que devolvió `listar_billeteras`.

### Familia de anotaciones

| Herramienta | `TipoPropuesta` | Operaciones que arma |
|---|---|---|
| `proponer_anotar` | `ANOTAR_REGISTROS` | `POST /activity/actividades/:id/completar` · `POST /activity/actividades/:id/no-hizo` · `POST /activity/conductas/:id/registrar` |

Filas `{ participanteId, tipo, id, motivo? }` con `tipo` en `HIZO | NO_HIZO | CONDUCTA`. El armador traduce `participanteId` → `usuarioId` en el body, igual que hace la familia personas del #30 con `posiciones`. Reglas que se replican para no morir al aplicar: sin sesión abierta no se arma la propuesta; una actividad que hoy no le toca a esa persona se rechaza con el motivo; `NO_HIZO` solo sobre `OBLIGATORIA`; y no se propone marcar lo que `estado_de_hoy` ya trae marcado.

### La escala

`proponer_umbrales_zona` suma una lista `borrar: [umbralZonaId]` (decisión 8). Los pasos de borrado entran en `escala.ts` como un tipo de paso más: `estadoResultante` los saca del conjunto, `violacionDeLaEscala` valida lo que queda, y `ordenAplicable` busca un orden donde **todos** los pasos intermedios cierren. Si no existe, la propuesta no se guarda y el error le explica al modelo por qué — exactamente como hoy.

### Migración

Aditiva sobre `TipoPropuesta`: `ARCHIVAR_CATALOGO`, `QUITAR_MARCAS`, `AJUSTES_MANUALES`, `ANOTAR_REGISTROS`. Sin backfill. Y `ConfiguracionIaOrganizacion` suma `avisoVersion Int?` (decisión 11).

## Parte D — Contratos en `shared-types`

La regla de la decisión 11 del #29 vale igual acá: cada esquema Zod hace `implements` contra el contrato real del endpoint destino, con el chequeo `SinFaltantes`.

**Ya existen y se reusan**: `CompletarActividadRequest`, `RegistrarNoHizoRequest`, `RegistrarConductaRequest`, `QuitarCompletadaQuery` (`activity.ts`) y `AjustarMonedasRequest` (`rewards.ts`).

**Hay que escribirlo**: `AjustarPuntosRequest` (Parte A), con su `implements` en el DTO de scoring.

`OperacionPropuestaIaDto.metodo` pasa a `'POST' | 'PATCH' | 'PUT' | 'DELETE'`. Es el único cambio de contrato del camino de aplicado y **el único lugar donde este ítem toca algo que el #29 dio por cerrado**.

## Parte E — Frontend (`app-web`)

- **`core/propuesta-ia.ts`**: cuatro casos nuevos en el `switch` de `armarFilas`, los enums nuevos en `VALORES`, y una función `esDestructiva(propuesta)` que es `true` para los tres tipos destructivos y para `UMBRALES_ZONA` con `borrar` no vacío (decisión 2).
- **`tarjeta-propuesta.component.ts`**: rama destructiva —encabezado rojo, sin «Aplicar todo», casilla por fila y botón deshabilitado hasta que haya al menos una tildada—. `aplicar-propuesta.ts` no cambia: `soloEstas` ya existe y es exactamente lo que la rama necesita.
- **`ContextoPropuesta`** suma billeteras y el estado de hoy, para que las filas digan *«Juan · Tender la cama»* y no dos uuid.
- **Pantalla nueva**: el modal de ajuste de puntos de la Parte A.
- **Entradas de contexto** («Pedirle ayuda a la IA») en la pantalla de integrantes y en la de billeteras, con el patrón que ya tienen Actividades, Rendimientos, Conductas, Recompensas, Tienda y Zonas.
- **El aviso de la decisión 11**: el texto del opt-in suma las dos clases de dato nuevas, y la pantalla de configuración vuelve a pedir la aceptación si `avisoVersion` es menor que la vigente.

## Parte F — Seguridad

Las once medidas de la Parte E del #29 siguen cubriendo el ítem: **no se agrega ninguna clase de capacidad nueva del lado de la IA** —sigue sin credenciales de escritura, sigue sin poder nombrar un tenant, sigue sin poder aplicar nada— y lo que se agrega son instancias de una clase ya analizada. Lo que cambia es el **peor caso de una propuesta mala aplicada sin mirar**, que pasa de «basura en el catálogo» a «una actividad archivada y unos puntos de más». Por eso:

- La decisión 1 convierte el test de la decisión 3 del #30 en una **lista blanca**: `DELETE` solo en `ARCHIVAR_CATALOGO`, `QUITAR_MARCAS` y `UMBRALES_ZONA`.
- La decisión 2 pone la fricción donde está el daño, y se verifica en la tarjeta: **no existe camino de un clic** que borre algo.
- Las lecturas nuevas **no agregan ni un email ni un dato de contacto**; agregan saldo y cumplimiento por persona, y por eso la decisión 11 vuelve a pedir el consentimiento.
- El test de clientes solo-lectura y el test estructural del tenant cubren los dos endpoints internos y las cuatro definiciones nuevas sin cambios.

## Parte G — Orden de ejecución

Cada tanda se termina y se verifica antes de la siguiente.

1. **El endpoint de ajuste de puntos y su pantalla** (Parte A). Sin una línea de `ai-service`: es un hueco del producto y se cierra primero, así queda entregado aunque el resto se posponga.
2. **`DELETE` en el camino de aplicado**: el contrato, la lista blanca con su test invertido, y la rama destructiva de la tarjeta —con una propuesta de archivar de un solo tipo para probarla de punta a punta—.
3. **Las dos lecturas** (`estado_de_hoy`, `listar_billeteras`) con sus endpoints internos y sus clientes.
4. **Familia destructiva**: `proponer_archivar` y `proponer_quitar_marcas`.
5. **Familia de ajustes**: `proponer_ajustes_manuales`.
6. **Familia de anotaciones**: `proponer_anotar`.
7. **La escala**: `borrar` dentro de `proponer_umbrales_zona`, con los pasos de borrado en `escala.ts`.
8. **El aviso** (decisión 11) y las dos entradas de contexto.
9. **E2E**: se amplía `asistente-ia.e2e.ts` con el proveedor stubbeado — ruteo, validación de referencias, aplicado parcial, aislamiento, y que la tarjeta destructiva no tenga «Aplicar todo».

Las tandas 4, 5 y 6 son independientes entre sí: si hay que cortar, se corta ahí.

## Parte H — Criterios de aceptación

1. Un Tutor ajusta **+10 puntos** a un integrante desde su pantalla, el puntaje sube 10 al leerlo, y el ledger tiene **una fila nueva** `AJUSTE_MANUAL` con su motivo — ninguna fila anterior cambió.
2. El mismo ajuste **sin sesión abierta** devuelve `409` y no escribe nada.
3. El ajuste queda en `audit-service` como `PUNTOS_AJUSTADOS`, consultable por entidad.
4. **`DELETE` solo aparece en los tres tipos de la lista blanca** — test sobre las operaciones que arma el servicio, para las dieciocho herramientas de propuesta.
5. La tarjeta de una propuesta destructiva **no tiene «Aplicar todo»** y su botón está deshabilitado hasta que se tilde al menos una fila — verificado en la E2E, no solo a ojo.
6. Una propuesta de umbrales con `borrar` **se pinta como destructiva** aunque las otras filas sean ediciones (decisión 8 + decisión 2).
7. Archivar una actividad **no cambia el puntaje de nadie**: se verifica el puntaje antes y después, y la fila de la tarjeta lo había dicho.
8. Quitar una completada **sí** baja el puntaje, y la fila lo había dicho.
9. `proponer_anotar` sobre una actividad que hoy no le toca a esa persona **no crea `Propuesta`**: el error vuelve al modelo con el motivo.
10. `proponer_ajustes_manuales` con un descuento que deja el saldo bajo 0 **no crea `Propuesta`**.
11. Un `registroId` inventado —o de otro grupo— se rechaza antes de persistir (decisión 2 del #30, sobre las entidades nuevas).
12. Aislamiento con dos tenants reales sobre las **dos lecturas nuevas**.
13. **Ninguna de las catorce lecturas devuelve una clave que matchee `/organizacionId|grupoId|tenant/`** ni un email — se revalida el criterio 11 del #30 con las dos nuevas.
14. Una organización que aceptó el aviso del #29 **encuentra el asistente apagado** hasta aceptar la versión 2 (decisión 11).
15. Aplicar una propuesta de 3 archivados donde el segundo falla deja **2 archivados**, la propuesta en `APLICADA_PARCIAL` y el `resultado` con las 3 filas.
16. Suite E2E propia verde dos corridas seguidas, y la suite completa sin regresiones.

## Nota sobre revisar una decisión del asistente

La decisión 3 del #30 —*ninguna operación usa `DELETE`*— era correcta cuando se escribió y **no se escribió por miedo al `DELETE`**: se escribió porque aquel ítem era sobre configurar un grupo, y archivar no es configurar. Lo que la vuelve chica no es un error de aquel ítem sino que el asistente pasó de armar grupos a acompañarlos.

Vale la pena dejar escrito **cómo** se revisa, porque es el precedente: la decisión no se borra, se convierte en una lista blanca. El test que la sostenía no desaparece —desaparecer es lo que hace que una regla se pierda sin que nadie lo note— sino que pasa a afirmar algo más fuerte y más específico. Una capacidad que se amplía deja atrás una regla más chica, no ninguna.

Y la mitad más importante del ítem no es del asistente: **el ajuste manual de puntos lo necesitaba el Tutor desde la Fase 7 y nadie lo había visto**, porque la única forma de encontrarlo era preguntarse dónde aplicaría una capacidad nueva. Es el mismo modo de descubrimiento que el #30 anotó para sus dos defectos: *leer el código con una pregunta nueva encima*.
