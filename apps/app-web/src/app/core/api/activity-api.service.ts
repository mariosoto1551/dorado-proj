import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import type {
  ActividadDto,
  ActualizarConfiguracionContenidoRequest,
  CompletadaOpcionalDto,
  CompletarTareaEquipoResponse,
  ConductaDto,
  ConfiguracionContenidoGrupoDto,
  CrearMiActividadRequest,
  CrearMiActividadResponse,
  CrearReporteMiembroRequest,
  EstadoPropuesta,
  EstadoReporte,
  MarcaRojaDto,
  MiEstadoHoyDto,
  MisActividadesDto,
  PropuestaActividadDto,
  RegistroActividadDto,
  RegistroConductaDto,
  RegistroTareaEquipoDto,
  ReporteMiembroDto,
  TareaEquipoDeHoyDto,
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

  registrarNoHizo(
    actividadId: string,
    usuarioId: string,
    motivo?: string
  ): Observable<RegistroActividadDto> {
    return this.http.post<RegistroActividadDto>(
      `${this.base}/actividades/${actividadId}/no-hizo`,
      motivo ? { usuarioId, motivo } : { usuarioId }
    );
  }

  /** Completadas OPCIONALES de un usuario en la sesión abierta (para corregir). */
  completadasOpcionales(grupoId: string, usuarioId: string): Observable<CompletadaOpcionalDto[]> {
    return this.http.get<CompletadaOpcionalDto[]>(
      `${this.base}/grupos/${grupoId}/usuarios/${usuarioId}/completadas`
    );
  }

  /** Marcas rojas vivas de un usuario en la sesión abierta (fase-14-12). */
  marcasRojas(grupoId: string, usuarioId: string): Observable<MarcaRojaDto[]> {
    return this.http.get<MarcaRojaDto[]>(
      `${this.base}/grupos/${grupoId}/usuarios/${usuarioId}/marcas`
    );
  }

  /**
   * Quita (soft-delete) una completada de actividad de un usuario. El motivo va
   * por query param, no por body: un DELETE con body pasa por intermediarios
   * que tienen derecho a descartarlo (fase-14-12).
   */
  eliminarRegistroActividad(
    registroId: string,
    motivo?: string
  ): Observable<RegistroActividadDto> {
    const params = motivo ? new HttpParams().set('motivo', motivo) : undefined;

    return this.http.delete<RegistroActividadDto>(
      `${this.base}/registros-actividad/${registroId}`,
      { params }
    );
  }

  /** Deshace una marca roja del tutor y devuelve los puntos (fase-14-12). */
  revertirMarca(registroId: string): Observable<RegistroActividadDto> {
    return this.http.post<RegistroActividadDto>(
      `${this.base}/registros-actividad/${registroId}/revertir`,
      {}
    );
  }

  registrarConducta(conductaId: string, usuarioId?: string): Observable<RegistroConductaDto> {
    return this.http.post<RegistroConductaDto>(
      `${this.base}/conductas/${conductaId}/registrar`,
      usuarioId ? { usuarioId } : {}
    );
  }

  // ---- Tareas de equipo y reportes del jefe (fase-14-09) ----
  /** Estado de las tareas del equipo en la sesión abierta (fase-14-13). */
  tareasDeHoyDelEquipo(equipoId: string): Observable<TareaEquipoDeHoyDto[]> {
    return this.http.get<TareaEquipoDeHoyDto[]>(
      `${this.base}/equipos/${equipoId}/tareas-de-hoy`
    );
  }

  /** Anula una tarea de equipo completada: el equipo pierde el reparto (fase-14-13). */
  anularTareaEquipo(
    registroTareaEquipoId: string,
    motivo?: string
  ): Observable<RegistroTareaEquipoDto> {
    const params = motivo ? new HttpParams().set('motivo', motivo) : undefined;

    return this.http.delete<RegistroTareaEquipoDto>(
      `${this.base}/registros-tarea-equipo/${registroTareaEquipoId}`,
      { params }
    );
  }

  /** Deshace la anulación y le devuelve el reparto al equipo (fase-14-13). */
  revertirTareaEquipo(registroTareaEquipoId: string): Observable<RegistroTareaEquipoDto> {
    return this.http.post<RegistroTareaEquipoDto>(
      `${this.base}/registros-tarea-equipo/${registroTareaEquipoId}/revertir`,
      {}
    );
  }

  completarTareaEquipo(
    equipoId: string,
    actividadId: string
  ): Observable<CompletarTareaEquipoResponse> {
    return this.http.post<CompletarTareaEquipoResponse>(
      `${this.base}/equipos/${equipoId}/tareas/${actividadId}/completar`,
      {}
    );
  }

  crearReporte(equipoId: string, datos: CrearReporteMiembroRequest): Observable<ReporteMiembroDto> {
    return this.http.post<ReporteMiembroDto>(`${this.base}/equipos/${equipoId}/reportes`, datos);
  }

  listarReportes(grupoId: string, estado?: EstadoReporte): Observable<ReporteMiembroDto[]> {
    let params = new HttpParams();

    if (estado) {
      params = params.set('estado', estado);
    }

    return this.http.get<ReporteMiembroDto[]>(`${this.base}/grupos/${grupoId}/reportes`, { params });
  }

  aprobarReporte(reporteId: string): Observable<ReporteMiembroDto> {
    return this.http.post<ReporteMiembroDto>(`${this.base}/reportes/${reporteId}/aprobar`, {});
  }

  rechazarReporte(reporteId: string, motivo?: string): Observable<ReporteMiembroDto> {
    return this.http.post<ReporteMiembroDto>(
      `${this.base}/reportes/${reporteId}/rechazar`,
      motivo ? { motivo } : {}
    );
  }

  // ---- Contenido creado por los integrantes (fase-14-10) ----

  /** Config del grupo: modo (RESTRICTIVO/BAJO_APROBACION/LIBRE) + topes. */
  obtenerConfiguracionContenido(grupoId: string): Observable<ConfiguracionContenidoGrupoDto> {
    return this.http.get<ConfiguracionContenidoGrupoDto>(
      `${this.base}/grupos/${grupoId}/configuracion-contenido`
    );
  }

  actualizarConfiguracionContenido(
    grupoId: string,
    datos: ActualizarConfiguracionContenidoRequest
  ): Observable<ConfiguracionContenidoGrupoDto> {
    return this.http.put<ConfiguracionContenidoGrupoDto>(
      `${this.base}/grupos/${grupoId}/configuracion-contenido`,
      datos
    );
  }

  /** Bandeja del tutor: propuestas del grupo (sin estado = todas). */
  listarPropuestas(grupoId: string, estado?: EstadoPropuesta): Observable<PropuestaActividadDto[]> {
    let params = new HttpParams();

    if (estado) {
      params = params.set('estado', estado);
    }

    return this.http.get<PropuestaActividadDto[]>(
      `${this.base}/grupos/${grupoId}/propuestas`,
      { params }
    );
  }

  aprobarPropuesta(propuestaId: string): Observable<PropuestaActividadDto> {
    return this.http.post<PropuestaActividadDto>(
      `${this.base}/propuestas/${propuestaId}/aprobar`,
      {}
    );
  }

  rechazarPropuesta(propuestaId: string, motivo?: string): Observable<PropuestaActividadDto> {
    return this.http.post<PropuestaActividadDto>(
      `${this.base}/propuestas/${propuestaId}/rechazar`,
      motivo ? { motivo } : {}
    );
  }

  /** Pantalla del integrante: config + cupo + sus actividades y propuestas. */
  misActividades(grupoId: string): Observable<MisActividadesDto> {
    return this.http.get<MisActividadesDto>(`${this.base}/grupos/${grupoId}/mis-actividades`);
  }

  crearMiActividad(
    grupoId: string,
    datos: CrearMiActividadRequest
  ): Observable<CrearMiActividadResponse> {
    return this.http.post<CrearMiActividadResponse>(
      `${this.base}/grupos/${grupoId}/mis-actividades`,
      datos
    );
  }

  archivarMiActividad(actividadId: string): Observable<ActividadDto> {
    return this.http.delete<ActividadDto>(`${this.base}/mis-actividades/${actividadId}`);
  }
}
