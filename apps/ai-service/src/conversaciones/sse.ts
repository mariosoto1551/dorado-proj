import { EventoIaSse } from '@dorado/shared-types';

/**
 * Cada cuánto sale un comentario `: ping` mientras el loop trabaja.
 *
 * No es decorativo: entre que el modelo empieza a pensar y contesta pueden
 * pasar 50 segundos sin un solo byte, y el `proxyTimeout` del Gateway para
 * `/api/ai` es de 120 s **de inactividad**. Un turno lento sin latido queda a
 * un pelo de que el proxy corte la conexión mientras el servicio sigue
 * trabajando y gastando tokens — exactamente el 502 que encontró la tanda 5,
 * pero esta vez con la respuesta ya en camino.
 *
 * 15 s deja ocho latidos dentro de la ventana: margen de sobra sin llenar el
 * log de nadie.
 */
const LATIDO_MS = 15_000;

/**
 * La superficie mínima de la respuesta HTTP que este canal necesita.
 *
 * Se declara acá en vez de importar el `Response` de Express por la misma
 * razón que `proveedor/tipos.ts` no importa los tipos del SDK de OpenAI: lo
 * que se quiere es que esto se pueda testear con un objeto literal de cuatro
 * métodos, sin levantar un servidor ni fabricar un socket.
 */
export interface RespuestaStream {
  setHeader(nombre: string, valor: string): void;
  write(chunk: string): unknown;
  end(): void;
  readonly writableEnded: boolean;
  /** Express la expone; empuja las cabeceras antes del primer dato. */
  flushHeaders?(): void;
}

/**
 * Canal `text/event-stream` de un turno del asistente (fase-14-29 tanda 6).
 *
 * Un evento sale como:
 *
 * ```
 * event: herramienta
 * data: {"tipo":"herramienta","nombre":"listar_actividades","estado":"ok"}
 * ```
 *
 * El `data` lleva el evento **entero, con su `tipo` adentro**, y la línea
 * `event:` repite ese mismo tipo. Duplicar parece redundante y no lo es: el
 * cliente hace un `switch` sobre el JSON parseado (una sola fuente de verdad,
 * tipada por `EventoIaSse`), y la línea `event:` es la que hace legible un
 * `curl` cuando algo no anda — que es justamente el escenario donde este
 * archivo se lee.
 *
 * **Escribir después de `cerrar()` no hace nada.** El caso real es el Tutor
 * que cierra la pestaña a mitad de turno: el loop sigue hasta terminar (los
 * tokens ya se están pagando y la contabilidad tiene que escribirse igual,
 * Parte E punto 6) y sus eventos caen en el vacío en vez de explotar contra un
 * socket muerto.
 */
export class CanalSse {
  private latido: ReturnType<typeof setInterval> | null = null;

  private cerrado = false;

  constructor(private readonly res: RespuestaStream) {}

  /**
   * Si ya salió el primer byte.
   *
   * Es lo que separa «todavía puedo contestar un 402 de verdad» de «ya hay un
   * 200 escrito y el error tiene que viajar como evento». El controller
   * decide con esto y con nada más.
   */
  get abierto(): boolean {
    return this.latido !== null;
  }

  /** Manda las cabeceras y arranca el latido. Idempotente. */
  abrir(): void {
    if (this.cerrado || this.latido !== null) {
      return;
    }

    this.res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    // `no-transform` es la mitad que importa: le dice a cualquier proxy del
    // camino que no comprima ni reempaquete el cuerpo, que es la forma en que
    // un stream termina bufferizado y llegando entero al final.
    this.res.setHeader('Cache-Control', 'no-cache, no-transform');
    this.res.setHeader('Connection', 'keep-alive');
    // Convención de nginx (el proxy de la plataforma de deploy) para apagar su
    // buffer de respuesta. No molesta donde no se entiende.
    this.res.setHeader('X-Accel-Buffering', 'no');
    this.res.flushHeaders?.();

    this.latido = setInterval(() => this.escribir(': ping\n\n'), LATIDO_MS);
  }

  enviar(evento: EventoIaSse): void {
    this.escribir(`event: ${evento.tipo}\ndata: ${JSON.stringify(evento)}\n\n`);
  }

  /** Corta el latido y termina la respuesta. Idempotente. */
  cerrar(): void {
    if (this.cerrado) {
      return;
    }

    this.cerrado = true;

    if (this.latido !== null) {
      clearInterval(this.latido);
      this.latido = null;
    }

    if (!this.res.writableEnded) {
      this.res.end();
    }
  }

  /**
   * Marca el canal como muerto **sin tocar la respuesta**: es lo que se llama
   * cuando el cliente se desconectó y el socket ya no existe. Llamar a `end()`
   * ahí no rompe nada, pero tampoco significa nada.
   */
  descartar(): void {
    this.cerrado = true;

    if (this.latido !== null) {
      clearInterval(this.latido);
      this.latido = null;
    }
  }

  private escribir(texto: string): void {
    if (this.cerrado || this.res.writableEnded) {
      return;
    }

    this.res.write(texto);
  }
}
