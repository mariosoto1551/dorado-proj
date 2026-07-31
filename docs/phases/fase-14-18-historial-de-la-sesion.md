# Fase 14 · Ítem 18 — Historial de la sesión (línea de tiempo del grupo para el Tutor)

> Sub-spec detallada del ítem 18 de `fase-14-post-mvp.md`. Especificación decidida con José (2026-07-30); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Fases 5 (catálogo), 6 (ciclo Sección/Sesión) y 7 (registro + ledger) completas, más los ítems de Fase 14 ya ejecutados: confirmación de obligatorias y `mi-estado-hoy` (#8), equipos de trabajo (#9), marcas rojas del tutor (#12) y anulación de tareas de equipo (#13). Todos existen.

No requiere ningún endpoint interno nuevo en otros servicios: `GET /internal/identity/grupos/:grupoId/usuarios`, `GET /internal/identity/grupos/:grupoId/tutores` y `GET /internal/session/grupos/:grupoId/secciones/actual` ya están implementados y ya los consume `activity-service` (`clientes/identity-client.service.ts`, `clientes/session-client.service.ts`).

## Motivación (el problema que resuelve)

El tutor no tiene ninguna pantalla que responda **«¿qué pasó hoy en el grupo?»**.

Los datos existen y están completos —`RegistroActividad`, `RegistroConducta` y `RegistroTareaEquipo` guardan cada acción con su hora, su autor, su valor en puntos y su historia de correcciones—, pero **solo se llega a ellos de a un participante por vez**: el panel operativo obliga al tutor a elegir primero un integrante y recién ahí le muestra sus completadas (`GET .../usuarios/:usuarioId/completadas`) y sus marcas rojas (`GET .../usuarios/:usuarioId/marcas`). Con seis integrantes eso son seis pantallas para enterarse del día; nunca se ve el conjunto.

De ahí salen tres problemas concretos:

1. **No hay foto del día.** El tutor no puede ver de un vistazo quién hizo cosas, quién no apareció, ni a qué hora se movió el grupo.
2. **Corregir exige saber de antemano a quién.** Las acciones del ítem #12 y #13 (anular, deshacer, con motivo) ya existen y funcionan, pero para ejercerlas hay que adivinar primero en qué participante mirar. La herramienta está construida y escondida.
3. **No hay dónde anotar nada.** Si el tutor quiere dejar constancia de por qué corrigió algo, su única opción es el `motivoTutor`, que **el integrante lee**. No existe una nota entre tutores.

Este ítem **no agrega datos nuevos al dominio**: expone lo que ya está guardado y reubica las acciones existentes donde tienen sentido.

## Decisiones de diseño (cerradas con José, 2026-07-30)

1. **Timeline cronológico del grupo**, más reciente arriba: hora · participante · qué pasó · puntos · quién lo registró. Con filtro por participante y por tipo. Es la vista que responde «¿qué está pasando?», no «¿cómo viene cada uno?».
2. **Solo la Sesión actual.** Una Sección cerrada es de solo lectura (regla 6) y navegar el histórico es otro producto. Ver la decisión 14 para qué se muestra fuera del horario de sesión.
3. **Lo sirve `activity-service`, no `audit-service`.** Activity es dueño de las filas y de las acciones que se ejercen sobre ellas; servir la vista desde audit dejaría la pantalla en un servicio y sus botones en otro, y obligaría a duplicar hacia audit eventos que hoy no viajan. `audit-service` sigue siendo el ledger de acciones administrativas, **sin cambios en este ítem**.
4. **Vive como pestaña del panel operativo** (`/grupos/:grupoId/secciones/actual`), no como página nueva: «Registrar» y «Qué pasó hoy». Cero entradas nuevas en un menú que ya tiene doce, y el contexto (grupo, sesión vigente) ya está cargado en esa pantalla.
5. **Entran actividades, conductas y tareas de equipo.** Completadas, «no hizo» (del tutor y los automáticos del cierre), confirmaciones de obligatorias —aunque valgan 0 puntos, son acciones del día— y tareas de equipo con su reparto. Canjes de recompensa y los hitos de apertura/cierre quedan fuera (ver «Fuera de alcance»).
6. **Registro rápido: solo conductas.** Desde el historial el tutor puede registrarle una conducta a cualquier participante sin cambiar de pantalla. Se limita a conductas a propósito: no tienen cupo de repeticiones, ni hora límite, ni días permitidos, así que **no hay ninguna regla del motor que el atajo pueda saltearse**. Marcar actividades desde acá exigiría decidir si el tutor pisa esas reglas, y esa excepción se propagaría a todo el registro.
7. **Notas internas como hilo.** Varias por registro, cada una con autor y hora, **invisibles para el integrante** (distintas del `motivoTutor` del #12, que sí se le muestra). Nadie edita ni pisa la nota de otro; cada tutor borra las suyas.
8. **Auto-refresco suave**: consulta cada 30 s mientras la pestaña está visible, se detiene cuando el navegador la oculta, más un botón de refrescar manual. Mismo patrón que la campana de notificaciones de Fase 10 — ya probado en el proyecto.
9. **Solo `TUTOR` y `ORG_ADMIN`.** Sin cambios en la app del integrante.

Detalles resueltos en esta spec:

10. **No hay tabla de eventos del historial.** El timeline se arma **leyendo y uniendo las tres tablas que ya existen**, ordenadas por `createdAt`. Materializar una tabla de "eventos del historial" sería duplicar el ledger en una copia que puede desincronizarse — exactamente lo que la regla 1 de `CLAUDE.md` prohíbe para el puntaje, aplicado a la trazabilidad. La única tabla nueva de este ítem es la de notas, que **no** deriva de nada.
11. **Lo anulado no desaparece: se muestra tachado.** Una fila con `eliminado = true` sigue en el timeline, atenuada, con quién la anuló, cuándo y con qué motivo, y con el rastro de la reversión si la hubo. Esconderla convertiría al historial en una vista parcial y contradiría el sentido del ítem: el registro que se anuló es justamente el que el tutor va a querer revisar. Un filtro permite ocultarlas si el tutor quiere ruido cero.
12. **Los nombres se resuelven con dos llamadas internas por request** (`usuarios` y `tutores` del grupo), volcadas a un mapa en memoria antes de armar la respuesta. Nunca una llamada por fila. Si un id no resuelve —un tutor que ya no está en el grupo, un `usuarioId` de una fila vieja— se devuelve un fallback legible (`«Tutor (ya no está en el grupo)»`), nunca el uuid crudo ni un error: el historial es la pantalla que **más** tiene que aguantar datos viejos. Mismo criterio que el fallback de nombres de `notification-service` (Fase 9).
13. **Paginación por cursor** `(createdAt, id)`, 50 filas por página. En el tenant piloto un día son decenas de filas, pero un grupo escolar de 30 integrantes con actividades repetibles pasa fácil las centenas, y esta pantalla se auto-refresca: sin tope, el costo crece con el día.
14. **Fuera de horario de sesión no se muestra una pantalla vacía.** Si no hay Sesión `ABIERTA`, el endpoint devuelve la **última Sesión de la Sección vigente** con `sesionEstado: 'CERRADA'` y el frontend la muestra en **solo lectura**, con un aviso. No es una excepción a la decisión 2: sigue siendo una única sesión, la más reciente, sin navegación. Las acciones ya exigen Sesión abierta por sus propias reglas (#12, decisión 11), así que el modo lectura no relaja ninguna validación — solo evita que el tutor abra el historial a las 22:05 y vea la nada.
15. **Las horas se formatean en la timezone del Grupo**, no en la del navegador. El servidor manda instantes ISO absolutos **más** `timezoneGrupo`, y el frontend formatea con `Intl.DateTimeFormat` en esa zona. Mismo problema que resolvió el ítem #14 con `deadlineEn`: el navegador no conoce la zona del Grupo, y un tutor de viaje no debe ver el día corrido.

### Fuera de alcance a propósito

- **Canjes de recompensas.** Viven en `rewards-service`; traerlos obliga a cruzar de servicio o a que rewards publique hacia activity. Es el único contenido candidato que agrega arquitectura, y se descartó para este ítem.
- **Hitos de apertura y cierre de la Sesión** como filas del timeline.
- **Navegar sesiones anteriores** (decisión 2). Un historial histórico con selector de fecha es un ítem propio, con su paginación y sus índices.
- **Anular una conducta con motivo, y deshacerla.** Hoy `DELETE /activity/registros-conducta/:id` no acepta motivo y **no tiene reversión**, a diferencia de las actividades desde el #12. El historial muestra el botón «Anular» tal como funciona hoy. Emparejar conductas con actividades requiere un evento nuevo y la cadena de compensación en scoring —el mismo trabajo que el #12 hizo del lado de actividades— y eso es un ítem propio, no un agregado silencioso a este. **Queda anotado como asimetría conocida.**
- **Notificar al integrante** de nada de lo que pase acá (mismo diferimiento que el #12).
- **Exportar el historial** (CSV/PDF). Pertenece al ítem #2 de Fase 14, reportes avanzados, que además está gateado por entitlement.

---

## Parte A — `activity-service`: el endpoint de historial

### `GET /activity/grupos/:grupoId/historial` (TUTOR, ORG_ADMIN)

Query params, todos opcionales:

| Param | Tipo | Default | Qué hace |
|---|---|---|---|
| `usuarioId` | uuid | — | Filtra a un participante. En tareas de equipo, filtra las de los equipos que lo tienen de miembro según el snapshot. |
| `tipo` | `ACTIVIDAD` \| `CONDUCTA` \| `TAREA_EQUIPO` | — | Filtra por clase de fila. |
| `incluirAnulados` | boolean | `true` | Con `false` esconde las filas con `eliminado = true` (decisión 11). |
| `cursor` | string | — | Cursor opaco de la página siguiente. |
| `limite` | int (1–100) | `50` | Tamaño de página. |

Validaciones, en orden:

1. `grupoId` pertenece a la organización del JWT (regla 3 — vía `AccesoGrupoService`, que ya existe y ya se usa en el resto del servicio). 404 si no.
2. Resolver la Sección vigente por el interno de session. Si no hay Sección vigente: `{ sesionId: null, eventos: [], ... }` — no es un error (mismo criterio que `completadas` y `marcas`).
3. Elegir la Sesión: la `ABIERTA`; si no hay ninguna abierta, la de `inicio` más reciente de esa Sección (decisión 14).

Response:

```ts
interface HistorialSesionDto {
  /** null si el grupo no tiene Sección vigente. */
  sesionId: string | null;
  /** ABIERTA habilita las acciones; CERRADA es solo lectura (decisión 14). */
  sesionEstado: 'ABIERTA' | 'CERRADA' | null;
  /** IANA, del Grupo. El frontend formatea las horas con esto (decisión 15). */
  timezoneGrupo: string;
  eventos: EventoHistorialDto[];
  /** null cuando no hay más páginas. */
  cursorSiguiente: string | null;
}

interface EventoHistorialDto {
  /** id de la fila de origen: el mismo que consumen anular/deshacer/notas. */
  id: string;
  tipo: 'ACTIVIDAD_COMPLETADA' | 'ACTIVIDAD_NO_HIZO' | 'CONDUCTA' | 'TAREA_EQUIPO';
  /** Instante absoluto (ISO). Se formatea en timezoneGrupo, no en la del navegador. */
  ocurridoEn: string;
  /** null en TAREA_EQUIPO: el sujeto es el equipo. */
  usuarioId: string | null;
  usuarioNombre: string | null;
  /** Solo en TAREA_EQUIPO. */
  equipoId: string | null;
  equipoNombre: string | null;
  /** actividadId o conductaId, según el tipo. */
  itemId: string;
  itemNombre: string;
  /**
   * Snapshot con signo, tal como quedó guardado. 0 en las confirmaciones de
   * obligatorias — que se muestran igual (decisión 5). En TAREA_EQUIPO es lo
   * que recibió CADA miembro; el bono del jefe viaja aparte.
   */
  puntos: number;
  bonoJefe: number | null;
  cantidadMiembros: number | null;
  registradoPorId: string;
  registradoPorTipo: 'TUTOR' | 'USUARIO' | 'SYSTEM';
  /** 'Automático al cerrar el día' cuando el tipo es SYSTEM (fase-14-08). */
  registradoPorNombre: string;
  anulado: boolean;
  anuladoPorNombre: string | null;
  anuladoEn: string | null;
  /** Nota del tutor VISIBLE para el integrante (fase-14-12). */
  motivoTutor: string | null;
  revertidoEn: string | null;
  revertidoPorNombre: string | null;
  /** Hilo de notas internas, invisible para el integrante (Parte B). */
  notas: NotaRegistroDto[];
}
```

Implementación de la unión (decisión 10): tres `findMany` acotados por `sesionId` + `organizacionId`, cada uno con `take: limite + 1` sobre el cursor, se mezclan en memoria por `createdAt` descendente y se corta a `limite`. Las notas de la página se traen con un único `findMany` con `registroId in [...]`. Los nombres, con las dos llamadas internas de la decisión 12. Total por request: 3 consultas de registros + 1 de notas + 2 llamadas REST internas, **independiente de la cantidad de filas**.

> El cursor codifica `createdAt` e `id` de la última fila devuelta (base64 de `<iso>|<uuid>`), y cada `findMany` filtra `createdAt < cursor.createdAt OR (createdAt = cursor.createdAt AND id < cursor.id)`. El desempate por `id` es necesario: dos registros del mismo segundo son perfectamente posibles cuando un tutor carga varios seguidos.

### Modelo de datos: la única tabla nueva

```prisma
// fase-14-18: nota interna del Tutor sobre un registro del historial. NO es
// ledger —no sostiene puntaje, no viaja a scoring, no genera evento— y por eso
// admite DELETE físico, mismo criterio que SeleccionPlanDia (fase-14-17).
// Es lo contrario del `motivoTutor` de RegistroActividad: esto NO lo ve el
// integrante nunca.
model NotaRegistro {
  id             String              @id @default(uuid())
  organizacionId String
  grupoId        String
  registroTipo   TipoRegistroHistorial
  registroId     String
  texto          String
  autorTutorId   String
  createdAt      DateTime            @default(now())

  @@index([organizacionId])
  @@index([registroTipo, registroId])
}

enum TipoRegistroHistorial {
  ACTIVIDAD
  CONDUCTA
  TAREA_EQUIPO
}
```

No lleva clave foránea al registro: las tres tablas de origen son distintas y una FK polimórfica no se expresa en Prisma. La integridad la garantiza el endpoint, que valida que el registro exista, sea del tenant y sea de la Sesión vigente antes de escribir.

`texto` tope **500 caracteres** (más largo que el `motivoTutor` de 200: una nota interna sí puede ser un descargo).

### `POST /activity/historial/:registroTipo/:registroId/notas` (TUTOR, ORG_ADMIN)

Body: `{ texto: string }`. Response: `NotaRegistroDto`.

1. 400 si `registroTipo` no es uno de los tres valores del enum.
2. 404 si el registro no existe o es de otra organización (mismo 404 en los dos casos, no revela nada — mismo criterio que el #12).
3. 409 `NO_HAY_SESION_ABIERTA` si el registro no es de la Sesión abierta. Las notas son parte del trabajo del día, no anotaciones retroactivas sobre lo ya cerrado.

### `DELETE /activity/notas/:id` (TUTOR, ORG_ADMIN)

1. 404 si no existe o es de otra organización.
2. **403 `NOTA_DE_OTRO_TUTOR`** si `autorTutorId` no es el del JWT (decisión 7). Un `ORG_ADMIN` **tampoco** borra notas ajenas: la regla es de autoría, no de jerarquía.
3. `DELETE` físico.

```ts
interface NotaRegistroDto {
  id: string;
  texto: string;
  autorTutorId: string;
  autorNombre: string;
  createdAt: string;
  /** true si el autor es quien está mirando: habilita el botón de borrar. */
  esPropia: boolean;
}
```

### Lo que NO cambia

Ningún endpoint existente cambia de shape ni de comportamiento. Las acciones del historial son llamadas a los endpoints que ya existen:

| Acción en la UI | Endpoint (ya implementado) |
|---|---|
| Anular una completada | `DELETE /activity/registros-actividad/:id?motivo=` (#12) |
| Deshacer una marca roja | `POST /activity/registros-actividad/:id/revertir` (#12) |
| Anular una tarea de equipo / deshacer | endpoints del #13 |
| Anular una conducta | `DELETE /activity/registros-conducta/:id` (sin motivo — ver «Fuera de alcance») |
| Registrar conducta rápida | `POST /activity/conductas/:id/registrar` con `usuarioId` (#7) |

Sin eventos de dominio nuevos y sin cambios en `scoring-service`, `session-service`, `identity-service` ni el Gateway (el prefijo `/api/activity/*` ya está proxeado).

---

## Parte B — Frontend (`app-web`)

**`panel-operativo.page.ts`** pasa a tener dos pestañas: «Registrar» (lo actual, intacto) y «Qué pasó hoy». La pestaña activa se refleja en la URL (`?vista=historial`) para que sea enlazable y sobreviva un refresh.

**Componente de timeline**:

- Fila compacta: hora · nombre · qué pasó · puntos con signo y color · autor. En móvil, dos renglones.
- Icono y acento por tipo: completada (verde), no hizo (rojo), conducta buena (verde), conducta mala (rojo), tarea de equipo (teal, el mismo acento que el #15).
- Confirmación de obligatoria: se muestra con «Confirmada» y **sin** número de puntos (vale 0 — mostrar «+0» es ruido).
- Fila anulada: atenuada, texto tachado, chip «Anulada», con quién y cuándo, y el `motivoTutor` debajo si lo hay. Si además fue revertida, chip «Deshecha».
- Autor `SYSTEM`: se muestra como «Automático al cerrar el día», nunca como un id.
- Menú por fila con las acciones que apliquen al tipo y al estado, más «Notas» con un contador cuando tiene.
- Filtros: participante (desplegable), tipo (chips) y un switch «Ocultar anuladas».
- «Cargar más» al pie con el cursor. El auto-refresco **solo recarga la primera página** y nunca reordena lo ya cargado bajo el cursor del tutor.
- Estado vacío distinto para «todavía no pasó nada hoy» y «no hay sesión abierta» (decisión 14).

**Hoja de notas** (bottom sheet en móvil, panel lateral en escritorio): hilo con autor y hora relativa, campo de texto con contador de 500, borrar solo en las propias.

**Registro rápido de conducta**: botón fijo en la pestaña → elegir participante → elegir conducta del catálogo → confirmar. Al volver, la fila nueva ya está arriba del timeline.

**Cliente API**: se extiende `activity.api.ts` (o equivalente) con `historial()`, `crearNota()` y `borrarNota()`. Sin cliente nuevo.

**Accesibilidad**: la lista es una `<ol>` real; el auto-refresco anuncia las novedades por `aria-live="polite"`; el color nunca es el único portador de significado (siempre hay icono y texto).

---

## Criterios de aceptación

- [ ] **Nada preexistente cambia**: la pestaña «Registrar» del panel operativo se comporta exactamente como antes, y ningún endpoint existente cambia de shape.
- [ ] Con una sesión abierta y actividad del día, `GET /activity/grupos/:id/historial` devuelve las filas de las tres tablas mezcladas y ordenadas por hora descendente, con los nombres de participante, actividad/conducta y autor resueltos.
- [ ] Una confirmación de obligatoria (0 puntos) aparece en el timeline; la UI la muestra como «Confirmada», sin número.
- [ ] El «no hizo» automático del cierre aparece con autor «Automático al cerrar el día», no con un id ni con un nombre inventado.
- [ ] Una tarea de equipo aparece como una sola fila, con el equipo, los puntos por miembro y el bono del jefe.
- [ ] Una fila anulada sigue visible, tachada, con quién la anuló y su motivo; con `incluirAnulados=false` desaparece.
- [ ] Anular y deshacer desde el historial producen exactamente el mismo resultado que desde el panel operativo (mismos endpoints, misma compensación en el ledger).
- [ ] Registrar una conducta desde el historial la deja registrada y visible en el timeline sin recargar la página.
- [ ] Notas: un tutor agrega dos notas a un registro y las ve en orden; **otro** tutor las lee pero no puede borrarlas (403 `NOTA_DE_OTRO_TUTOR`), y un `ORG_ADMIN` tampoco.
- [ ] Una nota **nunca** llega al integrante: `mi-estado-hoy` y todas las respuestas de la app del usuario siguen sin incluirla (verificado explícitamente, no por omisión).
- [ ] Paginación: con más de 50 filas, `cursorSiguiente` trae la página siguiente sin repetir ni saltear filas, incluso con varios registros del mismo segundo.
- [ ] Rendimiento: la cantidad de consultas y de llamadas internas por request **no depende** de la cantidad de filas devueltas.
- [ ] Sin sesión abierta se muestra la última sesión de la sección vigente en solo lectura, con aviso y sin botones de acción.
- [ ] Sin sección vigente, la respuesta es `{ sesionId: null, eventos: [] }` y la UI muestra el estado vacío correspondiente — no un error.
- [ ] Las horas se muestran en la timezone del Grupo aunque el navegador esté en otra (verificable cambiando la zona del sistema).
- [ ] Aislamiento multi-tenant: un tutor de otra organización recibe 404 al pedir el historial de ese grupo, al anotar sobre un registro ajeno y al borrar una nota ajena.
- [ ] El auto-refresco se detiene cuando la pestaña del navegador se oculta y se reanuda al volver.
- [ ] `activity` sigue verde en tests y lint, y la migración aplica contra Postgres real.

## Nota para Claude Code

Tres errores fáciles acá, en orden de gravedad:

1. **Materializar una tabla de "eventos del historial"** que se llene por eventos o por triggers. Es tentador porque simplifica la consulta, y es exactamente la clase de copia derivada que este proyecto prohíbe para el puntaje. El historial se **arma al leer**, igual que el puntaje se **suma al leer**. La única tabla nueva es `NotaRegistro`, que no deriva de nada.
2. **Esconder lo anulado.** Un historial que oculta lo corregido es una vista parcial que le miente al tutor sobre su propio día; y lo anulado es justo lo que va a querer revisar. Se muestra tachado, con su rastro completo.
3. **Resolver nombres de a uno.** Una llamada interna por fila convierte una pantalla que se auto-refresca en una tormenta contra identity. Dos llamadas por request, a un mapa, siempre — y con fallback legible, porque esta pantalla va a mostrar ids de gente que ya no está en el grupo.

Y un recordatorio de alcance: la asimetría de conductas (sin motivo y sin deshacer, a diferencia de actividades) está **declarada fuera de alcance a propósito**. Si al implementar aparece la tentación de "ya que estamos", eso es un ítem nuevo con su evento y su cadena de compensación en scoring — se anota, no se cuela.
