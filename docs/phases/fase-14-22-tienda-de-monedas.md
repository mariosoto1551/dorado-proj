# Fase 14 · Ítem 22 — Tienda de monedas: la economía del Grupo

> Sub-spec detallada del ítem 22 de `fase-14-post-mvp.md`. Este archivo es la especificación decidida con José (2026-07-31); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Fases 6, 7 y **8 completas** (esta última es la que se revisa), y de Fase 14 nada en particular — este ítem no depende de ninguno de los 21 anteriores.

Reutiliza, sin modificarlos: el evento `ZonaAlcanzada` con `esEvaluacionFinal` (Fase 7), la cola `rewards.q.zonas-alcanzadas` (creada en Fase 8, hoy sin efecto de negocio), el interno `GET /internal/scoring/umbrales/:id` y `GET /internal/scoring/usuarios/:usuarioId/secciones/:seccionId/resultado` (`ScoringClientService`, Fase 8), el evento `SeccionAbierta` (Fase 6), `EventoProcesado` y el flujo `PENDIENTE_ENTREGA → ENTREGADA`.

## Qué revisa de lo ya decidido

**Revisa una decisión ya tomada** (mismo caso que el #20 respecto del #8, por eso es ítem propio y **no** se edita `fase-08-rewards.md`): en Fase 8, al cerrar una Sección el participante elige o sortea **un premio, una vez, atado a la zona que alcanzó**. José revisó ese modelo el 2026-07-31 y decidió que el cierre pueda pagar en **moneda**, y que los premios se compren en una **tienda**.

`fase-08-rewards.md` **sigue siendo la especificación vigente** para todo Grupo en modo `DIRECTO` — que es el default y el de todos los grupos existentes. Este ítem **agrega un segundo modo**, no reemplaza al primero.

## Motivación (el problema que resuelve)

Tres problemas concretos del modelo actual:

1. **`permiteSeleccion` y `permiteAzar` son flags del premio, cuando describen el momento del canje.** Por eso el modelo se siente torcido: un mismo premio no puede estar a la vez «en la bolsa al azar barata» y «a elección, caro». Son propiedades de **cómo se ofrece**, no de **qué es**.
2. **El premio es de usar o perder.** `@@unique([usuarioId, seccionId])`: una vez por Sección, o nada. No existe ahorrar tres semanas para algo grande, que es el refuerzo más fuerte que puede dar un sistema así.
3. **El catálogo llama «Recompensa» a cosas que son castigos.** Ya hoy un tutor carga consecuencias de la zona roja como si fueran premios, y el sistema no distingue.

La moneda resuelve los tres: el rendimiento de la semana se separa de lo que te llevás, la elección y el azar pasan a ser **propiedades del producto de la tienda** (su lugar correcto — ver decisión 18), y el catálogo se tipa.

## Decisiones de diseño

Cerradas con José el 2026-07-31:

1. **Dos modos por Grupo, excluyentes**: `DIRECTO` (el de Fase 8, tal cual, **default**) y `TIENDA` (este ítem). Hay familias que quieren simple —domingo, elegís tu premio, listo— y aulas que quieren economía. Ninguna paga la complejidad de la otra.
2. **Puntos y monedas son ledgers distintos y no se mezclan.** Motivo técnico duro: si la tienda gastara puntos del ledger de scoring, **comprar te bajaría de zona**. Los puntos son el rendimiento de la Sección y definen la zona; las monedas son la billetera y se gastan.
3. **La billetera es derivada, nunca un campo.** `EventoMoneda` es un ledger inmutable y el saldo se suma al leer — regla 1 de `CLAUDE.md` aplicada a la economía. Sin `UPDATE`, sin `DELETE`, sin columna `saldo`.
4. **El rendimiento se configura por zona**: cada `UmbralZona` rinde N monedas al cierre de la Sección. Puede ser negativo.
5. **Bancarrota (la regla de José): si el rendimiento deja el saldo en negativo, se aplica un castigo AL INSTANTE y el saldo vuelve a 0.** El castigo es **100 % al azar**, sin elección. Cierra el agujero de la variante «multa con piso en 0», donde el que ya estaba en 0 no sentía nada, y evita la deuda arrastrada, que mata el loop justo con quien más lo necesita: duele una vez y el lunes se arranca limpio.
6. **Sin ningún ítem de tipo `CASTIGO` cargado, el saldo simplemente se clava en 0 y no pasa nada más.** El modo duro es opt-in dentro del opt-in: se puede tener tienda y no tener castigos nunca.
7. **El catálogo se tipa: `PREMIO` | `CASTIGO`.** Ortogonal al modo — en `DIRECTO` un castigo colgado del umbral rojo se sortea con la mecánica que ya existe; en `TIENDA` alimenta las bolsas de castigo.
8. **La compra es directa: si te alcanza, comprás.** Sin paso de aprobación del tutor. Un docente con 25 chicos no puede aprobar 25 compras; el tutor solo marca la **entrega**, que es el flujo que ya existe.
9. **El cambio de modo lo decide el Tutor: ahora o al abrir la próxima Sección.** No se aplica solo a mitad de una Sección en curso sin que él lo haya pedido.
10. **Volver de `TIENDA` a `DIRECTO` congela la billetera, no la borra.** El ledger no se toca (regla 1); si reactivan, las monedas siguen ahí.

Detalles resueltos en esta spec:

11. **El rendimiento por zona vive en `rewards-service`, no en `UmbralZona`.** `scoring-service` es un motor de puntos y no tiene por qué saber que existe una economía: si el rendimiento fuera una columna de `UmbralZona`, habría que tocar scoring, su DTO y el payload del evento para una decisión que es de recompensas. Se referencia por `umbralZonaId` (regla 2) y se valida contra el interno que Fase 8 ya usa.
12. **`Recompensa` no se renombra.** El nombre queda un poco corto ahora que también hay castigos, pero renombrar la tabla arrastra shared-types, el frontend y todo el código de Fase 8 sin ganar una sola función. En la UI se llama «ítem del catálogo»; en el schema sigue siendo `Recompensa`.
13. **`umbralZonaId` y `nombreZonaSnapshot` pasan a ser nullables**, obligatorios solo cuando el Grupo está en `DIRECTO`. En `TIENDA` un premio no está atado a ninguna zona. La migración es retro-compatible: todas las filas existentes ya lo tienen.
14. **`permiteSeleccion` y `permiteAzar` NO se eliminan.** Los usa el modo `DIRECTO`, que sigue vivo. En `TIENDA` se ignoran: el tipo de producto decide.
15. **Con `mecanica = ELECCION` el participante elige en el momento de comprar**, no después. Ahorra un estado `PENDIENTE_ELECCION` entero y deja la compra con el mismo ciclo de vida que el canje de Fase 8.
16. **Un usuario descalificado en la Sección no cobra**: 0 monedas, **sin multa y sin castigo**. Mismo criterio que Fase 8 (el descalificado no canjea nada); la descalificación ya es la consecuencia.
17. **Comprar no depende del estado de la Sección.** Es el quiebre deliberado con la regla de Fase 8 («no se canjea con la Sección `ABIERTA`»): ahí el canje era el resultado de la Sección; acá es gastar plata propia, y no hay motivo para prohibirlo un martes.

Revisión del modelo de producto (José, 2026-07-31, segunda vuelta de la misma sesión):

18. **El producto se modela en dos ejes: `fuente` × `mecanica`.** De dónde sale (un ítem puntual o una bolsa) y cómo se obtiene (al azar o eligiendo) son preguntas independientes. Esto es lo que corrige el modelo de tres tipos fijos con el que arrancó esta spec, y **es el punto entero del ítem**: al azar y a elección son propiedades **del producto de la tienda**, nunca del premio. Un premio es «una bici»; que salga sorteada o elegida depende de por qué puerta entró.
19. **La bolsa es siempre explícita: no existe la fuente «todo el catálogo».** El Tutor la arma, con un atajo «agregar todos» que la precarga. Mismo criterio que la secuencia de turnos del #21: precargable, pero siempre explícita y visible antes de guardar. El motivo es concreto — con «todo el catálogo», cargar mañana una bici de premio la mete sola en el sorteo de 10 monedas, sin que nadie lo haya decidido. El eje `fuente` queda con dos valores; se eligió el modelo de dos ejes igual porque agregar `TODO_EL_CATALOGO` después es sumar un valor, no rediseñar.
20. **Los castigos no usan bolsa.** El pozo del sorteo de la bancarrota es **todas las `Recompensa` de tipo `CASTIGO` y estado `ACTIVA` del Grupo**. Elimina una entidad de configuración entera y el riesgo de que un castigo termine comprable: las bolsas son siempre de premios, y meter un `CASTIGO` en una es un 400. Para sacar un castigo del sorteo se lo archiva, que es la misma acción que ya existe para todo el catálogo.
21. **El castigo se puede anular, pero no re-sortear.** El Tutor anula uno `PENDIENTE_ENTREGA` con motivo y **el ledger no se toca**: la deuda ya quedó saldada y el saldo sigue en 0 — lo único que cambia es que el castigo no se aplica. Es la misma salida que el «deshacer» del #12 y cubre el error de configuración y la segunda oportunidad. **Re-sortear no**: tirar de nuevo hasta que salga algo leve vacía de sentido el 100 % al azar, que es lo que hace que el castigo se perciba como del sistema y no del humor del tutor.

### Fuera de alcance a propósito

- **Stock y límites de compra.** No hay `limitePorSeccion` ni unidades finitas: si te alcanza, comprás, las veces que quieras. La palanca de regulación es el **precio**, que la economía ya le da al Tutor. Anotado acá para que quede claro que es una decisión, no un olvido — y porque el stock real trae el mismo problema de concurrencia que el doble gasto (dos chicos comprando la última unidad), en otro lugar y con otra solución.
- **Re-sorteo del castigo** (decisión 21).
- **Bloquear la tienda a un participante puntual**, ponderar las bolsas (unos ítems más probables que otros) y tener más de una moneda por Grupo. Ninguna de las tres es un rediseño si algún día se piden.

---

## Parte A — `rewards-service`: schema

Todo vive en rewards. Los participantes, las secciones y los umbrales se referencian **solo por id** (regla 2).

```prisma
enum ModoRecompensas {
  DIRECTO // fase-08 tal cual: premio por zona al cerrar la Sección (default)
  TIENDA  // fase-14-22: monedas por zona + tienda
}

enum TipoItemCatalogo {
  PREMIO
  CASTIGO
}

/** De dónde sale lo que se compra (decisión 18). */
enum FuenteProducto {
  ITEM  // un ítem puntual del catálogo
  BOLSA // una bolsa que arma el Tutor — siempre explícita (decisión 19)
}

/** Cómo se obtiene (decisión 18). Se ignora cuando la fuente es ITEM. */
enum MecanicaProducto {
  AZAR
  ELECCION // el participante elige en el momento de comprar (decisión 15)
}

enum TipoMovimientoMoneda {
  RENDIMIENTO_ZONA // acreditación al cerrar la Sección (monto >= 0)
  MULTA_ZONA       // rendimiento negativo de la zona (monto < 0)
  SALDO_SALDADO    // lleva el saldo negativo a 0 tras el castigo (decisión 5)
  COMPRA           // monto < 0
  AJUSTE_TUTOR     // manual, con motivo obligatorio
  REVERSION        // compensación de una compra deshecha
}

/** Config de recompensas por Grupo. Mutable: es config, no ledger. */
model ConfiguracionRecompensasGrupo {
  id             String          @id @default(uuid())
  organizacionId String
  grupoId        String          @unique
  modo           ModoRecompensas @default(DIRECTO)
  // Decisión 9: si no es null, se aplica al abrir la próxima Sección.
  modoPendiente  ModoRecompensas?
  // Cosmético, se muestra tal cual: "12 Doradas". Sin plural modelado a propósito.
  nombreMoneda   String          @default("monedas")
  iconoMoneda    String          @default("🪙")
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  @@index([organizacionId])
}

/**
 * Cuántas monedas rinde cada zona al cerrar la Sección (decisiones 4 y 11).
 * Referencia a UmbralZona de scoring_db: solo id, validado por REST interno.
 */
model RendimientoZona {
  id                 String   @id @default(uuid())
  organizacionId     String
  grupoId            String
  umbralZonaId       String   @unique
  nombreZonaSnapshot String
  // Puede ser negativo (dispara la bancarrota de la decisión 5).
  monedas            Int
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@index([organizacionId])
  @@index([grupoId])
}

/**
 * LEDGER DE MONEDAS (decisión 3, regla 1 de CLAUDE.md). Nunca UPDATE ni DELETE:
 * el saldo es SUM(monto) al leer. Las correcciones son filas nuevas.
 */
model EventoMoneda {
  id             String               @id @default(uuid())
  organizacionId String
  grupoId        String
  usuarioId      String
  tipo           TipoMovimientoMoneda
  // Con signo ya aplicado (positivo acredita, negativo debita).
  monto          Int
  // Sección que originó el movimiento (null en compras y ajustes sueltos).
  seccionId      String?
  // id de la Compra / RendimientoZona / EventoMoneda revertido, según el tipo.
  origenId       String?
  motivo         String?
  registradoPorId   String
  // 'TUTOR' | 'USUARIO' | 'SYSTEM'
  registradoPorTipo String
  createdAt      DateTime             @default(now())
  // SIN updatedAt: este modelo nunca se edita.

  @@index([organizacionId])
  @@index([grupoId, usuarioId])
  @@index([usuarioId, createdAt])
}

/**
 * Bolsa de premios para los productos de fuente BOLSA. SIEMPRE de premios
 * (decisión 20): los castigos no usan bolsa, así que no hace falta tiparla —
 * un ítem CASTIGO adentro es un 400, y por construcción ningún castigo puede
 * volverse comprable.
 */
model BolsaPremios {
  id             String         @id @default(uuid())
  organizacionId String
  grupoId        String
  nombre         String
  estado         EstadoCatalogo @default(ACTIVA)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  items          ItemBolsa[]

  @@index([organizacionId])
  @@index([grupoId])
}

model ItemBolsa {
  id           String       @id @default(uuid())
  bolsaId      String
  bolsa        BolsaPremios @relation(fields: [bolsaId], references: [id], onDelete: Cascade)
  recompensaId String

  @@unique([bolsaId, recompensaId])
  @@index([bolsaId])
}

model ProductoTienda {
  id             String         @id @default(uuid())
  organizacionId String
  grupoId        String
  nombre         String
  descripcion    String?
  imagenUrl      String?
  precio         Int
  // Los dos ejes (decisión 18). `mecanica` se ignora si fuente = ITEM.
  fuente         FuenteProducto
  mecanica       MecanicaProducto @default(AZAR)
  // fuente = ITEM → recompensaId (debe ser un PREMIO); BOLSA → bolsaId.
  recompensaId   String?
  bolsaId        String?
  estado         EstadoCatalogo @default(ACTIVA)
  creadoPorTutorId String
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  @@index([organizacionId])
  @@index([grupoId, estado])
}

model Compra {
  id             String      @id @default(uuid())
  organizacionId String
  grupoId        String
  usuarioId      String
  productoId     String
  // Snapshots: el producto puede cambiar de precio o archivarse después.
  nombreProductoSnapshot String
  precioSnapshot         Int
  // Cuenta la historia de la compra: «te salió» vs «lo elegiste».
  obtenidoPorAzar        Boolean
  // Qué ítem salió/eligió. Siempre resuelto al comprar (decisión 15).
  recompensaId           String
  nombreRecompensaSnapshot String
  estado              EstadoCanje @default(PENDIENTE_ENTREGA)
  entregadaPorTutorId String?
  entregadaEn         DateTime?
  // Reversión del Tutor (Parte C). Campos explícitos en vez de un valor nuevo
  // en EstadoCanje: ese enum lo comparte CanjeRecompensa (Fase 8) y no se toca.
  revertidaEn         DateTime?
  revertidaPorTutorId String?
  motivoReversion     String?
  createdAt           DateTime    @default(now())

  @@index([organizacionId])
  @@index([grupoId, estado])
  @@index([usuarioId, createdAt])
}

/**
 * Castigo sorteado por la bancarrota (decisión 5). No es una compra: no tiene
 * precio y no se elige. Sale del pozo de ítems CASTIGO del grupo (decisión 20),
 * por eso no hay bolsaId.
 */
model CastigoAsignado {
  id             String      @id @default(uuid())
  organizacionId String
  grupoId        String
  usuarioId      String
  seccionId      String
  recompensaId   String
  nombreRecompensaSnapshot String
  // Cuánto saldo negativo saldó (positivo), para poder auditar el porqué.
  deudaSaldada   Int
  estado              EstadoCanje @default(PENDIENTE_ENTREGA)
  entregadaPorTutorId String?
  entregadaEn         DateTime?
  // Anulación del Tutor (decisión 21). No toca el ledger: la deuda ya se saldó
  // y el saldo sigue en 0 — lo único que cambia es que el castigo no se aplica.
  anuladoEn          DateTime?
  anuladoPorTutorId  String?
  motivoAnulacion    String?
  createdAt           DateTime    @default(now())

  // Un castigo por usuario por Sección: la bancarrota se evalúa una sola vez.
  @@unique([usuarioId, seccionId])
  @@index([organizacionId])
  @@index([grupoId, estado])
}
```

Cambios sobre modelos existentes de Fase 8:

```prisma
model Recompensa {
  // ...campos actuales sin tocar...
  tipo               TipoItemCatalogo @default(PREMIO) // decisión 7
  umbralZonaId       String?  // pasa a nullable — decisión 13
  nombreZonaSnapshot String?  // pasa a nullable — decisión 13
}
```

**`CanjeRecompensa` no se toca.** Es el registro del modo `DIRECTO` y sigue funcionando igual.

Validaciones al escribir catálogo:

- `Recompensa` en un grupo `DIRECTO` sin `umbralZonaId` → 400 `ZONA_REQUERIDA`. En `TIENDA` el campo se ignora si viene.
- `ItemBolsa` que referencia una `Recompensa` de tipo `CASTIGO` → 400 `CASTIGO_NO_VA_EN_BOLSA` (decisión 20).
- `ProductoTienda` con `fuente = ITEM` cuyo `recompensaId` apunta a un `CASTIGO` → 400 `CASTIGO_NO_ES_COMPRABLE`. Entre esta validación y la anterior, **un castigo no puede llegar a la tienda por ningún camino**.
- `ProductoTienda` con `fuente = ITEM` sin `recompensaId`, con `fuente = BOLSA` sin `bolsaId`, o con los dos cargados → 400 `REFERENCIA_INVALIDA`.
- `precio < 1` → 400 `PRECIO_INVALIDO`.

## Parte B — El cierre económico (el corazón del ítem)

### B.1 — El consumidor de `ZonaAlcanzada` por fin hace algo

La cola `rewards.q.zonas-alcanzadas` ya existe desde Fase 8 y hoy solo marca `EventoProcesado`. Ahora, cuando `esEvaluacionFinal = true` **y el Grupo está en modo `TIENDA`**, ejecuta el cierre económico. Con `esEvaluacionFinal = false` sigue descartando, y en modo `DIRECTO` sigue sin efecto de negocio — es decir, **un grupo en `DIRECTO` se comporta exactamente como hoy**.

Idempotente por `EventoProcesado` **en la misma transacción** que los movimientos, igual que el resto de los consumidores del proyecto.

### B.2 — Algoritmo (por cada `ZonaAlcanzada` final)

1. **¿Descalificado?** Se consulta el `ResultadoSeccion` por el interno que ya existe. Si `descalificado = true` → no se escribe ningún movimiento (decisión 16). Se marca el evento como procesado igual.
2. **Buscar el `RendimientoZona`** del `umbralZonaId` del payload. Si no hay fila configurada → rinde 0 y no se escribe movimiento (un grupo que activó la tienda pero no configuró rendimientos no genera ruido en el ledger).
3. **Escribir el movimiento**: `RENDIMIENTO_ZONA` si `monedas >= 0`, `MULTA_ZONA` si es negativo. `registradoPorTipo = 'SYSTEM'`.
4. **Calcular el saldo** con la suma del ledger, ya incluyendo el movimiento del paso 3.
5. **Si el saldo quedó < 0** (bancarrota, decisión 5):
   - Leer el pozo: **todas las `Recompensa` de tipo `CASTIGO` y estado `ACTIVA` del grupo** (decisión 20 — no hay bolsa que configurar ni que mantener).
   - **Si hay al menos una**: sortear al azar (`Math.random()` sobre el array, sin ponderación — misma mecánica que el `sortear` de Fase 8) y crear `CastigoAsignado` con `deudaSaldada = -saldo`.
   - **Si el pozo está vacío** (decisión 6): no se crea castigo.
   - **En los dos casos**, escribir `SALDO_SALDADO` con `monto = -saldo` (positivo) y el motivo correspondiente. El saldo queda exactamente en 0.
6. **Publicar `MonedasAcreditadas`** con el resultado (ver Parte E) y marcar `EventoProcesado`.

Todo el bloque va en **una transacción**.

> El asiento del paso 3 y el del paso 5 son **dos filas**, no una neteada. Es a propósito: el ledger tiene que poder contar la historia («te tocó −5, quedaste en −2, se saldó con un castigo»), y una sola fila de 0 no la cuenta.

### B.3 — El cambio de modo (decisión 9)

`PUT .../configuracion` acepta `aplicarAhora: boolean`:

- `true` → escribe `modo` directamente. Es el camino de la primera activación, cuando no hay nada en curso que romper.
- `false` (default) → escribe `modoPendiente`. El consumidor de **`SeccionAbierta`** (cola nueva `rewards.q.secciones`, cuórum, DLX como todas) lo aplica y lo deja en `null`.

La UI tiene que decir cuál de los dos hace, con la advertencia de que «ahora» cambia la regla de la Sección en curso.

## Parte C — La compra

`POST /rewards/grupos/:grupoId/comprar` — `{ productoId, recompensaId? }`. Puede ejecutarla **el propio Usuario o el Tutor en su nombre**, igual que el canje de Fase 8.

1. Validar modo `TIENDA` → si no, 409 `MODO_DIRECTO` («este grupo no usa tienda»).
2. Validar producto `ACTIVA` del grupo → 404 / 409 `PRODUCTO_ARCHIVADO`.
3. **Resolver el ítem** según los dos ejes (decisión 18): `fuente = ITEM` → el suyo; `BOLSA + AZAR` → uno al azar de la bolsa; `BOLSA + ELECCION` → el `recompensaId` del body, que es obligatorio (400 `ELECCION_REQUERIDA`) y **debe pertenecer a la bolsa** (400 `ITEM_FUERA_DE_LA_BOLSA`). Se guarda `obtenidoPorAzar` según el camino tomado.
4. **Cobrar**: verificar `saldo >= precio` (409 `SALDO_INSUFICIENTE`, con `saldoActual` y `faltan` en el sobre de error) y escribir `EventoMoneda(COMPRA, -precio)` + `Compra`, **en una transacción con lock por participante**.
5. Publicar `CompraRealizada`.

> **El bug caro de este ítem vive acá.** Dos compras concurrentes del mismo participante pueden leer el mismo saldo y pasar las dos: se compran 2 premios de 10 con 12 monedas y el saldo queda en −8, un estado que ninguna regla del sistema puede producir. Hay que tomar **`pg_advisory_xact_lock` sobre el `usuarioId`** dentro de la transacción, con la advertencia que dejó el #16 (`docs/progreso/fase-14-post-mvp.md`): ese `$queryRaw` pasa tests, lint, typecheck y build, y falla en el 100 % de las corridas reales si está mal escrito — **hay que probarlo contra Postgres real**, no contra la BD en memoria.

**Deshacer una compra** (`POST /rewards/compras/:id/revertir`, solo Tutor/ORG_ADMIN, solo si `PENDIENTE_ENTREGA`): marca la compra revertida y escribe `EventoMoneda(REVERSION, +precioSnapshot)`. No se borra la fila ni se edita el movimiento original — compensación, como en el resto del proyecto.

## Parte D — Endpoints (prefijo `rewards`)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| `GET` | `/rewards/grupos/:grupoId/configuracion` | cualquier rol del grupo | Modo vigente, modo pendiente, nombre e ícono de la moneda. |
| `PUT` | `/rewards/grupos/:grupoId/configuracion` | TUTOR asignado, ORG_ADMIN | `{ modo, aplicarAhora, nombreMoneda?, iconoMoneda? }` (B.3). |
| `GET` | `/rewards/grupos/:grupoId/rendimientos` | TUTOR, ORG_ADMIN | Los `RendimientoZona` del grupo, **con las zonas que todavía no tienen fila** (para que la pantalla las liste completas). |
| `PUT` | `/rewards/grupos/:grupoId/rendimientos` | TUTOR asignado, ORG_ADMIN | `{ rendimientos: [{ umbralZonaId, monedas }] }`, idempotente. Valida cada umbral contra el interno de scoring y copia `nombreZonaSnapshot`. |
| `POST` `GET` `PATCH` `DELETE` | `/rewards/grupos/:grupoId/bolsas`, `/rewards/bolsas/:id` | TUTOR asignado, ORG_ADMIN | CRUD de bolsas + sus ítems. Solo de premios (decisión 20). `DELETE` archiva. |
| `POST` `GET` `PATCH` `DELETE` | `/rewards/grupos/:grupoId/productos`, `/rewards/productos/:id` | TUTOR asignado, ORG_ADMIN | CRUD de la tienda (`fuente` + `mecanica`). `DELETE` archiva (las compras conservan sus snapshots). |
| `GET` | `/rewards/grupos/:grupoId/tienda` | cualquier rol del grupo | La vitrina del participante: productos `ACTIVA` con `puedeComprar` y `faltan` calculados contra **su** saldo. |
| `POST` | `/rewards/grupos/:grupoId/comprar` | el propio Usuario, TUTOR en su nombre | Parte C. |
| `POST` | `/rewards/compras/:id/revertir` | TUTOR asignado, ORG_ADMIN | Compensación (Parte C). |
| `POST` | `/rewards/castigos/:id/anular` | TUTOR asignado, ORG_ADMIN | `{ motivo }` — **motivo obligatorio**. Solo si está `PENDIENTE_ENTREGA` (409 `YA_ENTREGADO` / `YA_ANULADO`). **No escribe ningún movimiento de monedas** (decisión 21). |
| `GET` | `/rewards/grupos/:grupoId/mi-billetera` | el propio Usuario | `{ saldo, nombreMoneda, iconoMoneda, movimientos: [...] }`, paginado. |
| `GET` | `/rewards/grupos/:grupoId/billeteras` | TUTOR asignado, ORG_ADMIN | Saldo de cada participante del grupo, en una sola lectura. |
| `POST` | `/rewards/grupos/:grupoId/usuarios/:usuarioId/ajuste` | TUTOR asignado, ORG_ADMIN | `{ monto, motivo }` — **motivo obligatorio**. Si dejara el saldo bajo 0 → 400 `SALDO_INSUFICIENTE` (el tutor no puede endeudar a nadie; la única deuda posible es la del cierre, y se salda sola). |
| `GET` | `/rewards/grupos/:grupoId/pendientes-entrega` | TUTOR asignado, ORG_ADMIN | **Una sola lista** con compras y castigos `PENDIENTE_ENTREGA`, unidos en la capa de lectura sin materializar nada (mismo criterio que el timeline del #18). Excluye lo revertido y lo anulado. |
| `PATCH` | `/rewards/compras/:id/entregar` · `/rewards/castigos/:id/entregar` | TUTOR asignado, ORG_ADMIN | `ENTREGADA` + quién y cuándo. |

Los endpoints de Fase 8 (`elegibles`, `seleccionar`, `sortear`, `canjes`, `canjes/:id/entregar`) **no se tocan**. En un grupo `TIENDA`, `elegibles` devuelve lista vacía con motivo `MODO_TIENDA`.

## Parte E — Eventos

Dos nuevos en `docs/architecture/event-catalog.md`, ambos producidos por Rewards y consumidos por Notification y Audit:

```ts
// rewards.monedas_acreditadas — el cierre económico de la Sección (B.2).
interface MonedasAcreditadasPayload {
  usuarioId: string;
  organizacionId: string;
  grupoId: string;
  seccionId: string;
  nombreZona: string;
  monedas: number;        // lo que rindió la zona, con signo
  saldoResultante: number;
  castigo: { recompensaId: string; nombre: string } | null; // decisión 5
}

// rewards.compra_realizada
interface CompraRealizadaPayload {
  compraId: string;
  usuarioId: string;
  organizacionId: string;
  grupoId: string;
  productoId: string;
  nombreProducto: string;
  precio: number;
  obtenidoPorAzar: boolean;
  recompensaId: string;
  nombreRecompensa: string;
}
```

Un solo evento cubre las dos notificaciones del cierre («cobraste 12 Doradas» y «te tocó un castigo»), porque son el mismo hecho.

Rewards pasa a **consumir** `session.seccion_abierta` (cola nueva `rewards.q.secciones`, B.3), además de `scoring.zona_alcanzada` que ya consumía.

El CRUD de tienda/bolsas/rendimientos, el ajuste manual, la reversión y el cambio de modo se auditan con `AccionAdministrativaRegistrada` (Fase 9): `MODO_RECOMPENSAS_CAMBIADO`, `RENDIMIENTOS_CONFIGURADOS`, `PRODUCTO_CREADO/EDITADO/ARCHIVADO`, `BOLSA_CREADA/EDITADA/ARCHIVADA`, `AJUSTE_MONEDAS`, `COMPRA_REVERTIDA`, `CASTIGO_ANULADO`.

## Tipos compartidos (`libs/shared-types/src/lib/rewards.ts`)

- Enums `ModoRecompensas`, `TipoItemCatalogo`, `FuenteProducto`, `MecanicaProducto`, `TipoMovimientoMoneda`.
- `ConfiguracionRecompensasGrupoDto`, `RendimientoZonaDto`, `BolsaPremiosDto`, `ProductoTiendaDto` (con `puedeComprar` y `faltan`), `CompraDto`, `CastigoAsignadoDto`, `BilleteraDto` (`{ saldo, nombreMoneda, iconoMoneda }`), `MovimientoMonedaDto`, `PendienteEntregaDto`.
- `ComprarRequest`/`ComprarResponse`, `ConfigurarRendimientosRequest`/`Response`, `AjustarMonedasRequest`/`Response`, `CambiarModoRecompensasRequest`/`Response`, `AnularCastigoRequest`/`Response` (regla 5 de estilo: prefijo compartido Request/Response).
- `RecompensaDto`: agregar `tipo`, y `umbralZonaId`/`nombreZonaSnapshot` pasan a `| null`.

## Parte F — Frontend (`app-web`)

Mostrar propuesta de UI a José antes de scaffoldear (preferencia registrada).

**Tutor** — una sección «Recompensas» con el interruptor de modo arriba de todo, porque decide qué se ve debajo:
- En `DIRECTO`: exactamente las pantallas de Fase 10, más el selector `PREMIO`/`CASTIGO` en el ítem.
- En `TIENDA`: rendimiento por zona (con los colores de zona que ya lee de la API), catálogo de ítems (cada uno marcado `PREMIO` o `CASTIGO`), bolsas de premios con el atajo **«agregar todos»** (decisión 19), productos con su precio, billeteras del grupo y la lista única de pendientes de entrega.
- **Los castigos no tienen pantalla de configuración propia** (decisión 20): son ítems del catálogo marcados como tales, y **todos los activos** forman el pozo del sorteo. La pantalla tiene que decirlo explícito, porque de ahí se deduce la única forma de sacar uno del sorteo: archivarlo.
- El formulario de producto es **dos preguntas, no una lista de tipos**: «¿de dónde sale?» (este ítem / esta bolsa) y «¿cómo se obtiene?» (al azar / lo elige). La segunda desaparece cuando la primera es un ítem puntual.
- **Aviso de inflación pasiva** al ponerle precio a un producto: «≈ N semanas en Verde». No bloquea nada — solo hace visible la calibración, que es lo único que el sistema no puede decidir por el tutor.
- **Preset al activar la tienda**: precargar rendimientos sugeridos (Rojo −5 / Amarillo +5 / Verde +12 / Dorado +25) **editables**, para que la decisión real sea una sola: ¿modo simple o economía?

**Participante** — el saldo visible y persistente en el encabezado (con su ícono y nombre), la tienda como vitrina con los productos que no puede pagar atenuados y con «te faltan N» (el motor del ahorro), y el historial de su billetera. El castigo de la bancarrota se muestra con el mismo peso visual que una marca roja del #12, no escondido.

## Criterios de aceptación

- [ ] **Retro-compatible**: un grupo existente (sin `ConfiguracionRecompensasGrupo`, o con `modo = DIRECTO`) canjea premios exactamente como en Fase 8 — los 4 criterios de `fase-08-rewards.md` siguen pasando sin cambios.
- [ ] Con la tienda activa y Verde rindiendo 12, al evaluarse la Sección el participante queda con saldo 12 y un movimiento `RENDIMIENTO_ZONA` en su ledger.
- [ ] **La regla de la bancarrota**: con saldo 3 y Rojo rindiendo −5, el cierre deja **dos** movimientos (`MULTA_ZONA −5`, `SALDO_SALDADO +2`), un `CastigoAsignado` sorteado del pozo de ítems `CASTIGO`, y **saldo exactamente 0**.
- [ ] Sin ningún ítem `CASTIGO` activo en el grupo, el mismo caso deja el saldo en 0 **sin** crear ningún castigo (decisión 6).
- [ ] El castigo sorteado sale **siempre** de un ítem de tipo `CASTIGO`, y un `CASTIGO` **no llega a la tienda por ningún camino**: 400 al meterlo en una bolsa y 400 al apuntarle un producto de fuente `ITEM`.
- [ ] Archivar un ítem `CASTIGO` lo saca del pozo; con todos archivados, la bancarrota no asigna castigo (decisión 20).
- [ ] Un participante **descalificado** en la Sección no recibe ningún movimiento: ni rendimiento, ni multa, ni castigo (decisión 16).
- [ ] `BOLSA + AZAR` devuelve un ítem al azar de su bolsa; `BOLSA + ELECCION` sin `recompensaId` da 400 `ELECCION_REQUERIDA`, y con uno que no pertenece a la bolsa da 400 `ITEM_FUERA_DE_LA_BOLSA`.
- [ ] **Los dos ejes son independientes** (decisión 18, el criterio que justifica el ítem): el mismo premio está a la vez en un producto de fuente `ITEM` (caro, directo) y dentro de una bolsa sorteada barata, **sin ningún flag en la `Recompensa`**.
- [ ] Comprar con saldo insuficiente da 409 `SALDO_INSUFICIENTE` y **no** escribe ningún movimiento.
- [ ] **Doble gasto**: dos compras concurrentes de 10 con saldo 12 dejan **una sola** compra y saldo 2 — verificado contra **Postgres real**, no contra la BD en memoria.
- [ ] El saldo nunca sale de una columna: borrar y recalcular la suma del ledger da el mismo número que devuelve `mi-billetera` (regla 1).
- [ ] Reentregar el mismo `ZonaAlcanzada` no acredita dos veces ni sortea un segundo castigo (`EventoProcesado`).
- [ ] Se puede comprar con la Sección `ABIERTA` (decisión 17) — el quiebre deliberado con Fase 8.
- [ ] Un ajuste del tutor que dejaría el saldo negativo da 400; uno con motivo vacío da 400.
- [ ] Revertir una compra entregada da 409; revertir una `PENDIENTE_ENTREGA` devuelve el precio como movimiento `REVERSION` **sin editar** el movimiento de compra original.
- [ ] **Anular un castigo** `PENDIENTE_ENTREGA` deja el rastro (quién, cuándo, motivo), lo saca de pendientes de entrega y **no escribe ningún movimiento de monedas**: el saldo sigue en 0 (decisión 21). Anular uno ya entregado da 409, y anular sin motivo da 400.
- [ ] Archivar un producto no rompe las compras ya hechas: siguen mostrando nombre y precio por sus snapshots.
- [ ] Cambiar el modo con `aplicarAhora = false` **no** cambia nada hasta que se abre la siguiente Sección; con `true` cambia al instante.
- [ ] Volver a `DIRECTO` deja el ledger de monedas intacto: al reactivar `TIENDA`, el saldo es el mismo (decisión 10).
- [ ] **Aislamiento**: un producto/bolsa/billetera de otra organización nunca es visible ni comprable (mismo criterio que la suite de Fase 12).

## Nota para Claude Code

Es un ítem grande: agrega un ledger nuevo, un catálogo nuevo y un modo de operación paralelo al de una fase ya cerrada. Orden sugerido:

1. **Config + modos** (`ConfiguracionRecompensasGrupo`, el `PUT`, el consumidor de `SeccionAbierta`) — es lo que garantiza que nada existente se rompa, y conviene tenerlo antes que nada.
2. **Ledger + billetera** (`EventoMoneda`, saldo derivado, ajuste del tutor). Se prueba solo.
3. **El cierre económico** (B.2), con la bancarrota. Test primero.
4. **Catálogo + tienda + compra** (Parte C), con el lock.
5. Tipos compartidos y frontend.

Tres advertencias concretas:

- **El bug caro es el doble gasto** (Parte C). Escribir ese test antes que el resto de la compra, y correrlo contra Postgres real: es el único camino del ítem que puede producir un saldo negativo imposible, y no se manifiesta en ninguna pantalla hasta que alguien queda debiendo.
- **No tocar el camino `DIRECTO`.** Todo lo nuevo entra por detrás de un chequeo de modo. Si un test de Fase 8 cambia de resultado, el error está en este ítem, no en Fase 8.
- **`Recompensa.umbralZonaId` pasa a nullable**: revisar cada lectura existente que lo asume no-null (`recompensas.service.ts`, `canjes.service.ts`, los mapeadores y `RecompensaDto` en el frontend) antes de dar el ítem por cerrado. Es el único cambio de este ítem que puede romper código ya escrito.

Migraciones a mano solo si no hay Postgres levantado, y **aplicarlas contra DB real + `prisma migrate diff` antes de dar el ítem por cerrado** (estándar desde el #19; el motivo lo dejó el #16).
