import { describe, expect, it } from 'vitest';

import type { EventoIaSse } from '@dorado/shared-types';

import { leerEventosIa } from './sse-parser';

/** Arma un stream que entrega exactamente los trozos que se le pasan. */
function streamDe(...trozos: string[]): ReadableStream<Uint8Array> {
  const codificador = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controlador) {
      for (const trozo of trozos) {
        controlador.enqueue(codificador.encode(trozo));
      }

      controlador.close();
    },
  });
}

async function juntar(stream: ReadableStream<Uint8Array>): Promise<EventoIaSse[]> {
  const eventos: EventoIaSse[] = [];

  for await (const evento of leerEventosIa(stream)) {
    eventos.push(evento);
  }

  return eventos;
}

describe('leerEventosIa', () => {
  it('lee los eventos de un stream bien formado', async () => {
    const eventos = await juntar(
      streamDe(
        'event: herramienta\ndata: {"tipo":"herramienta","nombre":"listar_actividades","estado":"ok"}\n\n',
        'event: fin\ndata: {"tipo":"fin","tokensConsumidosMes":120}\n\n'
      )
    );

    expect(eventos).toEqual([
      { tipo: 'herramienta', nombre: 'listar_actividades', estado: 'ok' },
      { tipo: 'fin', tokensConsumidosMes: 120 },
    ]);
  });

  it('junta un evento partido entre dos chunks', async () => {
    // El transporte no respeta los límites del protocolo: parsear chunk a
    // chunk anda en desarrollo, donde todo entra en un paquete, y se rompe con
    // la primera respuesta larga de producción.
    const eventos = await juntar(
      streamDe('event: texto\ndata: {"tipo":"texto","tex', 'to":"Hola, mundo"}\n\n')
    );

    expect(eventos).toEqual([{ tipo: 'texto', texto: 'Hola, mundo' }]);
  });

  it('separa dos eventos que llegaron en el mismo chunk', async () => {
    const eventos = await juntar(
      streamDe(
        'data: {"tipo":"texto","texto":"a"}\n\ndata: {"tipo":"fin","tokensConsumidosMes":1}\n\n'
      )
    );

    expect(eventos).toHaveLength(2);
  });

  it('ignora los latidos', async () => {
    const eventos = await juntar(
      streamDe(': ping\n\n', 'data: {"tipo":"texto","texto":"a"}\n\n', ': ping\n\n')
    );

    expect(eventos).toEqual([{ tipo: 'texto', texto: 'a' }]);
  });

  it('un bloque ilegible no tumba lo que viene después', async () => {
    const eventos = await juntar(
      streamDe('data: {esto no es json\n\n', 'data: {"tipo":"fin","tokensConsumidosMes":9}\n\n')
    );

    // El texto, la propuesta y el fin siguen valiendo aunque un evento se haya
    // corrompido: descartar la conversación entera sería peor.
    expect(eventos).toEqual([{ tipo: 'fin', tokensConsumidosMes: 9 }]);
  });

  it('descarta un evento sin cerrar en vez de entregarlo a medias', async () => {
    const eventos = await juntar(streamDe('data: {"tipo":"texto","texto":"corta'));

    // Sin el `\n\n` final el evento nunca se completó. Entregar medio JSON
    // sería peor que no entregar nada.
    expect(eventos).toEqual([]);
  });

  it('un stream vacío no entrega nada y termina', async () => {
    expect(await juntar(streamDe())).toEqual([]);
  });
});
