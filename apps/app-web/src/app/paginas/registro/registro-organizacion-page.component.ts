import { Component, inject, signal } from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
  type ValidationErrors,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';

/** Valida a nivel grupo que password y su confirmación coincidan. */
function passwordsCoinciden(grupo: AbstractControl): ValidationErrors | null {
  const password = grupo.get('password')?.value;
  const confirmacion = grupo.get('passwordConfirmacion')?.value;

  return password === confirmacion ? null : { passwordMismatch: true };
}

/**
 * Auto-registro de organización (spec fase-03): crea la Organización y su
 * Tutor ORG_ADMIN, deja la sesión iniciada y va directo al onboarding a crear
 * el primer Grupo.
 */
@Component({
  selector: 'app-registro-organizacion-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './registro-organizacion-page.component.html',
})
export class RegistroOrganizacionPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  private readonly auth = inject(AuthService);

  private readonly router = inject(Router);

  protected readonly cargando = signal(false);

  protected readonly error = signal<string | null>(null);

  protected readonly destacados = [
    'Tu cuenta queda como administrador (tutor) de la organización.',
    'Creás grupos, actividades y recompensas a tu medida.',
    'Invitás a otros tutores y participantes cuando quieras.',
  ];

  protected readonly form = this.fb.group(
    {
      nombre: ['', [Validators.required, Validators.maxLength(120)]],
      emailContacto: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      passwordConfirmacion: ['', [Validators.required]],
    },
    { validators: passwordsCoinciden }
  );

  protected enviar(): void {
    if (this.form.invalid || this.cargando()) {
      this.form.markAllAsTouched();

      return;
    }

    this.cargando.set(true);
    this.error.set(null);

    const { nombre, emailContacto, password } = this.form.getRawValue();

    this.auth.registrarOrganizacion({ nombre, emailContacto, password }).subscribe({
      // Organización recién creada: nunca tiene grupos → onboarding directo.
      next: () => void this.router.navigateByUrl('/onboarding'),
      error: (err: unknown) => {
        this.error.set(mensajeDeError(err));
        this.cargando.set(false);
      },
    });
  }
}
