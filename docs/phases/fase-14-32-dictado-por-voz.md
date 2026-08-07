# Fase 14 · Ítem 32 — Dictado por voz en el asistente

> Sub-spec detallada del ítem 32 de `fase-14-post-mvp.md`. Este archivo es la especificación decidida con José (2026-08-07); las desviaciones de implementación se registran en `docs/progreso/`, no acá. **No se edita una vez escrito** (protocolo de specs de `CLAUDE.md`).

## Prerrequisitos

El **ítem #29** completo (`ai-service`, `AsistentePage`, `IaApiService`). Nada más: este ítem no toca ningún backend.

Reutiliza tal cual: el `<textarea>` con `[(ngModel)]="borrador"` de `asistente.page.ts`, `IconoComponent`, `ToastService`, y las clases `.boton` / `.boton-neutro` / `.boton-peligro` de `libs/shared-ui/src/theme.css`.

## Motivación (el problema que resuelve)

El asistente se usa desde el celular y **cobra por lo bien escrito que esté el pedido**. Las dos cosas juntas son el problema: las preguntas que le sacan valor —*«armame un catálogo para un chico de 8 que ya hace la cama pero no junta los juguetes, y que las obligatorias sean tres»*— son párrafos, y un párrafo tipeado con el pulgar es un pedido que nadie escribe. Lo que se escribe en su lugar es *«actividades»*, y ahí el asistente adivina.

Las cuatro sugerencias de arranque (`SUGERENCIAS` en `asistente.page.ts`) existen exactamente por eso: son el reconocimiento, ya escrito en el #29, de que la pantalla no puede ser un cursor titilando. Pero una sugerencia enlatada resuelve el primer mensaje, no el segundo — y el segundo es donde está el contexto que solo el Tutor tiene.

Dictar no hace nada que tipear no haga. Simplemente hace que la longitud del pedido deje de tener un costo físico.

## Decisiones de diseño

Cerradas con José el 2026-08-07:

1. **La transcripción la hace el navegador, no el proveedor de IA.** Se usa la Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`), que es nativa del browser. Consecuencias, todas deliberadas: **costo cero**, **no consume cuota de tokens**, **`ai-service` no se entera de que este ítem existe**, y no hay endpoint, ni migración, ni evento, ni DTO nuevo.

   La alternativa evaluada y descartada por ahora era transcribir en el servidor vía el proveedor (mejor calidad con nombres propios, soporte parejo entre navegadores). Se descartó **no por el precio de la transcripción**, que es bajo, sino por lo que arrastra: la cuota del asistente está medida en **tokens** (`cuotaTokensMensuales`, decisión 8 del #29) y el audio se factura por minuto, dos unidades sin conversión honesta entre sí; `Mensaje.costoMicroUsd` no tiene dónde alojar el costo de algo que no es un mensaje; y el `rate-limit-ia` del Gateway cuenta requests, no minutos de audio. Ninguno de los tres es difícil — los tres son decisiones de producto que este ítem no necesita tomar para entregar el 90% del valor. Queda como camino de salida si el dictado del navegador resulta insuficiente en uso real, y **entonces sí** con su spec propia.

2. **Es dictado, no comando de voz.** Lo dictado aterriza en el `borrador` y se queda ahí, editable. Enviar sigue siendo apretar el botón o Enter. Dos motivos, y el segundo es el que decide: el reconocimiento se equivoca con nombres propios —que en este producto son los nombres de los chicos y de las actividades, o sea casi todo lo que importa—, y un envío automático gastaría cuota real en una transcripción que nadie leyó. Es además la misma forma que ya tiene el resto del asistente: **propone, y el humano confirma**.

3. **Si el navegador no soporta la API, el botón no se muestra.** Detección de features, no de user-agent. Es la regla que ya escribió `EntradaAsistenteComponent` en el #30 —*un atajo a una pantalla que no funciona es peor que no tener el atajo*— aplicada al mismo lugar: un micrófono que al apretarlo tira un error enseña que la app está rota, y no tener micrófono no enseña nada. El soporte real por navegador **se verifica al implementar**, no se asume desde esta spec.

4. **El dictado agrega, no reemplaza.** Al empezar se guarda lo que ya había en el `borrador` como base, y lo dictado se le concatena. Sin esto, dictar sobre un texto a medio escribir lo borra — y como los resultados parciales llegan y se corrigen varias veces por segundo, borrarlo sería instantáneo e irrecuperable (no hay undo en un `signal`).

5. **No amplía el aviso de consentimiento de IA.** El `AVISO_IA_VERSION_VIGENTE` cubre mandarle **datos del Grupo** al proveedor de IA; el dictado manda **la voz del propio Tutor** a su navegador, que además pide permiso de micrófono por su cuenta —un consentimiento por usuario, revocable desde el navegador, más granular que el nuestro—. Subir la versión del aviso obligaría a **todas** las organizaciones a volver a aceptarlo (el mecanismo que estrenó la decisión 11 del #31) por una función que la mayoría no va a apretar nunca. Se registra como decisión tomada y no como olvido: si mañana el dictado pasa al servidor (decisión 1), **ahí sí** cambia el destinatario del audio y el aviso tiene que crecer.

   Lo que sí se hace es decirlo donde se usa: el botón lleva `title="El dictado lo hace tu navegador"`.

6. **Tope duro de 60 segundos por sesión de dictado.** Con `continuous = true` —necesario, porque la gente hace pausas para pensar mientras dicta— el micrófono queda abierto hasta que alguien lo cierre. Un Tutor que aprieta y se distrae deja el micrófono escuchando la cocina. El tope se corta solo y no avisa con un error: se detiene igual que si hubiera apretado el botón.

7. **`no-speech` y `aborted` no muestran nada.** El primero es "apretaste y no dijiste nada" y el segundo es "lo cortaste vos": los dos son cosas que el Tutor ya sabe, y un toast que informa lo que la persona acaba de hacer es ruido. Los que sí avisan son `not-allowed`/`service-not-allowed` (falta el permiso — es lo único que el Tutor puede ir a arreglar), `audio-capture` (no hay micrófono) y `network`.

8. **Un componente, con `model()`.** `BotonDictadoComponent` recibe el texto por two-way binding (`[(texto)]="borrador"`) y adentro tiene todo: la detección, la sesión, la base de la decisión 4, el tope de la 6 y el mapeo de errores de la 7. La página gana **una línea de template y cero lógica**. Que la API del navegador esté detrás de un solo archivo es también lo que hace que la decisión 1 sea reversible sin cirugía.

9. **Idioma fijo `es-AR`, en una constante del archivo.** El producto todavía no tiene i18n; poner `navigator.language` sería fingir que sí y encima romper el dictado del Tutor argentino con el navegador en inglés, que es un caso más común que el contrario. Cuando llegue i18n, es una constante.

10. **Solo en la pantalla del asistente.** No en el buscador del catálogo, no en la descripción de una actividad, no en el nombre de una recompensa. El dictado paga donde el texto es largo y en prosa; en un campo de tres palabras cuesta más que tipearlo.

**Fuera de alcance a propósito**: transcripción en el servidor (es la decisión 1, y sería un ítem propio); voz de salida / que el asistente hable (text-to-speech); comandos de voz de cualquier tipo, incluido «enviá» (decisión 2); dictado en cualquier otro campo de la app (decisión 10); idiomas distintos de `es-AR` (decisión 9); y guardar, subir o reproducir el audio — este ítem **no toca un blob de audio en ningún momento**, la API del navegador entrega texto.

---

## Parte A — `BotonDictadoComponent`

Archivo nuevo: `apps/app-web/src/app/componentes/boton-dictado.component.ts`.

**Tipos.** Se declara en el archivo una interfaz mínima de lo que se usa de la API (`SpeechRecognition`, el evento de resultados y el de error) en vez de depender de que la `lib.dom` del TypeScript instalado los traiga. Es una API con prefijo histórico y soporte disparejo; escribir a mano las cinco propiedades que se tocan es más barato que descubrir en CI que el `lib` de esta versión no las declara.

**Entrada / salida.**

| Miembro | Tipo | Qué hace |
|---|---|---|
| `texto` | `model.required<string>()` | El borrador. Se lee al empezar (base, decisión 4) y se escribe en cada resultado. |
| `deshabilitado` | `input(false)` | El asistente está pensando. Corta el dictado en curso si pasa a `true`. |

**Estado interno**: `escuchando: signal<boolean>`, `soportado: boolean` (una vez, en el constructor).

**Comportamiento.**

1. `soportado === false` → el template no renderiza nada (decisión 3).
2. Click estando apagado: guarda `texto()` como base, crea la sesión (`lang = 'es-AR'`, `continuous = true`, `interimResults = true`), arranca el tope de 60 s (decisión 6).
3. En cada evento de resultados **se recorre la lista entera desde 0** y se reconstruye final + parcial. No se acumula desde `resultIndex`: el navegador **corrige resultados ya emitidos**, y acumular incrementalmente deja las correcciones afuera. Reconstruir es O(n) sobre una lista de segundos de habla, no hay razón para optimizarlo.
4. El resultado se une a la base con un espacio, sin duplicar los que ya haya (`unirDictado`).
5. Click estando prendido, tope cumplido, `deshabilitado` en `true`, o destrucción del componente (`DestroyRef`) → detiene la sesión y limpia el timer. **La cuarta importa**: navegar fuera de la pantalla con el micrófono abierto lo dejaría abierto.

**Template**: un botón cuadrado del mismo alto que el de enviar, `.boton .boton-neutro` apagado y `.boton .boton-peligro` + `animate-pulse` escuchando. `aria-pressed`, `aria-label` que cambia con el estado, y un `<span class="sr-only" aria-live="polite">` que anuncia «Escuchando» / «Dictado detenido» — la pulsación roja no existe para un lector de pantalla.

## Parte B — `IconoComponent`

Un nombre nuevo: `microfono` (Heroicons outline `microphone`). Es el único cambio en un archivo compartido y es aditivo.

## Parte C — `AsistentePage`

Una línea en el `<form>` de redacción, entre el `<textarea>` y el botón de enviar:

```html
<app-boton-dictado [(texto)]="borrador" [deshabilitado]="ocupado()" />
```

Más el import. **Nada más**: no hay estado nuevo en la página, `enviar()` no cambia, y el flujo de envío no distingue si el texto se tipeó o se dictó — que es precisamente la decisión 2 hecha código.

## Criterios de aceptación

1. En un navegador con la API, la pantalla del asistente muestra un botón de micrófono a la izquierda del de enviar.
2. Apretarlo pide permiso de micrófono; concedido, el botón se pone rojo y pulsa, y lo hablado aparece en el `<textarea>` mientras se habla.
3. El texto queda editable y **no se envía solo**: hace falta Enter o el botón (decisión 2).
4. Con el borrador ya conteniendo «Armame un catálogo», dictar «para un chico de 8» deja `Armame un catálogo para un chico de 8` — no reemplaza (decisión 4).
5. En un navegador sin la API, la pantalla se ve **exactamente como antes del ítem**: sin botón, sin hueco, sin error en consola (decisión 3).
6. Denegar el permiso muestra un toast que dice que hay que habilitarlo en el navegador; apretar y no decir nada no muestra nada (decisión 7).
7. A los 60 segundos de dictado continuo el micrófono se cierra solo, sin toast de error, y lo dictado hasta ahí queda (decisión 6).
8. Enviar mientras se dicta corta el dictado (`deshabilitado`), y navegar fuera de la pantalla también (`DestroyRef`).
9. La cuota de tokens del asistente (`tokensConsumidosMes`) **no se mueve** por dictar: se mueve recién al enviar, exactamente lo mismo que se movería si el texto se hubiera tipeado (decisión 1).
10. Ningún archivo de `apps/ai-service`, `libs/shared-types` ni de ningún otro backend cambia en este ítem.
