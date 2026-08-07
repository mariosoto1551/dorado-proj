import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';

import { IconoComponent } from './icono.component';
import { ToastService } from './toast.service';

/**
 * Idioma del reconocimiento (fase-14-32 decisión 9). Fijo a propósito: el
 * producto todavía no tiene i18n, y `navigator.language` rompería el dictado
 * del Tutor argentino que tiene el navegador en inglés — un caso bastante más
 * común que el contrario. Cuando llegue i18n, esto es una constante que se
 * reemplaza por el locale activo.
 */
const IDIOMA = 'es-AR';

/**
 * Tope duro de una sesión de dictado (decisión 6). Con `continuous = true` el
 * micrófono queda abierto hasta que alguien lo cierre; un Tutor que aprieta y
 * se distrae lo deja escuchando la cocina. Al cumplirse se detiene igual que si
 * hubiera apretado el botón: sin error, conservando lo dictado.
 */
const TOPE_MS = 60_000;

/**
 * Lo mínimo que este componente usa de la Web Speech API, declarado a mano.
 *
 * No se depende de que la `lib.dom` del TypeScript instalado traiga estos
 * tipos: es una API con prefijo histórico y soporte disparejo, y escribir las
 * cinco propiedades que se tocan es más barato que descubrir en CI que esta
 * versión del `lib` no las declara.
 */
interface AlternativaReconocida {
  readonly transcript: string;
}

interface ResultadoReconocido {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [indice: number]: AlternativaReconocida;
}

interface ListaResultados {
  readonly length: number;
  readonly [indice: number]: ResultadoReconocido;
}

interface EventoResultado {
  readonly results: ListaResultados;
}

interface EventoErrorReconocimiento {
  readonly error: string;
}

interface Reconocimiento {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((evento: EventoResultado) => void) | null;
  onerror: ((evento: EventoErrorReconocimiento) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type ConstructorReconocimiento = new () => Reconocimiento;

interface VentanaConVoz {
  SpeechRecognition?: ConstructorReconocimiento;
  webkitSpeechRecognition?: ConstructorReconocimiento;
}

function constructorDisponible(): ConstructorReconocimiento | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const ventana = window as unknown as VentanaConVoz;

  return ventana.SpeechRecognition ?? ventana.webkitSpeechRecognition;
}

/**
 * El micrófono solo existe en un contexto seguro: HTTPS, o `localhost` /
 * `127.0.0.1`, que el navegador trata como confiables aunque sean HTTP.
 *
 * Va junto a la detección del constructor y no aparte porque **el constructor
 * existe igual en un contexto inseguro** — Chrome expone
 * `webkitSpeechRecognition` sobre `http://192.168.1.x` y recién falla al
 * arrancar la sesión, con `not-allowed`. Sin este chequeo el botón se dibuja,
 * falla, y el toast manda a habilitar un permiso que el navegador tiene
 * deshabilitado justamente por el protocolo: un consejo imposible de seguir.
 *
 * Es la decisión 3 de la spec aplicada a un caso que no estaba enumerado —
 * *un atajo que no funciona es peor que no tener el atajo*—, no una excepción a
 * ella. En producción (`app-web` va por HTTPS) esto es siempre `true`; el único
 * escenario que apaga el botón es abrir el dev server por IP de LAN, y ahí la
 * salida es el port forwarding de Chrome DevTools contra `localhost`, no un
 * cambio en este archivo. Ver `docs/progreso/fase-14-post-mvp.md`, ítem 32.
 */
function contextoSeguro(): boolean {
  // `isSecureContext` no está en los navegadores más viejos ni en algunos
  // entornos de test: si no se puede saber, no se bloquea.
  return typeof window === 'undefined' || window.isSecureContext !== false;
}

/**
 * Une lo dictado a lo que ya había escrito (decisión 4).
 *
 * Exportada para poder testearla sola: es la única parte con reglas de
 * espaciado, y probarla a través de un micrófono simulado sería probar dos
 * cosas a la vez.
 */
export function unirDictado(base: string, dictado: string): string {
  const limpio = dictado.trim();

  if (limpio === '') {
    return base;
  }

  if (base.trim() === '') {
    return limpio;
  }

  return `${base.replace(/\s+$/, '')} ${limpio}`;
}

/**
 * Mensajes de error del dictado (decisión 7).
 *
 * `no-speech` («apretaste y no dijiste nada») y `aborted` («lo cortaste vos»)
 * no están y no es un olvido: son cosas que el Tutor acaba de hacer, y un toast
 * que informa lo que la persona ya sabe es ruido. Quedan los tres que dicen
 * algo que no se puede deducir desde este lado, y el primero es además el único
 * que el Tutor puede ir a arreglar.
 */
const MENSAJES: Record<string, string> = {
  'not-allowed': 'Falta el permiso de micrófono. Habilitalo en tu navegador y probá de nuevo.',
  'service-not-allowed':
    'Falta el permiso de micrófono. Habilitalo en tu navegador y probá de nuevo.',
  'audio-capture': 'No se encontró un micrófono.',
  network: 'El dictado necesita conexión a internet.',
};

/**
 * Botón de dictado por voz (fase-14-32).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRES COSAS QUE NO SON OBVIAS:
 *
 * 1. **La transcripción la hace el navegador, no el proveedor de IA**
 *    (decisión 1). Este componente no habla con `ai-service` ni con ninguna
 *    API: costo cero y sin consumo de cuota de tokens. Que toda la Web Speech
 *    API esté detrás de este archivo es también lo que haría reversible mover
 *    la transcripción al servidor el día que haga falta.
 *
 * 2. **Dicta sobre lo que ya hay, no lo pisa** (decisión 4). Los resultados
 *    parciales llegan y se corrigen varias veces por segundo, así que escribir
 *    directamente en el borrador borraría el texto a medio escribir al
 *    instante — y no hay undo en un `signal`.
 *
 * 3. **Sin soporte, no renderiza nada** (decisión 3). Un micrófono que al
 *    apretarlo tira un error enseña que la app está rota; no tener micrófono no
 *    enseña nada. Misma regla que `EntradaAsistenteComponent` (#30).
 */
@Component({
  selector: 'app-boton-dictado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `
    @if (soportado) {
      <button
        type="button"
        [class]="clases()"
        [disabled]="deshabilitado()"
        [attr.aria-pressed]="escuchando()"
        [attr.aria-label]="etiqueta()"
        [title]="titulo()"
        (click)="alternar()"
      >
        <span class="h-4 w-4" [class.animate-pulse]="escuchando()">
          <app-icono nombre="microfono" />
        </span>
      </button>

      <!-- La pulsación roja no existe para un lector de pantalla. -->
      <span class="sr-only" aria-live="polite">
        {{ escuchando() ? 'Escuchando' : '' }}
      </span>
    }
  `,
})
export class BotonDictadoComponent {
  /**
   * El borrador sobre el que se dicta. Two-way: se lee al empezar (la base de
   * la decisión 4) y se escribe en cada resultado.
   */
  readonly texto = model.required<string>();

  /**
   * El asistente está pensando. Además de apagar el botón, corta el dictado en
   * curso: sin eso, mandar con Enter mientras se dicta dejaría el micrófono
   * escribiendo sobre un borrador que la página ya vació.
   */
  readonly deshabilitado = input(false);

  protected readonly escuchando = signal(false);

  protected readonly soportado = constructorDisponible() !== undefined && contextoSeguro();

  private readonly toast = inject(ToastService);

  private sesion: Reconocimiento | null = null;

  private base = '';

  private temporizador: ReturnType<typeof setTimeout> | null = null;

  /**
   * Sin borde a propósito: las clases `.boton-neutro` y `.boton-peligro` de
   * shared-ui lo llevan y la del botón de enviar (`.boton-primario`) no, así
   * que con cualquiera de las dos este botón quedaría 2px más alto que su
   * vecino en una fila con `items-end`.
   *
   * Rojo LLENO mientras escucha, no contorneado: es la diferencia entre "hay un
   * botón rojo" y "esto está grabando".
   */
  protected readonly clases = computed(() =>
    this.escuchando()
      ? 'boton shrink-0 bg-red-500 text-white hover:bg-red-600'
      : 'boton shrink-0 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
  );

  protected readonly etiqueta = computed(() =>
    this.escuchando() ? 'Detener el dictado' : 'Dictar por voz'
  );

  protected readonly titulo = computed(() =>
    this.escuchando() ? 'Detener el dictado' : 'Dictar por voz — lo transcribe tu navegador'
  );

  constructor() {
    effect(() => {
      if (this.deshabilitado() && this.escuchando()) {
        this.detener();
      }
    });

    // Navegar fuera de la pantalla con el micrófono abierto lo dejaría abierto.
    inject(DestroyRef).onDestroy(() => this.detener());
  }

  protected alternar(): void {
    if (this.escuchando()) {
      this.detener();

      return;
    }

    this.empezar();
  }

  private empezar(): void {
    const Constructor = constructorDisponible();

    if (!Constructor) {
      return;
    }

    const sesion = new Constructor();

    sesion.lang = IDIOMA;
    // Con `false` el reconocimiento se corta en la primera pausa, y dictarle a
    // un asistente es justamente pararse a pensar en la mitad de la frase.
    sesion.continuous = true;
    sesion.interimResults = true;

    sesion.onresult = (evento) => this.alRecibir(evento);
    sesion.onerror = (evento) => this.alFallar(evento);
    sesion.onend = () => {
      this.escuchando.set(false);
      this.limpiar();
    };

    this.base = this.texto();
    this.sesion = sesion;
    this.escuchando.set(true);
    this.temporizador = setTimeout(() => this.detener(), TOPE_MS);

    try {
      sesion.start();
    } catch {
      // `start()` sobre una sesión ya arrancada tira. No es un error que el
      // Tutor pueda hacer algo con: se deshace el estado y listo.
      this.escuchando.set(false);
      this.limpiar();
    }
  }

  private detener(): void {
    this.sesion?.stop();
    this.escuchando.set(false);
    this.limpiar();
  }

  private limpiar(): void {
    if (this.temporizador !== null) {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }

    this.sesion = null;
  }

  /**
   * Se recorre la lista **entera desde 0** en vez de acumular desde
   * `resultIndex`: el navegador corrige resultados que ya había emitido, y
   * acumular incrementalmente deja esas correcciones afuera. Es O(n) sobre unos
   * segundos de habla — no hay nada que optimizar acá.
   */
  private alRecibir(evento: EventoResultado): void {
    let dictado = '';

    for (let i = 0; i < evento.results.length; i++) {
      const resultado = evento.results[i];

      if (resultado.length > 0) {
        dictado += resultado[0].transcript;
      }
    }

    this.texto.set(unirDictado(this.base, dictado));
  }

  private alFallar(evento: EventoErrorReconocimiento): void {
    const mensaje = MENSAJES[evento.error];

    if (mensaje) {
      this.toast.error(mensaje);
    }

    this.escuchando.set(false);
    this.limpiar();
  }
}
