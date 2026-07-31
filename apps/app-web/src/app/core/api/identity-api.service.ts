import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import type {
  ActualizarRolGrupoRequest,
  AgregarMiembroEquipoRequest,
  AsignarRolGrupoRequest,
  CrearEquipoRequest,
  CrearRolGrupoRequest,
  EditarEquipoRequest,
  EquipoDto,
  GrupoDto,
  InvitacionDto,
  MiEquipoDto,
  RolGrupoDto,
  SustituirJefeEquipoRequest,
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

  /** Grupos del principal autenticado — sirve también para USUARIO (fase-14). */
  misGrupos(): Observable<GrupoDto[]> {
    return this.http.get<GrupoDto[]>(`${this.base}/mis-grupos`);
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

  // ---- Equipos de trabajo (fase-14-09) ----
  listarEquipos(grupoId: string): Observable<EquipoDto[]> {
    return this.http.get<EquipoDto[]>(`${this.base}/grupos/${grupoId}/equipos`);
  }

  crearEquipo(grupoId: string, datos: CrearEquipoRequest): Observable<EquipoDto> {
    return this.http.post<EquipoDto>(`${this.base}/grupos/${grupoId}/equipos`, datos);
  }

  obtenerEquipo(equipoId: string): Observable<EquipoDto> {
    return this.http.get<EquipoDto>(`${this.base}/equipos/${equipoId}`);
  }

  editarEquipo(equipoId: string, datos: EditarEquipoRequest): Observable<EquipoDto> {
    return this.http.patch<EquipoDto>(`${this.base}/equipos/${equipoId}`, datos);
  }

  agregarMiembroEquipo(equipoId: string, datos: AgregarMiembroEquipoRequest): Observable<EquipoDto> {
    return this.http.post<EquipoDto>(`${this.base}/equipos/${equipoId}/miembros`, datos);
  }

  quitarMiembroEquipo(equipoId: string, usuarioId: string): Observable<EquipoDto> {
    return this.http.delete<EquipoDto>(`${this.base}/equipos/${equipoId}/miembros/${usuarioId}`);
  }

  sustituirJefeEquipo(equipoId: string, datos: SustituirJefeEquipoRequest): Observable<EquipoDto> {
    return this.http.post<EquipoDto>(`${this.base}/equipos/${equipoId}/jefe`, datos);
  }

  /** Equipos del participante autenticado (uno por grupo). */
  misEquipos(): Observable<MiEquipoDto[]> {
    return this.http.get<MiEquipoDto[]>(`${this.base}/mis-equipos`);
  }

  // ---- Roles del participante dentro del Grupo (fase-14-19) ----
  //
  // `RolGrupo` no es el `Rol` de plataforma: es la etiqueta funcional que define
  // el Tutor ("cocina", "mascotas") y que restringe qué actividades ve cada uno.

  /**
   * Catálogo de roles del grupo. Sirve al Tutor (con `cantidadAsignados`) y al
   * participante (solo los ACTIVO, para pintar los chips de sus compañeros).
   */
  listarRolesGrupo(grupoId: string, incluirArchivados = false): Observable<RolGrupoDto[]> {
    const query = incluirArchivados ? '?incluirArchivados=true' : '';

    return this.http.get<RolGrupoDto[]>(`${this.base}/grupos/${grupoId}/roles${query}`);
  }

  crearRolGrupo(grupoId: string, datos: CrearRolGrupoRequest): Observable<RolGrupoDto> {
    return this.http.post<RolGrupoDto>(`${this.base}/grupos/${grupoId}/roles`, datos);
  }

  /** Renombrar, recolorear o archivar. Archivar desasigna a sus participantes. */
  actualizarRolGrupo(
    rolGrupoId: string,
    datos: ActualizarRolGrupoRequest
  ): Observable<RolGrupoDto> {
    return this.http.patch<RolGrupoDto>(`${this.base}/roles/${rolGrupoId}`, datos);
  }

  /** Asignar, cambiar o quitar (`rolGrupoId: null`) el rol de un participante. */
  asignarRolGrupo(
    grupoId: string,
    usuarioId: string,
    datos: AsignarRolGrupoRequest
  ): Observable<RolGrupoDto | null> {
    return this.http.put<RolGrupoDto | null>(
      `${this.base}/grupos/${grupoId}/usuarios/${usuarioId}/rol`,
      datos
    );
  }
}
