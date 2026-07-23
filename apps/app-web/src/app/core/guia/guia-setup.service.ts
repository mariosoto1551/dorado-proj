import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';

import { ActivityApiService } from '../api/activity-api.service';
import { IdentityApiService } from '../api/identity-api.service';
import { RewardsApiService } from '../api/rewards-api.service';
import { ScoringApiService } from '../api/scoring-api.service';
import { SessionApiService } from '../api/session-api.service';

/**
 * Estado de completitud de los 6 pasos de setup de un Grupo. Cada flag se
 * deriva de un dato real del backend (no de una marca manual): así la guía
 * "sabe" sola qué falta y desaparece del menú cuando el grupo ya está armado.
 */
export interface EstadoPasos {
  zonas: boolean;
  actividades: boolean;
  conductas: boolean;
  recompensas: boolean;
  participantes: boolean;
  primeraSemana: boolean;
}

const PASOS_VACIO: EstadoPasos = {
  zonas: false,
  actividades: false,
  conductas: false,
  recompensas: false,
  participantes: false,
  primeraSemana: false,
};

/**
 * Fuente única del progreso de "Primeros pasos" (fase-14). La consumen el shell
 * (para el link del menú), el Resumen (banner de arranque) y la página de guía.
 * Cachea por grupo para no refetchear en cada navegación; `cargar(id, true)`
 * fuerza el refresco tras crear zonas/actividades/etc.
 */
@Injectable({ providedIn: 'root' })
export class GuiaSetupService {
  private readonly scoring = inject(ScoringApiService);

  private readonly activity = inject(ActivityApiService);

  private readonly rewards = inject(RewardsApiService);

  private readonly identity = inject(IdentityApiService);

  private readonly session = inject(SessionApiService);

  private readonly estadoSignal = signal<EstadoPasos>(PASOS_VACIO);

  private readonly cargadoSignal = signal(false);

  private grupoCargado: string | null = null;

  readonly totalPasos = 6;

  readonly estado = this.estadoSignal.asReadonly();

  readonly cargado = this.cargadoSignal.asReadonly();

  readonly completados = computed(
    () => Object.values(this.estadoSignal()).filter(Boolean).length
  );

  readonly completa = computed(
    () => this.cargadoSignal() && this.completados() === this.totalPasos
  );

  /**
   * Carga el estado de los 6 pasos de un grupo. Reusa la caché si ya se cargó
   * ese grupo, salvo que `force` sea true (tras una mutación relevante).
   */
  cargar(grupoId: string, force = false): void {
    if (!force && this.grupoCargado === grupoId && this.cargadoSignal()) {
      return;
    }

    this.grupoCargado = grupoId;

    forkJoin({
      zonas: this.scoring.listarUmbrales(grupoId).pipe(catchError(() => of([]))),
      actividades: this.activity.listarActividades(grupoId, 'ACTIVA').pipe(catchError(() => of([]))),
      conductas: this.activity.listarConductas(grupoId, 'ACTIVA').pipe(catchError(() => of([]))),
      recompensas: this.rewards.listarRecompensas(grupoId, 'ACTIVA').pipe(catchError(() => of([]))),
      usuarios: this.identity.listarUsuarios(grupoId).pipe(catchError(() => of([]))),
      seccion: this.session.seccionActual(grupoId).pipe(catchError(() => of(null))),
    }).subscribe((r) => {
      this.estadoSignal.set({
        zonas: r.zonas.length > 0,
        actividades: r.actividades.length > 0,
        conductas: r.conductas.length > 0,
        recompensas: r.recompensas.length > 0,
        participantes: r.usuarios.length > 0,
        primeraSemana: r.seccion !== null,
      });
      this.cargadoSignal.set(true);
    });
  }

  /** Limpia el estado al salir del contexto de un grupo (evita datos viejos). */
  reset(): void {
    this.estadoSignal.set(PASOS_VACIO);
    this.cargadoSignal.set(false);
    this.grupoCargado = null;
  }
}
