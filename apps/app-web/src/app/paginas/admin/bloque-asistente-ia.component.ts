import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { IconoComponent } from '../../componentes/icono.component';
import { ToastService } from '../../componentes/toast.service';
import { mensajeDeError } from '../../core/api/errores';
import { IaApiService } from '../../core/api/ia-api.service';

/**
 * El asistente de IA en el panel de la organización (fase-14-29 Parte G).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTÁ ACÁ Y NO EN LA CONFIGURACIÓN DEL GRUPO:
 *
 * la decisión 5 dice que el asistente lo prende el **ORG_ADMIN**, no el Tutor,
 * y que la fila de configuración es **por organización**. Un switch en la
 * pantalla de un grupo sugeriría que se prende por grupo —lo que es falso— y lo
 * pondría al alcance de quien no tiene esa decisión: prender esto manda datos
 * del grupo a un tercero, y eso es del dueño.
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Component({
  selector: 'app-bloque-asistente-ia',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `
    @if (estado(); as ia) {
      <section class="tarjeta mt-6">
        <div class="flex items-start gap-3">
          <span
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-marca-600 dark:bg-marca-900/40 dark:text-marca-300"
          >
            <span class="h-5 w-5"><app-icono nombre="chispa" /></span>
          </span>
          <div class="min-w-0 flex-1">
            <h2 class="font-semibold text-slate-900 dark:text-white">Asistente de IA</h2>
            <p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Ayuda a los tutores a armar el catálogo, calibrar la tienda y entender
              qué pasa en cada grupo. Propone; aplicar lo decide siempre una persona.
            </p>
          </div>
        </div>

        @if (!ia.disponibleEnPlan) {
          <p
            class="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            No está incluido en el plan actual de la organización.
          </p>
        } @else {
          @if (!ia.avisoAceptado) {
            <!--
              El aviso de la decisión 5. Es lo que el dueño acepta, y queda
              guardado con fecha y usuario: un consentimiento dado es un hecho.
            -->
            <div
              class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
            >
              <p class="font-semibold">Antes de prenderlo, leé esto</p>
              <p class="mt-1.5">
                Para generar las respuestas se envían a un proveedor externo
                (OpenAI) los datos del grupo que el asistente necesita mirar:
                nombres de pila de los integrantes, nombres de actividades,
                conductas, recompensas, roles y equipos, y los puntajes y saldos.
              </p>
              <p class="mt-1.5">
                <b>No se envían</b> correos electrónicos, contraseñas ni ningún
                dato de contacto. El proveedor no entrena sus modelos con los
                datos que se mandan por su API.
              </p>
            </div>
          }

          <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div class="text-xs text-slate-500 dark:text-slate-400">
              @if (ia.habilitada) {
                <p class="font-semibold text-emerald-600 dark:text-emerald-400">Prendido</p>
              } @else {
                <p class="font-semibold text-slate-500 dark:text-slate-400">Apagado</p>
              }
              @if (ia.aceptoAvisoEn) {
                <p class="mt-0.5">Aviso aceptado el {{ fecha(ia.aceptoAvisoEn) }}</p>
              }
              <p class="mt-0.5">{{ consumo() }}</p>
            </div>

            <button
              type="button"
              class="boton"
              [class]="ia.habilitada ? 'boton-neutro' : 'boton-primario'"
              [disabled]="guardando()"
              (click)="alternar(ia.habilitada)"
            >
              @if (guardando()) {
                Guardando…
              } @else {
                {{ ia.habilitada ? 'Apagar' : ia.avisoAceptado ? 'Prender' : 'Acepto y lo prendo' }}
              }
            </button>
          </div>

          @if (ia.habilitada) {
            <p class="mt-2 text-xs text-slate-400 dark:text-slate-500">
              Apagarlo no borra las conversaciones: quedan guardadas y vuelven a
              estar disponibles si lo prendés de nuevo.
            </p>
          }
        }
      </section>
    }
  `,
})
export class BloqueAsistenteIaComponent {
  private readonly ia = inject(IaApiService);

  private readonly toast = inject(ToastService);

  protected readonly estado = this.ia.configuracion;

  protected readonly guardando = signal(false);

  protected readonly consumo = computed(() => {
    const estado = this.estado();

    if (!estado) {
      return '';
    }

    const usados = estado.tokensConsumidosMes.toLocaleString('es-AR');

    // `null` es SIN LÍMITE y no «sin cuota» — los dos están a un carácter de
    // distancia y significan lo contrario (la trampa que dejó anotada la
    // tanda 1). Acá se escribe distinto a propósito.
    return estado.cuotaTokensMensuales === null
      ? `Consumo del mes: ${usados} tokens, sin tope`
      : `Consumo del mes: ${usados} de ${estado.cuotaTokensMensuales.toLocaleString('es-AR')} tokens`;
  });

  constructor() {
    void this.ia.cargarConfiguracion();
  }

  protected async alternar(estabaPrendido: boolean): Promise<void> {
    this.guardando.set(true);

    try {
      await firstValueFrom(
        this.ia.cambiarConfiguracion({
          habilitada: !estabaPrendido,
          // Se manda siempre al prender: el backend lo exige la primera vez y
          // lo ignora después. Mandarlo condicionado a `avisoAceptado` haría
          // que un cache viejo del frontend produzca un 400 evitable.
          aceptaAviso: !estabaPrendido,
        })
      );
      await this.ia.cargarConfiguracion();
      this.toast.exito(estabaPrendido ? 'Asistente apagado.' : 'Asistente prendido.');
    } catch (error) {
      this.toast.error(mensajeDeError(error));
    } finally {
      this.guardando.set(false);
    }
  }

  protected fecha(iso: string): string {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
}
