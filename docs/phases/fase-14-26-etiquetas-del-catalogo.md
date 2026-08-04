# Fase 14 · Ítem 26 — Etiquetas del catálogo de recompensas

> Sub-spec detallada del ítem 26 de `fase-14-post-mvp.md`. Este archivo es la especificación decidida con José (2026-08-03); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Fase 8 completa (catálogo `Recompensa`, canjes, entregas) y, de Fase 14, el **ítem #22** (tienda de monedas: `BolsaPremios`, `ProductoTienda`, modos `DIRECTO`/`TIENDA`). Ambos ejecutados.

Reutiliza tal cual: `AccesoGrupoService`, la extensión de tenant de Prisma que agrega `organizacionId` (+ `grupoId IN grupoIds`) a toda consulta, el `EventosPublisherService` con `publicarAccionAdministrativa` (retrofit de Fase 9), el enum `EstadoCatalogo`, y el patrón de catálogo por Grupo con **nombre + `colorHex` + archivable** que estrenó `RolGrupo` en el ítem #19.

## Motivación (el problema que resuelve)

El catálogo de ítems de un Grupo es hoy **una lista plana sin ningún eje de organización**: un `@for` en orden de creación (`catalogo-items.component.ts`), sin filtro, sin agrupación, sin más clasificación que `PREMIO`/`CASTIGO` y —solo en modo `DIRECTO`— la zona. Con 8 ítems no molesta; con 40, que es lo que produce un grupo activo después de unos meses de tienda, encontrar algo es leer todas las tarjetas.

El costo real no es la lectura, es **lo que hay que hacer de a uno porque no existe forma de nombrar un subconjunto**:

- Armar una bolsa de "premios chicos" es tildar 12 ítems a mano sobre una lista de 40, y repetirlo entero cada vez que se agrega un ítem nuevo que debería estar ahí. El atajo que existe hoy es «Agregar todos» — todo o nada.
- En modo `TIENDA`, cada premio necesita su producto creado a mano, con nombre, descripción y precio. Doce premios de 10 monedas son doce formularios idénticos salvo el nombre.

Las dos cosas son la misma carencia: **el Tutor tiene grupos de ítems en la cabeza y el sistema no tiene dónde escribirlos**.

Nada de esto es una regla de negocio. Una etiqueta **no cambia el comportamiento de nada**: no decide precios, no restringe quién ve qué, no entra en ningún sorteo. Es organización del adulto. Esa es exactamente la razón por la que se puede permitir cosas que otras entidades del catálogo no (ver decisión 6).

## Decisiones de diseño

Cerradas con José el 2026-08-03:

1. **Catálogo de etiquetas por Grupo**, no texto libre por ítem. Entidad propia con nombre + color, igual que `RolGrupo` (#19) y `UmbralZona.colorHex` (Fase 7). Con texto libre, "Juguetes" / "juguetes" / "juguete" son tres etiquetas distintas a la semana de uso, y renombrar significa editar ítem por ítem — que es justo el trabajo manual que este ítem viene a eliminar.
2. **Varias etiquetas por ítem** (N:M), a diferencia del rol del #19 que es uno solo. Ahí la cardinalidad 1 evitaba reglas de conflicto entre roles porque el rol **restringe**; acá la etiqueta no restringe nada, así que dos etiquetas no pueden entrar en conflicto — y el valor del atajo «todos los de X» crece con la libertad de cruzar ejes ("pantalla" y "fin de semana" son la misma bici por dos motivos distintos).
3. **La etiqueta es solo del Tutor.** No se muestra al participante en ninguna pantalla: ni en la tienda, ni en los elegibles del modo `DIRECTO`, ni en la billetera. Es organización interna del adulto, no una categoría de producto. Consecuencia técnica en la decisión 12.
4. **Tres usos, y ninguno más**: (a) filtrar el catálogo del Tutor, (b) precargar la selección al armar una bolsa, (c) crear productos de tienda en masa. Los tres son atajos de una acción que ya existe.

Detalles resueltos en esta spec:

5. **El nombre de la entidad es `EtiquetaCatalogo`, y la tabla de unión `EtiquetaEnRecompensa`.** No `EtiquetaRecompensa` para la primera: leídas juntas en un import o en un `where`, `EtiquetaRecompensa` y `RecompensaEtiqueta` se confunden a simple vista, y este ítem toca los tres archivos donde conviven. `EtiquetaCatalogo` además dice la verdad: etiqueta **ítems del catálogo**, que incluyen castigos — el propio #22 dejó anotado que llamarle "Recompensa" a un castigo es un nombre heredado, y no hace falta propagarlo a lo nuevo.

6. **Archivar una etiqueta es reversible** (`PATCH .../desarchivar`), y por eso **no pide confirmación**. Es la única entidad archivable de `rewards` que puede volver sin riesgo: desarchivar un producto o una bolsa vuelve a poner algo **comprable** en la tienda, y por eso el #23 (tanda 4) las dejó sin reactivación y con confirmación obligatoria; desarchivar una etiqueta vuelve a mostrar un chip. La regla que cerró aquel ítem —*se confirma lo que no tiene vuelta atrás, no todo lo que es rojo*— se aplica acá al otro lado: esto **sí** tiene vuelta atrás.

7. **Archivar una etiqueta NO desasigna nada.** Opuesto al #19, donde archivar un rol desasignaba a quienes lo tenían — y por un motivo concreto: allá la asignación **ocultaba actividades**, así que dejarla viva escondía cosas por una regla que ya nadie podía ver. Acá la asignación no hace nada por sí sola; conservarla es lo que hace que desarchivar (decisión 6) restituya el estado exacto en vez de dejar una etiqueta vacía. Una etiqueta archivada desaparece de filtros, de chips y de selectores, pero sus filas siguen ahí.

8. **Máximo 5 etiquetas por ítem** (400 `DEMASIADAS_ETIQUETAS`). Es un tope de interfaz, no de dominio: la tarjeta del catálogo muestra los chips y a partir de ahí dejan de comunicar. Se anota como tal para que subirlo mañana sea cambiar una constante y no descubrir por qué estaba.

9. **El filtro es por UNA etiqueta a la vez** (`?etiquetaId=`). Multi-etiqueta obliga a fijar si el cruce es unión o intersección, que es una semántica imposible de comunicar en una fila de chips — mismo razonamiento con el que el #24 hizo excluyentes los cuatro modos de destinatario en vez de cruzarlos.

10. **El atajo de bolsa precarga PREMIOS, no la etiqueta.** La bolsa se sigue guardando como **lista explícita de ítems** (decisión 19 del #22, intacta): la etiqueta elige qué tildar, y lo tildado queda editable antes de guardar. Una bolsa "todos los de X" resuelta al momento del sorteo metería sola la bici que se cargue mañana con esa etiqueta, que es exactamente lo que aquella decisión existe para impedir. Si la etiqueta tiene castigos, **se saltean en silencio** y el frontend lo dice (`«3 de 5 · 2 castigos no van en bolsa»`): no se envía nada que el backend vaya a rechazar con `CASTIGO_NO_VA_EN_BOLSA`.
11. **La creación masiva de productos saltea, no falla.** Un ítem de la etiqueta que ya tenga un `ProductoTienda` `ACTIVA` de fuente `ITEM` apuntándolo **no genera otro**: la respuesta dice cuántos creó y cuáles salteó. Correr el atajo dos veces no puede duplicar la tienda. Solo existe en modo `TIENDA` (400 `SOLO_EN_MODO_TIENDA`), y los castigos nunca entran — ya son dos puertas cerradas en `ProductosService`, esta es la tercera y falla antes de llegar.
12. **El DTO no lleva etiquetas para `Rol.USUARIO`.** Aplicación de la decisión 3 en el único lugar donde puede fugarse: `RecompensaDto` es el mismo tipo para el Tutor y para el participante (los elegibles del modo `DIRECTO`). El mapeador recibe las etiquetas ya resueltas o un array vacío, y quien decide es el service según el rol — la misma forma en que `listar` ya fuerza `estado = ACTIVA` para el participante desde Fase 8.
13. **Sin evento de dominio, sin cambio de esquema en `Recompensa`.** Dos tablas nuevas y nada más: ninguna columna existente cambia, así que la migración es aditiva pura y ningún grupo estrena comportamiento al aplicarla. Toda escritura sí publica `AccionAdministrativaRegistrada` (retrofit de Fase 9), como el resto del catálogo.
14. **La gestión de etiquetas no es una pestaña nueva.** La pantalla de Recompensas ya tiene seis pestañas y el #23 existe porque las pantallas están recargadas: el gestor es un **modal desde la pestaña Catálogo**, que es el único lugar desde donde se usan. Sumar una séptima pestaña para una entidad sin comportamiento sería agregarle peso a la navegación por algo que es un accesorio.

**Fuera de alcance a propósito**: etiquetar productos, bolsas, actividades o conductas (esto es el catálogo de `rewards` y nada más); etiquetas de Organización compartidas entre grupos; jerarquías o etiquetas anidadas; precio por etiqueta como regla viva (el precio de la creación masiva es un valor inicial que se copia a cada producto, no un vínculo); y cualquier uso de la etiqueta que cambie una regla de negocio — si mañana una etiqueta decide algo, deja de ser una etiqueta y necesita su propia spec.

---

## Parte A — `rewards-service`: modelo de datos

```prisma
/**
 * Etiqueta del catálogo de ítems (fase-14-26). Es organización del Tutor y NO
 * tiene ningún efecto de negocio: no decide precios, no restringe visibilidad y
 * no entra en ningún sorteo. Esa ausencia de consecuencias es lo que permite
 * que sea la única entidad archivable de este servicio que se puede desarchivar
 * (decisión 6) — reactivar una bolsa o un producto vuelve a poner algo
 * comprable en la tienda; reactivar una etiqueta vuelve a mostrar un chip.
 *
 * Se llama `EtiquetaCatalogo` y no `EtiquetaRecompensa` a propósito (decisión
 * 5): etiqueta ítems del catálogo, que incluyen castigos.
 */
model EtiquetaCatalogo {
  id             String         @id @default(uuid())
  organizacionId String
  grupoId        String
  nombre         String
  /** "#RRGGBB". Mismo criterio que UmbralZona.colorHex: el frontend no lo hardcodea. */
  colorHex       String
  estado         EstadoCatalogo @default(ACTIVA)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  recompensas    EtiquetaEnRecompensa[]

  @@unique([grupoId, nombre])
  @@index([organizacionId])
  @@index([grupoId, estado])
}

/**
 * Asignación N:M (decisión 2). Con `onDelete: Cascade` del lado de la etiqueta
 * por simetría con `ItemBolsa`, aunque en la práctica no se dispara: las
 * etiquetas se archivan, no se borran, y archivar NO desasigna (decisión 7).
 */
model EtiquetaEnRecompensa {
  id           String           @id @default(uuid())
  etiquetaId   String
  etiqueta     EtiquetaCatalogo @relation(fields: [etiquetaId], references: [id], onDelete: Cascade)
  recompensaId String
  recompensa   Recompensa       @relation(fields: [recompensaId], references: [id], onDelete: Cascade)

  @@unique([etiquetaId, recompensaId])
  @@index([recompensaId])
}

model Recompensa {
  // ... campos existentes, SIN CAMBIOS (decisión 13) ...
  etiquetas EtiquetaEnRecompensa[]
}
```

Migración: `etiquetas_catalogo_fase14`. Aditiva pura — dos tablas nuevas y una relación inversa, que no genera columna.

## Parte B — `rewards-service`: endpoints

Todos bajo el prefijo `rewards` del Gateway, con `TenantContextGuard` + `RolesGuard`. Salvo donde se aclare, `@Roles(TUTOR, ORG_ADMIN)`.

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/rewards/grupos/:grupoId/etiquetas` | Crea. 409 `ETIQUETA_DUPLICADA` si el nombre ya existe en el grupo. |
| `GET` | `/rewards/grupos/:grupoId/etiquetas?estado=` | Lista. Sin `estado`, devuelve solo `ACTIVA`. |
| `PATCH` | `/rewards/etiquetas/:id` | Renombra / cambia color. Mismo 409 en el nombre. |
| `DELETE` | `/rewards/etiquetas/:id` | Archiva. No desasigna (decisión 7). |
| `PATCH` | `/rewards/etiquetas/:id/desarchivar` | Vuelve a `ACTIVA` (decisión 6). |
| `PUT` | `/rewards/recompensas/:id/etiquetas` | Reemplaza el juego completo de etiquetas del ítem. |
| `POST` | `/rewards/grupos/:grupoId/productos/desde-etiqueta` | Creación masiva (decisión 11). |

Cambios en endpoints existentes:

- `GET /rewards/grupos/:grupoId/recompensas` acepta **`?etiquetaId=`** (decisión 9). Para `Rol.USUARIO` se ignora, igual que ya se ignora `estado`.
- `RecompensaDto` gana `etiquetas: EtiquetaCatalogoDto[]`, **siempre `[]` para `Rol.USUARIO`** (decisión 12).

### B.1 — `PUT /rewards/recompensas/:id/etiquetas`

Request: `{ etiquetaIds: string[] }` (0 a 5). Reemplazo completo, no incremental — mismo criterio que `BolsasService.editar` con sus ítems: una lista que se ve entera es auditable, un `add`/`remove` incremental obliga a reconstruir el estado leyendo el historial.

Validaciones: cada etiqueta existe, es del **mismo grupo** que el ítem y está `ACTIVA` (400 `ETIQUETA_INVALIDA`); como máximo 5 (400 `DEMASIADAS_ETIQUETAS`). Auditoría: `RECOMPENSA_ETIQUETADA`, con `antes`/`despues` de los ids.

> Va como endpoint aparte y no como campo de `EditarRecompensaRequest` porque el `PATCH` de recompensa tiene semántica de "solo lo que viene": un array vacío ahí sería indistinguible de "no lo mandé", que es la misma ambigüedad que el #24 tuvo que resolver a mano en la validación de destinatarios. Un `PUT` sobre un sub-recurso no tiene esa duda: lo que viene es lo que queda.

### B.2 — `POST /rewards/grupos/:grupoId/productos/desde-etiqueta`

Request: `{ etiquetaId: string, precio: number }` (`Int`, `precio >= 1` — el mismo mínimo que ya valida el alta de a uno con `PRECIO_INVALIDO`; un producto gratis no participa de ninguna economía).

1. 400 `SOLO_EN_MODO_TIENDA` si el modo del Grupo no es `TIENDA`.
2. Toma los ítems `ACTIVA` **de tipo `PREMIO`** con esa etiqueta.
3. Saltea los que ya tienen un `ProductoTienda` `ACTIVA` de `fuente = ITEM` apuntándolos (decisión 11).
4. Crea el resto en un `createMany`: `nombre` y `descripcion` copiados del ítem, `precio` el recibido, `fuente = ITEM`, `mecanica = AZAR` (se ignora en `ITEM`), `creadoPorTutorId` del JWT.
5. 400 `SIN_ITEMS_PARA_CREAR` si no queda ninguno — el Tutor tiene que enterarse de que no pasó nada, no ver un "listo" sobre cero filas.

Response: `{ creados: ProductoTiendaDto[], salteados: { recompensaId, nombre, motivo }[] }`, con `motivo` `'YA_TIENE_PRODUCTO' | 'ES_CASTIGO'`. Auditoría: un `PRODUCTOS_CREADOS_DESDE_ETIQUETA` con el resumen, no uno por producto — la acción del Tutor fue una sola.

## Parte C — `libs/shared-types`

```ts
export interface EtiquetaCatalogoDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  nombre: string;
  /** "#RRGGBB" — el frontend nunca lo hardcodea. */
  colorHex: string;
  estado: 'ACTIVA' | 'ARCHIVADA';
}
```

Más `etiquetas: EtiquetaCatalogoDto[]` en `RecompensaDto` (denormalizado con nombre y color: la lista del catálogo tiene que pintar los chips sin una segunda llamada por ítem).

## Parte D — `app-web` (área Tutor)

Todo dentro de la pantalla de Recompensas, sin pestañas nuevas (decisión 14).

**D.1 — Pestaña Catálogo** (`catalogo-items.component.ts`)

- Fila de **chips de filtro** arriba de la grilla: `Todas` + una por etiqueta activa, pintadas con su `colorHex`. Selección única (decisión 9). Se oculta entera si el grupo no tiene etiquetas — un filtro vacío es ruido para quien no usa el ítem.
- Cada tarjeta muestra sus chips de etiqueta, debajo del nombre.
- Botón **«Etiquetas»** junto a «Nuevo», que abre el **gestor** (`ui-modal`): lista de etiquetas con nombre y color, crear, renombrar, recolorear, archivar y desarchivar. Archivar sin `ui-confirm-dialog` (decisión 6).
- El modal de ítem gana un selector de etiquetas (chips tildables), que se guarda con el `PUT` de B.1 **después** del `POST`/`PATCH` del ítem, en la misma acción de guardar.

**D.2 — Pestaña Bolsas** (`bolsas.component.ts`)

El botón «Agregar todos» pasa a ser un grupo: «Agregar todos» + un desplegable **«…los de <etiqueta>»**. Precarga tildando (decisión 10), sin guardar, y muestra el conteo con los castigos salteados.

**D.3 — Pestaña Productos** (`productos.component.ts`)

Botón **«Desde una etiqueta»** junto a «Nuevo», solo en modo `TIENDA`. Modal: elegir etiqueta + precio, **previsualizar** qué ítems se van a crear y cuáles se saltean y por qué, y recién ahí confirmar. La previsualización se calcula en el frontend con los datos que la pantalla ya tiene (ítems del catálogo + productos activos) — no hay endpoint de simulación.

## Criterios de aceptación

1. Un Tutor crea la etiqueta "Pantalla" (color), la asigna a 3 ítems, y la fila de chips filtra la grilla a esos 3.
2. Renombrar la etiqueta cambia el chip en los 3 ítems sin tocarlos de a uno.
3. Archivar la etiqueta la saca de los filtros y de los chips; desarchivarla devuelve exactamente los mismos 3 ítems (decisiones 6 y 7).
4. Asignar una 6ª etiqueta a un ítem devuelve 400 `DEMASIADAS_ETIQUETAS`.
5. Una etiqueta de otro grupo devuelve 400 `ETIQUETA_INVALIDA` (aislamiento de tenant).
6. Al armar una bolsa, «los de Pantalla» tilda solo los `PREMIO` de esa etiqueta, informa los castigos salteados, y lo guardado es la **lista de ítems** — agregar después un ítem nuevo con esa etiqueta **no** lo mete en la bolsa (decisión 10).
7. «Desde una etiqueta» con precio 10 crea un producto por premio sin producto previo; correrlo de nuevo devuelve 400 `SIN_ITEMS_PARA_CREAR` y no duplica nada (decisión 11).
8. En modo `DIRECTO`, ese endpoint devuelve 400 `SOLO_EN_MODO_TIENDA`.
9. El participante **no ve ninguna etiqueta** en ninguna respuesta ni pantalla (decisión 3/12), incluidos los elegibles del modo `DIRECTO`.
10. Un grupo que no crea ninguna etiqueta ve las tres pantallas exactamente como antes del ítem: sin fila de filtros, sin chips, sin botones nuevos salvo «Etiquetas».
