import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { CampanaNotificacionesComponent } from './campana-notificaciones.component';

interface ItemNav {
  ruta: string;
  etiqueta: string;
  icono: NombreIcono;
  soloAdmin?: boolean;
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
  ],
  templateUrl: './shell.component.html',
})
export class ShellComponent implements OnInit, OnDestroy {
  protected readonly auth = inject(AuthService);

  private readonly notif = inject(NotificationApiService);

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

  protected readonly navTutor = computed<ItemNav[]>(() => {
    const g = this.grupoIdActivo();

    if (!g) {
      return [];
    }

    const base = `/grupos/${g}`;

    return [
      { ruta: base, etiqueta: 'Resumen', icono: 'home' },
      { ruta: `${base}/secciones/actual`, etiqueta: 'Semana actual', icono: 'calendar' },
      { ruta: `${base}/actividades`, etiqueta: 'Actividades', icono: 'check' },
      { ruta: `${base}/conductas`, etiqueta: 'Conductas', icono: 'flag' },
      { ruta: `${base}/umbrales`, etiqueta: 'Zonas', icono: 'chart' },
      { ruta: `${base}/recompensas`, etiqueta: 'Recompensas', icono: 'gift' },
      { ruta: `${base}/invitaciones`, etiqueta: 'Invitaciones', icono: 'link' },
      { ruta: `${base}/usuarios`, etiqueta: 'Usuarios', icono: 'users' },
      { ruta: `${base}/tutores`, etiqueta: 'Tutores', icono: 'shield', soloAdmin: true },
      { ruta: `${base}/configuracion-sesion`, etiqueta: 'Configuración', icono: 'cog' },
    ];
  });

  protected readonly navUsuario: ItemNav[] = [
    { ruta: '/', etiqueta: 'Inicio', icono: 'home' },
    { ruta: '/mi-conducta', etiqueta: 'Conducta', icono: 'flag' },
    { ruta: '/mi-progreso', etiqueta: 'Progreso', icono: 'chart' },
    { ruta: '/mis-recompensas', etiqueta: 'Premios', icono: 'gift' },
  ];

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
