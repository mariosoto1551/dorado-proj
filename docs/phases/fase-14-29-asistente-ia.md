# Fase 14 · Ítem 29 — Asistente de IA para el área del Tutor

> Sub-spec detallada del ítem 29 de `fase-14-post-mvp.md`. Este archivo es la especificación decidida con José (2026-08-04); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

Fases 1 a 13 completas, más los ítems **#19** (roles del participante), **#22** (tienda de monedas), **#24** (destinatario y vigencia), **#25** (objetivo y mínimo de repeticiones), **#26** (etiquetas del catálogo) y **#28** (monedas por cumplir) — todos ejecutados. La IA propone sobre el modelo tal como quedó después de esos seis; sin ellos, la mitad de los campos que sabe llenar no existen.

Reutiliza, sin modificarlos: el patrón de servicio NestJS con Prisma propio y filtro de tenant por ALS (Fase 2/5), la tabla de ruteo del Gateway (Fase 3), los entitlements de `billing-service` (Fase 4) y su cliente interno como molde, los clientes REST internos con `x-internal-secret` (ADR-00 §4), el `HttpExceptionFilter` con `DomainException` de `comun/excepciones.ts`, y el patrón de pantalla del Tutor con `libs/shared-ui` tal como quedó tras el #23 T2.

## Qué revisa de lo ya decidido

**Nada.** Es el primer ítem de la Fase 14 que agrega una capacidad sin tocar ninguna decisión anterior: no cambia el ledger de puntos, ni el de monedas, ni el motor de registro, ni una sola regla de negocio existente. Su invariante central es justamente ese — ver la decisión 2.

## Motivación (el problema que resuelve)

Después de 28 ítems, el modelo de datos de una Actividad tiene **más de veinte campos configurables**: tipo de puntaje, valor, puntos por cumplir, límite de tiempo, deadline, repeticiones máximas y mínimas por sesión y por sección, comportamiento al cierre, alcance, bono al jefe, días de la semana, siempre visible, roles permitidos, usuarios permitidos, equipos permitidos, vigencia desde y hasta, más el valor en monedas que vive en rewards. Cada uno tiene una razón, y todas juntas son la potencia del producto.

Y son también su barrera de entrada. Hoy, un Grupo nuevo arranca con el catálogo vacío y la única forma de llenarlo es **abrir el formulario veinte veces**. El #23 hizo el modal más legible —tres campos a la vista y tres secciones plegadas— pero no cambió la aritmética: veinte actividades siguen siendo veinte formularios, y quien no conoce el producto no sabe cuánto vale «tender la cama» ni si conviene que sea obligatoria.

Lo mismo del otro lado: el #28 le dio al Tutor una palanca sobre el ingreso en monedas, y el #22 sobre el gasto. **Nadie sabe qué números poner.** El aviso de calibración del #28 dice cuánto rinde una semana, pero no dice cuánto *debería* rendir.

El pedido de José (2026-08-04) es que una cuenta de empresa pueda usar IA dentro de la app para crear y editar tareas, y que quede claro qué tiene que hacer el dueño para prenderla y cómo se implementa de forma segura.

## Decisiones de diseño

Cerradas con José el 2026-08-04:

1. **Los tokens los paga la plataforma, con cuota por plan.** La API key es de la organización de OpenAI de la plataforma, no del tenant. El asistente es una *feature del plan* como `whiteLabel` o `reportesAvanzados`, con una **cuota mensual de tokens por organización** medida y cortada en el propio servicio. El dueño no crea cuenta en OpenAI ni pega ninguna key: prende un switch y funciona. Consecuencia obligatoria: **la cuota y el corte duro no son opcionales ni configurables por el tenant** — sin ellos, un tenant hostil o un bucle de reintentos gastan dinero real de la plataforma.
2. **La IA propone; el humano aplica.** El modelo **no tiene ninguna herramienta que escriba**. Todo lo que quiere cambiar lo devuelve como una `Propuesta`: una lista de operaciones tipadas y validadas que se muestran en pantalla y **no tocan ninguna base hasta que el Tutor aprieta «Aplicar»**. Ver la decisión 6 para el corolario que hace fuerte a esta.
3. **Solo `ORG_ADMIN` y `TUTOR`.** El participante no habla con el asistente. Eso deja afuera, por construcción y no por una regla que haya que mantener, todo el ítem #4 de la fase (consentimiento de menores, moderación obligatoria, retención de conversaciones de chicos): ningún menor manda texto a un LLM en esta versión.
4. **Cuatro capacidades en la primera versión**, y ninguna más: armar catálogo, editar en lote lo existente, explicar y analizar el grupo, y calibrar tienda y recompensas.
5. **El asistente viene apagado** y lo prende explícitamente el `ORG_ADMIN`, no el `TUTOR`, aceptando un aviso corto sobre qué datos salen hacia OpenAI. Esa aceptación se guarda con fecha y con quién la hizo. Ningún grupo existente cambia de comportamiento y ningún dato de ninguna organización sale hacia un tercero sin que su dueño lo haya habilitado — mismo criterio de opt-in del `planDelDiaActivo` del #17, aplicado acá porque acá importa mucho más.

Detalles resueltos en esta spec:

6. **La IA no tiene manos: aplicar es el frontend, con el JWT del Tutor, contra los endpoints públicos que ya existen.** `ai-service` **no tiene un solo camino de escritura hacia otro servicio** — sus clientes internos son todos `GET`, y hay un test que lo afirma sobre la lista de rutas. Cuando el Tutor aprieta «Aplicar», `app-web` ejecuta las operaciones llamando `POST /api/activity/actividades`, `PATCH /api/rewards/...`, etc., exactamente igual que si el Tutor hubiera llenado el formulario a mano. Consecuencias, todas deliberadas: cero superficie de escritura nueva; ninguna autorización nueva que auditar (la del formulario ya está probada); imposible que un bug del asistente escriba algo que el Tutor no podría escribir él mismo; y el peor caso de un prompt injection exitoso es **una propuesta fea que un humano ve antes de aplicar**.
7. **Servicio propio, `ai-service`, puerto 3009, prefijo `/api/ai`.** No va dentro de `activity-service` por tres motivos: cruza tres servicios (activity, rewards, scoring) y meterlo en uno lo convierte en el orquestador de los otros; tiene un perfil de falla y de latencia distinto al de todo el resto (segundos, no milisegundos, y depende de un tercero); y es lo único del monorepo que habla con una API externa de pago, que conviene tener aislado para poder apagarlo entero sin tocar el camino caliente de la app.
8. **El consumo se deriva sumando el ledger de mensajes, no de un contador mutable.** Es la regla 1 del proyecto aplicada a los tokens: `Mensaje` guarda `tokensEntrada`/`tokensSalida`/`costoMicroUsd` por llamada y el consumo del mes es un `aggregate` sobre esa tabla. Un contador `tokensUsados` que se incrementa es exactamente el campo mutable que este proyecto no usa en ninguna parte, y acá además sería el campo que decide si se cobra o no.
9. **El tenant nunca es un argumento de una herramienta.** Las herramientas de lectura que el modelo puede llamar **no tienen parámetro `organizacionId` ni `grupoId`**: el servicio los inyecta desde el JWT validado al ejecutar la llamada. El modelo no puede pedir datos de otro grupo porque no existe un lugar donde escribirlos. Es la regla 3 del proyecto llevada a su forma más estricta, y es la defensa contra el injection que no depende de que el modelo se porte bien.
10. **Los datos del Grupo entran al prompt como datos, nunca como instrucciones.** Nombres de actividades, de personas, descripciones y contenido creado por integrantes (#10) van dentro de bloques delimitados y etiquetados como no confiables, con el system prompt diciéndolo explícitamente. No es la defensa principal —esa es la 6 y la 9— es la que reduce el ruido.
11. **Una propuesta que no valida no se guarda: se le devuelve el error al modelo para que reintente.** Cada operación se valida en el servidor contra el shape real del DTO (Zod) y contra las reglas que el endpoint destino va a exigir de todos modos. Así el Tutor nunca ve una propuesta que la API rechazaría, y el «Aplicar» no falla a mitad de camino por algo que se podía saber antes.
12. **La propuesta vence.** Una propuesta guarda un snapshot del estado que leyó; si se aplica tres días después, el catálogo cambió. Vencen a las **24 horas** y al aplicar se revalida contra el estado actual. Vencida se puede leer, no aplicar.
13. **Aplicar es operación por operación, y una que falla no aborta el resto.** El resultado se muestra por fila (creada / falló + motivo). No hay transacción distribuida y no hace falta: crear cinco actividades y que la tercera falle deja cuatro actividades buenas y una fila roja que se reintenta, que es mejor que perder las cinco.
14. **Solo el Tutor ve el asistente; el participante no sabe que existe.** No hay pantalla, ni ícono, ni endpoint alcanzable con rol `USUARIO`.
15. **Sin eventos de dominio nuevos.** `ai-service` no publica ni consume RabbitMQ en esta versión. Lo que quede en el ledger de auditoría lo escriben los servicios destino cuando el frontend aplica, exactamente como cuando el Tutor usa el formulario.
16. **El modelo es configuración, no una decisión de esta spec.** `OPENAI_MODEL` como variable de entorno con default documentado en `.env.example`. Se elige el vigente al momento de implementar, no el que estaba vigente cuando se escribió este archivo — mismo criterio que la tabla de versiones de `CLAUDE.md`.

### Fuera de alcance a propósito

- **BYOK** (que cada organización cargue su propia key de OpenAI). Se evaluó y se descartó en la decisión 1; si algún día se pide, entra como ítem propio y necesita almacén cifrado de secretos por tenant.
- **El participante hablando con la IA.** Decisión 3. Arrastra el ítem #4 entero.
- **Generación de imágenes** (íconos de recompensas, avatares) y **voz**.
- **Que la IA cierre secciones, registre actividades, otorgue puntos o entregue recompensas.** No es una limitación técnica: la decisión 2 dice que la IA no escribe, y estas cuatro son las escrituras que además tocan el ledger.
- **RAG sobre documentos subidos por el tenant.** El contexto es el estado del Grupo, no una base de conocimiento.
- **Memoria entre conversaciones.** Cada conversación arranca limpia; el contexto lo dan las herramientas de lectura.
- **Streaming de la propuesta.** La respuesta en texto se transmite; la propuesta se entrega entera al final, ya validada (decisión 11).

---

## Parte A — `billing-service`: la feature y la cuota

Aditivo puro sobre el modelo de la Fase 4.

```prisma
model Plan {
  // ...campos actuales sin tocar...
  /// fase-14-29: si el plan habilita el asistente de IA.
  asistenteIa            Boolean @default(false)
  /// fase-14-29: techo mensual de tokens (entrada + salida) por organización.
  /// null = sin límite, y NO se usa en ningún plan vendido: existe para que
  /// soporte pueda destrabar un caso puntual, no como configuración normal.
  cuotaTokensIaMensual   Int?
}
```

`seed-planes.ts`: `FREE` → `asistenteIa: false`, `cuotaTokensIaMensual: 0`. `PRO` → `asistenteIa: true`, `cuotaTokensIaMensual: 2_000_000`.

`EntitlementsDto` en `libs/shared-types/src/lib/billing.ts`:

```ts
features: {
  whiteLabel: boolean;
  reportesAvanzados: boolean;
  asistenteIa: boolean;      // fase-14-29
},
limites: {
  // ...los cuatro actuales...
  tokensIaMensuales: number | null;  // fase-14-29
}
```

Migración aditiva, sin backfill: el default cubre las filas existentes.

## Parte B — `ai-service`: proyecto y schema (`ai_db`)

Servicio NestJS nuevo generado con `@nx/nest`, mismo molde que `rewards-service`: Prisma 7 con `@prisma/adapter-pg`, base propia `ai_db`, filtro de tenant por ALS, `comun/excepciones.ts`, health, logging estructurado.

```prisma
/// Opt-in por organización (decisión 5). Una fila por organización, creada
/// perezosamente la primera vez que se consulta o se habilita.
model ConfiguracionIaOrganizacion {
  id                   String   @id @default(uuid())
  organizacionId       String   @unique
  habilitada           Boolean  @default(false)
  /// Cuándo y quién aceptó el aviso de datos. Es el registro de consentimiento:
  /// se escribe al habilitar y NO se borra al deshabilitar (un consentimiento
  /// dado es un hecho, no un estado — mismo criterio que el ledger).
  aceptoAvisoEn        DateTime?
  aceptoAvisoPorUsuarioId String?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
}

model Conversacion {
  id             String   @id @default(uuid())
  organizacionId String
  grupoId        String
  /// Quién la abrió. Una conversación es de su autor: otro Tutor del mismo
  /// grupo no la lee (decisión de privacidad entre adultos del mismo tenant).
  usuarioId      String
  titulo         String
  archivada      Boolean  @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  mensajes   Mensaje[]
  propuestas Propuesta[]

  @@index([organizacionId, grupoId, usuarioId])
}

enum RolMensaje { USUARIO, ASISTENTE, HERRAMIENTA, SISTEMA }

/// Ledger inmutable: se escribe y no se edita nunca (regla 6 del proyecto).
/// Es también la fuente de verdad del consumo (decisión 8).
model Mensaje {
  id             String     @id @default(uuid())
  conversacionId String
  organizacionId String
  rol            RolMensaje
  contenido      String
  /// Nombre de la herramienta y argumentos, si rol = HERRAMIENTA.
  herramienta    String?
  /// Contabilidad de la llamada que produjo este mensaje. 0 en los mensajes
  /// del usuario. Se escribe SIEMPRE, incluso si la llamada falló a mitad:
  /// los tokens de entrada se pagan igual.
  tokensEntrada  Int        @default(0)
  tokensSalida   Int        @default(0)
  /// Costo estimado en millonésimas de dólar, con la tarifa vigente al
  /// momento de la llamada. Es un snapshot: la tarifa de mañana no reescribe
  /// lo que costó ayer (mismo criterio que nombreSnapshot del #28).
  costoMicroUsd  Int        @default(0)
  modelo         String?
  createdAt      DateTime   @default(now())

  conversacion Conversacion @relation(fields: [conversacionId], references: [id], onDelete: Cascade)

  @@index([conversacionId, createdAt])
  /// El índice del que depende el cálculo de cuota (decisión 8).
  @@index([organizacionId, createdAt])
}

enum EstadoPropuesta { BORRADOR, APLICADA, APLICADA_PARCIAL, DESCARTADA, VENCIDA }

enum TipoPropuesta {
  CREAR_ACTIVIDADES
  EDITAR_ACTIVIDADES
  PRECIOS_TIENDA
  RENDIMIENTOS_MONEDAS
}

model Propuesta {
  id             String          @id @default(uuid())
  conversacionId String
  organizacionId String
  grupoId        String
  tipo           TipoPropuesta
  /// Operaciones ya validadas contra el shape real del DTO destino
  /// (decisión 11). Cada una lleva su id local para poder reportar por fila.
  operaciones    Json
  /// Qué leyó el modelo para proponer esto (decisión 12): ids + updatedAt de
  /// lo que va a tocar. Se revalida al aplicar.
  snapshot       Json
  estado         EstadoPropuesta @default(BORRADOR)
  venceEn        DateTime
  aplicadaEn     DateTime?
  aplicadaPorUsuarioId String?
  /// Resultado por operación que reporta el frontend al terminar de aplicar
  /// (decisión 13): [{ opId, ok, entidadId?, error? }].
  resultado      Json?
  createdAt      DateTime        @default(now())

  conversacion Conversacion @relation(fields: [conversacionId], references: [id], onDelete: Cascade)

  @@index([organizacionId, grupoId])
}
```

## Parte C — Endpoints públicos (`/api/ai`, vía Gateway)

Todos con `@Roles(ORG_ADMIN, TUTOR)` salvo donde se aclare. `organizacionId`/`grupoId` **siempre** del JWT.

| Método | Ruta | Rol | Qué hace |
|---|---|---|---|
| `GET` | `/api/ai/configuracion` | ORG_ADMIN, TUTOR | Estado: `habilitada`, `disponibleEnPlan`, `cuotaTokensMensuales`, `tokensConsumidosMes`, `avisoAceptado`. |
| `PUT` | `/api/ai/configuracion` | **ORG_ADMIN** | `{ habilitada, aceptaAviso }`. Habilitar con `aceptaAviso !== true` → 400 `AVISO_NO_ACEPTADO`. Sin la feature en el plan → 402 `FEATURE_NO_DISPONIBLE`. |
| `GET` | `/api/ai/conversaciones?grupoId=` | ORG_ADMIN, TUTOR | Las del solicitante, no las de otros. |
| `POST` | `/api/ai/conversaciones` | ORG_ADMIN, TUTOR | `{ grupoId, primerMensaje }` → crea y responde. |
| `GET` | `/api/ai/conversaciones/:id` | autor | Mensajes + propuestas. 404 si es de otro usuario (no 403: no se confirma que exista). |
| `POST` | `/api/ai/conversaciones/:id/mensajes` | autor | **SSE**. Manda un mensaje y transmite la respuesta. |
| `POST` | `/api/ai/conversaciones/:id/archivar` | autor | — |
| `GET` | `/api/ai/propuestas/:id` | autor | La propuesta con sus operaciones. |
| `POST` | `/api/ai/propuestas/:id/descartar` | autor | → `DESCARTADA`. |
| `POST` | `/api/ai/propuestas/:id/aplicada` | autor | El frontend informa el resultado por operación (decisión 13). Solo registra: **no escribe en ningún otro servicio**. |

Códigos de negocio (`DomainException`, para que el filtro los conserve — la deuda que encontró el #26): `IA_NO_HABILITADA`, `FEATURE_NO_DISPONIBLE`, `AVISO_NO_ACEPTADO`, `CUOTA_IA_AGOTADA`, `PROPUESTA_VENCIDA`, `PROPUESTA_NO_APLICABLE`, `PROVEEDOR_NO_DISPONIBLE`.

Gateway: `{ prefijo: '/api/ai', servicio: AI }` en `tabla-ruteo.ts`, con `AI_INTERNAL_URL`. **El proxy tiene que soportar SSE** — verificar que `http-proxy-middleware` no bufferee la respuesta (`selfHandleResponse: false` y sin compresión sobre `text/event-stream`); si molesta, el fallback es long-polling y se registra como desviación.

## Parte D — Las herramientas del modelo

Dos familias, con una asimetría que es el corazón del ítem.

**Herramientas de lectura** — el modelo las llama solo, se ejecutan de verdad, todas contra internos `GET` existentes o nuevos de solo lectura. Ninguna recibe `organizacionId` ni `grupoId` (decisión 9):

| Herramienta | Origen | Para qué |
|---|---|---|
| `listar_actividades` | activity | Ver el catálogo antes de proponer, y para editar en lote. |
| `listar_conductas` | activity | Ídem. |
| `listar_participantes` | identity | Nombres de pila, roles del #19 y equipos del #9. **Nunca emails.** |
| `listar_umbrales_zona` | scoring | Para calibrar valores contra las zonas reales del grupo. |
| `resumen_puntajes` | scoring | «¿por qué Luciana bajó a Amarillo?». |
| `listar_recompensas` | rewards | Precios, etiquetas del #26, modo `DIRECTO`/`TIENDA`. |
| `listar_rendimientos_monedas` | rewards | Lo que paga cada acción (#28). |
| `resumen_cumplimiento` | activity | Qué se cumple y qué no, para «¿qué actividad nadie hace nunca?». |

**Herramientas de propuesta** — el modelo las «llama» pero **no ejecutan nada**: el servicio valida los argumentos (decisión 11), arma la `Propuesta` y le contesta al modelo «propuesta armada, mostrala». Si la validación falla, el error vuelve al modelo con el detalle del campo:

| Herramienta | Produce operaciones para |
|---|---|
| `proponer_crear_actividades` | `POST /api/activity/actividades` |
| `proponer_editar_actividades` | `PATCH /api/activity/actividades/:id` |
| `proponer_precios_tienda` | `PATCH /api/rewards/recompensas/:id` |
| `proponer_rendimientos_monedas` | `PUT` de rendimientos del #28 |

Cada operación se persiste **con la forma exacta del request del endpoint destino**, para que aplicar sea un `for` sobre el array y no una traducción — y para que un cambio de DTO rompa el build acá y no en producción.

## Parte E — Seguridad

El orden importa: las tres primeras son estructurales (no dependen de que nada se porte bien), el resto son controles.

1. **La IA no tiene credenciales de escritura** (decisión 6). `ai-service` no conoce ningún secreto que le permita mutar otra base. Es la única defensa que sigue valiendo si el modelo hace exactamente lo peor que puede hacer.
2. **El tenant no es un parámetro** (decisión 9). Cross-tenant por argumento del modelo es imposible por forma, no por chequeo. Test dedicado: ninguna definición de herramienta declara un parámetro cuyo nombre matchee `/organizacionId|grupoId|tenant/`.
3. **Un humano ve todo antes de que exista** (decisión 2). El peor caso de un injection exitoso es una propuesta rara en pantalla.
4. **La key vive solo en `ai-service`.** `OPENAI_API_KEY` es la key de un **service account** de un **project** de OpenAI (`dorado-dev` / `dorado-staging` / `dorado-prod`, uno por entorno con su propio límite de gasto). Nunca en `app-web`, nunca en un DTO, nunca en un log — el logger enmascara cualquier valor que empiece con el prefijo de key. Rotación: crear la key nueva en el mismo service account, desplegar, revocar la vieja.
5. **Cuota, en tres capas.** (a) *Pre-flight*: si `tokensConsumidosMes >= cuota`, 402 `CUOTA_IA_AGOTADA` **antes** de llamar a OpenAI. (b) *Por request*: `max_output_tokens` fijo y tope de iteraciones del loop de herramientas (**8**), para que un modelo en bucle no se coma el mes. (c) *Rate limit por usuario* en el Gateway sobre `/api/ai/conversaciones/*/mensajes`, más estricto que el global — reusa el seam `RATE_LIMIT_*` que dejó el #23 T4.
6. **La contabilidad se escribe aunque la llamada falle.** Los tokens de entrada se pagan igual. Un `try/finally` que persiste el `Mensaje` con lo consumido: si esto se hace «al terminar bien», un tenant que corta la conexión a propósito consume gratis.
7. **Datos personales.** Sale hacia OpenAI: nombres de pila, nombres de actividades/recompensas/roles/equipos, puntajes y saldos. **No sale**: email, contraseña, id de organización en claro, ni nada de `identity` que no sea nombre de pila. `safety_identifier` = SHA-256 de `${organizacionId}:${usuarioId}` en hex, recortado a 64 caracteres — estable, y no reversible a una persona. `prompt_cache_key` = `org:${organizacionId}:grupo:${grupoId}`, que es lo que hace que el catálogo repetido de una misma conversación entre por caché.
8. **Datos delimitados** (decisión 10): el estado del Grupo va en bloques `<datos_del_grupo>` con el system prompt diciendo que nada de adentro es una instrucción.
9. **El asistente nunca está en el camino crítico.** Si OpenAI está caído o `ai-service` no levanta, el Gateway responde 503 en `/api/ai/*` y **ninguna otra pantalla de la app cambia**. Timeout de 60 s por llamada, sin reintento automático de una llamada que ya consumió tokens.
10. **Egress**: `api.openai.com` es el único host externo que `ai-service` alcanza; documentarlo en el runbook y, si la plataforma de deploy lo permite, restringirlo ahí.
11. **Retención**: la API de OpenAI no entrena con los datos de la API por defecto. Anotar en el aviso de la decisión 5 y en `docs/runbook-deploy.md`, junto con la opción de pedir ZDR si algún tenant lo exige.

## Parte F — Frontend (`app-web`)

- Pantalla `/asistente`, en el grupo **Ajustes** del menú del #23 T3, visible solo con la feature habilitada.
- Chat con streaming, historial de conversaciones, y **tarjeta de propuesta** embebida en la conversación: por operación, qué crea o qué cambia, con el valor viejo y el nuevo cuando es una edición. Nada de JSON crudo en pantalla.
- Botones: **Aplicar todo**, **Aplicar seleccionadas** (checkbox por fila) y **Descartar**. Aplicar muestra progreso por fila y el resultado final (decisión 13), y después informa a `POST /api/ai/propuestas/:id/aplicada`.
- Entradas de contexto desde las pantallas donde duele: botón «Pedirle ayuda a la IA» en Actividades (con el catálogo vacío, es la acción principal de la pantalla) y en la pantalla de rendimientos del #28.
- Reusa `ui-modal`, `.tarjeta`, `.boton` y `ui-estado-vacio` de `shared-ui` (#23 T2). Confirmación **solo** en «Aplicar» (escribe de verdad) y no en «Descartar» — regla del #23 T4: *se confirma lo que no tiene vuelta atrás*.
- La lógica que arma el diff legible vive en `core/propuesta-ia.ts` y se testea sin montar Angular, como `core/termometro.ts` del #27 y `core/calibracion-monedas.ts` del #28.

## Parte G — Qué tiene que hacer el dueño de la empresa

Tres pasos, y ninguno involucra a OpenAI:

1. Estar en el plan **PRO** (o tener la feature habilitada desde el panel `PLATFORM_ADMIN` del #5).
2. Entrar a **Configuración → Asistente de IA**, leer el aviso de qué datos del grupo se envían a un proveedor externo para generar las respuestas, y **aceptar**. Queda registrado con fecha y usuario.
3. Prender el switch.

A partir de ahí, cualquier Tutor de la organización tiene la pantalla. El dueño ve el consumo del mes en la misma pantalla y puede apagarlo en cualquier momento; apagarlo no borra las conversaciones.

## Parte H — Orden de ejecución

Cada tanda se termina y se verifica antes de la siguiente.

1. **Billing**: feature + cuota en el plan y en los entitlements, con seed y migración. Lo más barato y lo que todo lo demás consulta.
2. **Andamio de `ai-service`**: proyecto Nx, Prisma, health, ruta en el Gateway, `/api/ai/configuracion` completo con el opt-in de la decisión 5. **Todavía sin OpenAI**: al terminar esta tanda el dueño puede prender el switch y no pasa nada, que es exactamente lo que tiene que pasar.
3. **Clientes internos de lectura** y las 8 herramientas de lectura, con el test de la decisión 9 y el de la 6 (ninguna ruta no-`GET`).
4. **El loop**: llamada a OpenAI, ejecución de herramientas, tope de iteraciones, contabilidad en `Mensaje`, corte por cuota. Verificable por API sin una sola pantalla.
5. **Herramientas de propuesta** + validación con Zod contra los DTOs reales + `Propuesta` con vencimiento.
6. **Frontend**: chat, tarjeta de propuesta, aplicar por operación.
7. **E2E**: suite propia (`asistente-ia.e2e.ts`) con el proveedor **stubbeado** — se testea el sistema, no el modelo (ver criterios).

## Parte I — Criterios de aceptación

1. Una organización FREE recibe 402 `FEATURE_NO_DISPONIBLE` al intentar habilitar, y `/api/ai/conversaciones` le responde 402 aunque la fila de configuración exista.
2. Habilitar sin `aceptaAviso: true` → 400 `AVISO_NO_ACEPTADO`. Con él, la fila queda con `aceptoAvisoEn` y `aceptoAvisoPorUsuarioId`.
3. Un `TUTOR` puede conversar; un `TUTOR` **no** puede habilitar (403). Un `USUARIO` recibe 403 en **todos** los endpoints de `/api/ai`.
4. Un Tutor de la organización A no puede leer una conversación de la organización B (404), y una herramienta de lectura ejecutada en el contexto de A **nunca** devuelve una fila de B — verificado con dos tenants reales, como la suite de aislamiento de la Fase 12.
5. Con el consumo del mes por encima de la cuota, mandar un mensaje devuelve 402 `CUOTA_IA_AGOTADA` **y el stub del proveedor no registra ninguna llamada**. El pre-flight corta antes de gastar, no después.
6. Una respuesta del modelo con una operación inválida (ej. `valorPuntos: "diez"`, o un `rolesPermitidos` con un id que no existe en el grupo) **no crea `Propuesta`**: el error vuelve al modelo y, si insiste, la conversación termina en texto sin propuesta.
7. Aplicar una propuesta de 3 actividades donde la segunda falla deja **2 actividades creadas**, la propuesta en `APLICADA_PARCIAL` y el `resultado` con las 3 filas y el motivo del fallo.
8. Una propuesta con `venceEn` en el pasado → 409 `PROPUESTA_VENCIDA` al aplicar, y sigue siendo legible.
9. Con `ai-service` apagado, `GET /api/health` lo reporta caído y **las 16 pantallas del Tutor siguen funcionando** — se verifica corriendo la suite E2E completa con el servicio abajo.
10. Los tokens quedan registrados aunque la llamada se corte a mitad, y el consumo del mes es la suma del ledger (no hay ningún campo contador en ninguna tabla).
11. Ningún log, ninguna respuesta de error y ningún DTO contiene la API key ni un email de participante.
12. Suite E2E propia verde dos corridas seguidas, y la suite completa sin regresiones.

> **Sobre testear IA**: el proveedor se stubbea con un doble que devuelve respuestas fijas (incluida una con tool-calls y una con argumentos inválidos). No se testea que el modelo proponga cosas buenas —eso no es determinista y no es lo que puede romperse en un deploy—: se testea el ruteo, la validación, la cuota, el aislamiento y el aplicado parcial, que son el sistema. Vale la pena tener presente el modo de falla que la Fase 14 ya encontró cuatro veces (`turnos-de-hoy` del #23 T1, el «✓ hizo» del #23 T4, el ocultamiento del #24 y el consumidor round-robin del #28): **la unidad verifica la pieza y lo que falla es el cable**. Acá el cable son el SSE a través del proxy y el «Aplicar» del frontend, y los dos necesitan E2E de navegador.

## Nota de configuración fuera del código

Al ejecutar la tanda 2 hay que actualizar, en el repo real: la tabla de puertos de `CLAUDE.md` (agregar `ai-service` → 3009), `docker-compose.yml` (base `ai_db`), `infra/render.yaml` (décimo servicio), `.env.example` y `.env.production.example` (`OPENAI_API_KEY`, `OPENAI_MODEL`, `AI_INTERNAL_URL`), `scripts/e2e-up.mjs` y `docs/runbook-deploy.md`. **`CLAUDE.md` sí se edita** —es referencia viva, no una spec—; los `docs/phases/fase-XX-*.md` anteriores, no.
