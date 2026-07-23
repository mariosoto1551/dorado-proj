import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';

import type { NotificacionDto } from '@dorado/shared-types';

import { NotificationApiService } from '../../core/api/notification-api.service';

/**
 * Campana de notificaciones del shell (spec fase-10). El badge se alimenta del
 * polling de 30s del NotificationApiService; al abrir el panel se cargan las
 * notificaciones, y marcar una (o todas) leída refresca el contador sin
 * recargar la página.
 */
@Component({
  selector: 'app-campana-notificaciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative">
      <button
        type="button"
        (click)="alternar()"
        class="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        aria-label="Notificaciones"
      >
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
          />
        </svg>
        @if (notif.noLeidas() > 0) {
          <span
            class="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white animate-pop"
          >
            {{ notif.noLeidas() > 99 ? '99+' : notif.noLeidas() }}
          </span>
        }
      </button>

      @if (abierto()) {
        <!-- Backdrop para cerrar al tocar fuera -->
        <button type="button" aria-label="Cerrar" class="fixed inset-0 z-30 cursor-default" (click)="cerrar()"></button>

        <div
          class="absolute right-0 z-40 mt-2 flex max-h-[70dvh] w-80 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl animate-slide-up dark:border-slate-700 dark:bg-slate-900 sm:w-96"
        >
          <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <h3 class="text-sm font-bold text-slate-900 dark:text-white">Notificaciones</h3>
            @if (notif.noLeidas() > 0) {
              <button
                type="button"
                (click)="marcarTodas()"
                class="text-xs font-semibold text-marca-600 hover:text-marca-700 dark:text-marca-400 dark:hover:text-marca-300"
              >
                Marcar todas
              </button>
            }
          </div>

          <div class="flex-1 overflow-y-auto">
            @if (cargando()) {
              <p class="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
            } @else if (items().length === 0) {
              <p class="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                No tenés notificaciones.
              </p>
            } @else {
              @for (n of items(); track n.id) {
                <button
                  type="button"
                  (click)="marcarUna(n)"
                  class="flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  [class.bg-marca-50]="!n.leida"
                  [class.dark:bg-marca-900/30]="!n.leida"
                >
                  <span
                    class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    [class]="n.leida ? 'bg-transparent' : 'bg-marca-500'"
                  ></span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm text-slate-800 dark:text-slate-100">{{ n.mensaje }}</span>
                    <span class="mt-0.5 block text-xs text-slate-400 dark:text-slate-500">{{
                      tiempoRelativo(n.createdAt)
                    }}</span>
                  </span>
                </button>
              }
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class CampanaNotificacionesComponent {
  protected readonly notif = inject(NotificationApiService);

  protected readonly abierto = signal(false);

  protected readonly cargando = signal(false);

  protected readonly items = signal<NotificacionDto[]>([]);

  protected alternar(): void {
    if (this.abierto()) {
      this.cerrar();

      return;
    }

    this.abierto.set(true);
    this.cargar();
  }

  protected cerrar(): void {
    this.abierto.set(false);
  }

  protected marcarUna(n: NotificacionDto): void {
    if (!n.leida) {
      this.notif.marcarLeida(n.id).subscribe(() => {
        this.items.update((lista) =>
          lista.map((x) => (x.id === n.id ? { ...x, leida: true } : x))
        );
        this.notif.refrescarContador();
      });
    }
  }

  protected marcarTodas(): void {
    this.notif.marcarTodasLeidas().subscribe(() => {
      this.items.update((lista) => lista.map((x) => ({ ...x, leida: true })));
      this.notif.refrescarContador();
    });
  }

  protected tiempoRelativo(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60_000);

    if (min < 1) {
      return 'recién';
    }

    if (min < 60) {
      return `hace ${min} min`;
    }

    const horas = Math.floor(min / 60);

    if (horas < 24) {
      return `hace ${horas} h`;
    }

    const dias = Math.floor(horas / 24);

    return `hace ${dias} d`;
  }

  private cargar(): void {
    this.cargando.set(true);
    this.notif.listar(1).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
