import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import type { CanjeRecompensaDto, RecompensaDto } from '@dorado/shared-types';

import { environment } from '../../../environments/environment';
import type {
  CrearRecompensaRequest,
  EditarRecompensaRequest,
  ElegiblesResponse,
  SeleccionarRecompensaRequest,
} from './api.types';

/** Cliente REST de rewards-service: catálogo de recompensas + elegibles/canjes. */
@Injectable({ providedIn: 'root' })
export class RewardsApiService {
  private readonly http = inject(HttpClient);

  private readonly base = `${environment.apiBaseUrl}/rewards`;

  // ---- Catálogo ----
  listarRecompensas(grupoId: string, estado?: 'ACTIVA' | 'ARCHIVADA'): Observable<RecompensaDto[]> {
    let params = new HttpParams();

    if (estado) {
      params = params.set('estado', estado);
    }

    return this.http.get<RecompensaDto[]>(`${this.base}/grupos/${grupoId}/recompensas`, { params });
  }

  crearRecompensa(grupoId: string, datos: CrearRecompensaRequest): Observable<RecompensaDto> {
    return this.http.post<RecompensaDto>(`${this.base}/grupos/${grupoId}/recompensas`, datos);
  }

  editarRecompensa(recompensaId: string, datos: EditarRecompensaRequest): Observable<RecompensaDto> {
    return this.http.patch<RecompensaDto>(`${this.base}/recompensas/${recompensaId}`, datos);
  }

  archivarRecompensa(recompensaId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/recompensas/${recompensaId}`);
  }

  // ---- Elegibles / canjes ----
  elegibles(usuarioId: string, seccionId: string): Observable<ElegiblesResponse> {
    return this.http.get<ElegiblesResponse>(
      `${this.base}/usuarios/${usuarioId}/secciones/${seccionId}/elegibles`
    );
  }

  seleccionar(
    usuarioId: string,
    seccionId: string,
    datos: SeleccionarRecompensaRequest
  ): Observable<CanjeRecompensaDto> {
    return this.http.post<CanjeRecompensaDto>(
      `${this.base}/usuarios/${usuarioId}/secciones/${seccionId}/seleccionar`,
      datos
    );
  }

  sortear(usuarioId: string, seccionId: string): Observable<CanjeRecompensaDto> {
    return this.http.post<CanjeRecompensaDto>(
      `${this.base}/usuarios/${usuarioId}/secciones/${seccionId}/sortear`,
      {}
    );
  }

  listarCanjes(grupoId: string, seccionId: string): Observable<CanjeRecompensaDto[]> {
    return this.http.get<CanjeRecompensaDto[]>(
      `${this.base}/grupos/${grupoId}/secciones/${seccionId}/canjes`
    );
  }

  marcarEntregada(canjeId: string): Observable<CanjeRecompensaDto> {
    return this.http.patch<CanjeRecompensaDto>(`${this.base}/canjes/${canjeId}/entregar`, {});
  }
}
