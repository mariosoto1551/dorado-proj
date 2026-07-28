# Fase 14 · Ítem 16 — Scheduler con recuperación: ninguna transición se pierde por un reinicio

> Sub-spec del ítem 16 de `fase-14-post-mvp.md`. Backend puro (`session-service`), sin frontend, sin endpoints nuevos y sin eventos nuevos. Decidido con José (2026-07-27). **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Fase 6 (ciclo de vida Sesión/Sección y scheduler del modo `AUTOMATICO`). Existe.

## Motivación (el bug que resuelve)

El scheduler de la Fase 6 dispara **por igualdad de minuto**: en cada tick pregunta "¿el minuto actual **es** el del cron?" (`cronMatcheaMinuto`, `apps/session-service/src/comun/cron.ts`). La idempotencia (`UltimoTickProcesado.minutoEpoch`) sólo cubre "reinicios del proceso **dentro del mismo minuto**" — así está escrito, textual, en `fase-06-session-section.md` línea 99.

Consecuencia: **si el proceso no está vivo exactamente en ese minuto, la transición no ocurre nunca.** No se recupera después. Un grupo con `cronAperturaSeccion = "0 0 * * 1"` cuyo `session-service` estuvo caído el lunes a las 00:00 no cierra su Sección esa semana: se queda en `EVALUACION` hasta el lunes siguiente.

Los disparadores reales de esa pérdida no son exóticos, son la operación normal:

- Un deploy. El runbook usa `docker compose up --build` (`docs/runbook-deploy.md:141`); un build que cruce el minuto del cron se come la transición, en silencio y sin log de error.
- Un reinicio del VPS, un OOM-kill, una caída de Postgres de 90 segundos.
- Cualquier corte de red que haga fallar `identity.obtenerGrupo` justo en ese minuto (ese caso ya se reintenta al minuto siguiente — pero para entonces el cron ya no matchea, así que el reintento no sirve de nada).

Pedido de José (2026-07-27): *"quiero que esta app sea profesional, que no se pierda cosas y funcione bien"*.

## Decisiones de diseño

1. **Se cambia el modelo de disparo: de "¿es el minuto exacto?" a "¿qué venció desde la última vez que miré?".** El scheduler pasa a ser un **reconciliador**, no un temporizador. Cada tick evalúa la ventana `(evaluadoHasta, ahora]` y aplica **todas** las ocurrencias de cron que caigan adentro, en orden cronológico. Un downtime de tres horas se recupera solo en el primer tick posterior.

2. **`UltimoTickProcesado.minutoEpoch` (`Int`) se reemplaza por `evaluadoHasta` (`DateTime?`).** El minuto entero ya no alcanza: hace falta el instante exacto hasta el que se evaluó. La ventana es **abierta en `desde` y cerrada en `hasta`** — sin huecos y sin solapamiento entre ticks consecutivos, que es lo que da la idempotencia (estrictamente más fuerte que la que daba `minutoEpoch`: dos ticks en el mismo minuto tampoco duplican, porque el segundo ve una ventana ya vacía).

3. **`evaluadoHasta` nulo (fila nueva, o fila vieja migrada) NO replica historia: arranca en `ahora`.** Un grupo recién puesto en `AUTOMATICO` — y, sobre todo, los grupos que ya existen cuando se despliega este ítem — no deben fabricar retroactivamente las Secciones de todo el pasado. La migración deja la columna en `NULL` a propósito.

4. **Cada transición se sella con el instante en que *estaba programada*, no con el de la recuperación.** Si el cron de las 00:00 se aplica a las 03:17 porque el servicio recién arrancó, la Sección cerrada lleva `fechaFin = 00:00`, no `03:17`. El ledger tiene que reflejar cuándo correspondía el corte; si no, un scoring calculado después vería una Sesión de 3 horas de más. Esto vale para `fechaFin` de Sesión y Sección y para `fechaInicio` de las que se abren.

5. **La recuperación está acotada por ventana: `SCHEDULER_MAX_RECUPERACION_HORAS`, default 168 (7 días).** Si `evaluadoHasta` quedó más atrás que eso (backup restaurado, servicio apagado un mes, reloj movido), se recorta `desde` al límite y se **loguea un warning**. Recuperar hasta un ciclo completo de Sección cubre cualquier corte real; más allá de eso, fabricar meses de Secciones en silencio sería peor que no hacer nada, y amerita que un operador mire.

6. **Y por cantidad: máximo `MAX_OCURRENCIAS_POR_TICK = 500` por tick.** Protege contra un cron mal configurado (`* * * * *` + una ventana larga = 10.080 ocurrencias). Si se alcanza el tope, se procesan las 500 más antiguas y **`evaluadoHasta` se deja en la última ocurrencia aplicada, no en `ahora`** — así el tick siguiente continúa exactamente donde quedó. El tope acota el trabajo por tick; **no descarta trabajo**.

7. **El tick toma un lock de asesoría de Postgres por grupo (`pg_advisory_xact_lock`) dentro de la transacción.** `@Cron` de NestJS es in-process: con dos réplicas de `session-service`, hoy las dos ticknean y — como el guard se lee *antes* de aplicar las transiciones y Postgres corre en Read Committed — podrían duplicar Secciones. El lock serializa por grupo y se libera solo al terminar la transacción; la segunda réplica entra después, ve la ventana vacía y no hace nada. Se usa lock de asesoría y no `SELECT … FOR UPDATE` porque tiene que funcionar también cuando la fila de `UltimoTickProcesado` todavía no existe.

8. **Las extensiones (`autocierrePospuestoHasta`) se evalúan contra el instante de cada ocurrencia**, no contra `ahora`: una extensión que estaba vigente a las 00:00 suprime el autocierre de las 00:00 aunque se recupere a las 03:17. El caso "extensión vencida sin cron que matchee" se sigue evaluando una vez al final del tick, contra `ahora`, igual que antes.

9. **El orden de la spec de Fase 6 se respeta dentro de cada instante**: si el cron de sesión y el de sección caen en el mismo minuto (el caso Destino:Dorado, lunes 00:00), primero corre el de sesión (casos 1–2: cierre y evaluación) y después el de sección (caso 3: cierre y apertura de la siguiente).

### Fuera de alcance a propósito

- **Mover el scheduler a un scheduler durable externo** (tabla de jobs, colas con delay en RabbitMQ). La reconciliación resuelve el problema real con una fracción de la complejidad, y no agrega una pieza de infraestructura más que operar.
- **Un endpoint para forzar la reconciliación a mano.** Si algún día hace falta, es exponer `procesarTick(ahora)` bajo `/internal/*`.
- **Notificar cuando hubo recuperación.** Por ahora queda en el log (`warn` con cuántas ocurrencias se recuperaron); no se publica evento ni se avisa al tutor.

---

## Parte 1 — Schema (`session-service`)

```prisma
model UltimoTickProcesado {
  grupoId       String    @id
  // Instante hasta el que ya se evaluaron los crons de este grupo. La ventana
  // de cada tick es (evaluadoHasta, ahora]. NULL = nunca evaluado: el primer
  // tick lo fija en `ahora` sin replicar historia (decisión 3).
  evaluadoHasta DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}
```

Migración: `DROP COLUMN "minutoEpoch"`, `ADD COLUMN "evaluadoHasta" TIMESTAMP(3)`. Destructiva sobre una tabla **operacional** (no de negocio, sin `organizacionId`, se regenera sola) — se acepta a propósito en vez de dejar una columna muerta que la documentación describa como el mecanismo de idempotencia cuando ya no lo es.

## Parte 2 — `comun/cron.ts`

Se agrega `ocurrenciasEntre(expresion, desde, hasta, timezone, maximo)`: lista de instantes que matchean el cron en `(desde, hasta]`, en orden ascendente, evaluados en la timezone del Grupo. Devuelve `[]` si la expresión es inválida (mismo criterio defensivo que `cronMatcheaMinuto`: el guard duro está en el `PUT` de configuración). Corta al llegar a `maximo`.

`cronMatcheaMinuto` queda: ya no la usa el scheduler, pero sigue siendo la forma correcta de responder "¿este instante es una ocurrencia?" y está cubierta por tests.

## Parte 3 — `scheduler/scheduler.service.ts`

`procesarGrupo(config, ahora)`:

1. Lectura barata fuera de la transacción: si `evaluadoHasta >= ahora`, cortar.
2. `identity.obtenerGrupo(grupoId)` para la timezone — **fuera** de la transacción (es I/O de red; no se tiene una transacción abierta esperando un HTTP).
3. Transacción:
   a. `pg_advisory_xact_lock(hashtext(grupoId))`.
   b. Re-leer `evaluadoHasta` (ahora sí bajo lock: es el valor autoritativo).
   c. `desde = evaluadoHasta ?? ahora`, recortado por `SCHEDULER_MAX_RECUPERACION_HORAS`.
   d. Construir la lista ordenada de ocurrencias de ambos crons en `(desde, ahora]` (sesión antes que sección ante empate).
   e. Aplicar cada una a su instante, re-leyendo la Sección vigente en cada iteración (`cerrarSeccion` crea la siguiente).
   f. Evaluar la extensión vencida contra `ahora`.
   g. `upsert` de `evaluadoHasta` en la **misma** transacción.
4. Publicar los eventos acumulados, después del commit.

## Parte 4 — Env

`SCHEDULER_MAX_RECUPERACION_HORAS`, opcional, entero ≥ 1, default 168. Se valida en `config/env.schema.ts` como el resto.

## Criterios de aceptación

- [ ] Con el servicio caído durante el minuto del cron de sesión, el primer tick posterior **aplica** el cierre-y-avance que se había perdido.
- [ ] Con el servicio caído tres días (cron `0 0 * * 1-6`), el primer tick posterior aplica las tres aperturas de sesión perdidas, en orden.
- [ ] Las transiciones recuperadas llevan `fechaFin`/`fechaInicio` del instante **programado**, no el de la recuperación.
- [ ] Lunes 00:00 recuperado: primero el cron de sesión (cierre + `EVALUACION`), después el de sección (cierre + apertura), en ese orden.
- [ ] Dos ticks seguidos en el mismo minuto no duplican nada (la ventana del segundo está vacía).
- [ ] Un grupo sin fila de `UltimoTickProcesado` no replica historia: primer tick sin transiciones, `evaluadoHasta = ahora`.
- [ ] Con `evaluadoHasta` un mes atrás, se recorta a la ventana máxima y se loguea warning.
- [ ] Con un cron `* * * * *` y una ventana enorme, un tick aplica como mucho 500 ocurrencias y deja `evaluadoHasta` en la última aplicada (el siguiente tick continúa).
- [ ] Una extensión vigente al instante de la ocurrencia suprime ese autocierre aunque se recupere más tarde.
- [ ] Si `identity` no responde, no se marca `evaluadoHasta` y el grupo se reintenta — y ahora el reintento **sí** recupera la transición perdida.
- [ ] Los criterios de aceptación del caso Destino:Dorado de la Fase 6 siguen pasando sin cambios de comportamiento en el camino feliz.

## Nota para Claude Code

El cambio de fondo es conceptual, no de líneas: **un scheduler no debe preguntar "¿es la hora?" sino "¿qué venció?"**. Si en el futuro aparece otro job periódico en el monorepo (recordatorios, expiración de recompensas, cortes de facturación), tiene que nacer con este mismo patrón — ventana `(evaluadoHasta, ahora]` persistida, no igualdad de minuto. Es la diferencia entre un sistema que depende de estar prendido en el instante justo y uno que converge al estado correcto en cuanto vuelve.
