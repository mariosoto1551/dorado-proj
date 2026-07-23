import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';

import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Login unificado (spec fase-03): un solo form para Tutor (email) y Usuario
 * (username) — el campo `identificador` acepta cualquiera de los dos y el
 * backend resuelve.
 */
@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login-page.component.html',
})
export class LoginPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  private readonly auth = inject(AuthService);

  private readonly router = inject(Router);

  protected readonly cargando = signal(false);

  protected readonly error = signal<string | null>(null);

  protected readonly destacados = [
    'Seguí el puntaje de cada participante en tiempo real.',
    'Registrá conductas y actividades en segundos.',
    'Canjeá recompensas sin planillas ni cuentas a mano.',
  ];

  protected readonly form = this.fb.group({
    identificador: ['', Validators.required],
    password: ['', Validators.required],
  });

  protected enviar(): void {
    if (this.form.invalid || this.cargando()) {
      this.form.markAllAsTouched();

      return;
    }

    this.cargando.set(true);
    this.error.set(null);

    this.auth
      .login(this.form.getRawValue())
      .pipe(switchMap(() => this.auth.destinoPostLogin()))
      .subscribe({
        next: (destino) => void this.router.navigateByUrl(destino),
        error: (err: unknown) => {
          this.error.set(mensajeDeError(err));
          this.cargando.set(false);
        },
      });
  }
}
