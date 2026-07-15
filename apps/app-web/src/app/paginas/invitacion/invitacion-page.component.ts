import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';

import { TipoInvitado } from '@dorado/shared-types';

import { environment } from '../../../environments/environment';
import { codigoDeError, mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';
import type { PreviewInvitacionRespuesta } from '../../core/auth/auth.types';

type EstadoPagina = 'cargando' | 'error' | 'valida';

const USERNAME_PATRON = /^[a-zA-Z0-9._-]{3,30}$/;

/**
 * Preview + canje de invitación (spec fase-03). El form cambia según
 * `tipoInvitado`: TUTOR pide email, USUARIO pide username. Un 404/410 muestra
 * un estado de error explícito, no un error genérico.
 */
@Component({
  selector: 'app-invitacion-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './invitacion-page.component.html',
})
export class InvitacionPageComponent {
  private readonly http = inject(HttpClient);

  private readonly fb = inject(NonNullableFormBuilder);

  private readonly auth = inject(AuthService);

  private readonly router = inject(Router);

  private readonly codigo = inject(ActivatedRoute).snapshot.paramMap.get('codigo') ?? '';

  protected readonly estado = signal<EstadoPagina>('cargando');

  protected readonly mensajeEstado = signal('');

  protected readonly preview = signal<PreviewInvitacionRespuesta | null>(null);

  protected readonly esUsuario = computed(
    () => this.preview()?.tipoInvitado === TipoInvitado.USUARIO
  );

  protected readonly cargando = signal(false);

  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    nombre: ['', [Validators.required, Validators.maxLength(120)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    email: [''],
    username: [''],
  });

  constructor() {
    this.cargarPreview();
  }

  protected enviar(): void {
    if (this.form.invalid || this.cargando()) {
      this.form.markAllAsTouched();

      return;
    }

    this.cargando.set(true);
    this.error.set(null);

    const valores = this.form.getRawValue();
    const datos = this.esUsuario()
      ? { nombre: valores.nombre, password: valores.password, username: valores.username }
      : { nombre: valores.nombre, password: valores.password, email: valores.email };

    this.auth
      .canjearInvitacion(this.codigo, datos)
      .pipe(switchMap(() => this.auth.destinoPostLogin()))
      .subscribe({
        next: (destino) => void this.router.navigateByUrl(destino),
        error: (err: unknown) => {
          this.error.set(mensajeDeError(err));
          this.cargando.set(false);
        },
      });
  }

  private cargarPreview(): void {
    this.http
      .get<PreviewInvitacionRespuesta>(
        `${environment.apiBaseUrl}/auth/invitaciones/${this.codigo}`
      )
      .subscribe({
        next: (preview) => {
          if (preview.estado !== 'PENDIENTE') {
            this.estado.set('error');
            this.mensajeEstado.set(this.mensajePorEstado(preview.estado));

            return;
          }

          this.preview.set(preview);
          this.ajustarValidadores(preview.tipoInvitado);
          this.estado.set('valida');
        },
        error: (err: unknown) => {
          this.estado.set('error');
          this.mensajeEstado.set(
            codigoDeError(err) === 'NO_ENCONTRADO'
              ? 'Esta invitación no existe. Revisá el enlace que te compartieron.'
              : mensajeDeError(err)
          );
        },
      });
  }

  private ajustarValidadores(tipo: 'TUTOR' | 'USUARIO'): void {
    if (tipo === TipoInvitado.USUARIO) {
      this.form.controls.username.setValidators([
        Validators.required,
        Validators.pattern(USERNAME_PATRON),
      ]);
    } else {
      this.form.controls.email.setValidators([Validators.required, Validators.email]);
    }

    this.form.controls.username.updateValueAndValidity();
    this.form.controls.email.updateValueAndValidity();
  }

  private mensajePorEstado(estado: string): string {
    switch (estado) {
      case 'CANJEADA':
        return 'Esta invitación ya fue usada.';
      case 'EXPIRADA':
        return 'Esta invitación está vencida. Pedile una nueva a tu tutor.';
      case 'REVOCADA':
        return 'Esta invitación fue revocada.';
      default:
        return 'Esta invitación ya no está disponible.';
    }
  }
}
