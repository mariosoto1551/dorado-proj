import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import type {
  ActividadDto,
  ConductaDto,
  MiEstadoHoyDto,
  RegistroActividadDto,
  RegistroConductaDto,
} from '@dorado/shared-types';

import { environment } from '../../../environments/environment';
import type {
  CrearActividadRequest,
  CrearConductaRequest,
  EditarActividadRequest,
  EditarConductaRequest,
  IniciarCronometroResponse,
} from './api.types';

/** Cliente REST de activity-service: catálogo (actividades/conductas) + registros. */
@Injectable({ providedIn: 'root' })
export class ActivityApiService {
  private readonly http = inject(HttpClient);

  private readonly base = `${environment.apiBaseUrl}/activity`;

  // ---- Actividades ----
  listarActividades(grupoId: string, estado?: 'ACTIVA' | 'ARCHIVADA'): Observable<ActividadDto[]> {
    let params = new HttpParams();

    if (estado) {
      params = params.set('estado', estado);
    }

    return this.http.get<ActividadDto[]>(`${this.base}/grupos/${grupoId}/actividades`, { params });
  }

  crearActividad(grupoId: string, datos: CrearActividadRequest): Observable<ActividadDto> {
    return this.http.post<ActividadDto>(`${this.base}/grupos/${grupoId}/actividades`, datos);
  }

  editarActividad(actividadId: string, datos: EditarActividadRequest): Observable<ActividadDto> {
    return this.http.patch<ActividadDto>(`${this.base}/actividades/${actividadId}`, datos);
  }

  archivarActividad(actividadId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/actividades/${actividadId}`);
  }

  /** Estado real de las actividades de hoy del propio usuario (fase-14-08). */
  miEstadoHoy(grupoId: string): Observable<MiEstadoHoyDto> {
    return this.http.get<MiEstadoHoyDto>(`${this.base}/grupos/${grupoId}/mi-estado-hoy`);
  }

  // ---- Conductas ----
  listarConductas(grupoId: string, estado?: 'ACTIVA' | 'ARCHIVADA'): Observable<ConductaDto[]> {
    let params = new HttpParams();

    if (estado) {
      params = params.set('estado', estado);
    }

    return this.http.get<ConductaDto[]>(`${this.base}/grupos/${grupoId}/conductas`, { params });
  }

  crearConducta(grupoId: string, datos: CrearConductaRequest): Observable<ConductaDto> {
    return this.http.post<ConductaDto>(`${this.base}/grupos/${grupoId}/conductas`, datos);
  }

  editarConducta(conductaId: string, datos: EditarConductaRequest): Observable<ConductaDto> {
    return this.http.patch<ConductaDto>(`${this.base}/conductas/${conductaId}`, datos);
  }

  archivarConducta(conductaId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/conductas/${conductaId}`);
  }

  // ---- Registros ----
  completarActividad(actividadId: string, usuarioId?: string): Observable<RegistroActividadDto> {
    return this.http.post<RegistroActividadDto>(
      `${this.base}/actividades/${actividadId}/completar`,
      usuarioId ? { usuarioId } : {}
    );
  }

  iniciarCronometro(actividadId: string): Observable<IniciarCronometroResponse> {
    return this.http.post<IniciarCronometroResponse>(
      `${this.base}/actividades/${actividadId}/iniciar-cronometro`,
      {}
    );
  }

  registrarNoHizo(actividadId: string, usuarioId: string): Observable<RegistroActividadDto> {
    return this.http.post<RegistroActividadDto>(
      `${this.base}/actividades/${actividadId}/no-hizo`,
      { usuarioId }
    );
  }

  registrarConducta(conductaId: string, usuarioId?: string): Observable<RegistroConductaDto> {
    return this.http.post<RegistroConductaDto>(
      `${this.base}/conductas/${conductaId}/registrar`,
      usuarioId ? { usuarioId } : {}
    );
  }
}
