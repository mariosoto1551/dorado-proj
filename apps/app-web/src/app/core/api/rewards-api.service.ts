import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import type {
  BilleteraDto,
  BolsaPremiosDto,
  CanjeRecompensaDto,
  CompraDto,
  ConfiguracionRecompensasGrupoDto,
  MiBilleteraResponse,
  PendienteEntregaDto,
  ProductoTiendaDto,
  RecompensaDto,
  RendimientoZonaDto,
} from '@dorado/shared-types';

import { environment } from '../../../environments/environment';
import type {
  AjustarMonedasRequest,
  AnularCastigoRequest,
  CambiarModoRecompensasRequest,
  ComprarRequest,
  ConfigurarRendimientosRequest,
  CrearProductoRequest,
  CrearRecompensaRequest,
  EditarProductoRequest,
  EditarRecompensaRequest,
  ElegiblesResponse,
  GuardarBolsaRequest,
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

  // ---- Tienda de monedas (fase-14-22) ----

  configuracion(grupoId: string): Observable<ConfiguracionRecompensasGrupoDto> {
    return this.http.get<ConfiguracionRecompensasGrupoDto>(
      `${this.base}/grupos/${grupoId}/configuracion`
    );
  }

  cambiarModo(
    grupoId: string,
    datos: CambiarModoRecompensasRequest
  ): Observable<ConfiguracionRecompensasGrupoDto> {
    return this.http.put<ConfiguracionRecompensasGrupoDto>(
      `${this.base}/grupos/${grupoId}/configuracion`,
      datos
    );
  }

  rendimientos(grupoId: string): Observable<RendimientoZonaDto[]> {
    return this.http.get<RendimientoZonaDto[]>(`${this.base}/grupos/${grupoId}/rendimientos`);
  }

  configurarRendimientos(
    grupoId: string,
    datos: ConfigurarRendimientosRequest
  ): Observable<RendimientoZonaDto[]> {
    return this.http.put<RendimientoZonaDto[]>(
      `${this.base}/grupos/${grupoId}/rendimientos`,
      datos
    );
  }

  listarBolsas(grupoId: string): Observable<BolsaPremiosDto[]> {
    return this.http.get<BolsaPremiosDto[]>(`${this.base}/grupos/${grupoId}/bolsas`);
  }

  crearBolsa(grupoId: string, datos: GuardarBolsaRequest): Observable<BolsaPremiosDto> {
    return this.http.post<BolsaPremiosDto>(`${this.base}/grupos/${grupoId}/bolsas`, datos);
  }

  editarBolsa(bolsaId: string, datos: GuardarBolsaRequest): Observable<BolsaPremiosDto> {
    return this.http.put<BolsaPremiosDto>(`${this.base}/bolsas/${bolsaId}`, datos);
  }

  archivarBolsa(bolsaId: string): Observable<BolsaPremiosDto> {
    return this.http.delete<BolsaPremiosDto>(`${this.base}/bolsas/${bolsaId}`);
  }

  tienda(grupoId: string, incluirArchivados = false): Observable<ProductoTiendaDto[]> {
    const params = incluirArchivados ? new HttpParams().set('incluirArchivados', 'true') : undefined;

    return this.http.get<ProductoTiendaDto[]>(`${this.base}/grupos/${grupoId}/tienda`, { params });
  }

  crearProducto(grupoId: string, datos: CrearProductoRequest): Observable<ProductoTiendaDto> {
    return this.http.post<ProductoTiendaDto>(`${this.base}/grupos/${grupoId}/productos`, datos);
  }

  editarProducto(productoId: string, datos: EditarProductoRequest): Observable<ProductoTiendaDto> {
    return this.http.patch<ProductoTiendaDto>(`${this.base}/productos/${productoId}`, datos);
  }

  archivarProducto(productoId: string): Observable<ProductoTiendaDto> {
    return this.http.delete<ProductoTiendaDto>(`${this.base}/productos/${productoId}`);
  }

  comprar(grupoId: string, datos: ComprarRequest): Observable<CompraDto> {
    return this.http.post<CompraDto>(`${this.base}/grupos/${grupoId}/comprar`, datos);
  }

  revertirCompra(compraId: string, motivo?: string): Observable<CompraDto> {
    return this.http.post<CompraDto>(`${this.base}/compras/${compraId}/revertir`, { motivo });
  }

  anularCastigo(castigoId: string, datos: AnularCastigoRequest): Observable<void> {
    return this.http.post<void>(`${this.base}/castigos/${castigoId}/anular`, datos);
  }

  miBilletera(grupoId: string): Observable<MiBilleteraResponse> {
    return this.http.get<MiBilleteraResponse>(`${this.base}/grupos/${grupoId}/mi-billetera`);
  }

  billeteras(grupoId: string): Observable<BilleteraDto[]> {
    return this.http.get<BilleteraDto[]>(`${this.base}/grupos/${grupoId}/billeteras`);
  }

  ajustarMonedas(
    grupoId: string,
    usuarioId: string,
    datos: AjustarMonedasRequest
  ): Observable<BilleteraDto> {
    return this.http.post<BilleteraDto>(
      `${this.base}/grupos/${grupoId}/usuarios/${usuarioId}/ajuste`,
      datos
    );
  }

  pendientesDeEntrega(grupoId: string): Observable<PendienteEntregaDto[]> {
    return this.http.get<PendienteEntregaDto[]>(
      `${this.base}/grupos/${grupoId}/pendientes-entrega`
    );
  }

  entregarCompra(compraId: string): Observable<CompraDto> {
    return this.http.patch<CompraDto>(`${this.base}/compras/${compraId}/entregar`, {});
  }

  entregarCastigo(castigoId: string): Observable<void> {
    return this.http.patch<void>(`${this.base}/castigos/${castigoId}/entregar`, {});
  }
}
