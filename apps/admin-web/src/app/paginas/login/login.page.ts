import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { mensajeDeError } from '../../core/api/errores';
import { SesionAdminService } from '../../core/auth/sesion-admin.service';

/** Login del panel de plataforma (POST /api/auth/admin/login). */
@Component({
  selector: 'admin-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="login-screen fade">
      <form class="loginbox" (ngSubmit)="entrar()">
        <div class="mark">D</div>
        <h1>Panel de plataforma</h1>
        <p class="sub">Gestión de organizaciones y planes</p>

        @if (error()) {
          <div class="formerror">{{ error() }}</div>
        }

        <div class="field">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" autocomplete="username" [(ngModel)]="email" required />
        </div>
        <div class="field">
          <label for="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            autocomplete="current-password"
            [(ngModel)]="password"
            required
          />
        </div>

        <button class="btn primary" type="submit" [disabled]="cargando()">
          {{ cargando() ? 'Entrando…' : 'Entrar' }}
        </button>
        <p class="note">
          Acceso exclusivo de <code>PLATFORM_ADMIN</code>.<br />
          Las cuentas de organización no pueden ingresar acá.
        </p>
      </form>
    </div>
  `,
})
export class LoginPage {
  private readonly sesion = inject(SesionAdminService);

  private readonly router = inject(Router);

  protected email = '';

  protected password = '';

  protected readonly cargando = signal(false);

  protected readonly error = signal<string | null>(null);

  protected entrar(): void {
    if (this.cargando() || !this.email || !this.password) {
      return;
    }

    this.cargando.set(true);
    this.error.set(null);

    this.sesion.login({ email: this.email, password: this.password }).subscribe({
      next: () => {
        void this.router.navigate(['/organizaciones']);
      },
      error: (err) => {
        this.error.set(mensajeDeError(err));
        this.cargando.set(false);
      },
    });
  }
}
