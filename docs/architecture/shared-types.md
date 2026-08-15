# DTOs compartidos — `libs/shared-types`

> Interfaces TypeScript compartidas entre todos los servicios y los frontends. Contienen solo forma de datos (IDs como `string`, nunca objetos anidados de otro servicio — eso se resuelve con un fetch puntual si la UI lo necesita). Cada servicio tiene su propio schema Prisma (documentado en la fase que lo crea); estas interfaces son la "vista pública" de esas entidades.

```ts
// ---------- Enums ----------
export enum Rol { PLATFORM_ADMIN = 'PLATFORM_ADMIN', ORG_ADMIN = 'ORG_ADMIN', TUTOR = 'TUTOR', USUARIO = 'USUARIO' }
export enum EstadoOrganizacion { ACTIVA = 'ACTIVA', SUSPENDIDA = 'SUSPENDIDA' }
export enum EstadoInvitacion { PENDIENTE = 'PENDIENTE', CANJEADA = 'CANJEADA', EXPIRADA = 'EXPIRADA', REVOCADA = 'REVOCADA' }
export enum TipoInvitado { TUTOR = 'TUTOR', USUARIO = 'USUARIO' }
export enum CodigoPlan { FREE = 'FREE', PRO = 'PRO' }
export enum TipoPuntaje { OPCIONAL = 'OPCIONAL', OBLIGATORIA = 'OBLIGATORIA' }
export enum TipoLimiteTiempo { DEADLINE = 'DEADLINE', CRONOMETRO = 'CRONOMETRO', SIN_LIMITE = 'SIN_LIMITE' }
export enum TipoConducta { BUENA = 'BUENA', MALA = 'MALA' }
export enum EstadoSesion { ABIERTA = 'ABIERTA', CERRADA = 'CERRADA' }
export enum EstadoSeccion { ABIERTA = 'ABIERTA', EVALUACION = 'EVALUACION', CERRADA = 'CERRADA' }
export enum ModoSesion { MANUAL = 'MANUAL', AUTOMATICO = 'AUTOMATICO' }
export enum EvaluarUmbralesEn { CADA_SESION = 'CADA_SESION', SOLO_AL_CIERRE_SECCION = 'SOLO_AL_CIERRE_SECCION' }
export enum TipoOrigenPuntos { ACTIVIDAD_COMPLETADA = 'ACTIVIDAD_COMPLETADA', NO_HIZO = 'NO_HIZO', CONDUCTA = 'CONDUCTA', CORRECCION = 'CORRECCION' }
export enum MecanicaRecompensa { SELECCION = 'SELECCION', AZAR = 'AZAR' }
export enum EstadoCanje { PENDIENTE_ENTREGA = 'PENDIENTE_ENTREGA', ENTREGADA = 'ENTREGADA' }
export enum PrincipalType { TUTOR = 'TUTOR', USUARIO = 'USUARIO' }

// ---------- Auth ----------
export interface JwtPayload {
  sub: string;
  principalType: PrincipalType;
  organizacionId: string;
  grupoIds: string[];
  rol: Rol;
  plan: CodigoPlan;
  iat: number;
  exp: number;
}

export interface TenantContext {
  organizacionId: string;
  grupoIds: string[];
  rol: Rol;
  principalId: string;
  principalType: PrincipalType;
}

// ---------- Identity ----------
export interface OrganizacionDto { id: string; nombre: string; emailContacto: string; estado: EstadoOrganizacion; createdAt: string; }
export interface GrupoDto { id: string; organizacionId: string; nombre: string; timezone: string; createdAt: string; }
export interface TutorDto { id: string; organizacionId: string; email: string; nombre: string; rol: Rol.ORG_ADMIN | Rol.TUTOR; grupoIds: string[]; estado: 'ACTIVO' | 'INACTIVO'; createdAt: string; }
export interface UsuarioDto { id: string; organizacionId: string; grupoId: string; username: string; nombre: string; avatarId: string; estado: 'ACTIVO' | 'INACTIVO'; createdAt: string; rolGrupo?: RolGrupoEtiquetaDto | null; /* fase-14-19: solo lo pueblan los endpoints que alimentan pantallas */ }
export interface InvitacionDto { id: string; organizacionId: string; grupoId: string; tipoInvitado: TipoInvitado; codigo: string; estado: EstadoInvitacion; expiraEn: string; creadoPorTutorId: string; }
// Equipos de trabajo (fase-14-09)
export enum RolEquipoMiembro { JEFE = 'JEFE', MIEMBRO = 'MIEMBRO' }
export interface EquipoMiembroDto { usuarioId: string; nombre: string; avatarId: string; rol: RolEquipoMiembro; rolGrupo?: RolGrupoEtiquetaDto | null; /* fase-14-19: `rol` es JEFE/MIEMBRO del equipo; `rolGrupo` es "cocina"/"mascotas" */ }
export interface EquipoDto { id: string; organizacionId: string; grupoId: string; nombre: string; estado: 'ACTIVO' | 'INACTIVO'; jefeUsuarioId: string; miembros: EquipoMiembroDto[]; createdAt: string; }
export interface MiEquipoDto extends EquipoDto { esJefe: boolean; }
export interface EquipoInternoDto { equipoId: string; organizacionId: string; grupoId: string; nombre: string; estado: 'ACTIVO' | 'INACTIVO'; jefeUsuarioId: string; miembros: Array<{ usuarioId: string; rol: RolEquipoMiembro }>; }
export interface CrearEquipoRequest { nombre: string; jefeUsuarioId: string; miembrosIds: string[]; }
export interface EditarEquipoRequest { nombre?: string; estado?: 'ACTIVO' | 'INACTIVO'; }
export interface AgregarMiembroEquipoRequest { usuarioId: string; }
export interface SustituirJefeEquipoRequest { nuevoJefeUsuarioId: string; }
// Roles del participante dentro del Grupo (fase-14-19). OJO: `RolGrupo` NO es el `Rol` de plataforma
// (TUTOR/USUARIO/ORG_ADMIN/PLATFORM_ADMIN) — es una etiqueta funcional por grupo que define el Tutor.
export interface RolGrupoEtiquetaDto { id: string; nombre: string; colorHex: string; }
export interface RolGrupoDto extends RolGrupoEtiquetaDto { grupoId: string; estado: 'ACTIVO' | 'INACTIVO'; cantidadAsignados?: number; createdAt: string; }
export interface CrearRolGrupoRequest { nombre: string; colorHex: string; }
export type CrearRolGrupoResponse = RolGrupoDto;
export interface ActualizarRolGrupoRequest { nombre?: string; colorHex?: string; estado?: 'ACTIVO' | 'INACTIVO'; }
export interface AsignarRolGrupoRequest { rolGrupoId: string | null; } // null quita el rol
export interface RolGrupoInternoDto { id: string; organizacionId: string; grupoId: string; nombre: string; colorHex: string; estado: 'ACTIVO' | 'INACTIVO'; }
export interface RolAsignadoDto { usuarioId: string; rolGrupoId: string | null; } // payload del camino caliente

// ---------- Billing ----------
export interface PlanDto { id: string; codigo: CodigoPlan; nombre: string; limiteTutores: number | null; limiteUsuarios: number | null; limiteGrupos: number | null; limiteActividadesPorGrupo: number | null; whiteLabel: boolean; reportesAvanzados: boolean; }
export interface SuscripcionDto { id: string; organizacionId: string; planId: string; plan: CodigoPlan; estado: 'ACTIVA' | 'CANCELADA'; fuente: 'MANUAL' | 'FLAG'; }
export interface EntitlementsDto { plan: CodigoPlan; limites: { tutores: number | null; usuarios: number | null; grupos: number | null; actividadesPorGrupo: number | null; }; features: { whiteLabel: boolean; reportesAvanzados: boolean; }; }

// ---------- Activity Catalog ----------
export interface ActividadDto { id: string; organizacionId: string; grupoId: string; nombre: string; descripcion: string | null; tipoPuntaje: TipoPuntaje; valorPuntos: number; puntosPorCumplir: number; /* fase-14-20: lo que suma cumplir una obligatoria confirmable; 0 en el resto */ tipoLimiteTiempo: TipoLimiteTiempo; deadlineHora: string | null; duracionCronometroMinutos: number | null; repeticionesMaximasSesion: number; repeticionesMinimasSesion: number; /* fase-14-25: confirmaciones necesarias para no perder puntos; 1 = como antes del ítem */ repeticionesMaximasSeccion: number | null; comportamientoAlCierre: ComportamientoAlCierre; alcance: AlcanceActividad; bonoJefePuntos: number; rolesPermitidos: string[]; /* fase-14-19: ids de RolGrupo que la ven; vacío = todos */ usuariosPermitidos: string[]; equiposPermitidos: string[]; /* fase-14-24: destinatario nominal; los tres arrays son excluyentes */ vigenteDesde: string | null; vigenteHasta: string | null; /* fase-14-24: fechas civiles "YYYY-MM-DD" del calendario del Grupo */ estado: 'ACTIVA' | 'ARCHIVADA'; }
// Turnos rotativos (fase-14-21). La secuencia es una LISTA ORDENADA de posiciones y admite repetidos:
// con [José, Luciana, José, Alejandra] a José le tocan 2 de cada 4 turnos. No cuelga de ActividadDto.
export enum ModoTurno { ORDEN_FIJO = 'ORDEN_FIJO', AZAR = 'AZAR' }
export enum FrecuenciaTurno { SESION = 'SESION', SECCION = 'SECCION' }
export enum AvisoPosicionTurno { YA_NO_ESTA_EN_EL_GRUPO = 'YA_NO_ESTA_EN_EL_GRUPO', SIN_EL_ROL = 'SIN_EL_ROL' }
export interface PosicionTurnoDto { orden: number; usuarioId: string; nombre: string; aviso: AvisoPosicionTurno | null; }
export interface TurnoDeHoyDto { usuarioIdAsignado: string | null; nombreAsignado: string | null; esMio: boolean; }
export interface AsignacionTurnoDto { actividadId: string; usuarioId: string; nombre: string; vueltaNumero: number; indice: number; usuarioOriginalId: string | null; nombreOriginal: string | null; reasignadoEn: string | null; motivoReasignacion: string | null; }
export interface TurnoActividadDto { actividadId: string; modo: ModoTurno; frecuencia: FrecuenciaTurno; activo: boolean; posiciones: PosicionTurnoDto[]; asignacionVigente: AsignacionTurnoDto | null; proximos: Array<{ usuarioId: string; nombre: string }>; }
export interface ConfigurarTurnoRequest { modo: `${ModoTurno}`; frecuencia: `${FrecuenciaTurno}`; activo?: boolean; posiciones: Array<{ usuarioId: string }>; } // el ORDEN del array ES la secuencia
export type ConfigurarTurnoResponse = TurnoActividadDto;
export interface ReasignarTurnoRequest { usuarioId: string; motivo?: string; }
export interface TurnoDeHoyDelGrupoDto { actividadId: string; actividadNombre: string; frecuencia: FrecuenciaTurno; asignacion: AsignacionTurnoDto | null; }
// Tareas de equipo y reportes del jefe (fase-14-09)
export enum AlcanceActividad { INDIVIDUAL = 'INDIVIDUAL', EQUIPO = 'EQUIPO' }
export enum EstadoReporte { PENDIENTE = 'PENDIENTE', APROBADO = 'APROBADO', RECHAZADO = 'RECHAZADO' }
export interface AsignacionPuntosEquipoDto { usuarioId: string; puntos: number; esJefe: boolean; }
export interface CompletarTareaEquipoResponse { registroTareaEquipoId: string; equipoId: string; actividadId: string; asignaciones: AsignacionPuntosEquipoDto[]; }
export interface ReporteMiembroDto { id: string; organizacionId: string; grupoId: string; equipoId: string; reportadoUsuarioId: string; jefeUsuarioId: string; conductaId: string; motivo: string | null; estado: EstadoReporte; resueltoPorTutorId: string | null; registroConductaId: string | null; createdAt: string; }
export interface CrearReporteMiembroRequest { reportadoUsuarioId: string; conductaId: string; motivo?: string; }
export interface ConductaDto { id: string; organizacionId: string; grupoId: string; nombre: string; tipo: TipoConducta; valorPuntos: number; permiteAutoreporte: boolean; estado: 'ACTIVA' | 'ARCHIVADA'; }
export interface RegistroActividadDto { id: string; organizacionId: string; grupoId: string; usuarioId: string; actividadId: string; sesionId: string; seccionId: string; tipo: 'COMPLETADA' | 'NO_HIZO'; valorPuntosSnapshot: number; registradoPorId: string; registradoPorTipo: PrincipalType; createdAt: string; }
export interface RegistroConductaDto { id: string; organizacionId: string; grupoId: string; usuarioId: string; conductaId: string; sesionId: string; seccionId: string; valorPuntosSnapshot: number; registradoPorId: string; registradoPorTipo: PrincipalType; eliminado: boolean; createdAt: string; }
// Historial de la sesión (fase-14-18). El timeline NO sale de una tabla propia: se arma uniendo RegistroActividad + RegistroConducta + RegistroTareaEquipo.
// fase-14-34 le suma una CUARTA fuente que no es de activity-service: los ajustes manuales del ledger de scoring, por REST interno (ver AjusteHistorialInternoDto).
export enum TipoEventoHistorial { ACTIVIDAD_COMPLETADA = 'ACTIVIDAD_COMPLETADA', ACTIVIDAD_NO_HIZO = 'ACTIVIDAD_NO_HIZO', CONDUCTA = 'CONDUCTA', TAREA_EQUIPO = 'TAREA_EQUIPO', AJUSTE_MANUAL = 'AJUSTE_MANUAL' }
export enum TipoRegistroHistorial { ACTIVIDAD = 'ACTIVIDAD', CONDUCTA = 'CONDUCTA', TAREA_EQUIPO = 'TAREA_EQUIPO' } // sobre qué tabla cuelga una NOTA (espejo del enum Prisma)
export enum FiltroTipoHistorial { ACTIVIDAD = 'ACTIVIDAD', CONDUCTA = 'CONDUCTA', TAREA_EQUIPO = 'TAREA_EQUIPO', AJUSTE = 'AJUSTE' } // fase-14-34: el `?tipo=` del timeline. Superset del de arriba — un ajuste no lleva notas.
export interface NotaRegistroDto { id: string; texto: string; autorTutorId: string; autorNombre: string; createdAt: string; esPropia: boolean; } // interna del Tutor — NUNCA viaja a la app del integrante
export interface EventoHistorialDto { id: string; tipo: TipoEventoHistorial; ocurridoEn: string; usuarioId: string | null; usuarioNombre: string | null; equipoId: string | null; equipoNombre: string | null; itemId: string; itemNombre: string; puntos: number; bonoJefe: number | null; cantidadMiembros: number | null; registradoPorId: string; registradoPorTipo: 'TUTOR' | 'USUARIO' | 'SYSTEM'; registradoPorNombre: string; anulado: boolean; anuladoPorNombre: string | null; anuladoEn: string | null; motivoTutor: string | null; revertidoEn: string | null; revertidoPorNombre: string | null; notas: NotaRegistroDto[]; }
export interface HistorialSesionDto { sesionId: string | null; sesionEstado: EstadoSesion | null; timezoneGrupo: string; ajustesDisponibles: boolean; eventos: EventoHistorialDto[]; cursorSiguiente: string | null; } // fase-14-34: `ajustesDisponibles: false` = scoring no contestó y PUEDE FALTAR alguna fila; la pantalla lo dice. Sin él, «no hubo ajustes» y «no pude preguntar» se ven igual.

// ---------- Session/Section ----------
export interface ConfiguracionSesionDto { grupoId: string; modo: ModoSesion; cronSesion: string | null; sesionesPorSeccion: number; cronCierreSeccion: string | null; evaluarUmbralesEn: EvaluarUmbralesEn; }
export interface SeccionDto { id: string; organizacionId: string; grupoId: string; numero: number; estado: EstadoSeccion; fechaInicio: string; fechaFin: string | null; }
export interface SesionDto { id: string; seccionId: string; organizacionId: string; grupoId: string; numero: number; estado: EstadoSesion; fechaInicio: string; fechaFin: string | null; }

// ---------- Scoring ----------
export interface EventoPuntosDto { id: string; organizacionId: string; grupoId: string; usuarioId: string; seccionId: string; sesionId: string; tipoOrigen: TipoOrigenPuntos; origenId: string; puntosSnapshot: number; registradoPorId: string; registradoPorTipo: PrincipalType; corregidoDeId: string | null; createdAt: string; }
export interface UmbralZonaDto { id: string; organizacionId: string; grupoId: string; nombreZona: string; orden: number; puntosMin: number; puntosMax: number | null; colorHex: string; }
export interface PuntajeUsuarioDto { usuarioId: string; seccionId: string; puntajeTotal: number; zona: UmbralZonaDto | null; descalificado: boolean; }
export interface PuntajeEquipoDto { equipoId: string; seccionId: string | null; puntajeTotal: number; porMiembro: Array<{ usuarioId: string; puntos: number }>; } // fase-14-09
export interface DescalificacionDto { id: string; organizacionId: string; grupoId: string; usuarioId: string; seccionId: string; motivo: string; registradaPorTutorId: string; createdAt: string; }
// fase-14-34: SOLO interno (GET /internal/scoring/grupos/:g/sesiones/:s/ajustes) — se lo consume activity-service para el timeline. Solo tipoOrigen AJUSTE_MANUAL: las CORRECCION contarían dos veces una anulación que el historial ya muestra tachada.
export interface AjusteHistorialInternoDto { id: string; usuarioId: string; puntos: number; motivo: string; registradoPorId: string; registradoPorTipo: string; cargadoRetroactivamenteEn: string | null; createdAt: string; }

// ---------- Rewards ----------
export interface RecompensaDto { id: string; organizacionId: string; grupoId: string; nombre: string; descripcion: string | null; imagenUrl: string | null; umbralZonaId: string; nombreZonaSnapshot: string; permiteSeleccion: boolean; permiteAzar: boolean; estado: 'ACTIVA' | 'ARCHIVADA'; }
export interface CanjeRecompensaDto { id: string; organizacionId: string; grupoId: string; usuarioId: string; seccionId: string; recompensaId: string; mecanica: MecanicaRecompensa; estado: EstadoCanje; entregadaPorTutorId: string | null; entregadaEn: string | null; }
// Etiquetas del catálogo (fase-14-26). Organizan la pantalla del Tutor y NO tienen efecto de negocio.
// `RecompensaDto.etiquetas` viaja denormalizado (nombre + color) y es SIEMPRE [] para Rol.USUARIO.
export interface EtiquetaCatalogoDto { id: string; organizacionId: string; grupoId: string; nombre: string; colorHex: string; estado: 'ACTIVA' | 'ARCHIVADA'; }
export interface ProductosDesdeEtiquetaDto { creados: ProductoTiendaDto[]; salteados: Array<{ recompensaId: string; nombre: string; motivo: 'YA_TIENE_PRODUCTO' | 'ES_CASTIGO' }>; }

// ---------- Contratos de request del asistente de IA (fase-14-29 y fase-14-30) ----------
// Estas interfaces son la MISMA forma que el body de su endpoint destino, y la clase con
// decoradores del servicio las `implements` + verifica cobertura de claves (ver contratos.ts).
// Existen porque `ai-service` arma propuestas con la forma exacta del request: aplicar una
// propuesta es un `for` sobre el array, no una traducción. Un campo renombrado en un servicio
// tiene que ROMPER EL BUILD, no deteriorar la propuesta en silencio.
// Los enums van como `${Enum}` porque cada servicio valida contra los que genera su Prisma.

export type Exhaustivo<T extends never> = T; // falla a compilar si T no es never
export type ClavesNoCubiertas<TContrato, TClase> = Exclude<keyof TContrato, keyof TClase>;

// activity
export interface CrearActividadRequest { nombre: string; descripcion?: string | null; tipoPuntaje: `${TipoPuntaje}`; valorPuntos: number; puntosPorCumplir?: number; tipoLimiteTiempo: `${TipoLimiteTiempo}`; deadlineHora?: string | null; duracionCronometroMinutos?: number | null; repeticionesMaximasSesion?: number; repeticionesMinimasSesion?: number; repeticionesMaximasSeccion?: number | null; comportamientoAlCierre?: `${ComportamientoAlCierre}`; alcance?: `${AlcanceActividad}`; bonoJefePuntos?: number; diasSemana?: number[]; siempreVisible?: boolean; rolesPermitidos?: string[]; usuariosPermitidos?: string[]; equiposPermitidos?: string[]; vigenteDesde?: string | null; vigenteHasta?: string | null; }
export type EditarActividadRequest = Partial<CrearActividadRequest>;
export interface CrearConductaRequest { nombre: string; tipo: `${TipoConducta}`; valorPuntos: number; permiteAutoreporte?: boolean; }
export type EditarConductaRequest = Partial<CrearConductaRequest>; // sin `estado`: archivar es otro camino

// scoring
export interface CrearUmbralRequest { nombreZona: string; orden: number; puntosMin: number; puntosMax?: number | null; colorHex: string; } // puntosMax null = zona más alta, sin techo
export type EditarUmbralRequest = Partial<CrearUmbralRequest>;
export interface GuardarConfiguracionScoringRequest { puntosIniciales: number; }

// rewards
export interface CrearRecompensaRequest { tipo?: `${TipoItemCatalogo}`; umbralZonaId?: string; nombre: string; descripcion?: string; imagenUrl?: string; permiteSeleccion?: boolean; permiteAzar?: boolean; }
export interface EditarRecompensaRequest { tipo?: `${TipoItemCatalogo}`; umbralZonaId?: string; nombre?: string; descripcion?: string | null; imagenUrl?: string | null; permiteSeleccion?: boolean; permiteAzar?: boolean; }
export interface CrearEtiquetaRequest { nombre: string; colorHex: string; }
export type EditarEtiquetaRequest = Partial<CrearEtiquetaRequest>;
export interface AsignarEtiquetasRequest { etiquetaIds: string[]; } // PUT sobre sub-recurso: reemplazo completo
export interface GuardarBolsaRequest { nombre: string; recompensaIds: string[]; }
export interface CrearProductoRequest { nombre: string; descripcion?: string | null; imagenUrl?: string | null; precio: number; fuente: `${FuenteProducto}`; mecanica?: `${MecanicaProducto}`; recompensaId?: string | null; bolsaId?: string | null; }
export interface EditarProductoRequest { nombre?: string; descripcion?: string | null; imagenUrl?: string | null; precio?: number; fuente?: `${FuenteProducto}`; mecanica?: `${MecanicaProducto}`; recompensaId?: string | null; bolsaId?: string | null; } // el precio vive acá, NO en Recompensa

// La tienda por REST interno (fase-14-30): de acá sale el productoId que el asistente necesita.
export interface ProductoTiendaInternoDto { id: string; nombre: string; descripcion: string | null; precio: number; fuente: FuenteProducto; mecanica: MecanicaProducto; recompensaId: string | null; bolsaId: string | null; estado: 'ACTIVA' | 'ARCHIVADA'; }
export interface BolsaPremiosInternaDto { id: string; nombre: string; estado: 'ACTIVA' | 'ARCHIVADA'; recompensaIds: string[]; }
export interface TiendaInternaDto { productos: ProductoTiendaInternoDto[]; bolsas: BolsaPremiosInternaDto[]; }

// ---------- Notification / Audit ----------
export interface NotificacionDto { id: string; organizacionId: string; grupoId: string; destinatarioId: string; destinatarioTipo: PrincipalType; tipo: string; mensaje: string; leida: boolean; createdAt: string; }
export interface RegistroAuditoriaDto { id: string; organizacionId: string; grupoId: string | null; actorId: string; actorTipo: 'TUTOR' | 'USUARIO' | 'PLATFORM_ADMIN' | 'SYSTEM'; accion: string; entidadTipo: string; entidadId: string; detalle: Record<string, unknown>; createdAt: string; }
```

## Ubicación y uso

- Vive en `libs/shared-types/src/index.ts` (o dividido en archivos por dominio, re-exportados desde `index.ts` — decisión libre de implementación, no cambia el contrato).
- Los servicios NestJS importan estos tipos para tipar sus DTOs de request/response (no para mapear sus modelos Prisma internos 1:1 — el modelo Prisma puede tener columnas internas que no se exponen, ej. `passwordHash` nunca viaja en un DTO).
- El frontend Angular importa el mismo paquete para tipar las respuestas HTTP.
