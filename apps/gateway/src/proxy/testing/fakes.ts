import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Fakes mínimos de req/res para testear los middlewares del Gateway sin
 * levantar un servidor HTTP. Solo para specs.
 */
export interface ReqFakeOpciones {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
}

export function crearReqFake(opciones: ReqFakeOpciones = {}): IncomingMessage {
  return {
    method: opciones.method ?? 'GET',
    url: opciones.url ?? '/',
    headers: opciones.headers ?? {},
    ip: opciones.ip ?? '127.0.0.1',
  } as unknown as IncomingMessage;
}

export interface ResFake extends ServerResponse {
  cuerpo: string;
  cuerpoJson(): Record<string, unknown>;
}

export function crearResFake(): ResFake {
  const headers: Record<string, unknown> = {};

  const res = {
    statusCode: 200,
    headersSent: false,
    cuerpo: '',

    setHeader(nombre: string, valor: unknown) {
      headers[nombre.toLowerCase()] = valor;
      return res;
    },

    getHeader(nombre: string) {
      return headers[nombre.toLowerCase()];
    },

    // express-rate-limit (draft-8) usa el res.append de Express.
    append(nombre: string, valor: unknown) {
      headers[nombre.toLowerCase()] = valor;
      return res;
    },

    end(datos?: unknown) {
      res.headersSent = true;

      if (typeof datos === 'string') {
        res.cuerpo = datos;
      }

      return res;
    },

    cuerpoJson(): Record<string, unknown> {
      return JSON.parse(res.cuerpo) as Record<string, unknown>;
    },
  };

  return res as unknown as ResFake;
}
