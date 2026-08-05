import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CanalSse, type RespuestaStream } from './sse';

/** Doble de respuesta HTTP: acumula lo escrito para poder afirmar sobre el texto crudo. */
function crearRespuesta() {
  const cabeceras: Record<string, string> = {};
  const trozos: string[] = [];
  let terminada = false;

  const res: RespuestaStream = {
    setHeader: (nombre, valor) => {
      cabeceras[nombre] = valor;
    },
    write: (chunk) => trozos.push(chunk),
    end: () => {
      terminada = true;
    },
    get writableEnded() {
      return terminada;
    },
  };

  return {
    res,
    cabeceras,
    trozos,
    get terminada() {
      return terminada;
    },
    get texto() {
      return trozos.join('');
    },
  };
}

describe('CanalSse', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('manda las cabeceras que impiden que un proxy bufferee el stream', () => {
    const doble = crearRespuesta();

    new CanalSse(doble.res).abrir();

    expect(doble.cabeceras['Content-Type']).toBe('text/event-stream; charset=utf-8');
    // Las dos que evitan que el cuerpo llegue entero al final en vez de a
    // medida que se produce: no-transform apaga la recompresión intermedia y
    // X-Accel-Buffering apaga el buffer de nginx.
    expect(doble.cabeceras['Cache-Control']).toContain('no-transform');
    expect(doble.cabeceras['X-Accel-Buffering']).toBe('no');
  });

  it('serializa un evento con su nombre y el JSON completo', () => {
    const doble = crearRespuesta();
    const canal = new CanalSse(doble.res);

    canal.abrir();
    canal.enviar({ tipo: 'herramienta', nombre: 'listar_actividades', estado: 'ok' });

    expect(doble.texto).toBe(
      'event: herramienta\n' +
        'data: {"tipo":"herramienta","nombre":"listar_actividades","estado":"ok"}\n\n'
    );
  });

  it('deja el evento en UNA sola línea de data aunque el texto tenga saltos', () => {
    const doble = crearRespuesta();
    const canal = new CanalSse(doble.res);

    canal.abrir();
    canal.enviar({ tipo: 'texto', texto: 'Primera línea.\n\nSegunda línea.' });

    // Un `\n` crudo dentro del data partiría el evento en dos y el cliente
    // leería medio JSON. JSON.stringify lo escapa, y esto lo fija.
    const lineasData = doble.texto.split('\n').filter((linea) => linea.startsWith('data: '));

    expect(lineasData).toHaveLength(1);
    expect(JSON.parse(lineasData[0].slice('data: '.length))).toEqual({
      tipo: 'texto',
      texto: 'Primera línea.\n\nSegunda línea.',
    });
  });

  it('late cada 15 s mientras el turno trabaja', () => {
    const doble = crearRespuesta();
    const canal = new CanalSse(doble.res);

    canal.abrir();
    vi.advanceTimersByTime(31_000);

    expect(doble.trozos.filter((trozo) => trozo === ': ping\n\n')).toHaveLength(2);

    canal.cerrar();
  });

  it('deja de latir al cerrar', () => {
    const doble = crearRespuesta();
    const canal = new CanalSse(doble.res);

    canal.abrir();
    canal.cerrar();
    vi.advanceTimersByTime(60_000);

    expect(doble.texto).toBe('');
    expect(doble.terminada).toBe(true);
  });

  it('ignora lo que se escriba después de cerrar', () => {
    const doble = crearRespuesta();
    const canal = new CanalSse(doble.res);

    canal.abrir();
    canal.cerrar();
    canal.enviar({ tipo: 'fin', tokensConsumidosMes: 10 });

    // El caso real: el Tutor cerró la pestaña y el loop sigue hasta terminar
    // porque los tokens se pagan igual. Sus eventos no tienen que explotar.
    expect(doble.texto).toBe('');
  });

  it('descartar corta el latido sin terminar la respuesta', () => {
    const doble = crearRespuesta();
    const canal = new CanalSse(doble.res);

    canal.abrir();
    canal.descartar();
    vi.advanceTimersByTime(60_000);

    expect(doble.texto).toBe('');
    // El socket ya no existe: llamar a end() no rompe, pero tampoco significa
    // nada, y distinguirlo hace que el controller no invente un cierre limpio
    // sobre una conexión que el cliente ya cortó.
    expect(doble.terminada).toBe(false);
  });

  it('abrir dos veces no arranca dos latidos', () => {
    const doble = crearRespuesta();
    const canal = new CanalSse(doble.res);

    canal.abrir();
    canal.abrir();
    vi.advanceTimersByTime(15_000);

    expect(doble.trozos.filter((trozo) => trozo === ': ping\n\n')).toHaveLength(1);

    canal.cerrar();
  });
});
