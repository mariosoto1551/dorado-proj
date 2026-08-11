import { Injectable, Logger } from '@nestjs/common';

import { ActivityClientService } from '../clientes/activity-client.service';
import { IdentityClientService } from '../clientes/identity-client.service';
import { RewardsClientService } from '../clientes/rewards-client.service';
import { ScoringClientService } from '../clientes/scoring-client.service';
import { ContextoHerramienta } from '../comun/acceso-grupo.service';
import { NOMBRES_HERRAMIENTAS_LECTURA } from './definiciones';

/**
 * Lo que el ejecutor le devuelve al loop (tanda 4) para que lo mande como
 * mensaje de rol HERRAMIENTA.
 *
 * El error viaja como resultado y no como excepción a propósito: una
 * herramienta que falla tiene que poder contarse en castellano dentro de la
 * conversación ("no pude leer el catálogo ahora"), no tirar abajo el turno.
 */
export type ResultadoHerramienta =
  | { ok: true; datos: unknown }
  | { ok: false; error: string };

/** Ventana por defecto del resumen de cumplimiento, en días. */
const DIAS_CUMPLIMIENTO_DEFAULT = 30;

const DIAS_CUMPLIMIENTO_MIN = 1;

const DIAS_CUMPLIMIENTO_MAX = 365;

/**
 * Ejecuta las herramientas de LECTURA que el modelo pide (fase-14-29 Parte D).
 *
 * Las dos cosas que hay que entender de este archivo:
 *
 * 1. **El tenant no sale de los argumentos, sale del contexto.** `argumentos`
 *    es texto que produjo un modelo a partir de, entre otras cosas, datos que
 *    escribieron los integrantes del grupo (fase-14-10): es entrada no
 *    confiable y se trata como tal. El `grupoId` sobre el que se lee viene del
 *    `ContextoHerramienta`, que solo `AccesoGrupoService` sabe construir.
 *    Aunque el modelo mande `{"grupoId": "el-de-otra-organizacion"}`, ese
 *    campo no se lee en ninguna línea de acá.
 *
 * 2. **Ninguna herramienta escribe.** Todas terminan en un GET de
 *    `ClienteInternoBase`, que es el único método de red del servicio.
 *
 * 3. **Ninguna herramienta devuelve un DTO crudo** (fase-14-30 decisión 9).
 *    Cada respuesta se arma campo por campo. La regla nació de un defecto:
 *    cuatro de las ocho lecturas del fase-14-29 pasaban el DTO entero, y
 *    `ActividadDto`, `ConductaDto`, `UmbralZonaDto` y `RecompensaDto` llevan
 *    `organizacionId` y `grupoId` — o sea que **el id de organización salía en
 *    claro hacia el proveedor**, justo lo que la Parte E de aquel ítem promete
 *    que no pasa. Las dos que se armaban a mano nunca tuvieron el problema, y
 *    esa es exactamente la diferencia: pasar el DTO entero es el camino corto y
 *    nadie lo había cerrado. Cuatro `delete` habrían arreglado el caso y dejado
 *    el camino abierto para la lectura número trece.
 *
 *    Moldear cobra además dos cosas que ya se estaban cobrando sin decirlo:
 *    viaja solo lo que el modelo necesita (menos tokens de entrada en cada
 *    llamada) y cada campo se nombra pensando en que lo lea un modelo.
 *    `herramientas.service.spec.ts` lo verifica sobre la salida real.
 */
@Injectable()
export class HerramientasService {
  private readonly logger = new Logger(HerramientasService.name);

  constructor(
    private readonly activity: ActivityClientService,
    private readonly identity: IdentityClientService,
    private readonly scoring: ScoringClientService,
    private readonly rewards: RewardsClientService
  ) {}

  /**
   * Ejecuta una herramienta por nombre. Un nombre desconocido no es una
   * excepción: es un resultado de error que vuelve al modelo, que después de
   * verlo suele corregirse solo.
   */
  async ejecutar(
    nombre: string,
    argumentos: Record<string, unknown>,
    contexto: ContextoHerramienta
  ): Promise<ResultadoHerramienta> {
    if (!NOMBRES_HERRAMIENTAS_LECTURA.includes(nombre)) {
      this.logger.warn(`El modelo pidió una herramienta inexistente: ${nombre}`);

      return { ok: false, error: `No existe una herramienta llamada "${nombre}".` };
    }

    const { grupoId } = contexto;

    switch (nombre) {
      case 'listar_actividades':
        return { ok: true, datos: await this.actividades(grupoId, this.estado(argumentos)) };

      case 'listar_conductas':
        return { ok: true, datos: await this.conductas(grupoId, this.estado(argumentos)) };

      case 'listar_participantes':
        return { ok: true, datos: await this.participantes(grupoId) };

      case 'listar_umbrales_zona':
        return { ok: true, datos: await this.umbrales(grupoId) };

      case 'resumen_puntajes':
        return await this.resumenPuntajes(grupoId);

      case 'listar_recompensas':
        return { ok: true, datos: await this.recompensas(grupoId, this.estado(argumentos)) };

      case 'listar_rendimientos_monedas':
        return { ok: true, datos: await this.rendimientos(grupoId) };

      case 'listar_tienda':
        return { ok: true, datos: await this.tienda(grupoId, this.estado(argumentos)) };

      case 'listar_etiquetas':
        return { ok: true, datos: await this.etiquetas(grupoId, this.estado(argumentos)) };

      case 'listar_turnos':
        return { ok: true, datos: await this.turnos(grupoId) };

      case 'configuracion_del_grupo':
        return await this.configuracionDelGrupo(grupoId);

      case 'resumen_cumplimiento':
        return {
          ok: true,
          datos: await this.resumenCumplimiento(grupoId, this.dias(argumentos)),
        };

      // fase-14-31: las dos ya vienen moldeadas del endpoint interno —sin
      // claves de tenant y con los nombres pensados para que los lea un
      // modelo—, así que acá no hay nada que recortar. Ver la decisión 9 del
      // #30: la regla es que la respuesta se arme campo por campo, y armarla
      // del otro lado del cable la cumple igual.
      case 'estado_de_hoy':
        return {
          ok: true,
          // fase-14-33: el día que se quiere mirar, si el tutor nombró uno.
          datos: await this.activity.estadoDeHoy(grupoId, this.sesionId(argumentos)),
        };

      case 'listar_billeteras':
        return { ok: true, datos: await this.rewards.billeteras(grupoId) };

      // fase-14-33: pass-through — el interno ya devuelve el shape final.
      case 'listar_sesiones_de_la_seccion':
        return { ok: true, datos: await this.activity.sesionesDeLaSeccion(grupoId) };

      // Inalcanzable con el catálogo actual (el nombre ya se validó arriba),
      // pero es la rama que se va a ejecutar el día que alguien agregue una
      // definición y se olvide del case. Mejor un error que le vuelve al modelo
      // que un `undefined` silencioso.
      default:
        return {
          ok: false,
          error: `La herramienta "${nombre}" está declarada pero todavía no se puede ejecutar.`,
        };
    }
  }

  /**
   * Catálogo de actividades, sin los dos campos de tenant y sin el autor.
   *
   * `creadaPorUsuarioId` se cae porque no hay nada que el asistente pueda hacer
   * con él: `origen` ya le dice si la actividad es del catálogo del Tutor o
   * personal de un integrante, que es la parte que cambia qué se puede proponer
   * sobre ella.
   */
  private async actividades(grupoId: string, estado?: string): Promise<unknown> {
    const actividades = await this.activity.actividades(grupoId, estado);

    return actividades.map((actividad) => ({
      actividadId: actividad.id,
      nombre: actividad.nombre,
      descripcion: actividad.descripcion,
      tipoPuntaje: actividad.tipoPuntaje,
      valorPuntos: actividad.valorPuntos,
      puntosPorCumplir: actividad.puntosPorCumplir,
      tipoLimiteTiempo: actividad.tipoLimiteTiempo,
      deadlineHora: actividad.deadlineHora,
      duracionCronometroMinutos: actividad.duracionCronometroMinutos,
      repeticionesMaximasSesion: actividad.repeticionesMaximasSesion,
      repeticionesMinimasSesion: actividad.repeticionesMinimasSesion,
      repeticionesMaximasSeccion: actividad.repeticionesMaximasSeccion,
      comportamientoAlCierre: actividad.comportamientoAlCierre,
      alcance: actividad.alcance,
      bonoJefePuntos: actividad.bonoJefePuntos,
      origen: actividad.origen,
      diasSemana: actividad.diasSemana,
      siempreVisible: actividad.siempreVisible,
      rolesPermitidos: actividad.rolesPermitidos,
      usuariosPermitidos: actividad.usuariosPermitidos,
      equiposPermitidos: actividad.equiposPermitidos,
      vigenteDesde: actividad.vigenteDesde,
      vigenteHasta: actividad.vigenteHasta,
      estado: actividad.estado,
    }));
  }

  private async conductas(grupoId: string, estado?: string): Promise<unknown> {
    const conductas = await this.activity.conductas(grupoId, estado);

    return conductas.map((conducta) => ({
      conductaId: conducta.id,
      nombre: conducta.nombre,
      tipo: conducta.tipo,
      valorPuntos: conducta.valorPuntos,
      permiteAutoreporte: conducta.permiteAutoreporte,
      estado: conducta.estado,
    }));
  }

  private async umbrales(grupoId: string): Promise<unknown> {
    const umbrales = await this.scoring.umbrales(grupoId);

    return umbrales.map((umbral) => ({
      umbralZonaId: umbral.id,
      nombreZona: umbral.nombreZona,
      orden: umbral.orden,
      puntosMin: umbral.puntosMin,
      // null = la zona más alta, la que no tiene techo.
      puntosMax: umbral.puntosMax,
      colorHex: umbral.colorHex,
    }));
  }

  /**
   * Recompensas con sus etiquetas. Las etiquetas también se moldean: son otro
   * DTO con `organizacionId` y `grupoId` adentro, anidado dentro de este.
   */
  private async recompensas(grupoId: string, estado?: string): Promise<unknown> {
    const recompensas = await this.rewards.recompensas(grupoId, estado);

    return recompensas.map((recompensa) => ({
      recompensaId: recompensa.id,
      nombre: recompensa.nombre,
      descripcion: recompensa.descripcion,
      tipo: recompensa.tipo,
      umbralZonaId: recompensa.umbralZonaId,
      nombreZona: recompensa.nombreZonaSnapshot,
      permiteSeleccion: recompensa.permiteSeleccion,
      permiteAzar: recompensa.permiteAzar,
      etiquetas: recompensa.etiquetas.map((etiqueta) => ({
        etiquetaId: etiqueta.id,
        nombre: etiqueta.nombre,
      })),
      estado: recompensa.estado,
    }));
  }

  private async rendimientos(grupoId: string): Promise<unknown> {
    const rendimientos = await this.rewards.rendimientos(grupoId);

    return rendimientos.map((rendimiento) => ({
      tipoAccion: rendimiento.tipoAccion,
      origenId: rendimiento.origenId,
      nombre: rendimiento.nombreSnapshot,
      monedas: rendimiento.monedas,
      monedasBonoJefe: rendimiento.monedasBonoJefe,
    }));
  }

  /**
   * Productos y bolsas (fase-14-30 tanda 1).
   *
   * **Es la lectura de la que sale el `productoId`** que
   * `proponer_precios_tienda` pedía y que ninguna herramienta devolvía: el
   * precio vive en el `ProductoTienda`, no en la `Recompensa`, así que
   * `listar_recompensas` no alcanzaba y el modelo solo podía inventarlo.
   *
   * El filtro por estado se aplica acá y no en el endpoint interno porque vale
   * para las dos listas por igual, y una bolsa archivada con productos activos
   * es una combinación que el Tutor tiene que poder ver.
   */
  private async tienda(grupoId: string, estado?: string): Promise<unknown> {
    const tienda = await this.rewards.tienda(grupoId);
    const pasa = (suyo: string): boolean => estado === undefined || suyo === estado;

    return {
      productos: tienda.productos
        .filter((producto) => pasa(producto.estado))
        .map((producto) => ({
          productoId: producto.id,
          nombre: producto.nombre,
          descripcion: producto.descripcion,
          precio: producto.precio,
          fuente: producto.fuente,
          mecanica: producto.mecanica,
          recompensaId: producto.recompensaId,
          bolsaId: producto.bolsaId,
          estado: producto.estado,
        })),
      bolsas: tienda.bolsas
        .filter((bolsa) => pasa(bolsa.estado))
        .map((bolsa) => ({
          bolsaId: bolsa.id,
          nombre: bolsa.nombre,
          recompensaIds: bolsa.recompensaIds,
          estado: bolsa.estado,
        })),
    };
  }

  private async etiquetas(grupoId: string, estado?: string): Promise<unknown> {
    const etiquetas = await this.rewards.etiquetas(grupoId, estado);

    return etiquetas.map((etiqueta) => ({
      etiquetaId: etiqueta.id,
      nombre: etiqueta.nombre,
      colorHex: etiqueta.colorHex,
      estado: etiqueta.estado,
    }));
  }

  private async turnos(grupoId: string): Promise<unknown> {
    const turnos = await this.activity.turnos(grupoId);

    return turnos.map((turno) => ({
      actividadId: turno.actividadId,
      modo: turno.modo,
      frecuencia: turno.frecuencia,
      activo: turno.activo,
      // La secuencia ya viene ordenada del endpoint; el orden explícito viaja
      // igual porque el modelo lee JSON, no confía en la posición del array.
      posiciones: turno.posiciones.map((posicion) => ({
        orden: posicion.orden,
        usuarioId: posicion.usuarioId,
      })),
    }));
  }

  /**
   * La configuración del Grupo: **una herramienta, tres servicios, una
   * respuesta**.
   *
   * Son tres llamadas en paralelo y no tres herramientas por el mismo criterio
   * que `listar_participantes`: el modelo la consulta para entender el terreno
   * antes de proponer, y partirla en tres costaría tres vueltas del loop, o sea
   * tres llamadas al proveedor pagadas para contestar una cosa.
   *
   * Un servicio que no contesta deja su parte en `null` en vez de un default
   * inventado. La diferencia importa: decir «DIRECTO» sin saberlo haría que el
   * asistente descarte la tienda de un grupo que sí la usa.
   */
  private async configuracionDelGrupo(grupoId: string): Promise<ResultadoHerramienta> {
    const [actividad, scoring, recompensas] = await Promise.all([
      this.activity.configuracion(grupoId),
      this.scoring.configuracion(grupoId),
      this.rewards.configuracion(grupoId),
    ]);

    if (!actividad && !scoring && !recompensas) {
      return { ok: false, error: 'No se pudo leer la configuración del grupo en este momento.' };
    }

    return {
      ok: true,
      datos: {
        planDelDiaActivo: actividad?.planDelDiaActivo ?? null,
        contenidoCreadoPorIntegrantes: actividad
          ? {
              modo: actividad.modoCreacionUsuario,
              maxPuntosPorActividad: actividad.maxPuntosActividadUsuario,
              maxActividadesActivasPorPersona: actividad.maxActividadesActivasPorUsuario,
            }
          : null,
        puntosIniciales: scoring?.puntosIniciales ?? null,
        recompensas: recompensas
          ? {
              modo: recompensas.modo,
              modoPendiente: recompensas.modoPendiente,
              nombreMoneda: recompensas.nombreMoneda,
              iconoMoneda: recompensas.iconoMoneda,
            }
          : null,
      },
    };
  }

  /**
   * Gente del grupo: participantes con su rol funcional, el catálogo de roles y
   * los equipos con su jefe.
   *
   * Se arma en UNA sola herramienta y no en tres porque las tres preguntas se
   * hacen juntas —"¿a quién le pongo esta actividad?"— y separarlas costaría
   * tres vueltas del loop, o sea tres llamadas al proveedor pagadas para
   * responder una cosa.
   *
   * **Sin emails ni ningún dato de contacto**: no se filtran acá, es que no
   * vienen en el DTO (ver `IdentityClientService`).
   */
  private async participantes(grupoId: string): Promise<unknown> {
    const [usuarios, roles, equipos] = await Promise.all([
      this.identity.participantes(grupoId),
      this.identity.roles(grupoId),
      this.identity.equipos(grupoId),
    ]);

    return {
      participantes: usuarios.map((usuario) => ({
        usuarioId: usuario.id,
        nombre: usuario.nombre,
        rol: usuario.rolGrupo?.nombre ?? null,
        rolId: usuario.rolGrupo?.id ?? null,
      })),
      roles: roles
        .filter((rol) => rol.estado === 'ACTIVO')
        .map((rol) => ({ rolId: rol.id, nombre: rol.nombre })),
      equipos: equipos
        .filter((equipo) => equipo.estado === 'ACTIVO')
        .map((equipo) => ({
          equipoId: equipo.equipoId,
          nombre: equipo.nombre,
          jefeUsuarioId: equipo.jefeUsuarioId,
          miembros: equipo.miembros.map((miembro) => miembro.usuarioId),
        })),
    };
  }

  /**
   * Puntajes de la sección más reciente, con los nombres compuestos acá.
   *
   * scoring no conoce nombres y no debe salir a identity por esto (regla 2):
   * el cruce por ID lo hace quien tiene las dos mitades, que es este servicio.
   */
  private async resumenPuntajes(grupoId: string): Promise<ResultadoHerramienta> {
    const [resumen, usuarios] = await Promise.all([
      this.scoring.resumenPuntajes(grupoId),
      this.identity.participantes(grupoId),
    ]);

    if (!resumen) {
      return { ok: false, error: 'No se pudieron leer los puntajes del grupo en este momento.' };
    }

    const nombrePorId = new Map(usuarios.map((usuario) => [usuario.id, usuario.nombre]));

    return {
      ok: true,
      datos: {
        seccionId: resumen.seccionId,
        // El modelo tiene que poder decir "provisorio" cuando lo es: una
        // sección abierta todavía puede cambiar de zona antes de cerrar.
        definitivo: resumen.origen === 'SNAPSHOT',
        puntajes: resumen.puntajes.map((puntaje) => ({
          nombre: nombrePorId.get(puntaje.usuarioId) ?? null,
          usuarioId: puntaje.usuarioId,
          puntajeTotal: puntaje.puntajeTotal,
          zona: puntaje.nombreZona,
          descalificado: puntaje.descalificado,
        })),
      },
    };
  }

  /**
   * Cuánto se usa cada actividad. El DTO trae `grupoId` en la raíz y se cae acá
   * — incluido el caso del servicio caído, que antes lo devolvía igual.
   */
  private async resumenCumplimiento(grupoId: string, dias: number): Promise<unknown> {
    const resumen = await this.activity.resumenCumplimiento(grupoId, dias);

    return {
      dias: resumen?.dias ?? dias,
      actividades: (resumen?.actividades ?? []).map((actividad) => ({
        actividadId: actividad.actividadId,
        nombre: actividad.nombre,
        estado: actividad.estado,
        tipoPuntaje: actividad.tipoPuntaje,
        valorPuntos: actividad.valorPuntos,
        vecesCompletada: actividad.vecesCompletada,
        vecesNoHizo: actividad.vecesNoHizo,
        participantesDistintos: actividad.participantesDistintos,
        ultimaVezCompletada: actividad.ultimaVezCompletada,
      })),
    };
  }

  /** `estado` del modelo, aceptado solo si es uno de los dos válidos. */
  private estado(argumentos: Record<string, unknown>): string | undefined {
    const valor = argumentos['estado'];

    return valor === 'ACTIVA' || valor === 'ARCHIVADA' ? valor : undefined;
  }

  /**
   * `dias` del modelo, acotado al rango declarado. Un modelo que pide 100000
   * días no recibe un error: recibe el máximo, que es lo que quería decir.
   */
  private dias(argumentos: Record<string, unknown>): number {
    const crudo = argumentos['dias'];
    const numero = typeof crudo === 'number' ? crudo : Number.parseInt(String(crudo ?? ''), 10);

    if (!Number.isFinite(numero)) {
      return DIAS_CUMPLIMIENTO_DEFAULT;
    }

    return Math.min(Math.max(Math.trunc(numero), DIAS_CUMPLIMIENTO_MIN), DIAS_CUMPLIMIENTO_MAX);
  }

  /**
   * `sesionId` del modelo (fase-14-33), o `undefined`.
   *
   * No se valida que sea un uuid real: el que decide si esa Sesión existe y es
   * de la Sección vigente es activity-service, que es el único que puede
   * saberlo. Acá solo se descarta lo que ni siquiera es un string — un modelo
   * que manda `null` o un número quiso decir «hoy».
   */
  private sesionId(argumentos: Record<string, unknown>): string | undefined {
    const valor = argumentos['sesionId'];

    return typeof valor === 'string' && valor.trim() !== '' ? valor : undefined;
  }
}
