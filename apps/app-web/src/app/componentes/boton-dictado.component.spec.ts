import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BotonDictadoComponent, unirDictado } from './boton-dictado.component';
import { ToastService } from './toast.service';

/** Una pieza de habla como la entrega el navegador. */
interface Pieza {
  texto: string;
  final: boolean;
}

/**
 * La Web Speech API, falsificada.
 *
 * No existe en jsdom, así que sin esto no hay nada que testear. Se stubbea el
 * **constructor global** y no el componente: así lo que corre en el test es el
 * mismo camino que corre en el navegador —detección, configuración de la
 * sesión, acumulación de resultados y limpieza—, y lo único distinto es de
 * dónde sale el audio.
 */
class ReconocimientoFalso {
  static ultima: ReconocimientoFalso | null = null;

  lang = '';

  continuous = false;

  interimResults = false;

  onresult: ((evento: { results: unknown }) => void) | null = null;

  onerror: ((evento: { error: string }) => void) | null = null;

  onend: (() => void) | null = null;

  arranques = 0;

  frenadas = 0;

  constructor() {
    ReconocimientoFalso.ultima = this;
  }

  start(): void {
    this.arranques++;
  }

  stop(): void {
    this.frenadas++;
  }

  abort(): void {
    this.frenadas++;
  }

  /** Emite la lista COMPLETA de resultados, que es como llega de verdad. */
  emitir(...piezas: Pieza[]): void {
    const results = piezas.map((pieza) => ({
      isFinal: pieza.final,
      length: 1,
      0: { transcript: pieza.texto },
    }));

    this.onresult?.({ results });
  }

  fallar(error: string): void {
    this.onerror?.({ error });
  }
}

@Component({
  imports: [BotonDictadoComponent],
  template: `<app-boton-dictado [(texto)]="borrador" [deshabilitado]="ocupado()" />`,
})
class Anfitrion {
  readonly borrador = signal('');

  readonly ocupado = signal(false);
}

describe('BotonDictadoComponent', () => {
  let fixture: ComponentFixture<Anfitrion>;
  let anfitrion: Anfitrion;
  let errores: string[];

  const boton = (): HTMLButtonElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector('button');

  const sesion = (): ReconocimientoFalso => {
    const ultima = ReconocimientoFalso.ultima;

    if (!ultima) {
      throw new Error('No se creó ninguna sesión de reconocimiento');
    }

    return ultima;
  };

  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const montar = async (): Promise<void> => {
    await TestBed.configureTestingModule({
      imports: [Anfitrion],
      providers: [
        {
          provide: ToastService,
          useValue: {
            error: (texto: string) => errores.push(texto),
            exito: () => undefined,
            info: () => undefined,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Anfitrion);
    anfitrion = fixture.componentInstance;
    await render();
  };

  const dictar = async (...piezas: Pieza[]): Promise<void> => {
    boton()?.click();
    await render();
    sesion().emitir(...piezas);
    await render();
  };

  beforeEach(() => {
    errores = [];
    ReconocimientoFalso.ultima = null;
    (globalThis as Record<string, unknown>)['SpeechRecognition'] = ReconocimientoFalso;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['SpeechRecognition'];
    delete (globalThis as Record<string, unknown>)['webkitSpeechRecognition'];
    TestBed.resetTestingModule();
  });

  describe('unirDictado', () => {
    it('sobre un borrador vacío deja solo lo dictado', () => {
      expect(unirDictado('', ' hola ')).toBe('hola');
    });

    it('sobre un borrador con texto agrega con un solo espacio', () => {
      expect(unirDictado('Armame un catálogo', ' para un chico de 8')).toBe(
        'Armame un catálogo para un chico de 8'
      );
      expect(unirDictado('Armame un catálogo ', 'para un chico de 8')).toBe(
        'Armame un catálogo para un chico de 8'
      );
    });

    it('un dictado vacío no toca la base (ni le agrega un espacio)', () => {
      expect(unirDictado('Armame un catálogo', '   ')).toBe('Armame un catálogo');
    });
  });

  describe('soporte del navegador', () => {
    it('sin la API, no renderiza nada — ni botón ni hueco', async () => {
      delete (globalThis as Record<string, unknown>)['SpeechRecognition'];
      await montar();

      expect(boton()).toBeNull();
      expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('');
    });

    it('con el prefijo `webkit` alcanza', async () => {
      delete (globalThis as Record<string, unknown>)['SpeechRecognition'];
      (globalThis as Record<string, unknown>)['webkitSpeechRecognition'] = ReconocimientoFalso;
      await montar();

      expect(boton()).not.toBeNull();
    });

    it('en un contexto inseguro tampoco, aunque el constructor exista', async () => {
      // Encontrado usando la app: Chrome expone `webkitSpeechRecognition` sobre
      // `http://192.168.1.x` y recién falla al arrancar la sesión. Sin este
      // chequeo el botón se dibuja, muere con `not-allowed`, y el toast manda a
      // habilitar un permiso que el navegador tiene deshabilitado justamente
      // por el protocolo — un consejo imposible de seguir.
      const original = Object.getOwnPropertyDescriptor(window, 'isSecureContext');

      Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });

      try {
        await montar();

        expect(boton()).toBeNull();
      } finally {
        if (original) {
          Object.defineProperty(window, 'isSecureContext', original);
        } else {
          delete (window as unknown as Record<string, unknown>)['isSecureContext'];
        }
      }
    });
  });

  describe('dictado', () => {
    beforeEach(async () => {
      await montar();
    });

    it('arranca la sesión en es-AR, continua y con parciales', async () => {
      boton()?.click();
      await render();

      expect(sesion().arranques).toBe(1);
      expect(sesion().lang).toBe('es-AR');
      // `continuous` en false cortaría en la primera pausa, y dictarle a un
      // asistente es pararse a pensar en la mitad de la frase.
      expect(sesion().continuous).toBe(true);
      expect(sesion().interimResults).toBe(true);
    });

    it('escribe lo dictado en el borrador y NO lo envía', async () => {
      await dictar({ texto: 'armame un catálogo', final: true });

      expect(anfitrion.borrador()).toBe('armame un catálogo');
    });

    it('agrega a lo que ya había escrito en vez de pisarlo', async () => {
      anfitrion.borrador.set('Armame un catálogo');
      await render();

      await dictar({ texto: ' para un chico de 8', final: true });

      expect(anfitrion.borrador()).toBe('Armame un catálogo para un chico de 8');
    });

    it('respeta las correcciones del navegador sobre resultados ya emitidos', async () => {
      // El navegador reemite la lista entera con el resultado corregido. Si el
      // componente acumulara desde `resultIndex`, la corrección se perdería y
      // quedaría el texto viejo pegado al nuevo.
      await dictar({ texto: 'armame un catalo', final: false });
      expect(anfitrion.borrador()).toBe('armame un catalo');

      sesion().emitir({ texto: 'armame un catálogo', final: true });
      await render();

      expect(anfitrion.borrador()).toBe('armame un catálogo');
    });

    it('un segundo click detiene', async () => {
      boton()?.click();
      await render();
      expect(boton()?.getAttribute('aria-pressed')).toBe('true');

      boton()?.click();
      await render();

      expect(sesion().frenadas).toBe(1);
      expect(boton()?.getAttribute('aria-pressed')).toBe('false');
    });

    it('el `onend` del navegador apaga el estado', async () => {
      boton()?.click();
      await render();

      sesion().onend?.();
      await render();

      expect(boton()?.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('errores', () => {
    beforeEach(async () => {
      await montar();
    });

    it('sin permiso avisa qué hay que hacer', async () => {
      boton()?.click();
      await render();

      sesion().fallar('not-allowed');
      await render();

      expect(errores).toHaveLength(1);
      expect(errores[0]).toContain('permiso de micrófono');
      expect(boton()?.getAttribute('aria-pressed')).toBe('false');
    });

    it('apretar y no decir nada no muestra nada', async () => {
      boton()?.click();
      await render();

      sesion().fallar('no-speech');
      await render();

      expect(errores).toEqual([]);
    });

    it('cortarlo uno mismo tampoco', async () => {
      boton()?.click();
      await render();

      sesion().fallar('aborted');
      await render();

      expect(errores).toEqual([]);
    });
  });

  describe('cierres del micrófono que no dependen del Tutor', () => {
    it('a los 60 segundos se cierra solo, sin error y conservando lo dictado', async () => {
      vi.useFakeTimers();

      try {
        await montar();
        await dictar({ texto: 'armame un catálogo', final: true });

        vi.advanceTimersByTime(60_000);
        await render();

        expect(sesion().frenadas).toBe(1);
        expect(errores).toEqual([]);
        expect(anfitrion.borrador()).toBe('armame un catálogo');
      } finally {
        vi.useRealTimers();
      }
    });

    it('mandar mientras se dicta corta el dictado', async () => {
      await montar();
      boton()?.click();
      await render();

      anfitrion.ocupado.set(true);
      await render();

      expect(sesion().frenadas).toBe(1);
      expect(boton()?.disabled).toBe(true);
    });

    it('irse de la pantalla cierra el micrófono', async () => {
      await montar();
      boton()?.click();
      await render();

      fixture.destroy();

      expect(sesion().frenadas).toBe(1);
    });
  });
});
