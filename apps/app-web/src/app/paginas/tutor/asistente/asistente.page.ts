import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import type {
  ConversacionIaDto,
  EventoIaSse,
  MensajeIaDto,
  PropuestaIaDto,
  ResultadoOperacionIa,
} from '@dorado/shared-types';
import { EstadoVacioComponent } from '@dorado/shared-ui';

import { EncabezadoPaginaComponent } from '../../../componentes/encabezado-pagina.component';
import { IconoComponent } from '../../../componentes/icono.component';
import { ToastService } from '../../../componentes/toast.service';
import { ActivityApiService } from '../../../core/api/activity-api.service';
import { IaApiService, ErrorIa } from '../../../core/api/ia-api.service';
import { IdentityApiService } from '../../../core/api/identity-api.service';
import { RewardsApiService } from '../../../core/api/rewards-api.service';
import { aplicarOperaciones, resumirAplicado } from '../../../core/aplicar-propuesta';
import { describirHerramienta, type EstadoHerramienta } from '../../../core/herramientas-ia';
import type { ContextoPropuesta } from '../../../core/propuesta-ia';
import { BurbujaMensajeComponent } from './burbuja-mensaje.component';
import { PanelConversacionesComponent } from './panel-conversaciones.component';
import { TarjetaPropuestaComponent } from './tarjeta-propuesta.component';

/** Una línea del rastro de progreso del turno en curso. */
interface PasoHerramienta {
  nombre: string;
  estado: EstadoHerramienta;
}

/** Arranques sugeridos: con el chat vacío, la pantalla no puede ser un cursor. */
const SUGERENCIAS = [
  'Armame un catálogo de actividades para arrancar',
  '¿Qué actividad no hace nadie nunca?',
  '¿Están bien los precios de la tienda?',
  'Explicame por qué bajó de zona el que más bajó',
];

/**
 * El asistente de IA del Tutor (fase-14-29 Parte F).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOS COSAS QUE ESTA PANTALLA HACE Y QUE NO SON OBVIAS:
 *
 * 1. **El «Aplicar» lo ejecuta ella, con el JWT del Tutor, contra los endpoints
 *    públicos de siempre** (decisión 6). `ai-service` no tiene ningún camino de
 *    escritura hacia otro servicio: cada operación viaja con su método, su ruta
 *    y su body, y esto hace un `for`. Es la razón por la que un bug del
 *    asistente no puede escribir nada que el Tutor no pudiera escribir a mano.
 *
 * 2. **Carga el estado del grupo aunque no lo muestre.** Actividades, productos,
 *    rendimientos, roles, personas y equipos se piden para que la tarjeta de
 *    propuesta pueda decir el valor viejo al lado del nuevo y traducir uuids a
 *    nombres. Sin eso la tarjeta sigue funcionando, pero muestra menos —y una
 *    edición sin el «antes» es media edición.
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Component({
  selector: 'app-asistente',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    EncabezadoPaginaComponent,
    EstadoVacioComponent,
    IconoComponent,
    BurbujaMensajeComponent,
    PanelConversacionesComponent,
    TarjetaPropuestaComponent,
  ],
  template: `
    <section class="mx-auto flex h-[calc(100dvh-4rem)] max-w-3xl flex-col px-4 py-6">
      <div class="flex items-start gap-3">
        <app-encabezado-pagina
          class="min-w-0 flex-1"
          titulo="Asistente"
          subtitulo="Te ayuda a armar el catálogo, revisar precios y entender qué pasa en el grupo."
        />
        <button
          type="button"
          class="boton boton-neutro boton-sm shrink-0"
          (click)="panelAbierto.set(true)"
        >
          Historial
        </button>
      </div>

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else if (motivoBloqueo(); as motivo) {
        <ui-estado-vacio class="mt-6">{{ motivo }}</ui-estado-vacio>
      } @else {
        <!-- Conversación -->
        <div
          #hilo
          class="mt-4 flex-1 space-y-3 overflow-y-auto rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/40"
        >
          @if (mensajes().length === 0 && !ocupado()) {
            <div class="py-6 text-center">
              <span
                class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-marca-50 text-marca-600 dark:bg-marca-900/40 dark:text-marca-300"
              >
                <span class="h-6 w-6"><app-icono nombre="chispa" /></span>
              </span>
              <p class="mt-3 text-sm text-slate-500 dark:text-slate-400">
                Preguntale lo que quieras sobre este grupo. Lee todo, no cambia
                nada: lo que proponga te lo muestra para que decidas vos.
              </p>
              <div class="mt-4 flex flex-wrap justify-center gap-2">
                @for (sugerencia of sugerencias; track sugerencia) {
                  <button
                    type="button"
                    class="rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition hover:border-marca-400 hover:text-marca-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-marca-600"
                    (click)="enviar(sugerencia)"
                  >
                    {{ sugerencia }}
                  </button>
                }
              </div>
            </div>
          }

          <!--
            El orden de este bloque es el orden en que pasaron las cosas, y no
            es casual: el rastro va pegado al mensaje del usuario que lo
            disparó, y las tarjetas al final. La primera versión las ponía
            arriba del rastro y se leía al revés de como había ocurrido.
          -->
          @for (mensaje of mensajes(); track mensaje.id) {
            <app-burbuja-mensaje [mensaje]="mensaje" />

            @if (mensaje.id === ultimoDelUsuarioId() && pasos().length > 0) {
              <ul class="animate-fade-in space-y-1 pl-1">
                @for (paso of pasos(); track $index) {
                  <li class="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                    <span class="w-4 text-center">
                      @if (paso.estado === 'corriendo') {
                        <span class="inline-block animate-spin">⟳</span>
                      } @else if (paso.estado === 'ok') {
                        ✓
                      } @else {
                        ✗
                      }
                    </span>
                    {{ describir(paso) }}
                  </li>
                }
              </ul>
            }
          }

          @for (propuesta of propuestas(); track propuesta.id) {
            <app-tarjeta-propuesta
              [propuesta]="propuesta"
              [contexto]="contexto()"
              [enCurso]="operacionEnCurso()"
              [aplicando]="aplicandoId() === propuesta.id"
              [resultados]="resultadosDe(propuesta)"
              (aplicar)="aplicar(propuesta, $event)"
              (descartar)="descartar(propuesta)"
            />
          }

          @if (ocupado()) {
            <p class="animate-pulse pl-1 text-xs text-slate-400 dark:text-slate-500">
              Pensando…
            </p>
          }

          @if (error(); as texto) {
            <p
              class="animate-fade-in rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-500/10 dark:text-red-300"
            >
              {{ texto }}
            </p>
          }
        </div>

        <!-- Redacción -->
        <form class="mt-3 flex items-end gap-2" (submit)="enviarDelForm($event)">
          <textarea
            class="campo max-h-32 flex-1 resize-none"
            rows="1"
            placeholder="Escribí acá…"
            [(ngModel)]="borrador"
            [ngModelOptions]="{ standalone: true }"
            [disabled]="ocupado()"
            (keydown)="alTeclear($event)"
          ></textarea>
          <button
            type="submit"
            class="boton boton-primario shrink-0"
            [disabled]="ocupado() || borrador().trim() === ''"
            aria-label="Enviar"
          >
            <span class="h-4 w-4"><app-icono nombre="chevron" /></span>
          </button>
        </form>

        @if (consumo(); as texto) {
          <p class="mt-1.5 text-center text-[11px] text-slate-400 dark:text-slate-600">
            {{ texto }}
          </p>
        }
      }
    </section>

    <app-panel-conversaciones
      [abierto]="panelAbierto()"
      [conversaciones]="conversaciones()"
      [activaId]="conversacionId()"
      (elegir)="abrir($event)"
      (nueva)="empezarNueva()"
      (cerrar)="panelAbierto.set(false)"
    />
  `,
})
export class AsistentePage {
  private readonly ruta = inject(ActivatedRoute);

  private readonly ia = inject(IaApiService);

  private readonly activity = inject(ActivityApiService);

  private readonly rewards = inject(RewardsApiService);

  private readonly identity = inject(IdentityApiService);

  private readonly toast = inject(ToastService);

  private readonly hilo = viewChild<ElementRef<HTMLElement>>('hilo');

  protected readonly sugerencias = SUGERENCIAS;

  protected readonly borrador = signal('');

  protected readonly cargando = signal(true);

  protected readonly ocupado = signal(false);

  protected readonly error = signal<string | null>(null);

  protected readonly panelAbierto = signal(false);

  protected readonly conversaciones = signal<ConversacionIaDto[]>([]);

  protected readonly conversacionId = signal<string | null>(null);

  protected readonly mensajes = signal<MensajeIaDto[]>([]);

  protected readonly propuestas = signal<PropuestaIaDto[]>([]);

  protected readonly pasos = signal<PasoHerramienta[]>([]);

  protected readonly contexto = signal<ContextoPropuesta>({});

  protected readonly aplicandoId = signal<string | null>(null);

  protected readonly operacionEnCurso = signal<string | null>(null);

  /** Resultados de lo que se está aplicando ahora (los ya guardados van en el DTO). */
  private readonly resultadosEnVivo = signal<ResultadoOperacionIa[]>([]);

  private readonly grupoId = signal<string>('');

  protected readonly configuracion = this.ia.configuracion;

  /**
   * El último mensaje del usuario: es de quien cuelga el rastro de progreso.
   *
   * Colgarlo del final de la lista no serviría — cuando llega la respuesta del
   * asistente, esa pasa a ser la última y el rastro quedaría **debajo** del
   * texto que produjo, o sea al revés de como ocurrió.
   */
  protected readonly ultimoDelUsuarioId = computed(() => {
    const mensajes = this.mensajes();

    for (let i = mensajes.length - 1; i >= 0; i -= 1) {
      if (mensajes[i].rol === 'USUARIO') {
        return mensajes[i].id;
      }
    }

    return null;
  });

  /**
   * Por qué no se puede usar, en las palabras del problema y no del sistema.
   * Los tres motivos se resuelven de formas distintas y la pantalla lo dice.
   */
  protected readonly motivoBloqueo = computed<string | null>(() => {
    const estado = this.configuracion();

    if (!estado || estado.puedeUsarse) {
      return null;
    }

    if (!estado.disponibleEnPlan) {
      return 'El asistente viene con el plan PRO. Con el plan actual, esta pantalla no hace nada.';
    }

    if (!estado.habilitada) {
      return (
        'El asistente todavía no está prendido en esta organización. Lo prende el ' +
        'administrador desde el panel de la organización, aceptando el aviso sobre qué ' +
        'datos del grupo se envían para generar las respuestas.'
      );
    }

    return (
      'Se agotó la cuota de este mes. Vuelve a estar disponible el mes que viene, o ' +
      'escribinos si necesitás más.'
    );
  });

  protected readonly consumo = computed(() => {
    const estado = this.configuracion();

    if (!estado?.puedeUsarse || estado.cuotaTokensMensuales === null) {
      return null;
    }

    const porcentaje = (estado.tokensConsumidosMes / estado.cuotaTokensMensuales) * 100;

    // Una conversación entera come ~0,4% de la cuota de PRO, así que redondear
    // deja «0%» después de haber gastado dinero de verdad — que suena a que el
    // contador no anda. Con «menos del 1%» se entiende que sí cuenta.
    if (porcentaje > 0 && porcentaje < 1) {
      return 'Consumo del mes: menos del 1% de la cuota de la organización';
    }

    return `Consumo del mes: ${Math.round(porcentaje)}% de la cuota de la organización`;
  });

  constructor() {
    // Baja el hilo al fondo cada vez que aparece algo nuevo: en una respuesta
    // que tarda 40 segundos, tener que scrollear para ver el progreso es lo
    // mismo que no tenerlo.
    effect(() => {
      this.mensajes();
      this.pasos();
      this.propuestas();
      queueMicrotask(() => {
        const elemento = this.hilo()?.nativeElement;

        if (elemento) {
          elemento.scrollTop = elemento.scrollHeight;
        }
      });
    });

    void this.iniciar();
  }

  // ── Arranque ──────────────────────────────────────────────────────────────

  private async iniciar(): Promise<void> {
    const grupoId = this.ruta.snapshot.paramMap.get('grupoId') ?? '';

    this.grupoId.set(grupoId);

    const estado = await this.ia.cargarConfiguracion();

    if (estado?.puedeUsarse) {
      await Promise.all([this.cargarConversaciones(), this.cargarContexto()]);
    }

    this.cargando.set(false);

    // Entrada desde otra pantalla («Pedirle ayuda a la IA»): la pregunta ya
    // viene armada y se manda sola. Si el Tutor tuviera que apretar Enter
    // sobre un texto que él no escribió, el atajo no ahorraría nada.
    const pregunta = this.ruta.snapshot.queryParamMap.get('pregunta');

    if (pregunta && estado?.puedeUsarse) {
      void this.enviar(pregunta);
    }
  }

  private async cargarConversaciones(): Promise<void> {
    try {
      this.conversaciones.set(
        await firstValueFrom(this.ia.listarConversaciones(this.grupoId()))
      );
    } catch {
      // El historial es accesorio: sin él se puede conversar igual.
      this.conversaciones.set([]);
    }
  }

  /**
   * El estado del grupo que necesita la tarjeta para decir «antes».
   *
   * Cada pedazo se resuelve por separado (`allSettled`, no `all`): que falle el
   * listado de equipos no puede dejar la tarjeta sin los nombres de las
   * actividades, que es lo que más se usa.
   */
  private async cargarContexto(): Promise<void> {
    const grupoId = this.grupoId();
    const [actividades, conductas, productos, rendimientos, roles, personas, equipos] =
      await Promise.allSettled([
        firstValueFrom(this.activity.listarActividades(grupoId, 'ACTIVA')),
        firstValueFrom(this.activity.listarConductas(grupoId, 'ACTIVA')),
        firstValueFrom(this.rewards.tienda(grupoId)),
        firstValueFrom(this.rewards.rendimientosAcciones(grupoId)),
        firstValueFrom(this.identity.listarRolesGrupo(grupoId)),
        firstValueFrom(this.identity.listarUsuarios(grupoId)),
        firstValueFrom(this.identity.listarEquipos(grupoId)),
      ]);

    this.contexto.set({
      actividades: valorDe(actividades) ?? [],
      conductas: valorDe(conductas) ?? [],
      productos: valorDe(productos) ?? [],
      rendimientos: [
        ...(valorDe(rendimientos)?.actividades ?? []),
        ...(valorDe(rendimientos)?.conductas ?? []),
      ],
      roles: mapaDe(valorDe(roles)),
      personas: mapaDe(valorDe(personas)),
      equipos: mapaDe(valorDe(equipos)),
    });
  }

  // ── Conversación ──────────────────────────────────────────────────────────

  protected alTeclear(evento: KeyboardEvent): void {
    // Enter manda, Shift+Enter hace un salto de línea: es lo que la mano ya
    // sabe hacer en cualquier chat.
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault();
      void this.enviar(this.borrador());
    }
  }

  protected enviarDelForm(evento: Event): void {
    evento.preventDefault();
    void this.enviar(this.borrador());
  }

  protected async enviar(texto: string): Promise<void> {
    const limpio = texto.trim();

    if (limpio === '' || this.ocupado()) {
      return;
    }

    this.borrador.set('');
    this.error.set(null);
    this.pasos.set([]);
    this.ocupado.set(true);

    // Optimista: la burbuja aparece al instante y el evento `mensaje` del
    // stream la reemplaza por la fila real del ledger.
    const provisorio: MensajeIaDto = {
      id: `provisorio-${Date.now()}`,
      rol: 'USUARIO',
      contenido: limpio,
      herramienta: null,
      createdAt: new Date().toISOString(),
    };

    this.mensajes.update((previos) => [...previos, provisorio]);

    const id = this.conversacionId();

    try {
      const stream = this.ia.conversar(
        id
          ? { tipo: 'seguir', conversacionId: id, texto: limpio }
          : { tipo: 'nueva', grupoId: this.grupoId(), texto: limpio }
      );

      for await (const evento of stream) {
        this.aplicarEvento(evento, provisorio.id);
      }
    } catch (error) {
      this.error.set(
        error instanceof ErrorIa ? error.message : 'El asistente no pudo responder.'
      );
    } finally {
      this.ocupado.set(false);
    }
  }

  private aplicarEvento(evento: EventoIaSse, provisorioId: string): void {
    switch (evento.tipo) {
      case 'conversacion':
        this.conversacionId.set(evento.conversacion.id);
        this.conversaciones.update((previas) => [evento.conversacion, ...previas]);
        break;

      case 'mensaje':
        this.mensajes.update((previos) =>
          previos.map((mensaje) => (mensaje.id === provisorioId ? evento.mensaje : mensaje))
        );
        break;

      case 'herramienta':
        this.pasos.update((previos) => {
          // El `corriendo` abre una línea y el `ok`/`error` cierra LA ÚLTIMA
          // abierta con ese nombre. Un turno puede pedir la misma herramienta
          // dos veces, y cerrar la primera dejaría una girando para siempre.
          const abierto = indiceDelUltimoAbierto(previos, evento.nombre);

          if (evento.estado === 'corriendo' || abierto === -1) {
            return [...previos, { nombre: evento.nombre, estado: evento.estado }];
          }

          return previos.map((paso, i) =>
            i === abierto ? { ...paso, estado: evento.estado } : paso
          );
        });
        break;

      case 'texto':
        this.mensajes.update((previos) => [
          ...previos,
          {
            id: `respuesta-${Date.now()}`,
            rol: 'ASISTENTE',
            contenido: evento.texto,
            herramienta: null,
            createdAt: new Date().toISOString(),
          },
        ]);
        break;

      case 'propuesta':
        this.propuestas.update((previas) => [...previas, evento.propuesta]);
        break;

      case 'fin':
        this.ia.actualizarConsumo(evento.tokensConsumidosMes);
        this.pasos.set([]);
        break;

      case 'error':
        this.error.set(evento.mensaje);
        break;
    }
  }

  protected async abrir(id: string): Promise<void> {
    this.panelAbierto.set(false);

    if (id === this.conversacionId()) {
      return;
    }

    this.cargando.set(true);

    try {
      const detalle = await firstValueFrom(this.ia.detalleConversacion(id));

      this.conversacionId.set(id);
      this.mensajes.set(detalle.mensajes);
      this.propuestas.set(detalle.propuestas);
      this.error.set(null);
      this.pasos.set([]);
    } catch {
      this.toast.error('No se pudo abrir esa conversación.');
    } finally {
      this.cargando.set(false);
    }
  }

  protected empezarNueva(): void {
    this.panelAbierto.set(false);
    this.conversacionId.set(null);
    this.mensajes.set([]);
    this.propuestas.set([]);
    this.pasos.set([]);
    this.error.set(null);
  }

  // ── Propuestas ────────────────────────────────────────────────────────────

  /**
   * Solo lo que se está aplicando **ahora**. El resultado ya guardado lo saca
   * la tarjeta de la propia propuesta: duplicar ese fallback acá sería una
   * segunda fuente de verdad para lo mismo.
   */
  protected resultadosDe(propuesta: PropuestaIaDto): readonly ResultadoOperacionIa[] {
    return this.aplicandoId() === propuesta.id ? this.resultadosEnVivo() : [];
  }

  /**
   * El «Aplicar»: un `for` sobre las operaciones, con el JWT del Tutor.
   *
   * Una que falla no aborta el resto (decisión 13) y el resultado se informa
   * después a `POST /ai/propuestas/:id/aplicada` — que **solo registra**: ese
   * endpoint no escribe en ningún otro servicio.
   */
  protected async aplicar(propuesta: PropuestaIaDto, soloEstas?: string[]): Promise<void> {
    this.aplicandoId.set(propuesta.id);
    this.resultadosEnVivo.set([]);

    const resultados = await aplicarOperaciones(
      propuesta.operaciones,
      (operacion) => {
        this.operacionEnCurso.set(operacion.opId);

        return this.ia.ejecutarOperacion(operacion);
      },
      {
        soloEstas,
        onFila: (fila) => this.resultadosEnVivo.update((previos) => [...previos, fila]),
      }
    );

    this.operacionEnCurso.set(null);

    try {
      const guardada = await firstValueFrom(this.ia.registrarAplicada(propuesta.id, resultados));

      this.reemplazarPropuesta(guardada);
    } catch {
      // El registro es contabilidad: si falla, lo aplicado ya está aplicado y
      // no hay que decirle al Tutor que no pasó nada.
      this.toast.error('Los cambios se aplicaron, pero no se pudo registrar el resultado.');
    }

    const resumen = resumirAplicado(resultados);

    if (resumen.todoBien) {
      this.toast.exito(`Listo: ${resumen.ok} ${resumen.ok === 1 ? 'cambio' : 'cambios'}.`);
    } else {
      this.toast.error(
        `${resumen.ok} de ${resultados.length} se aplicaron; ${resumen.fallaron} fallaron.`
      );
    }

    this.aplicandoId.set(null);
    await this.cargarContexto();
  }

  protected async descartar(propuesta: PropuestaIaDto): Promise<void> {
    try {
      this.reemplazarPropuesta(await firstValueFrom(this.ia.descartarPropuesta(propuesta.id)));
    } catch {
      this.toast.error('No se pudo descartar la propuesta.');
    }
  }

  private reemplazarPropuesta(propuesta: PropuestaIaDto): void {
    this.propuestas.update((previas) =>
      previas.map((fila) => (fila.id === propuesta.id ? propuesta : fila))
    );
  }

  protected describir(paso: PasoHerramienta): string {
    return describirHerramienta(paso.nombre, paso.estado);
  }
}

/** `findLastIndex` a mano: el `lib` de este proyecto todavía no llega a es2023. */
function indiceDelUltimoAbierto(pasos: readonly PasoHerramienta[], nombre: string): number {
  for (let i = pasos.length - 1; i >= 0; i -= 1) {
    if (pasos[i].nombre === nombre && pasos[i].estado === 'corriendo') {
      return i;
    }
  }

  return -1;
}

function valorDe<T>(resultado: PromiseSettledResult<T>): T | undefined {
  return resultado.status === 'fulfilled' ? resultado.value : undefined;
}

function mapaDe(
  filas: ReadonlyArray<{ id: string; nombre: string }> | undefined
): ReadonlyMap<string, string> {
  return new Map((filas ?? []).map((fila) => [fila.id, fila.nombre]));
}
