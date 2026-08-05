import { describe, expect, it, vi } from 'vitest';

import { PrincipalType, Rol, TenantContext } from '@dorado/shared-types';

import { CuotaIaAgotadaException, ProveedorNoDisponibleException } from '../comun/excepciones';
import type { ConfiguracionService } from '../configuracion/configuracion.service';
import { ConversacionesController } from './conversaciones.controller';
import type { ConversacionesService } from './conversaciones.service';
import type { EmisorProgreso } from './loop.service';

const TENANT: TenantContext = {
  organizacionId: 'org-1',
  grupoIds: ['grupo-1'],
  rol: Rol.TUTOR,
  principalId: 'tutor-1',
  principalType: PrincipalType.TUTOR,
};

const SSE = 'text/event-stream';

/** Doble de la respuesta HTTP con la superficie que usa el controller. */
function crearRespuesta() {
  const escrito: string[] = [];
  const json = vi.fn();
  let terminada = false;
  let alCerrar: (() => void) | null = null;

  const res = {
    setHeader: vi.fn(),
    write: (chunk: string) => escrito.push(chunk),
    end: () => {
      terminada = true;
    },
    get writableEnded() {
      return terminada;
    },
    status: vi.fn(() => ({ json })),
    on: (_evento: 'close', escucha: () => void) => {
      alCerrar = escucha;
    },
  };

  return {
    res,
    json,
    get texto() {
      return escrito.join('');
    },
    get terminada() {
      return terminada;
    },
    cerrarCliente: () => alCerrar?.(),
  };
}

/**
 * @param turno lo que hace el service: recibe el emisor y decide qué emite y
 *              si termina bien o lanza.
 */
function crearControlador(turno: (emitir?: EmisorProgreso) => Promise<unknown>) {
  const conversaciones = {
    crear: vi.fn(async (_t: unknown, _d: unknown, emitir?: EmisorProgreso) => turno(emitir)),
    enviarMensaje: vi.fn(
      async (_t: unknown, _i: string, _x: string, emitir?: EmisorProgreso) => turno(emitir)
    ),
  } as unknown as ConversacionesService;

  const configuracion = {
    tokensConsumidosMes: vi.fn(async () => 4321),
  } as unknown as ConfiguracionService;

  return {
    conversaciones,
    controlador: new ConversacionesController(conversaciones, configuracion),
  };
}

function eventosDe(texto: string): Array<Record<string, unknown>> {
  return texto
    .split('\n')
    .filter((linea) => linea.startsWith('data: '))
    .map((linea) => JSON.parse(linea.slice('data: '.length)) as Record<string, unknown>);
}

describe('ConversacionesController', () => {
  describe('negociación por Accept', () => {
    it('sin text/event-stream contesta el JSON de siempre', async () => {
      const { controlador } = crearControlador(async () => ({ id: 'conv-1' }));
      const doble = crearRespuesta();

      await controlador.enviarMensaje(TENANT, 'conv-1', { texto: 'hola' }, 'application/json', doble.res);

      // Los scripts de verificación y la suite E2E quieren un cuerpo entero
      // que se pueda afirmar de una: ese camino no se rompe por existir el
      // stream.
      expect(doble.res.status).toHaveBeenCalledWith(201);
      expect(doble.json).toHaveBeenCalledWith({ id: 'conv-1' });
      expect(doble.texto).toBe('');
    });

    it('con text/event-stream transmite y cierra con el consumo del mes', async () => {
      const { controlador } = crearControlador(async (emitir) => {
        emitir?.({ tipo: 'texto', texto: 'listo' });

        return {};
      });
      const doble = crearRespuesta();

      await controlador.enviarMensaje(TENANT, 'conv-1', { texto: 'hola' }, SSE, doble.res);

      expect(eventosDe(doble.texto)).toEqual([
        { tipo: 'texto', texto: 'listo' },
        { tipo: 'fin', tokensConsumidosMes: 4321 },
      ]);
      expect(doble.terminada).toBe(true);
    });
  });

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * LA REGLA DE ESTA TANDA, ESCRITA COMO TEST:
   *
   * lo que rebota ANTES de gastar un token sale como status HTTP de verdad;
   * lo que falla DESPUÉS de que el stream empezó sale como evento `error`.
   *
   * Sin el primer caso, un 402 de cuota agotada llegaría al navegador como un
   * `200 OK` con la mala noticia adentro, y el cliente tendría que aprender a
   * leer errores en dos lugares distintos para saber por qué no puede hablar.
   * ─────────────────────────────────────────────────────────────────────────
   */
  describe('errores', () => {
    it('lo que falla antes del primer evento se relanza SIN cerrar la respuesta', async () => {
      const { controlador } = crearControlador(async () => {
        throw new CuotaIaAgotadaException(2_000_000, 2_000_000);
      });
      const doble = crearRespuesta();

      const error = await controlador
        .enviarMensaje(TENANT, 'conv-1', { texto: 'hola' }, SSE, doble.res)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(CuotaIaAgotadaException);
      expect(doble.texto).toBe('');
      // Cerrar acá dejaría al HttpExceptionFilter sin dónde escribir el 402.
      expect(doble.terminada).toBe(false);
    });

    it('lo que falla con el stream abierto viaja como evento con su code de negocio', async () => {
      const { controlador } = crearControlador(async (emitir) => {
        emitir?.({ tipo: 'herramienta', nombre: 'listar_actividades', estado: 'ok' });

        throw new ProveedorNoDisponibleException();
      });
      const doble = crearRespuesta();

      await controlador.enviarMensaje(TENANT, 'conv-1', { texto: 'hola' }, SSE, doble.res);

      expect(eventosDe(doble.texto).at(-1)).toEqual({
        tipo: 'error',
        code: 'PROVEEDOR_NO_DISPONIBLE',
        mensaje: 'El asistente no está disponible en este momento',
      });
      expect(doble.terminada).toBe(true);
    });

    it('un error inesperado no filtra su mensaje al cliente', async () => {
      const { controlador } = crearControlador(async (emitir) => {
        emitir?.({ tipo: 'texto', texto: 'x' });

        throw new Error('connect ECONNREFUSED 10.0.0.4:5432 password=secreto');
      });
      const doble = crearRespuesta();

      await controlador.enviarMensaje(TENANT, 'conv-1', { texto: 'hola' }, SSE, doble.res);

      const ultimo = eventosDe(doble.texto).at(-1) as { code: string; mensaje: string };

      expect(ultimo.code).toBe('ERROR_INTERNO');
      expect(doble.texto).not.toContain('secreto');
      expect(doble.texto).not.toContain('ECONNREFUSED');
    });
  });

  it('si el cliente corta, el turno termina igual y no se escribe nada más', async () => {
    const doble = crearRespuesta();
    const { controlador, conversaciones } = crearControlador(async (emitir) => {
      emitir?.({ tipo: 'herramienta', nombre: 'listar_actividades', estado: 'corriendo' });
      doble.cerrarCliente();
      emitir?.({ tipo: 'texto', texto: 'esto ya no llega a nadie' });

      return {};
    });

    await controlador.enviarMensaje(TENANT, 'conv-1', { texto: 'hola' }, SSE, doble.res);

    // El turno NO se cancela: los tokens ya se están pagando y la
    // contabilidad tiene que llegar al ledger igual (Parte E, punto 6).
    expect(conversaciones.enviarMensaje).toHaveBeenCalled();
    expect(doble.texto).not.toContain('ya no llega');
    expect(eventosDe(doble.texto)).toHaveLength(1);
  });
});
