import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';

import type {
  CambiarConfiguracionIaRequest,
  ConfiguracionIaDto,
  ConversacionIaDetalleDto,
  ConversacionIaDto,
  EventoIaSse,
  OperacionPropuestaIaDto,
  PropuestaIaDto,
  ResultadoOperacionIa,
} from '@dorado/shared-types';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { leerEventosIa } from '../sse-parser';

/** Lo que se le pide al asistente: un mensaje nuevo o una conversación nueva. */
export type PedidoConversacion =
  | { tipo: 'nueva'; grupoId: string; texto: string }
  | { tipo: 'seguir'; conversacionId: string; texto: string };

/**
 * Error del asistente con el `code` de negocio a la vista.
 *
 * Los rechazos que importan acá tienen respuestas distintas en pantalla
 * —`FEATURE_NO_DISPONIBLE` se resuelve cambiando de plan, `IA_NO_HABILITADA`
 * con un clic del dueño, `CUOTA_IA_AGOTADA` esperando al mes que viene—, así
 * que el `code` tiene que llegar entero y no aplastado a «hubo un error».
 */
export class ErrorIa extends Error {
  constructor(
    readonly code: string,
    mensaje: string,
    readonly status = 0
  ) {
    super(mensaje);
    this.name = 'ErrorIa';
  }
}

/**
 * Cliente del asistente de IA (fase-14-29). Es el único servicio de `core/api`
 * que no usa `HttpClient` para todo, y la razón está en `conversar()`.
 */
@Injectable({ providedIn: 'root' })
export class IaApiService {
  private readonly http = inject(HttpClient);

  private readonly auth = inject(AuthService);

  private readonly base = `${environment.apiBaseUrl}/ai`;

  /**
   * Estado del asistente, cacheado.
   *
   * Existe porque el menú tiene que saber si mostrar «Asistente» **antes** de
   * que nadie entre a la pantalla (la spec pide que el ítem aparezca solo con
   * la feature habilitada), y sin cachear eso sería una llamada por cada
   * navegación. `null` = todavía no se preguntó, que no es lo mismo que
   * «apagado»: con `null` el ítem no se muestra y tampoco se afirma que no
   * exista.
   */
  private readonly configuracionSignal = signal<ConfiguracionIaDto | null>(null);

  readonly configuracion = this.configuracionSignal.asReadonly();

  // ── Configuración ─────────────────────────────────────────────────────────

  /** Refresca el estado cacheado. Un fallo deja el cache como estaba. */
  async cargarConfiguracion(): Promise<ConfiguracionIaDto | null> {
    try {
      const estado = await firstValueFrom(
        this.http.get<ConfiguracionIaDto>(`${this.base}/configuracion`)
      );

      this.configuracionSignal.set(estado);

      return estado;
    } catch {
      return this.configuracionSignal();
    }
  }

  cambiarConfiguracion(datos: CambiarConfiguracionIaRequest): Observable<ConfiguracionIaDto> {
    return this.http.put<ConfiguracionIaDto>(`${this.base}/configuracion`, datos);
  }

  /** Deja el consumo del mes al día sin volver a preguntar por la red. */
  actualizarConsumo(tokensConsumidosMes: number): void {
    this.configuracionSignal.update((estado) =>
      estado ? { ...estado, tokensConsumidosMes } : estado
    );
  }

  // ── Conversaciones ────────────────────────────────────────────────────────

  listarConversaciones(grupoId: string): Observable<ConversacionIaDto[]> {
    return this.http.get<ConversacionIaDto[]>(`${this.base}/conversaciones`, {
      params: new HttpParams().set('grupoId', grupoId),
    });
  }

  detalleConversacion(id: string): Observable<ConversacionIaDetalleDto> {
    return this.http.get<ConversacionIaDetalleDto>(`${this.base}/conversaciones/${id}`);
  }

  archivarConversacion(id: string): Observable<ConversacionIaDto> {
    return this.http.post<ConversacionIaDto>(`${this.base}/conversaciones/${id}/archivar`, {});
  }

  /**
   * Habla con el asistente y va entregando el progreso a medida que llega.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * POR QUÉ ACÁ HAY `fetch` Y NO `HttpClient`:
   *
   * `HttpClient` entrega el cuerpo cuando terminó — no hay forma de leerlo a
   * medida que llega—, y un turno tarda entre 20 y 50 segundos. `EventSource`
   * tampoco sirve: solo hace GET y no manda cabeceras, y esto es un POST con
   * body y con el token en `Authorization` (regla 7 del proyecto: el access
   * token vive en memoria, no hay cookie de sesión que aprovechar).
   *
   * El costo de salirse de `HttpClient` es quedarse sin el interceptor, así
   * que las tres cosas que hace se replican explícitamente acá: el `Bearer`,
   * el `withCredentials` (la cookie httpOnly del refresh viaja entre 4200 y
   * 3000 solo con eso) y **un** reintento tras refrescar ante un 401.
   * ───────────────────────────────────────────────────────────────────────────
   */
  async *conversar(pedido: PedidoConversacion): AsyncGenerator<EventoIaSse> {
    let respuesta = await this.pedirStream(pedido);

    if (respuesta.status === 401) {
      // Un solo reintento, igual que el interceptor: si el refresh también
      // falla, el 401 sube y la sesión se maneja donde siempre.
      respuesta.body?.cancel();

      if (await firstValueFrom(this.auth.refrescar())) {
        respuesta = await this.pedirStream(pedido);
      }
    }

    if (!respuesta.ok || !respuesta.body) {
      throw await this.errorDe(respuesta);
    }

    yield* leerEventosIa(respuesta.body);
  }

  // ── Propuestas ────────────────────────────────────────────────────────────

  detallePropuesta(id: string): Observable<PropuestaIaDto> {
    return this.http.get<PropuestaIaDto>(`${this.base}/propuestas/${id}`);
  }

  descartarPropuesta(id: string): Observable<PropuestaIaDto> {
    return this.http.post<PropuestaIaDto>(`${this.base}/propuestas/${id}/descartar`, {});
  }

  registrarAplicada(
    id: string,
    resultado: ResultadoOperacionIa[]
  ): Observable<PropuestaIaDto> {
    return this.http.post<PropuestaIaDto>(`${this.base}/propuestas/${id}/aplicada`, { resultado });
  }

  /**
   * Ejecuta una operación de una propuesta **tal cual viene**.
   *
   * Método, ruta y body salen del DTO sin tocarse (decisión 6): esto es el
   * mismo request que haría el formulario del Tutor, con el mismo JWT y contra
   * el mismo endpoint público. Por eso pasa por `HttpClient` y no por el
   * `fetch` de arriba — acá el interceptor de sesión sí tiene que correr.
   */
  ejecutarOperacion(operacion: OperacionPropuestaIaDto): Promise<{ id?: string } | null> {
    return firstValueFrom(
      this.http.request<{ id?: string } | null>(
        operacion.metodo,
        `${environment.apiBaseUrl}${operacion.ruta}`,
        { body: operacion.body }
      )
    );
  }

  // ── Internos del stream ───────────────────────────────────────────────────

  private pedirStream(pedido: PedidoConversacion): Promise<Response> {
    const token = this.auth.accessToken();
    const url =
      pedido.tipo === 'nueva'
        ? `${this.base}/conversaciones`
        : `${this.base}/conversaciones/${pedido.conversacionId}/mensajes`;
    const body =
      pedido.tipo === 'nueva'
        ? { grupoId: pedido.grupoId, primerMensaje: pedido.texto }
        : { texto: pedido.texto };

    return fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  /**
   * Un rechazo previo al stream llega como JSON con el sobre `ApiErrorResponse`
   * — es el orden que fija el controller: lo que se sabe antes de gastar un
   * token sale como status HTTP de verdad, no como un `200` con la mala
   * noticia adentro.
   */
  private async errorDe(respuesta: Response): Promise<ErrorIa> {
    try {
      const cuerpo = (await respuesta.json()) as { code?: string; message?: string };

      return new ErrorIa(
        cuerpo.code ?? 'ERROR_INTERNO',
        cuerpo.message ?? 'El asistente no pudo responder',
        respuesta.status
      );
    } catch {
      return new ErrorIa(
        'ERROR_INTERNO',
        respuesta.status === 0
          ? 'No se pudo conectar con el servidor. Revisá tu conexión.'
          : 'El asistente no pudo responder',
        respuesta.status
      );
    }
  }
}
