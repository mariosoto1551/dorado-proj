import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';

/**
 * Layout raíz autenticado (spec fase-03): topbar con nombre + logout y
 * sidebar placeholder (se llena en Fase 10 — bottom nav para USUARIO,
 * drawer para Tutor). Mobile-first: la sidebar solo aparece de md: hacia
 * arriba.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet],
  templateUrl: './shell.component.html',
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);

  private readonly router = inject(Router);

  protected salir(): void {
    this.auth.logout().subscribe({
      complete: () => void this.router.navigateByUrl('/login'),
    });
  }
}
