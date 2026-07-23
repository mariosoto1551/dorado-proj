import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Router } from '@angular/router';

import { SesionAdminService } from '../../core/auth/sesion-admin.service';

/** Shell autenticado del panel: topbar fija + outlet de las páginas. */
@Component({
  selector: 'admin-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `
    <div class="topbar">
      <div class="brand"><span class="mark">D</span>Plataforma Dorado <small>admin</small></div>
      <div style="flex:1"></div>
      <div class="who">
        <span class="av">{{ sesion.iniciales() }}</span>
        <span>{{ sesion.nombreMostrable() }}</span>
        <button type="button" class="ghost" (click)="salir()">Salir</button>
      </div>
    </div>
    <div class="wrap">
      <router-outlet />
    </div>
  `,
})
export class ShellComponent {
  protected readonly sesion = inject(SesionAdminService);

  private readonly router = inject(Router);

  protected salir(): void {
    this.sesion.logout().subscribe(() => {
      void this.router.navigate(['/login']);
    });
  }
}
