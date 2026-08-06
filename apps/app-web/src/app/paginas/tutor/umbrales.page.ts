import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { UmbralZonaDto } from '@dorado/shared-types';
import { ConfirmDialogComponent, ZonaBadgeComponent, EstadoVacioComponent, CampoComponent, ModalComponent } from '@dorado/shared-ui';

import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina.component';
import { EntradaAsistenteComponent } from '../../componentes/entrada-asistente.component';
import { IconoComponent } from '../../componentes/icono.component';
import { ToastService } from '../../componentes/toast.service';
import type { CrearUmbralRequest } from '../../core/api/api.types';
import { mensajeDeError } from '../../core/api/errores';
import { ScoringApiService } from '../../core/api/scoring-api.service';

interface FormUmbral {
  nombreZona: string;
  orden: number;
  puntosMin: number;
  sinTope: boolean;
  puntosMax: number;
  colorHex: string;
}

const FORM_VACIO: FormUmbral = {
  nombreZona: '',
  orden: 1,
  puntosMin: 0,
  sinTope: false,
  puntosMax: 100,
  colorHex: '#22C55E',
};

/** CRUD de Umbrales de zona (fase-10) con validación de contigüidad para feedback inmediato. */
@Component({
  selector: 'app-umbrales',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, CampoComponent, EstadoVacioComponent, 
    FormsModule,
    EncabezadoPaginaComponent,
    EntradaAsistenteComponent,
    IconoComponent,
    ConfirmDialogComponent,
    ZonaBadgeComponent,
  ],
  template: `
    <section class="mx-auto max-w-3xl px-4 py-6">
      <app-encabezado-pagina titulo="Zonas" subtitulo="Los rangos de puntos y su color.">
        <button
          type="button"
          (click)="abrirNueva()"
          class="boton boton-primario"
        >
          <span class="h-4 w-4"><app-icono nombre="plus" /></span>
          Nueva
        </button>
      </app-encabezado-pagina>

      <!-- Base de puntos iniciales por semana (fase-14) -->
      <div class="mt-5 tarjeta">
        <label for="puntosIniciales" class="block text-sm font-semibold text-slate-700 dark:text-slate-200">
          Puntos iniciales
        </label>
        <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Con cuántos puntos arranca cada participante al empezar una semana. 0 = arrancan en cero.
        </p>
        <div class="mt-2 flex items-center gap-2">
          <input
            id="puntosIniciales"
            [(ngModel)]="puntosIniciales"
            name="puntosIniciales"
            type="number"
            min="0"
            class="w-32 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 transition-colors focus:border-marca-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
          />
          <button type="button" (click)="guardarConfig()" [disabled]="guardandoConfig()" class="btn-primario">
            {{ guardandoConfig() ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </div>

      @if (avisoContinuidad(); as aviso) {
        <p class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
          ⚠ {{ aviso }}
        </p>
      }

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else if (umbrales().length === 0) {
        <ui-estado-vacio class="mt-6">
          Todavía no hay zonas definidas.
        </ui-estado-vacio>

        <!--
          fase-14-30 tanda 8. Un grupo nuevo llega acá sin ninguna zona y sin
          nada trabado: es la pantalla que hay que resolver ANTES que el
          catálogo de recompensas en modo DIRECTO, y la escala es contra lo que
          se calibra después cada valor en puntos.
        -->
        <app-entrada-asistente
          class="mt-3 block"
          [grupoId]="grupoId()"
          [pregunta]="PREGUNTA_ESCALA_VACIA"
          detalle="Te propone una escala de zonas con sus rangos. Vos decidís qué se aplica."
        />
      } @else {
        <ul class="mt-5 space-y-2">
          @for (u of umbralesOrdenados(); track u.id) {
            <li class="flex items-center gap-3 tarjeta">
              <span class="h-8 w-8 shrink-0 rounded-lg" [style.background-color]="u.colorHex"></span>
              <div class="min-w-0 flex-1">
                <ui-zona-badge [zona]="u" tamano="sm" />
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {{ u.puntosMin }} – {{ u.puntosMax === null ? '∞' : u.puntosMax }} pts · orden {{ u.orden }}
                </p>
              </div>
              <div class="flex shrink-0 gap-1">
                <button
                  type="button"
                  (click)="abrirEditar(u)"
                  class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-marca-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-marca-300"
                  aria-label="Editar"
                >
                  <span class="h-4 w-4"><app-icono nombre="pencil" /></span>
                </button>
                <button
                  type="button"
                  (click)="aEliminar.set(u)"
                  class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  aria-label="Eliminar"
                >
                  <span class="h-4 w-4"><app-icono nombre="trash" /></span>
                </button>
              </div>
            </li>
          }
        </ul>

        <!--
          Con zonas ya cargadas la pregunta cambia de «armámela» a «¿está bien?»,
          que es la única pantalla del ítem donde el asistente revisa en vez de
          crear. Y es deliberado que el atajo exista igual: mover un rango
          recalcula la zona de todos en el acto (decisión 6), así que la
          propuesta llega con el aviso de cuántos cambian de zona — un número
          que desde acá no se puede calcular a mano.
        -->
        <app-entrada-asistente
          class="mt-4 block"
          variante="enlace"
          [grupoId]="grupoId()"
          [pregunta]="PREGUNTA_ESCALA_REVISION"
          titulo="¿La escala está bien para este grupo? Preguntale a la IA"
        />
      }
    </section>

    <ui-modal
      [abierto]="formAbierto()"
      [titulo]="editando() ? 'Editar zona' : 'Nueva zona'"
      (cerrar)="cerrarForm()"
    >
      @if (formAbierto()) {
        <form (submit)="guardar($event)">
  
            <div class="mt-4 space-y-3">
              <div class="flex items-center gap-3">
                <ui-campo etiqueta="Color">
                  <input
                    [(ngModel)]="form.colorHex"
                    name="colorHex"
                    type="color"
                    class="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 dark:border-slate-700"
                  />
                </ui-campo>
                <ui-campo etiqueta="Nombre de la zona" class="flex-1">
                  <input
                    [(ngModel)]="form.nombreZona"
                    name="nombreZona"
                    required
                    maxlength="50"
                    placeholder="Verde, Dorado…"
                    class="campo"
                  />
                </ui-campo>
              </div>
  
              <div class="grid grid-cols-3 gap-3">
                <ui-campo etiqueta="Orden">
                  <input
                    [(ngModel)]="form.orden"
                    name="orden"
                    type="number"
                    min="1"
                    class="campo"
                  />
                </ui-campo>
                <ui-campo etiqueta="Desde">
                  <input
                    [(ngModel)]="form.puntosMin"
                    name="puntosMin"
                    type="number"
                    class="campo"
                  />
                </ui-campo>
                <ui-campo etiqueta="Hasta">
                  <input
                    [(ngModel)]="form.puntosMax"
                    name="puntosMax"
                    type="number"
                    [disabled]="form.sinTope"
                    class="campo"
                  />
                </ui-campo>
              </div>
  
              <label class="flex items-center gap-2">
                <input
                  [(ngModel)]="form.sinTope"
                  name="sinTope"
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500 dark:border-slate-600"
                />
                <span class="text-sm text-slate-700 dark:text-slate-200">Sin tope (zona más alta)</span>
              </label>
  
              <div class="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                <span class="text-xs text-slate-400 dark:text-slate-500">Vista previa:</span>
                <div class="mt-1.5">
                  <ui-zona-badge [zona]="{ nombreZona: form.nombreZona || 'Zona', colorHex: form.colorHex }" />
                </div>
              </div>
            </div>
  
          <div class="botonera">
            <button type="button" (click)="cerrarForm()" class="boton boton-neutro">Cancelar</button>
            <button type="submit" [disabled]="guardando()" class="boton boton-primario">
              {{ guardando() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </form>
      }
    </ui-modal>

    <ui-confirm-dialog
      [abierto]="aEliminar() !== null"
      titulo="Eliminar zona"
      [mensaje]="'¿Eliminar la zona «' + (aEliminar()?.nombreZona ?? '') + '»?'"
      textoConfirmar="Eliminar"
      (confirmar)="confirmarEliminar()"
      (cancelar)="aEliminar.set(null)"
    />
  `,
})
export class UmbralesPage {
  readonly grupoId = input.required<string>();

  /** fase-14-30 tanda 8: sin escala todavía, la escala es lo que falta. */
  protected readonly PREGUNTA_ESCALA_VACIA =
    'Este grupo todavía no tiene zonas. Mirá las actividades, las conductas y ' +
    'quiénes son los integrantes, y proponeme una escala de zonas con sus rangos ' +
    'de puntos y sus colores.';

  /** Con escala cargada la pregunta es la otra: si sigue sirviendo. */
  protected readonly PREGUNTA_ESCALA_REVISION =
    'Mirá los puntajes de esta semana y el catálogo del grupo, y decime si la ' +
    'escala de zonas está bien calibrada. Si no, proponeme los cambios.';

  private readonly api = inject(ScoringApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly umbrales = signal<UmbralZonaDto[]>([]);

  protected readonly formAbierto = signal(false);

  protected readonly guardando = signal(false);

  protected readonly editando = signal<UmbralZonaDto | null>(null);

  protected readonly aEliminar = signal<UmbralZonaDto | null>(null);

  protected form: FormUmbral = { ...FORM_VACIO };

  /** Base de puntos con la que cada usuario arranca cada Sección (fase-14). */
  protected puntosIniciales = 0;

  protected readonly guardandoConfig = signal(false);

  protected readonly umbralesOrdenados = computed(() =>
    [...this.umbrales()].sort((a, b) => a.orden - b.orden)
  );

  /** Espejo liviano de la validación del backend: detecta huecos/solapes por orden. */
  protected readonly avisoContinuidad = computed<string | null>(() => {
    const orden = this.umbralesOrdenados();

    for (let i = 1; i < orden.length; i++) {
      const previo = orden[i - 1];
      const actual = orden[i];

      if (previo.puntosMax === null) {
        return `La zona «${previo.nombreZona}» no tiene tope pero hay una zona superior.`;
      }

      if (actual.puntosMin !== previo.puntosMax + 1) {
        return `Hueco o solape entre «${previo.nombreZona}» y «${actual.nombreZona}» (${previo.puntosMax} → ${actual.puntosMin}).`;
      }
    }

    return null;
  });

  constructor() {
    effect(() => {
      const g = this.grupoId();
      this.cargar(g);
    });
  }

  protected abrirNueva(): void {
    this.editando.set(null);
    const siguienteOrden = this.umbrales().length + 1;
    this.form = { ...FORM_VACIO, orden: siguienteOrden };
    this.formAbierto.set(true);
  }

  protected abrirEditar(u: UmbralZonaDto): void {
    this.editando.set(u);
    this.form = {
      nombreZona: u.nombreZona,
      orden: u.orden,
      puntosMin: u.puntosMin,
      sinTope: u.puntosMax === null,
      puntosMax: u.puntosMax ?? 100,
      colorHex: u.colorHex,
    };
    this.formAbierto.set(true);
  }

  protected cerrarForm(): void {
    this.formAbierto.set(false);
  }

  protected guardar(evento: Event): void {
    evento.preventDefault();

    if (this.form.nombreZona.trim().length === 0) {
      return;
    }

    this.guardando.set(true);
    const datos: CrearUmbralRequest = {
      nombreZona: this.form.nombreZona.trim(),
      orden: Number(this.form.orden),
      puntosMin: Number(this.form.puntosMin),
      puntosMax: this.form.sinTope ? null : Number(this.form.puntosMax),
      colorHex: this.form.colorHex.toUpperCase(),
    };
    const actual = this.editando();

    const peticion = actual
      ? this.api.editarUmbral(actual.id, datos)
      : this.api.crearUmbral(this.grupoId(), datos);

    peticion.subscribe({
      next: () => {
        this.toasts.exito(actual ? 'Zona actualizada.' : 'Zona creada.');
        this.guardando.set(false);
        this.formAbierto.set(false);
        this.cargar(this.grupoId());
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.guardando.set(false);
      },
    });
  }

  protected confirmarEliminar(): void {
    const u = this.aEliminar();

    if (!u) {
      return;
    }

    this.api.eliminarUmbral(u.id).subscribe({
      next: () => {
        this.toasts.exito('Zona eliminada.');
        this.aEliminar.set(null);
        this.cargar(this.grupoId());
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.aEliminar.set(null);
      },
    });
  }

  protected guardarConfig(): void {
    this.guardandoConfig.set(true);
    this.api
      .guardarConfiguracion(this.grupoId(), { puntosIniciales: Number(this.puntosIniciales) })
      .subscribe({
        next: (config) => {
          this.puntosIniciales = config.puntosIniciales;
          this.guardandoConfig.set(false);
          this.toasts.exito('Puntos iniciales guardados.');
        },
        error: (e) => {
          this.toasts.error(mensajeDeError(e));
          this.guardandoConfig.set(false);
        },
      });
  }

  private cargar(grupoId: string): void {
    this.cargando.set(true);
    this.api.listarUmbrales(grupoId).subscribe({
      next: (u) => {
        this.umbrales.set(u);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
    this.api.obtenerConfiguracion(grupoId).subscribe({
      next: (config) => (this.puntosIniciales = config.puntosIniciales),
      error: () => undefined,
    });
  }
}
