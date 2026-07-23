import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { IconoComponent, type NombreIcono } from '../../componentes/icono.component';
import { NotificationApiService } from '../../core/api/notification-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { GuiaSetupService } from '../../core/guia/guia-setup.service';
import { CampanaNotificacionesComponent } from './campana-notificaciones.component';
import { GuiaFlotanteComponent } from './guia-flotante.component';

interface ItemNav {
  ruta: string;
  etiqueta: string;
  icono: NombreIcono;
  soloAdmin?: boolean;
}

interface GrupoNav {
  titulo: string;
  items: ItemNav[];
}

/**
 * Layout raíz autenticado (fase-10). Se adapta por rol:
 *  - Tutor/ORG_ADMIN: sidebar (drawer en mobile, fija en desktop) con la
 *    navegación del Grupo activo (derivado de la URL).
 *  - Usuario: bottom nav fija (mobile-first), sin sidebar.
 * La campana de notificaciones (polling 30s) vive en la topbar para ambos.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    CampanaNotificacionesComponent,
    IconoComponent,
    GuiaFlotanteComponent,
  ],
  templateUrl: './shell.component.html',
})
export class ShellComponent implements OnInit, OnDestroy {
  protected readonly auth = inject(AuthService);

  private readonly notif = inject(NotificationApiService);

  protected readonly guia = inject(GuiaSetupService);

  private readonly router = inject(Router);

  protected readonly drawerAbierto = signal(false);

  /** URL actual como signal (se recalcula en cada NavigationEnd). */
  private readonly urlActual = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url)
    ),
    { initialValue: this.router.url }
  );

  /** grupoId del Grupo activo, extraído de /grupos/:grupoId/... (tutor). */
  protected readonly grupoIdActivo = computed<string | null>(() => {
    const m = /\/grupos\/([0-9a-fA-F-]{36})/.exec(this.urlActual());

    return m ? m[1] : null;
  });

  /**
   * Menú del área Tutor agrupado por propósito (fase-14): sigue el mismo orden
   * lógico de armado que la guía de primeros pasos, para que menú y guía
   * "cuenten la misma historia".
   */
  protected readonly navTutor = computed<GrupoNav[]>(() => {
    const g = this.grupoIdActivo();

    if (!g) {
      return [];
    }

    const base = `/grupos/${g}`;

    return [
      {
        titulo: 'Día a día',
        items: [
          { ruta: base, etiqueta: 'Resumen', icono: 'home' },
          { ruta: `${base}/secciones/actual`, etiqueta: 'Semana actual', icono: 'calendar' },
        ],
      },
      {
        titulo: 'Sistema de puntos',
        items: [
          { ruta: `${base}/umbrales`, etiqueta: 'Zonas', icono: 'chart' },
          { ruta: `${base}/actividades`, etiqueta: 'Actividades', icono: 'check' },
          { ruta: `${base}/conductas`, etiqueta: 'Conductas', icono: 'flag' },
          { ruta: `${base}/recompensas`, etiqueta: 'Recompensas', icono: 'gift' },
          { ruta: `${base}/configuracion-sesion`, etiqueta: 'Configuración', icono: 'cog' },
        ],
      },
      {
        titulo: 'Gente',
        items: [
          { ruta: `${base}/usuarios`, etiqueta: 'Usuarios', icono: 'users' },
          { ruta: `${base}/tutores`, etiqueta: 'Tutores', icono: 'shield', soloAdmin: true },
          { ruta: `${base}/invitaciones`, etiqueta: 'Invitaciones', icono: 'link' },
        ],
      },
    ];
  });

  /** Ruta de la guía de primeros pasos del grupo activo. */
  protected readonly rutaGuia = computed<string | null>(() => {
    const g = this.grupoIdActivo();

    return g ? `/grupos/${g}/guia` : null;
  });

  /** El link "Primeros pasos" se muestra hasta completar el setup del grupo. */
  protected readonly mostrarGuia = computed(
    () => this.grupoIdActivo() !== null && this.guia.cargado() && !this.guia.completa()
  );

  /** El widget flotante acompaña en todas las páginas menos la guía misma. */
  protected readonly mostrarGuiaFlotante = computed(
    () => this.mostrarGuia() && !this.urlActual().endsWith('/guia')
  );

  protected readonly navUsuario: ItemNav[] = [
    { ruta: '/', etiqueta: 'Inicio', icono: 'home' },
    { ruta: '/mi-conducta', etiqueta: 'Conducta', icono: 'flag' },
    { ruta: '/mi-progreso', etiqueta: 'Progreso', icono: 'chart' },
    { ruta: '/mis-recompensas', etiqueta: 'Premios', icono: 'gift' },
  ];

  constructor() {
    // Mantiene cargado el progreso de setup del grupo activo (cacheado) para el
    // link "Primeros pasos" del menú. Al salir del contexto de un grupo, limpia.
    effect(() => {
      const g = this.grupoIdActivo();

      if (g) {
        this.guia.cargar(g);
      } else {
        this.guia.reset();
      }
    });
  }

  ngOnInit(): void {
    this.notif.iniciarPolling();
  }

  ngOnDestroy(): void {
    this.notif.detenerPolling();
  }

  protected cerrarDrawer(): void {
    this.drawerAbierto.set(false);
  }

  protected alternarDrawer(): void {
    this.drawerAbierto.update((v) => !v);
  }

  protected salir(): void {
    this.notif.detenerPolling();
    this.auth.logout().subscribe({
      complete: () => void this.router.navigateByUrl('/login'),
    });
  }
}
