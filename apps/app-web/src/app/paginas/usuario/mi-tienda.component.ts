import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { forkJoin, type Observable } from 'rxjs';

import {
  FuenteProducto,
  MecanicaProducto,
  TipoItemCatalogo,
  type MiBilleteraResponse,
  type ObjetivoDto,
  type ProductoTiendaDto,
  type RecompensaDto,
} from '@dorado/shared-types';

import { IconoComponent } from '../../componentes/icono.component';
import { ToastService } from '../../componentes/toast.service';
import { EconomiaService } from '../../core/api/economia.service';
import { mensajeDeError } from '../../core/api/errores';
import { RewardsApiService } from '../../core/api/rewards-api.service';
import { AuthService } from '../../core/auth/auth.service';

/**
 * La tienda del participante (fase-14-22).
 *
 * Los productos que todavía no puede pagar se ven **atenuados y con barra de
 * progreso**: la barra convierte «te faltan 11» —un número abstracto— en algo
 * que se ve avanzar semana a semana. Es lo que hace que ahorrar se sienta como
 * progreso y no como espera, y por eso NO se esconden los caros.
 */
@Component({
  selector: 'app-mi-tienda',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `
    <!-- Billetera -->
    <div class="rounded-3xl bg-linear-to-br from-amber-400 to-amber-600 p-6 text-center text-white shadow-lg">
      <p class="text-sm text-amber-50">Tenés</p>
      <p class="text-4xl font-black">
        {{ economia.iconoMoneda() }} {{ economia.saldo() }}
      </p>
      <p class="text-sm text-amber-50">{{ economia.nombreMoneda() }}</p>

      <!-- fase-14-25: el objetivo, arriba de todo. Es lo que convierte «tengo
           14» en «me faltan 11 para la bici» — un número abstracto en una meta. -->
      @if (objetivo(); as o) {
        <div class="mt-5 border-t border-white/25 pt-4 text-left animate-fade-in">
          <div class="flex items-baseline justify-between gap-2">
            <p class="min-w-0 truncate text-sm font-bold">🎯 {{ o.nombre }}</p>
            <p class="shrink-0 text-xs font-semibold text-amber-50">
              {{ o.faltan > 0 ? 'Te faltan ' + o.faltan : '¡Ya te alcanza!' }}
            </p>
          </div>
          <div class="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/25">
            <div
              class="h-full rounded-full bg-white transition-all duration-500"
              [style.width.%]="progresoDelObjetivo(o)"
            ></div>
          </div>
        </div>
      }
    </div>

    @if (cargando()) {
      <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
    } @else {
      @if (productos().length === 0) {
        <div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          La tienda todavía está vacía. 🛒
        </div>
      } @else {
        <h2 class="mt-6 mb-2 text-sm font-bold text-slate-500 uppercase dark:text-slate-400">Tienda</h2>
        <ul class="space-y-2.5">
          @for (p of productos(); track p.id) {
            <li
              class="rounded-2xl border-2 bg-white p-4 shadow-sm transition dark:bg-slate-900"
              [class]="
                p.puedeComprar
                  ? 'border-slate-100 dark:border-slate-800'
                  : 'border-slate-100 opacity-60 dark:border-slate-800'
              "
            >
              <div class="flex items-center gap-3">
                <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500 dark:bg-amber-500/15 dark:text-amber-400">
                  <span class="h-6 w-6"><app-icono nombre="gift" /></span>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="font-semibold text-slate-900 dark:text-white">{{ p.nombre }}</p>
                  <p class="text-xs text-slate-500 dark:text-slate-400">{{ comoSeObtiene(p) }}</p>
                </div>
                <span class="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-sm font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                  {{ p.precio }}
                </span>
              </div>

              @if (p.puedeComprar) {
                <button
                  type="button"
                  (click)="iniciarCompra(p)"
                  class="mt-3 w-full rounded-xl bg-marca-600 py-2.5 text-sm font-bold text-white transition hover:bg-marca-700 active:scale-[0.98]"
                >
                  Comprar
                </button>
              } @else {
                <!-- La barra: el motor del ahorro. -->
                <div class="mt-3">
                  <div class="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      class="h-full rounded-full bg-amber-400 transition-all duration-500 dark:bg-amber-500"
                      [style.width.%]="progreso(p)"
                    ></div>
                  </div>
                  <div class="mt-1.5 flex items-center justify-between gap-2">
                    <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Te faltan {{ p.faltan }}
                    </p>
                    <!-- fase-14-25: marcar objetivo. Toggle, sin confirmación:
                         cambiar de meta no destruye nada. -->
                    <button
                      type="button"
                      (click)="alternarObjetivo(p)"
                      [disabled]="guardandoObjetivo()"
                      class="rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50"
                      [class]="
                        esObjetivo(p)
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300'
                      "
                    >
                      {{ esObjetivo(p) ? '🎯 Mi objetivo' : '☆ Marcar objetivo' }}
                    </button>
                  </div>
                </div>
              }
            </li>
          }
        </ul>
      }

      <!-- Historial -->
      @if (billetera(); as b) {
        @if (b.movimientos.length > 0) {
          <h2 class="mt-8 mb-2 text-sm font-bold text-slate-500 uppercase dark:text-slate-400">Movimientos</h2>
          <ul class="space-y-1.5">
            @for (m of b.movimientos; track m.id) {
              <li class="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
                <span class="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                  {{ m.motivo ?? ETIQUETAS[m.tipo] }}
                </span>
                <span
                  class="shrink-0 text-sm font-bold"
                  [class]="m.monto >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'"
                >
                  {{ m.monto > 0 ? '+' : '' }}{{ m.monto }}
                </span>
              </li>
            }
          </ul>
        }
      }
    }

    <!-- Elegir de la bolsa -->
    @if (eligiendo(); as producto) {
      <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <button type="button" aria-label="Cerrar" (click)="eligiendo.set(null)" class="absolute inset-0 cursor-default bg-slate-900/50 animate-fade-in"></button>
        <div class="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl animate-slide-up dark:bg-slate-900 sm:rounded-2xl">
          <h2 class="text-lg font-bold text-slate-900 dark:text-white">Elegí tu premio</h2>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ producto.nombre }}</p>

          <ul class="mt-4 space-y-2">
            @for (item of premiosDeLaBolsa(); track item.id) {
              <li>
                <button
                  type="button"
                  (click)="comprar(producto, item.id)"
                  class="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:border-marca-400 hover:bg-marca-50 dark:border-slate-700 dark:hover:border-marca-500 dark:hover:bg-marca-500/10"
                >
                  <span class="block text-sm font-semibold text-slate-800 dark:text-slate-100">{{ item.nombre }}</span>
                  @if (item.descripcion) {
                    <span class="block text-xs text-slate-500 dark:text-slate-400">{{ item.descripcion }}</span>
                  }
                </button>
              </li>
            }
          </ul>

          <button
            type="button"
            (click)="eligiendo.set(null)"
            class="mt-4 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
        </div>
      </div>
    }

    <!-- Lo que salió -->
    @if (obtenido(); as premio) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <button type="button" aria-label="Cerrar" (click)="obtenido.set(null)" class="absolute inset-0 cursor-default bg-slate-900/60 animate-fade-in"></button>
        <div class="relative w-full max-w-sm rounded-3xl bg-linear-to-br from-amber-400 to-amber-600 p-8 text-center text-white shadow-2xl animate-pop">
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
            <span class="h-8 w-8"><app-icono nombre="trophy" /></span>
          </div>
          <p class="mt-3 text-sm text-amber-50">¡Te llevaste!</p>
          <p class="text-2xl font-black">{{ premio }}</p>
          <p class="mt-2 text-xs text-amber-50">Te lo van a entregar. ⏳</p>
          <button
            type="button"
            (click)="obtenido.set(null)"
            class="mt-5 w-full rounded-xl bg-white/20 py-2.5 text-sm font-bold text-white transition hover:bg-white/30"
          >
            Genial
          </button>
        </div>
      </div>
    }
  `,
})
export class MiTiendaComponent {
  private readonly api = inject(RewardsApiService);

  private readonly auth = inject(AuthService);

  private readonly toasts = inject(ToastService);

  protected readonly economia = inject(EconomiaService);

  protected readonly ETIQUETAS: Record<string, string> = {
    RENDIMIENTO_ZONA: 'Cierre de la semana',
    MULTA_ZONA: 'Cierre de la semana',
    SALDO_SALDADO: 'Deuda saldada',
    COMPRA: 'Compra',
    AJUSTE_TUTOR: 'Ajuste del tutor',
    REVERSION: 'Devolución',
  };

  protected readonly cargando = signal(true);

  protected readonly productos = signal<ProductoTiendaDto[]>([]);

  protected readonly billetera = signal<MiBilleteraResponse | null>(null);

  protected readonly eligiendo = signal<ProductoTiendaDto | null>(null);

  protected readonly obtenido = signal<string | null>(null);

  /** fase-14-25: evita que dos toques seguidos manden dos PUT. */
  protected readonly guardandoObjetivo = signal(false);

  private readonly items = signal<RecompensaDto[]>([]);

  private readonly bolsas = signal<{ id: string; recompensaIds: string[] }[]>([]);

  protected readonly premiosDeLaBolsa = computed(() => {
    const producto = this.eligiendo();

    if (!producto?.bolsaId) {
      return [];
    }

    const bolsa = this.bolsas().find((b) => b.id === producto.bolsaId);
    const ids = new Set(bolsa?.recompensaIds ?? []);

    return this.items().filter((i) => ids.has(i.id) && i.tipo === TipoItemCatalogo.PREMIO);
  });

  constructor() {
    this.cargar();
  }

  protected comoSeObtiene(producto: ProductoTiendaDto): string {
    if (producto.fuente === FuenteProducto.ITEM) {
      return this.items().find((i) => i.id === producto.recompensaId)?.nombre ?? 'Un premio';
    }

    return producto.mecanica === MecanicaProducto.AZAR ? 'Sale uno al azar 🎲' : 'Elegís vos ✨';
  }

  /** fase-14-25: el objetivo vigente, tal como lo resolvió el servidor. */
  protected objetivo(): ObjetivoDto | null {
    return this.billetera()?.objetivo ?? null;
  }

  protected esObjetivo(producto: ProductoTiendaDto): boolean {
    return this.objetivo()?.productoId === producto.id;
  }

  protected progresoDelObjetivo(objetivo: ObjetivoDto): number {
    if (objetivo.precio <= 0) {
      return 100;
    }

    return Math.min(100, Math.round((this.economia.saldo() / objetivo.precio) * 100));
  }

  /**
   * Marca o desmarca el objetivo. Recarga `mi-billetera` en vez de escribir el
   * estado local: `faltan` lo calcula el servidor contra el saldo del momento,
   * y duplicar esa cuenta acá sería una segunda fuente de verdad.
   */
  protected alternarObjetivo(producto: ProductoTiendaDto): void {
    const grupoId = this.auth.grupoUsuario();

    if (!grupoId || this.guardandoObjetivo()) {
      return;
    }

    const quitando = this.esObjetivo(producto);

    this.guardandoObjetivo.set(true);

    // `Observable<unknown>`: los dos endpoints devuelven cosas distintas y acá
    // no se usa ninguna — lo que importa es recargar después.
    const peticion: Observable<unknown> = quitando
      ? this.api.quitarObjetivo(grupoId)
      : this.api.fijarObjetivo(grupoId, producto.id);

    peticion.subscribe({
      next: () => {
        this.guardandoObjetivo.set(false);
        this.cargar();
      },
      error: (e: unknown) => {
        this.guardandoObjetivo.set(false);
        this.toasts.error(mensajeDeError(e));
      },
    });
  }

  protected progreso(producto: ProductoTiendaDto): number {
    if (producto.precio <= 0) {
      return 100;
    }

    return Math.min(100, Math.round((this.economia.saldo() / producto.precio) * 100));
  }

  protected iniciarCompra(producto: ProductoTiendaDto): void {
    // Solo la mecánica ELECCION abre el diálogo; el resto compra directo.
    if (
      producto.fuente === FuenteProducto.BOLSA &&
      producto.mecanica === MecanicaProducto.ELECCION
    ) {
      this.eligiendo.set(producto);

      return;
    }

    this.comprar(producto);
  }

  protected comprar(producto: ProductoTiendaDto, recompensaId?: string): void {
    const grupoId = this.auth.grupoUsuario();

    if (!grupoId) {
      return;
    }

    this.api.comprar(grupoId, { productoId: producto.id, recompensaId }).subscribe({
      next: (compra) => {
        this.eligiendo.set(null);
        this.obtenido.set(compra.nombreRecompensaSnapshot);
        // El chip del encabezado tiene que reflejar el gasto al instante.
        this.economia.refrescarSaldo();
        this.cargar();
      },
      error: (e) => {
        this.eligiendo.set(null);
        this.toasts.error(mensajeDeError(e));
      },
    });
  }

  private cargar(): void {
    const grupoId = this.auth.grupoUsuario();

    if (!grupoId) {
      this.cargando.set(false);

      return;
    }

    this.cargando.set(true);

    forkJoin({
      productos: this.api.tienda(grupoId),
      billetera: this.api.miBilletera(grupoId),
      items: this.api.listarRecompensas(grupoId, 'ACTIVA'),
      bolsas: this.api.listarBolsas(grupoId),
    }).subscribe({
      next: ({ productos, billetera, items, bolsas }) => {
        this.productos.set(productos);
        this.billetera.set(billetera);
        this.items.set(items);
        this.bolsas.set(bolsas);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
