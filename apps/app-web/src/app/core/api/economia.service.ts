import { computed, inject, Injectable, signal } from '@angular/core';

import { ModoRecompensas } from '@dorado/shared-types';

import { AuthService } from '../auth/auth.service';
import { RewardsApiService } from './rewards-api.service';

/**
 * Estado compartido de la economía del grupo del participante (fase-14-22).
 *
 * Existe porque el saldo se muestra en el encabezado de TODA la app —ver el
 * saldo mientras confirma tareas es lo que conecta «hice esto» con «me falta
 * para aquello»— y no solo en la tienda. Sin un estado compartido, cada
 * pantalla lo pediría por su cuenta y el chip del encabezado se desincronizaría
 * de la vitrina apenas comprara algo.
 */
@Injectable({ providedIn: 'root' })
export class EconomiaService {
  private readonly api = inject(RewardsApiService);

  private readonly auth = inject(AuthService);

  private readonly modoSignal = signal<ModoRecompensas | null>(null);

  private readonly saldoSignal = signal(0);

  private readonly nombreMonedaSignal = signal('monedas');

  private readonly iconoMonedaSignal = signal('🪙');

  private grupoCargado: string | null = null;

  readonly modo = this.modoSignal.asReadonly();

  readonly saldo = this.saldoSignal.asReadonly();

  readonly nombreMoneda = this.nombreMonedaSignal.asReadonly();

  readonly iconoMoneda = this.iconoMonedaSignal.asReadonly();

  /** El chip del encabezado solo existe si el grupo usa tienda. */
  readonly usaTienda = computed(() => this.modoSignal() === ModoRecompensas.TIENDA);

  /** Carga modo y saldo del grupo del participante. Idempotente por grupo. */
  cargar(forzar = false): void {
    const grupoId = this.auth.grupoUsuario();

    if (!grupoId || (!forzar && this.grupoCargado === grupoId)) {
      return;
    }

    this.grupoCargado = grupoId;

    this.api.configuracion(grupoId).subscribe({
      next: (config) => {
        this.modoSignal.set(config.modo);
        this.nombreMonedaSignal.set(config.nombreMoneda);
        this.iconoMonedaSignal.set(config.iconoMoneda);

        if (config.modo === ModoRecompensas.TIENDA) {
          this.refrescarSaldo();
        }
      },
      // Silencioso a propósito: un grupo sin configuración no es un error, y
      // el chip simplemente no aparece.
      error: () => this.modoSignal.set(ModoRecompensas.DIRECTO),
    });
  }

  /** Tras comprar o cobrar: el chip del encabezado tiene que reflejarlo ya. */
  refrescarSaldo(): void {
    const grupoId = this.auth.grupoUsuario();

    if (!grupoId) {
      return;
    }

    this.api.miBilletera(grupoId).subscribe({
      next: (billetera) => {
        this.saldoSignal.set(billetera.saldo);
        this.nombreMonedaSignal.set(billetera.nombreMoneda);
        this.iconoMonedaSignal.set(billetera.iconoMoneda);
      },
      error: () => undefined,
    });
  }

  reset(): void {
    this.grupoCargado = null;
    this.modoSignal.set(null);
    this.saldoSignal.set(0);
  }
}
