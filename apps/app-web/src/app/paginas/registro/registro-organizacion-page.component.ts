import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';

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

  protected readonly form = this.fb.group({
    nombre: ['', [Validators.required, Validators.maxLength(120)]],
    emailContacto: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected enviar(): void {
    if (this.form.invalid || this.cargando()) {
      this.form.markAllAsTouched();

      return;
    }

    this.cargando.set(true);
    this.error.set(null);

    this.auth.registrarOrganizacion(this.form.getRawValue()).subscribe({
      // Organización recién creada: nunca tiene grupos → onboarding directo.
      next: () => void this.router.navigateByUrl('/onboarding'),
      error: (err: unknown) => {
        this.error.set(mensajeDeError(err));
        this.cargando.set(false);
      },
    });
  }
}
