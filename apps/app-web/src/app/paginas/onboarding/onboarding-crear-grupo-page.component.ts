import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import type { GrupoDto } from '@dorado/shared-types';

import { environment } from '../../../environments/environment';
import { mensajeDeError } from '../../core/api/errores';

/**
 * Zonas horarias comunes para el selector (spec fase-03). La detectada por el
 * navegador se agrega arriba de todo si no está en la lista.
 */
const TIMEZONES_COMUNES = [
  'America/La_Paz',
  'America/Argentina/Buenos_Aires',
  'America/Santiago',
  'America/Lima',
  'America/Bogota',
  'America/Caracas',
  'America/Mexico_City',
  'America/Montevideo',
  'America/Asuncion',
  'America/Guayaquil',
  'America/Costa_Rica',
  'America/Santo_Domingo',
  'Europe/Madrid',
];

@Component({
  selector: 'app-onboarding-crear-grupo-page',
  imports: [ReactiveFormsModule],
  templateUrl: './onboarding-crear-grupo-page.component.html',
})
export class OnboardingCrearGrupoPageComponent {
  private readonly http = inject(HttpClient);

  private readonly fb = inject(NonNullableFormBuilder);

  private readonly router = inject(Router);

  protected readonly cargando = signal(false);

  protected readonly error = signal<string | null>(null);

  protected readonly timezones: readonly string[];

  protected readonly form;

  constructor() {
    const delNavegador = Intl.DateTimeFormat().resolvedOptions().timeZone;

    this.timezones = TIMEZONES_COMUNES.includes(delNavegador)
      ? TIMEZONES_COMUNES
      : [delNavegador, ...TIMEZONES_COMUNES];

    this.form = this.fb.group({
      nombre: ['', [Validators.required, Validators.maxLength(120)]],
      timezone: [delNavegador, Validators.required],
    });
  }

  protected enviar(): void {
    if (this.form.invalid || this.cargando()) {
      this.form.markAllAsTouched();

      return;
    }

    this.cargando.set(true);
    this.error.set(null);

    this.http
      .post<GrupoDto>(`${environment.apiBaseUrl}/identity/grupos`, this.form.getRawValue())
      .subscribe({
        next: () => void this.router.navigateByUrl('/'),
        error: (err: unknown) => {
          this.error.set(mensajeDeError(err));
          this.cargando.set(false);
        },
      });
  }
}
