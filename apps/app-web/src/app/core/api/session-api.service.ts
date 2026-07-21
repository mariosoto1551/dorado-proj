import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import type {
  ConfiguracionSesionDto,
  EstadoSeccion,
  SeccionDto,
  SesionDto,
} from '@dorado/shared-types';

import { environment } from '../../../environments/environment';
import type {
  ExtenderSesionRequest,
  GuardarConfiguracionRequest,
  SeccionConSesionesResponse,
} from './api.types';

/** Cliente REST de session-service: configuración + máquina de estados de Sección/Sesión. */
@Injectable({ providedIn: 'root' })
export class SessionApiService {
  private readonly http = inject(HttpClient);

  private readonly base = `${environment.apiBaseUrl}/session`;

  // ---- Configuración ----
  obtenerConfiguracion(grupoId: string): Observable<ConfiguracionSesionDto> {
    return this.http.get<ConfiguracionSesionDto>(`${this.base}/grupos/${grupoId}/configuracion`);
  }

  guardarConfiguracion(
    grupoId: string,
    datos: GuardarConfiguracionRequest
  ): Observable<ConfiguracionSesionDto> {
    return this.http.put<ConfiguracionSesionDto>(
      `${this.base}/grupos/${grupoId}/configuracion`,
      datos
    );
  }

  // ---- Secciones ----
  seccionActual(grupoId: string): Observable<SeccionConSesionesResponse | null> {
    return this.http.get<SeccionConSesionesResponse | null>(
      `${this.base}/grupos/${grupoId}/secciones/actual`
    );
  }

  listarSecciones(grupoId: string, estado?: EstadoSeccion): Observable<SeccionDto[]> {
    let params = new HttpParams();

    if (estado) {
      params = params.set('estado', estado);
    }

    return this.http.get<SeccionDto[]>(`${this.base}/grupos/${grupoId}/secciones`, { params });
  }

  obtenerSeccion(seccionId: string): Observable<SeccionConSesionesResponse> {
    return this.http.get<SeccionConSesionesResponse>(`${this.base}/secciones/${seccionId}`);
  }

  iniciarSeccion(grupoId: string): Observable<SeccionConSesionesResponse> {
    return this.http.post<SeccionConSesionesResponse>(
      `${this.base}/grupos/${grupoId}/secciones/iniciar`,
      {}
    );
  }

  // Las mutaciones devuelven la fila afectada (SesionDto/SeccionDto), NO la
  // Sección completa con sus sesiones — el panel recarga seccionActual después.
  abrirSiguienteSesion(seccionId: string): Observable<SesionDto> {
    return this.http.post<SesionDto>(
      `${this.base}/secciones/${seccionId}/sesiones/abrir-siguiente`,
      {}
    );
  }

  forzarCierreSesion(seccionId: string, sesionId: string): Observable<SesionDto> {
    return this.http.post<SesionDto>(
      `${this.base}/secciones/${seccionId}/sesiones/${sesionId}/forzar-cierre`,
      {}
    );
  }

  extenderSesion(sesionId: string, datos: ExtenderSesionRequest): Observable<SesionDto> {
    return this.http.post<SesionDto>(`${this.base}/sesiones/${sesionId}/extender`, datos);
  }

  forzarEvaluacion(seccionId: string): Observable<SeccionDto> {
    return this.http.post<SeccionDto>(`${this.base}/secciones/${seccionId}/forzar-evaluacion`, {});
  }

  cerrarSeccion(seccionId: string): Observable<SeccionDto> {
    return this.http.post<SeccionDto>(`${this.base}/secciones/${seccionId}/cerrar`, {});
  }
}
