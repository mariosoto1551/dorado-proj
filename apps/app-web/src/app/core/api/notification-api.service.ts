import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { catchError, of, Subscription, switchMap, timer, type Observable } from 'rxjs';

import type { NotificacionDto } from '@dorado/shared-types';

import { environment } from '../../../environments/environment';
import type { PaginadoResponse } from './api.types';

/**
 * Cliente de notification-service + estado del badge de la campana.
 *
 * El conteo de no-leídas se refresca por POLLING cada 30s (spec fase-10 —
 * sin push/WebSockets en el MVP, ver arquitectura-base.md). El polling se
 * arranca desde el shell autenticado y se corta al salir.
 */
@Injectable({ providedIn: 'root' })
export class NotificationApiService {
  private readonly http = inject(HttpClient);

  private readonly base = `${environment.apiBaseUrl}/notification`;

  private readonly noLeidasSignal = signal(0);

  private polling: Subscription | null = null;

  /** Contador de no-leídas para el badge de la campana. */
  readonly noLeidas = this.noLeidasSignal.asReadonly();

  listar(pagina = 1, soloNoLeidas = false): Observable<PaginadoResponse<NotificacionDto>> {
    let params = new HttpParams().set('pagina', pagina).set('porPagina', 20);

    if (soloNoLeidas) {
      params = params.set('leida', 'false');
    }

    return this.http.get<PaginadoResponse<NotificacionDto>>(`${this.base}/mis-notificaciones`, {
      params,
    });
  }

  contarNoLeidas(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.base}/no-leidas/count`);
  }

  marcarLeida(id: string): Observable<NotificacionDto> {
    return this.http.patch<NotificacionDto>(`${this.base}/${id}/leer`, {});
  }

  marcarTodasLeidas(): Observable<{ actualizadas: number }> {
    return this.http.patch<{ actualizadas: number }>(`${this.base}/leer-todas`, {});
  }

  /** Arranca el polling del contador (idempotente). Cada 30s + una lectura inmediata. */
  iniciarPolling(): void {
    if (this.polling) {
      return;
    }

    this.polling = timer(0, 30_000)
      .pipe(
        switchMap(() => this.contarNoLeidas().pipe(catchError(() => of({ count: this.noLeidasSignal() })))),
      )
      .subscribe((res) => this.noLeidasSignal.set(res.count));
  }

  detenerPolling(): void {
    this.polling?.unsubscribe();
    this.polling = null;
    this.noLeidasSignal.set(0);
  }

  /** Refresco inmediato del contador (ej. tras marcar leídas, sin esperar al tick). */
  refrescarContador(): void {
    this.contarNoLeidas()
      .pipe(catchError(() => of({ count: this.noLeidasSignal() })))
      .subscribe((res) => this.noLeidasSignal.set(res.count));
  }
}
