import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import type {
  GrupoDto,
  InvitacionDto,
  TutorDto,
  UsuarioDto,
} from '@dorado/shared-types';

import { environment } from '../../../environments/environment';
import type {
  CrearGrupoRequest,
  CrearInvitacionRequest,
  EditarGrupoRequest,
  EditarUsuarioRequest,
} from './api.types';

/** Cliente REST de identity-service vía el Gateway (grupos/usuarios/tutores/invitaciones). */
@Injectable({ providedIn: 'root' })
export class IdentityApiService {
  private readonly http = inject(HttpClient);

  private readonly base = `${environment.apiBaseUrl}/identity`;

  listarGrupos(): Observable<GrupoDto[]> {
    return this.http.get<GrupoDto[]>(`${this.base}/grupos`);
  }

  obtenerGrupo(grupoId: string): Observable<GrupoDto> {
    return this.http.get<GrupoDto>(`${this.base}/grupos/${grupoId}`);
  }

  crearGrupo(datos: CrearGrupoRequest): Observable<GrupoDto> {
    return this.http.post<GrupoDto>(`${this.base}/grupos`, datos);
  }

  editarGrupo(grupoId: string, datos: EditarGrupoRequest): Observable<GrupoDto> {
    return this.http.patch<GrupoDto>(`${this.base}/grupos/${grupoId}`, datos);
  }

  listarUsuarios(grupoId: string): Observable<UsuarioDto[]> {
    return this.http.get<UsuarioDto[]>(`${this.base}/grupos/${grupoId}/usuarios`);
  }

  editarUsuario(usuarioId: string, datos: EditarUsuarioRequest): Observable<UsuarioDto> {
    return this.http.patch<UsuarioDto>(`${this.base}/usuarios/${usuarioId}`, datos);
  }

  desactivarUsuario(usuarioId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/usuarios/${usuarioId}`);
  }

  listarTutores(grupoId: string): Observable<TutorDto[]> {
    return this.http.get<TutorDto[]>(`${this.base}/grupos/${grupoId}/tutores`);
  }

  desactivarTutor(tutorId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/tutores/${tutorId}`);
  }

  listarInvitaciones(grupoId: string): Observable<InvitacionDto[]> {
    return this.http.get<InvitacionDto[]>(`${this.base}/grupos/${grupoId}/invitaciones`);
  }

  crearInvitacion(grupoId: string, datos: CrearInvitacionRequest): Observable<InvitacionDto> {
    return this.http.post<InvitacionDto>(`${this.base}/grupos/${grupoId}/invitaciones`, datos);
  }

  revocarInvitacion(invitacionId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/invitaciones/${invitacionId}`);
  }
}
