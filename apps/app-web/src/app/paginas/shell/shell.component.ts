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
import { EconomiaService } from '../../core/api/economia.service';
import { IaApiService } from '../../core/api/ia-api.service';
import { NotificationApiService } from '../../core/api/notification-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { GuiaSetupService } from '../../core/guia/guia-setup.service';
import { CampanaNotificacionesComponent } from './campana-notificaciones.component';
import { SelectorGrupoUsuarioComponent } from './selector-grupo-usuario.component';

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
    SelectorGrupoUsuarioComponent,
  ],
  templateUrl: './shell.component.html',
})
export class ShellComponent implements OnInit, OnDestroy {
  protected readonly auth = inject(AuthService);

  private readonly notif = inject(NotificationApiService);

  protected readonly guia = inject(GuiaSetupService);

  /** fase-14-22: el chip de saldo del participante (solo si el grupo usa tienda). */
  protected readonly economia = inject(EconomiaService);

  /** fase-14-29: decide si el menú muestra «Asistente». Cacheado, una llamada. */
  private readonly ia = inject(IaApiService);

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
   * Menú del área Tutor (fase-14-23 T3), agrupado por LA PREGUNTA que responde
   * cada grupo: *qué hago hoy* / *qué se puede hacer y cuánto vale* / *quiénes
   * son* / *cómo está armado el grupo*.
   *
   * Antes había tres grupos y el del medio ("Sistema de puntos") mezclaba
   * **Zonas** —que se configura una vez y no se vuelve— con **Entregas**, que
   * se usa todas las semanas. Las tres mudanzas que arreglan eso son Entregas y
   * Reportes hacia «Día a día», y Zonas hacia «Ajustes».
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
          { ruta: `${base}/entregas`, etiqueta: 'Entregas', icono: 'gift' },
          { ruta: `${base}/reportes`, etiqueta: 'Reportes', icono: 'flag' },
        ],
      },
      {
        titulo: 'Catálogo',
        items: [
          { ruta: `${base}/actividades`, etiqueta: 'Actividades', icono: 'check' },
          { ruta: `${base}/conductas`, etiqueta: 'Conductas', icono: 'flag' },
          { ruta: `${base}/recompensas`, etiqueta: 'Recompensas', icono: 'gift' },
        ],
      },
      {
        titulo: 'Gente',
        items: [
          { ruta: `${base}/usuarios`, etiqueta: 'Usuarios', icono: 'users' },
          { ruta: `${base}/equipos`, etiqueta: 'Equipos', icono: 'shield' },
          { ruta: `${base}/tutores`, etiqueta: 'Tutores', icono: 'shield', soloAdmin: true },
          { ruta: `${base}/invitaciones`, etiqueta: 'Invitaciones', icono: 'link' },
        ],
      },
      {
        titulo: 'Ajustes',
        items: [
          { ruta: `${base}/configuracion`, etiqueta: 'Configuración del grupo', icono: 'cog' },
          { ruta: `${base}/umbrales`, etiqueta: 'Zonas', icono: 'chart' },
          { ruta: `${base}/roles`, etiqueta: 'Roles', icono: 'tag' },
          // fase-14-29: solo con la feature usable. Un ítem de menú que lleva a
          // una pantalla que no funciona es peor que no tener el ítem.
          ...(this.ia.configuracion()?.puedeUsarse
            ? [{ ruta: `${base}/asistente`, etiqueta: 'Asistente', icono: 'chispa' as const }]
            : []),
        ],
      },
    ];
  });

  protected readonly navUsuario: ItemNav[] = [
    { ruta: '/', etiqueta: 'Inicio', icono: 'home' },
    { ruta: '/mi-equipo', etiqueta: 'Equipo', icono: 'users' },
    { ruta: '/mi-conducta', etiqueta: 'Conducta', icono: 'flag' },
    { ruta: '/mi-progreso', etiqueta: 'Progreso', icono: 'chart' },
    { ruta: '/mis-recompensas', etiqueta: 'Premios', icono: 'gift' },
  ];

  constructor() {
    // Mantiene cargado el progreso de setup del grupo activo (cacheado) para la
    // tarjeta «Primeros pasos» del Resumen — desde la T3 es el único lugar donde
    // aparece. Al salir del contexto de un grupo, limpia.
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
    // El chip de saldo del encabezado; para un tutor no hace ninguna llamada.
    if (!this.auth.esTutor()) {
      this.economia.cargar();
    }

    // Una sola vez por sesión: el estado del asistente es de la ORGANIZACIÓN,
    // no del grupo, así que no hace falta releerlo al cambiar de grupo. El
    // participante no lo pregunta nunca — no tiene la pantalla (decisión 14).
    if (this.auth.esTutor()) {
      void this.ia.cargarConfiguracion();
    }

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
