import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { EncabezadoPaginaComponent } from '../../../componentes/encabezado-pagina.component';
import { BloqueIntegranteComponent } from './bloque-integrante.component';
import { BloqueRecompensasComponent } from './bloque-recompensas.component';
import { BloqueSemanaComponent } from './bloque-semana.component';

/**
 * Configuración del grupo — el hub de la tanda 3 (fase-14-23).
 *
 * Antes de esto, lo que define cómo se comporta un grupo estaba repartido en
 * SEIS lugares y tres de ellos no tenían pantalla propia: el modo de
 * recompensas vivía arriba del catálogo de `/recompensas`, y el plan del día y
 * el contenido de los integrantes arriba del catálogo de `/actividades`,
 * ocupando el primer tercio de una pantalla a la que se entra a ver otra cosa.
 * Y ninguno de los seis decía en qué estado estaban los otros cinco.
 *
 * Los bloques agrupan por LA PREGUNTA QUE RESPONDEN, no por el servicio que los
 * guarda: «cómo corre la semana» es session-service, «qué se gana» cruza
 * rewards y scoring, «qué ve el integrante» cruza activity e identity. Al tutor
 * no le importa esa frontera.
 *
 * Lo que es un CRUD con lista y modal —Zonas y Roles— sigue teniendo pantalla
 * propia y desde acá se ve su estado y se entra (decisión 1 de la tanda).
 */
@Component({
  selector: 'app-configuracion-grupo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    EncabezadoPaginaComponent,
    BloqueSemanaComponent,
    BloqueRecompensasComponent,
    BloqueIntegranteComponent,
  ],
  template: `
    <section class="mx-auto max-w-2xl px-4 py-6">
      <app-encabezado-pagina
        titulo="Configuración del grupo"
        subtitulo="Todo lo que define cómo se comporta este grupo, en un solo lugar."
      />

      <div class="mt-5 space-y-4">
        <div class="tarjeta">
          <h2 class="text-sm font-bold text-slate-900 dark:text-white">Cómo corre la semana</h2>
          <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Cuándo se abre y se cierra cada ciclo, y cuándo se recalculan las zonas.
          </p>
          <div class="mt-4">
            <app-bloque-semana [grupoId]="grupoId()" />
          </div>
        </div>

        <div class="tarjeta">
          <h2 class="text-sm font-bold text-slate-900 dark:text-white">Qué se gana</h2>
          <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Cómo se convierte el puntaje en premios, y los tramos de zona.
          </p>
          <div class="mt-4">
            <app-bloque-recompensas [grupoId]="grupoId()" />
          </div>
        </div>

        <div class="tarjeta">
          <h2 class="text-sm font-bold text-slate-900 dark:text-white">Qué ve el integrante</h2>
          <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Qué aparece en su lista y cuánto puede crear por su cuenta.
          </p>
          <div class="mt-4">
            <app-bloque-integrante [grupoId]="grupoId()" />
          </div>
        </div>
      </div>
    </section>
  `,
})
export class ConfiguracionGrupoPage {
  readonly grupoId = input.required<string>();
}
