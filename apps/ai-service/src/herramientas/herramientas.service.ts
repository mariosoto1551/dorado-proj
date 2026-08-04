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
        return {
          ok: true,
          datos: await this.activity.actividades(grupoId, this.estado(argumentos)),
        };

      case 'listar_conductas':
        return {
          ok: true,
          datos: await this.activity.conductas(grupoId, this.estado(argumentos)),
        };

      case 'listar_participantes':
        return { ok: true, datos: await this.participantes(grupoId) };

      case 'listar_umbrales_zona':
        return { ok: true, datos: await this.scoring.umbrales(grupoId) };

      case 'resumen_puntajes':
        return await this.resumenPuntajes(grupoId);

      case 'listar_recompensas':
        return {
          ok: true,
          datos: await this.rewards.recompensas(grupoId, this.estado(argumentos)),
        };

      case 'listar_rendimientos_monedas':
        return { ok: true, datos: await this.rewards.rendimientos(grupoId) };

      case 'resumen_cumplimiento':
        return {
          ok: true,
          datos: await this.resumenCumplimiento(grupoId, this.dias(argumentos)),
        };

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

  private async resumenCumplimiento(grupoId: string, dias: number): Promise<unknown> {
    const resumen = await this.activity.resumenCumplimiento(grupoId, dias);

    return resumen ?? { grupoId, dias, actividades: [] };
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
}
