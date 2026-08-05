import type { EventoIaSse } from '@dorado/shared-types';

/**
 * Parser de `text/event-stream` (fase-14-29 tanda 6), sin Angular en el medio
 * — mismo criterio que `core/termometro.ts` del #27 y `core/calibracion-monedas.ts`
 * del #28: se prueba solo, con strings.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ SE ESCRIBE UNO EN VEZ DE USAR `EventSource`:
 *
 * `EventSource` **solo hace GET y no manda cabeceras**. Los dos endpoints que
 * corren el loop son `POST` con body, y el access token de este proyecto vive
 * en memoria y viaja en `Authorization` (regla 7: nada de tokens en
 * localStorage, así que tampoco hay cookie de sesión que `EventSource` pudiera
 * aprovechar). Con `fetch` + `ReadableStream` se tienen las tres cosas: método,
 * body y cabecera.
 *
 * Lo que se pierde con `fetch` es la reconexión automática de `EventSource`, y
 * en este caso **perderla es lo correcto**: un turno que se reconecta solo
 * vuelve a llamar al proveedor y vuelve a pagarlo. Reintentar es decisión del
 * humano, igual que en `openai.service.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Va entregando los eventos a medida que llegan.
 *
 * **Un evento puede llegar partido en dos chunks y dos eventos pueden llegar
 * en el mismo** — el transporte no respeta los límites del protocolo. Por eso
 * hay un buffer y se corta por el separador (`\n\n`), no por chunk: parsear
 * chunk a chunk funciona en desarrollo, donde todo entra en un paquete, y se
 * rompe en producción con la primera respuesta larga.
 */
export async function* leerEventosIa(
  cuerpo: ReadableStream<Uint8Array>
): AsyncGenerator<EventoIaSse> {
  const lector = cuerpo.getReader();
  const decodificador = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await lector.read();

      if (done) {
        break;
      }

      buffer += decodificador.decode(value, { stream: true });

      let corte = buffer.indexOf('\n\n');

      while (corte !== -1) {
        const bloque = buffer.slice(0, corte);

        buffer = buffer.slice(corte + 2);

        const evento = interpretarBloque(bloque);

        if (evento) {
          yield evento;
        }

        corte = buffer.indexOf('\n\n');
      }
    }
  } finally {
    // Si quien consume corta el `for await` (por ejemplo porque el componente
    // se destruyó), el generador entra acá y hay que soltar el lector: sin
    // esto la conexión queda colgada del lado del navegador.
    lector.releaseLock();
  }
}

/**
 * Un bloque son las líneas de un evento. Solo interesan las de `data:`.
 *
 * Devuelve `null` para lo que no es un evento con datos: los latidos
 * (`: ping`), la línea `event:` —que es informativa, el `tipo` viaja dentro
 * del JSON— y cualquier bloque vacío del final del stream.
 */
function interpretarBloque(bloque: string): EventoIaSse | null {
  const datos = bloque
    .split('\n')
    .filter((linea) => linea.startsWith('data:'))
    .map((linea) => linea.slice('data:'.length).trimStart())
    .join('\n');

  if (datos === '') {
    return null;
  }

  try {
    return JSON.parse(datos) as EventoIaSse;
  } catch {
    // Un bloque ilegible se saltea en vez de tumbar la conversación entera: lo
    // que sigue llegando —el texto, la propuesta, el fin— vale igual.
    return null;
  }
}
