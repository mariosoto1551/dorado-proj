import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import type {
  AdminCambiarEstadoOrgResponse,
  AdminCambiarPlanResponse,
  AdminListarOrganizacionesResponse,
  AdminOrganizacionDetalleDto,
  CodigoPlan,
  EstadoOrganizacion,
} from '@dorado/shared-types';

import { environment } from '../../../environments/environment';

export interface FiltrosOrganizaciones {
  q?: string;
  plan?: CodigoPlan | '';
  estado?: EstadoOrganizacion | '';
  page?: number;
  pageSize?: number;
}

/** Cliente REST del panel de plataforma vía el Gateway (fase-14-05). */
@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);

  private readonly base = `${environment.apiBaseUrl}/admin`;

  listarOrganizaciones(filtros: FiltrosOrganizaciones): Observable<AdminListarOrganizacionesResponse> {
    let params = new HttpParams();

    if (filtros.q) {
      params = params.set('q', filtros.q);
    }
    if (filtros.plan) {
      params = params.set('plan', filtros.plan);
    }
    if (filtros.estado) {
      params = params.set('estado', filtros.estado);
    }
    params = params.set('page', String(filtros.page ?? 1));
    params = params.set('pageSize', String(filtros.pageSize ?? 20));

    return this.http.get<AdminListarOrganizacionesResponse>(`${this.base}/organizaciones`, {
      params,
    });
  }

  detalleOrganizacion(id: string): Observable<AdminOrganizacionDetalleDto> {
    return this.http.get<AdminOrganizacionDetalleDto>(`${this.base}/organizaciones/${id}`);
  }

  cambiarPlan(id: string, plan: CodigoPlan): Observable<AdminCambiarPlanResponse> {
    return this.http.post<AdminCambiarPlanResponse>(`${this.base}/organizaciones/${id}/plan`, {
      plan,
    });
  }

  cambiarEstado(
    id: string,
    estado: EstadoOrganizacion
  ): Observable<AdminCambiarEstadoOrgResponse> {
    return this.http.post<AdminCambiarEstadoOrgResponse>(
      `${this.base}/organizaciones/${id}/estado`,
      { estado }
    );
  }
}
