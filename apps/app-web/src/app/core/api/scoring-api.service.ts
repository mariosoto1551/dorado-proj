import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import type {
  ConfiguracionScoringGrupoDto,
  DescalificacionDto,
  EventoPuntosDto,
  PuntajeUsuarioDto,
  UmbralZonaDto,
} from '@dorado/shared-types';

import { environment } from '../../../environments/environment';
import type {
  CorregirEventoPuntosRequest,
  CrearUmbralRequest,
  DescalificarUsuarioRequest,
  EditarUmbralRequest,
} from './api.types';

/** Cliente REST de scoring-service: umbrales, puntajes derivados, descalificaciones, correcciones. */
@Injectable({ providedIn: 'root' })
export class ScoringApiService {
  private readonly http = inject(HttpClient);

  private readonly base = `${environment.apiBaseUrl}/scoring`;

  // ---- Umbrales de zona ----
  listarUmbrales(grupoId: string): Observable<UmbralZonaDto[]> {
    return this.http.get<UmbralZonaDto[]>(`${this.base}/grupos/${grupoId}/umbrales`);
  }

  crearUmbral(grupoId: string, datos: CrearUmbralRequest): Observable<UmbralZonaDto> {
    return this.http.post<UmbralZonaDto>(`${this.base}/grupos/${grupoId}/umbrales`, datos);
  }

  editarUmbral(umbralId: string, datos: EditarUmbralRequest): Observable<UmbralZonaDto> {
    return this.http.patch<UmbralZonaDto>(`${this.base}/umbrales/${umbralId}`, datos);
  }

  eliminarUmbral(umbralId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/umbrales/${umbralId}`);
  }

  // ---- Configuración de scoring (puntos iniciales por Sección) ----
  obtenerConfiguracion(grupoId: string): Observable<ConfiguracionScoringGrupoDto> {
    return this.http.get<ConfiguracionScoringGrupoDto>(
      `${this.base}/grupos/${grupoId}/configuracion`
    );
  }

  guardarConfiguracion(
    grupoId: string,
    datos: ConfiguracionScoringGrupoDto
  ): Observable<ConfiguracionScoringGrupoDto> {
    return this.http.put<ConfiguracionScoringGrupoDto>(
      `${this.base}/grupos/${grupoId}/configuracion`,
      datos
    );
  }

  // ---- Puntajes (derivados del ledger) ----
  puntajeDeUsuario(usuarioId: string, seccionId: string): Observable<PuntajeUsuarioDto> {
    return this.http.get<PuntajeUsuarioDto>(
      `${this.base}/usuarios/${usuarioId}/secciones/${seccionId}/puntaje`
    );
  }

  puntajesDeGrupo(grupoId: string, seccionId: string): Observable<PuntajeUsuarioDto[]> {
    return this.http.get<PuntajeUsuarioDto[]>(
      `${this.base}/grupos/${grupoId}/secciones/${seccionId}/puntajes`
    );
  }

  // ---- Descalificaciones ----
  listarDescalificaciones(seccionId: string): Observable<DescalificacionDto[]> {
    return this.http.get<DescalificacionDto[]>(
      `${this.base}/secciones/${seccionId}/descalificaciones`
    );
  }

  descalificar(
    seccionId: string,
    usuarioId: string,
    datos: DescalificarUsuarioRequest
  ): Observable<DescalificacionDto> {
    return this.http.post<DescalificacionDto>(
      `${this.base}/secciones/${seccionId}/usuarios/${usuarioId}/descalificar`,
      datos
    );
  }

  // ---- Correcciones post-cierre ----
  corregirEvento(
    eventoPuntosId: string,
    datos: CorregirEventoPuntosRequest
  ): Observable<EventoPuntosDto> {
    return this.http.post<EventoPuntosDto>(
      `${this.base}/eventos-puntos/${eventoPuntosId}/corregir`,
      datos
    );
  }
}
