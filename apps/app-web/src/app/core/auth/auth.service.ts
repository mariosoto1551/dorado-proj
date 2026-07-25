import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable, of, shareReplay, tap } from 'rxjs';

import { PrincipalType, Rol, type GrupoDto, type JwtPayload, type TutorDto, type UsuarioDto } from '@dorado/shared-types';

import { environment } from '../../../environments/environment';
import type {
  RegistrarOrganizacionRespuesta,
  SesionRespuesta,
} from './auth.types';
import { decodificarJwtPayload } from './jwt.util';

export interface LoginDatos {
  identificador: string;
  password: string;
}

export interface RegistroOrganizacionDatos {
  nombre: string;
  emailContacto: string;
  password: string;
}

export interface CanjeInvitacionDatos {
  nombre: string;
  password: string;
  email?: string;
  username?: string;
}

/**
 * Sesión de app-web (fase-03 + CLAUDE.md regla 7): el access token vive SOLO
 * en este signal en memoria — nunca localStorage/sessionStorage. Se pierde al
 * recargar la página a propósito; el refresh silencioso (cookie httpOnly
 * dorado_refresh, que viaja sola con withCredentials) lo rehidrata.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly accessTokenSignal = signal<string | null>(null);

  private readonly perfilSignal = signal<TutorDto | UsuarioDto | null>(null);

  private refreshEnCurso: Observable<boolean> | null = null;

  readonly accessToken = this.accessTokenSignal.asReadonly();

  readonly perfil = this.perfilSignal.asReadonly();

  readonly sesionActiva = computed(() => this.accessTokenSignal() !== null);

  readonly payload = computed<JwtPayload | null>(() => {
    const token = this.accessTokenSignal();

    return token ? decodificarJwtPayload(token) : null;
  });

  readonly rol = computed<Rol | null>(() => this.payload()?.rol ?? null);

  readonly esTutor = computed(
    () => this.rol() === Rol.ORG_ADMIN || this.rol() === Rol.TUTOR
  );

  readonly esOrgAdmin = computed(() => this.rol() === Rol.ORG_ADMIN);

  /** Id del principal autenticado (sub del JWT): tutorId o usuarioId. */
  readonly principalId = computed<string | null>(() => this.payload()?.sub ?? null);

  /** Grupos del JWT (para USUARIO: TODOS los suyos; para TUTOR: los asignados). */
  readonly grupoIds = computed<string[]>(() => this.payload()?.grupoIds ?? []);

  /** Grupos del participante autenticado (fase-14, multi-grupo). Vacío si es tutor. */
  readonly gruposUsuario = computed<string[]>(() => (this.esTutor() ? [] : this.grupoIds()));

  /** Grupo elegido explícitamente por el participante en el selector (o null). */
  private readonly grupoActivoSeleccionado = signal<string | null>(null);

  /**
   * Grupo ACTIVO del USUARIO autenticado (fase-14): el que eligió en el selector
   * si sigue siendo válido, o el primero por defecto. Null para tutores. Con un
   * solo grupo (caso más común) se comporta igual que antes.
   */
  readonly grupoUsuario = computed<string | null>(() => {
    if (this.esTutor()) {
      return null;
    }

    const grupos = this.gruposUsuario();
    const elegido = this.grupoActivoSeleccionado();

    return elegido && grupos.includes(elegido) ? elegido : (grupos[0] ?? null);
  });

  /** Cambia el grupo activo del participante (usado por el selector de grupo). */
  seleccionarGrupoUsuario(grupoId: string): void {
    this.grupoActivoSeleccionado.set(grupoId);
  }

  login(datos: LoginDatos): Observable<SesionRespuesta> {
    return this.http
      .post<SesionRespuesta>(`${environment.apiBaseUrl}/auth/login`, datos, {
        withCredentials: true,
      })
      .pipe(tap((sesion) => this.establecerSesion(sesion.accessToken, sesion.perfil)));
  }

  registrarOrganizacion(
    datos: RegistroOrganizacionDatos
  ): Observable<RegistrarOrganizacionRespuesta> {
    return this.http
      .post<RegistrarOrganizacionRespuesta>(
        `${environment.apiBaseUrl}/auth/organizaciones`,
        datos,
        { withCredentials: true }
      )
      .pipe(tap((respuesta) => this.establecerSesion(respuesta.accessToken, respuesta.tutor)));
  }

  /**
   * Aceptar una invitación CON LA SESIÓN ACTUAL (fase-14): no crea cuenta, une
   * al principal logueado al grupo. Devuelve una sesión nueva (el JWT ya trae el
   * grupo sumado) y la deja activa, igual que un login.
   */
  aceptarInvitacion(codigo: string): Observable<SesionRespuesta> {
    return this.http
      .post<SesionRespuesta>(
        `${environment.apiBaseUrl}/identity/invitaciones/${codigo}/aceptar`,
        {},
        { withCredentials: true }
      )
      .pipe(tap((sesion) => this.establecerSesion(sesion.accessToken, sesion.perfil)));
  }

  canjearInvitacion(codigo: string, datos: CanjeInvitacionDatos): Observable<SesionRespuesta> {
    return this.http
      .post<SesionRespuesta>(
        `${environment.apiBaseUrl}/auth/invitaciones/${codigo}/canjear`,
        datos,
        { withCredentials: true }
      )
      .pipe(tap((sesion) => this.establecerSesion(sesion.accessToken, sesion.perfil)));
  }

  /**
   * POST /api/auth/refresh — la cookie httpOnly viaja sola. Devuelve true si
   * la sesión quedó hidratada. Comparte UNA llamada en vuelo entre quienes la
   * pidan a la vez: el refresh token rota en cada uso (ADR-00 §3), dos
   * llamadas paralelas harían que la segunda pise un token ya revocado.
   */
  refrescar(): Observable<boolean> {
    if (this.refreshEnCurso) {
      return this.refreshEnCurso;
    }

    this.refreshEnCurso = this.http
      .post<SesionRespuesta>(
        `${environment.apiBaseUrl}/auth/refresh`,
        {},
        { withCredentials: true }
      )
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

  /** Limpia la sesión local e invalida el refresh token en el servidor. */
  logout(): Observable<void> {
    const limpiar = () => this.limpiarSesion();

    return this.http
      .post<void>(`${environment.apiBaseUrl}/auth/logout`, {}, { withCredentials: true })
      .pipe(
        tap({ next: limpiar, error: limpiar }),
        catchError(() => of(undefined))
      );
  }

  /**
   * Destino post-login/post-canje (spec fase-03): USUARIO va a '/'; un tutor
   * (ORG_ADMIN/TUTOR) sin grupos todavía va a '/onboarding' a crear el primero.
   * grupoIds del JWT no alcanza para ORG_ADMIN (viene vacío por diseño, tiene
   * acceso implícito a todos) — se consulta la lista real.
   */
  destinoPostLogin(): Observable<string> {
    if (!this.esTutor()) {
      return of('/');
    }

    return this.http
      .get<GrupoDto[]>(`${environment.apiBaseUrl}/identity/grupos`, {
        withCredentials: true,
      })
      .pipe(
        map((grupos) => (grupos.length === 0 ? '/onboarding' : '/')),
        catchError(() => of('/'))
      );
  }

  nombreMostrable(): string {
    const perfil = this.perfilSignal();

    if (perfil) {
      return perfil.nombre;
    }

    return this.payload()?.principalType === PrincipalType.USUARIO ? 'Usuario' : 'Tutor';
  }

  private establecerSesion(accessToken: string, perfil: TutorDto | UsuarioDto): void {
    this.accessTokenSignal.set(accessToken);
    this.perfilSignal.set(perfil);
  }

  private limpiarSesion(): void {
    this.accessTokenSignal.set(null);
    this.perfilSignal.set(null);
  }
}
