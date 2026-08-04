# Fase 14 · Ítem 25 — Objetivo de ahorro y mínimo de repeticiones

> Sub-spec detallada del ítem 25 de `fase-14-post-mvp.md`. Especificación decidida con José (2026-08-03); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Fases 5 (catálogo), 6 (ciclo Sección/Sesión), 7 (registro + ledger) y 8 (recompensas) completas, más los ítems de Fase 14 ya ejecutados: confirmación de obligatorias (#8), marcas rojas del tutor (#12), obligatorias que suman (#20), turnos rotativos (#21) y tienda de monedas (#22). Todos existen.

## Motivación (el problema que resuelve)

Dos cosas que aparecieron mirando la app en uso el 2026-08-03, una en cada punta del ciclo:

**(a) La tienda no tiene a dónde apuntar.** El ítem #22 dejó la vitrina con la barra de progreso y el «te faltan 11» de cada producto — el motor del ahorro. Pero son N barras iguales compitiendo entre sí: el participante ve once progresos parciales y ninguno propio. Un objetivo es lo que convierte «tengo 14 monedas» en «me faltan 11 para la bici», que es la única forma en que un número abstracto sostiene una conducta a lo largo de varias semanas.

**(b) «Hasta 3 veces» no significa lo que parece.** Una obligatoria con `repeticionesMaximasSesion = 3` hoy se comporta así: cada confirmación paga `puntosPorCumplir` (ítem #20), pero el castigo del cierre es **binario** — con **una sola** confirmación no hay descuento, y solo con cero se escribe el `NO_HIZO`. El techo es del premio; no existe ninguna forma de decir «esto hay que hacerlo tres veces por día». Para «tomar la medicación 3 veces» o «pasear al perro 2 veces», el sistema hoy no tiene cómo expresarlo.

Los dos son el mismo problema de fondo visto en dos pantallas distintas: **el sistema no deja fijar la meta, solo el techo**.

## Decisiones de diseño (cerradas con José, 2026-08-03)

### Objetivo de ahorro

1. **Se persiste en el backend, no en el cliente.** Un objetivo que vive en el dispositivo se pierde al cambiar de teléfono y no lo puede ver nadie más. Persistirlo cuesta una tabla chica y habilita la decisión 4.
2. **Uno solo por participante y por Grupo.** Dos objetivos simultáneos son cero objetivos: la pantalla vuelve a ser N barras compitiendo, que es exactamente lo que este ítem viene a resolver.
3. **Es config mutable, no ledger.** A diferencia de la billetera (regla 1: saldo derivado, ledger inmutable), el objetivo es una preferencia: se pisa con `UPDATE` y no deja historia. No hay nada que auditar en haber cambiado de idea sobre qué querés comprarte.
4. **El Tutor lo ve** en la pantalla de billeteras: «ahorrando para 🎁 Bici — le faltan 11». El valor de que el objetivo exista está tanto en la pantalla del chico como en que el adulto pueda reforzarlo fuera de la app.
5. **Comprar el producto que era el objetivo lo limpia.** Se cumplió; dejarlo puesto convertiría el logro en un cartel viejo.
6. **Un objetivo que apunta a un producto archivado se trata como si no existiera** (viaja `null`), sin borrarlo de la tabla: si el Tutor lo desarchiva, vuelve solo. Mismo criterio fail-soft que el resto de las lecturas del participante.
7. **Solo existe en modo `TIENDA`.** En `DIRECTO` el premio es de usar o perder por Sección (decisión 2 de `fase-14-22`), no hay ahorro que objetivar, y la pantalla ni muestra el botón.
8. **No cambia ninguna regla de compra**: el objetivo no reserva monedas, no bloquea comprar otra cosa y no da ninguna ventaja. Es un señalador, no una restricción — si reservara saldo sería una promesa que el sistema tendría que sostener contra la bancarrota del #22, y esa complejidad no compra nada.

### Mínimo de repeticiones

9. **Campo nuevo `repeticionesMinimasSesion`, default 1.** Con 1 el comportamiento es exactamente el de hoy (una confirmación alcanza), así que **ninguna actividad existente cambia** con la migración. Mismo criterio retro-compatible que `puntosPorCumplir` en el #20.
10. **Solo aplica a `OBLIGATORIA` + `REQUIERE_CONFIRMACION`.** Es el único par que el cierre castiga; fuera de ahí el campo se fuerza a 1 (mismo trato que `puntosPorCumplir` en el #20, decisión 4).
11. **Acotado a `1 ≤ mínimo ≤ repeticionesMaximasSesion`.** Un mínimo mayor que el máximo es un castigo garantizado por algo que el servidor mismo va a rechazar al confirmarlo.
12. **El castigo es proporcional a lo que faltó**: `−valorPuntos × (mínimoEfectivo − vecesHechas)`. Con castigo 10 y mínimo 3, hacer 2 cuesta −10 y hacer 0 cuesta −30. Es simétrico con el premio, que ya escala por repetición desde el #20, y hace que esforzarse a medias duela menos que no hacer nada — que es lo que sostiene el intento del día siguiente. El castigo binario se descartó por eso: castigar 2 de 3 igual que 0 de 3 enseña a abandonar.
13. **Una sola fila `NO_HIZO` por par (usuario, actividad, sesión)**, con el total en `valorPuntosSnapshot` — no una fila por repetición faltante. La unicidad del par es lo que hace idempotente al cierre y legible al historial del #18; la cantidad ya está en el monto.
14. **Las repeticiones que el Tutor quemó bajan el mínimo**: `mínimoEfectivo = min(repeticionesMinimasSesion, topeEfectivo)`, con `topeEfectivo = repeticionesMaximasSesion − vecesPerdidas` (ítem #12). Sin este tope el sistema castigaría por no llegar a un número al que el servidor ya no dejaba llegar, y encima además del castigo que la marca roja ya aplicó. Doble castigo por un solo hecho.
15. **El `NO_HIZO` manual del Tutor no cambia**: sigue valiendo `−valorPuntos` una vez y sigue bloqueando la actividad (#12). Si existe, el cierre no agrega nada — misma regla de hoy.
16. **La pantalla del integrante muestra el mínimo en la barrita**, que ya existe («2 de 3»): el umbral se marca sobre la barra y el texto dice cuántas faltan *para no perder puntos*, no cuántas faltan para el techo. Sin esto el ítem es un castigo invisible, que es la peor clase.

### Alcance explícito de este corte

**Fuera a propósito**: mínimos por Sección (el ciclo del castigo es la Sesión, meter la semana obliga a decidir qué pasa con los días ya cerrados — regla 6); mínimos en opcionales (nada las castiga, un mínimo ahí no tendría efecto); objetivos de grupo o compartidos; reservar monedas (decisión 8); y notificar «te falta poco» (es el ítem #7 del catálogo de notificaciones, no este).

---

## Parte A — `activity-service`: el mínimo

### A.1 Modelo de datos

En `Actividad`:

```prisma
  // fase-14-25: cuántas confirmaciones hacen falta para NO perder puntos al
  // cerrar la Sesión. Default 1 ⇒ toda actividad preexistente conserva el
  // comportamiento del ítem 8 (una confirmación alcanzaba). Se fuerza a 1 fuera
  // de OBLIGATORIA + REQUIERE_CONFIRMACION y nunca supera a
  // repeticionesMaximasSesion (spec, decisiones 9-11).
  repeticionesMinimasSesion  Int              @default(1)
```

Migración nueva, aditiva, sin backfill: el default cubre todas las filas existentes.

### A.2 Validación al escribir

En `ActividadesService`, junto a la normalización que ya hace `puntosPorCumplir`:

- Fuera de `OBLIGATORIA` + `REQUIERE_CONFIRMACION` → se guarda **1**, se ignore lo que haya mandado el cliente.
- Dentro de ese par → `1 ≤ mínimo ≤ repeticionesMaximasSesion` (el máximo **resultante** de la operación, no el guardado antes: bajar el máximo y el mínimo en el mismo PATCH tiene que poder hacerse en un solo paso). Fuera de rango → 400.

### A.3 El castigo del cierre

En `CierreService.paresPendientes`, hoy `yaResuelto` es un `Set` de pares con **cualquier** registro de la sesión. Pasa a contar:

- `NO_HIZO` existente para el par → se saltea (decisión 15, sin cambios).
- `COMPLETADA` (incluidas las que el Tutor eliminó, que gastaron el intento) → se cuentan por separado: `vecesHechas` son las vivas y `vecesPerdidas` las eliminadas, igual que en `mi-estado-hoy`.
- `mínimoEfectivo = min(repeticionesMinimasSesion, repeticionesMaximasSesion − vecesPerdidas)`.
- `faltantes = mínimoEfectivo − vecesHechas`. Si `faltantes ≤ 0`, no se castiga.
- Si no, **una** fila `NO_HIZO` con `valorPuntosSnapshot = −(valorPuntos × faltantes)`.

El resto del filtrado del cierre (programación del #11, rol del #19, turno del #21, destinatario del #24) queda **exactamente igual** y sigue corriendo antes: el mínimo solo cambia *cuánto* se castiga a quien ya se determinó que corresponde castigar.

### A.4 `mi-estado-hoy`

`MiEstadoActividadHoyDto` suma dos campos:

- `repeticionesMinimasSesion`: el nominal, para el texto del formulario y del detalle.
- `minimoEfectivo`: `min(mínimo, topeEfectivo)` ya resuelto por el servidor — es contra este que la pantalla dibuja el umbral, por el mismo motivo por el que `topeEfectivo` existe (que el cliente no re-derive una regla que el servidor ya sabe).

`ActividadDto` suma `repeticionesMinimasSesion` para el formulario del Tutor.

---

## Parte B — `rewards-service`: el objetivo

### B.1 Modelo de datos

```prisma
/**
 * Para qué está ahorrando un participante (fase-14-25). Es CONFIG, no ledger:
 * se pisa con update y no deja historia (decisión 3) — a diferencia de
 * EventoMoneda, que nunca se edita. Uno por participante y por Grupo.
 */
model ObjetivoParticipante {
  id             String   @id @default(uuid())
  organizacionId String
  grupoId        String
  usuarioId      String
  productoId     String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([usuarioId, grupoId])
  @@index([organizacionId])
  @@index([grupoId])
}
```

### B.2 Endpoints

| Método | Ruta | Rol | Qué hace |
|---|---|---|---|
| `PUT` | `/rewards/grupos/:grupoId/mi-objetivo` | `USUARIO` | Fija el objetivo (`{ productoId }`). Upsert por `(usuarioId, grupoId)`. |
| `DELETE` | `/rewards/grupos/:grupoId/mi-objetivo` | `USUARIO` | Lo quita. 204. |

Validaciones del `PUT`: el producto existe, es del Grupo, está `ACTIVA` y el Grupo está en modo `TIENDA` (decisión 7). Cualquier otra cosa → 400. Es el participante y solo él: `tenant.principalId`, nunca un `usuarioId` del body (regla 3).

### B.3 Lecturas

- `MiBilleteraResponse` suma `objetivo: ObjetivoDto | null`, con `{ productoId, nombre, precio, faltan }` — `faltan` derivado contra el saldo del momento, igual que en la vitrina. `null` si no hay objetivo o si el producto quedó archivado (decisión 6).
- `BilleteraDto` (el listado del Tutor) suma `objetivoNombre: string | null` y `objetivoFaltan: number | null`. Una consulta más para todo el grupo, no una por participante.
- `ComprasService.comprar`: si el producto comprado era el objetivo, se borra en la misma transacción (decisión 5).

---

## Parte C — Frontend (`app-web`)

### C.1 Formulario del Tutor (`actividades.page.ts`)

El campo «Mínimo para no perder puntos» aparece **solo** cuando la actividad es obligatoria confirmable y `repeticionesMaximasSesion > 1` — con máximo 1 el mínimo solo puede ser 1 y mostrarlo es ruido. Va pegado al campo de repeticiones máximas, con la ayuda «Si confirma menos, pierde `valorPuntos` por cada vez que faltó».

El resumen de la tarjeta de la actividad dice «3× por sesión (mín. 2)» cuando el mínimo es mayor que 1.

### C.2 Pantalla del integrante

La barrita de repeticiones ya existente marca el umbral del mínimo (un separador visible sobre la barra) y, mientras `vecesHechas < minimoEfectivo`, el texto dice «te faltan N para no perder puntos». Alcanzado el mínimo, el texto pasa a ser el del techo («podés hacerla 1 vez más»), porque a partir de ahí lo que está en juego es premio, no castigo.

### C.3 Tienda del participante (`mi-tienda.component.ts`)

- Cada producto que todavía no puede pagar suma un botón de estrella «Mi objetivo» (toggle).
- El objetivo elegido se muestra **arriba, en la tarjeta de la billetera**: nombre, barra de progreso grande y «te faltan N». Es lo primero que se ve al entrar.
- El producto marcado queda destacado en la lista, sin sacarlo de su lugar: moverlo al tope rompería el orden estable de la vitrina.

### C.4 Billeteras del Tutor (`billeteras.component.ts`)

Bajo el saldo de cada participante, «🎯 ahorrando para *Bici* — le faltan 11». Nada si no tiene objetivo.

---

## Criterios de aceptación

1. Una obligatoria confirmable con máximo 3 y mínimo 3: confirmar 2 veces y cerrar la sesión escribe **un** `NO_HIZO` de `−valorPuntos`; confirmar 0 escribe uno de `−3 × valorPuntos`; confirmar 3 no escribe ninguno.
2. Con mínimo 1 (default), el comportamiento del cierre es idéntico al de antes de este ítem para todas las actividades existentes.
3. Si el Tutor quemó 2 repeticiones de una actividad con máximo 3 y mínimo 3, y el integrante confirmó la única que quedaba, **no** hay castigo al cierre.
4. Crear o editar una actividad con mínimo mayor que el máximo devuelve 400.
5. Una actividad opcional guardada con mínimo 5 queda con mínimo 1 en la base.
6. El participante marca un producto como objetivo, cierra sesión, vuelve a entrar desde otro navegador y el objetivo sigue ahí.
7. Comprar el producto que era el objetivo lo deja sin objetivo.
8. El Tutor ve en billeteras para qué ahorra cada integrante.
9. En un Grupo en modo `DIRECTO` no aparece ningún botón de objetivo y el `PUT` devuelve 400.
10. `nx run-many -t test lint build` limpio en los proyectos tocados.

## Nota para Claude Code

El mínimo toca **el motor de puntaje**: la fila que escribe el cierre entra al ledger y no se edita nunca (regla 6). Antes de tocar `CierreService`, leer sus tests existentes — el filtrado por programación, rol, turno y destinatario ya está cubierto ahí, y este ítem no debe cambiar ni uno de esos casos, solo agregar los del mínimo.
