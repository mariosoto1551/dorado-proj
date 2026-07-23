import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, map, Observable, of, shareReplay, tap } from 'rxjs';

import { Rol, type AdminLoginResponse, type JwtPayload, type PlatformAdminDto } from '@dorado/shared-types';

import { environment } from '../../../environments/environment';
import { decodificarJwtPayload } from './jwt.util';

export interface AdminLoginDatos {
  email: string;
  password: string;
}

/**
 * Sesión del panel de plataforma (fase-14-05 + CLAUDE.md regla 7): el access
 * token vive SOLO en este signal en memoria, nunca en localStorage. Se pierde
 * al recargar; el refresh silencioso (cookie httpOnly dorado_refresh, que
 * viaja sola con withCredentials) lo rehidrata contra /api/auth/admin/refresh.
 * Aislada de la sesión tenant de app-web: es otra app, otro origen.
 */
@Injectable({ providedIn: 'root' })
export class SesionAdminService {
  private readonly http = inject(HttpClient);

  private readonly base = `${environment.apiBaseUrl}/auth/admin`;

  private readonly accessTokenSignal = signal<string | null>(null);

  private readonly perfilSignal = signal<PlatformAdminDto | null>(null);

  private refreshEnCurso: Observable<boolean> | null = null;

  readonly accessToken = this.accessTokenSignal.asReadonly();

  readonly perfil = this.perfilSignal.asReadonly();

  readonly sesionActiva = computed(() => this.accessTokenSignal() !== null);

  private readonly payload = computed<JwtPayload | null>(() => {
    const token = this.accessTokenSignal();

    return token ? decodificarJwtPayload(token) : null;
  });

  /** true solo si el token es realmente de un PLATFORM_ADMIN. */
  readonly esPlatformAdmin = computed(() => this.payload()?.rol === Rol.PLATFORM_ADMIN);

  login(datos: AdminLoginDatos): Observable<AdminLoginResponse> {
    return this.http
      .post<AdminLoginResponse>(`${this.base}/login`, datos, { withCredentials: true })
      .pipe(tap((sesion) => this.establecerSesion(sesion.accessToken, sesion.perfil)));
  }

  /**
   * POST /api/auth/admin/refresh — la cookie httpOnly viaja sola. Comparte UNA
   * llamada en vuelo (el refresh token rota en cada uso, ADR-00 §3).
   */
  refrescar(): Observable<boolean> {
    if (this.refreshEnCurso) {
      return this.refreshEnCurso;
    }

    this.refreshEnCurso = this.http
      .post<AdminLoginResponse>(`${this.base}/refresh`, {}, { withCredentials: true })
      .pipe(
        tap((sesion) => this.establecerSesion(sesion.accessToken, sesion.perfil)),
        map(() => true),
        catchError(() => {
          this.limpiarSesion();

          return of(false);
        }),
        tap({ finalize: () => (this.refreshEnCurso = null) }),
        shareReplay(1)
      );

    return this.refreshEnCurso;
  }

  logout(): Observable<void> {
    const limpiar = () => this.limpiarSesion();

    return this.http.post<void>(`${this.base}/logout`, {}, { withCredentials: true }).pipe(
      tap({ next: limpiar, error: limpiar }),
      catchError(() => of(undefined))
    );
  }

  nombreMostrable(): string {
    return this.perfilSignal()?.email ?? 'Administrador';
  }

  iniciales(): string {
    const nombre = this.perfilSignal()?.nombre ?? 'A';

    return nombre
      .split(' ')
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
  }

  private establecerSesion(accessToken: string, perfil: PlatformAdminDto): void {
    this.accessTokenSignal.set(accessToken);
    this.perfilSignal.set(perfil);
  }

  private limpiarSesion(): void {
    this.accessTokenSignal.set(null);
    this.perfilSignal.set(null);
  }
}
