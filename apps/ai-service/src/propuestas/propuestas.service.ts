import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { z } from 'zod';

import { PropuestaIaDto, ResultadoOperacionIa, TenantContext } from '@dorado/shared-types';

import { ActivityClientService } from '../clientes/activity-client.service';
import { IdentityClientService } from '../clientes/identity-client.service';
import { RewardsClientService } from '../clientes/rewards-client.service';
import { ScoringClientService } from '../clientes/scoring-client.service';
import { ContextoHerramienta } from '../comun/acceso-grupo.service';
import { PropuestaNoAplicableException, PropuestaVencidaException } from '../comun/excepciones';
import { PrismaService } from '../prisma/prisma.service';
import {
  cuantosCambianDeZona,
  estadoResultante,
  ordenAplicable,
  violacionDeLaEscala,
  type PasoDeEscala,
  type ZonaDeLaEscala,
} from './escala';
import {
  esquemaAgregarMiembro,
  esquemaAsignarEtiquetas,
  esquemaAsignarRol,
  esquemaConfiguracionScoring,
  esquemaConfigurarTurno,
  esquemaCrearActividad,
  esquemaCrearConducta,
  esquemaCrearEquipo,
  esquemaCrearEtiqueta,
  esquemaCrearProducto,
  esquemaCrearRecompensa,
  esquemaCrearRol,
  esquemaCrearUmbral,
  esquemaEditarActividad,
  esquemaEditarConducta,
  esquemaEditarEquipo,
  esquemaEditarProducto,
  esquemaEditarRecompensa,
  esquemaEditarRol,
  esquemaEditarUmbral,
  esquemaGuardarBolsa,
  esquemaRendimientos,
  esquemaSustituirJefe,
  explicarError,
} from './esquemas';
import { limpiarVacios, normalizarLimiteTiempo, violacionDeInvariantes } from './invariantes';

/** Decisión 12: una propuesta vence a las 24 h de armada. */
const HORAS_DE_VIGENCIA = 24;

/** Lo que se guarda por operación: el request destino + cómo aplicarlo. */
export interface OperacionPropuesta {
  /** Id local, para poder reportar por fila (decisión 13). */
  opId: string;
  /**
   * `DELETE` desde el fase-14-31, y **solo** en los tipos de
   * `TIPOS_PROPUESTA_CON_BORRADO`. La decisión 3 del #30 no se borró: se
   * volvió una lista blanca, con su test en `propuestas.service.spec.ts`.
   */
  metodo: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Ruta pública, relativa a `/api`. La ejecuta el frontend con el JWT del Tutor. */
  ruta: string;
  /** El body, con la forma EXACTA del request de ese endpoint. */
  body: unknown;
  /** Una línea legible para la tarjeta de la propuesta. Nada de JSON crudo en pantalla. */
  etiqueta: string;
}

type TipoPropuesta =
  | 'CREAR_ACTIVIDADES'
  | 'EDITAR_ACTIVIDADES'
  /**
   * El nombre de la herramienta que lo produce es `proponer_editar_productos`
   * desde el fase-14-30 (decisión 7). El valor NO se renombró y no es un
   * descuido: el nombre de la herramienta solo viaja hacia el proveedor dentro
   * de un request, pero este valor **está persistido en filas existentes**.
   */
  | 'PRECIOS_TIENDA'
  | 'RENDIMIENTOS_MONEDAS'
  | 'CREAR_CONDUCTAS'
  | 'EDITAR_CONDUCTAS'
  | 'TURNOS'
  | 'CREAR_RECOMPENSAS'
  | 'EDITAR_RECOMPENSAS'
  | 'PRODUCTOS_TIENDA'
  | 'ETIQUETAS'
  | 'UMBRALES_ZONA'
  | 'ROLES_GRUPO'
  | 'EQUIPOS'
  // fase-14-31 — alcance operativo.
  | 'ARCHIVAR_CATALOGO'
  | 'QUITAR_MARCAS'
  | 'AJUSTES_MANUALES'
  | 'ANOTAR_REGISTROS';

/**
 * Lo que el armador le devuelve al loop para que se lo cuente al modelo.
 *
 * Lleva también la propuesta **entera** (fase-14-29 tanda 6): la fila recién
 * creada ya está en memoria, así que mandarla por el stream cuesta cero y hace
 * que la tarjeta aparezca en pantalla en el momento en que se armó, sin una
 * segunda llamada del navegador.
 */
export type ResultadoArmado =
  | {
      ok: true;
      propuestaId: string;
      cantidad: number;
      mensaje: string;
      propuesta: PropuestaIaDto;
    }
  | { ok: false; error: string };

/**
 * Arma, valida y guarda las propuestas (fase-14-29 tanda 5).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOS REGLAS QUE NO SE NEGOCIAN ACÁ:
 *
 * 1. **Una operación que no valida NO se guarda** (decisión 11). El error
 *    vuelve al modelo con la ruta del campo para que reintente. No se guarda
 *    «lo que sí validó» y se descarta el resto: una propuesta a medias es peor
 *    que ninguna, porque el Tutor no tiene cómo saber qué falta.
 *
 * 2. **Nada de esto escribe en otro servicio** (decisión 6). Se guarda una fila
 *    en `ai_db` y se devuelve. Las operaciones llevan método y ruta porque el
 *    que las va a ejecutar es el FRONTEND con el JWT del Tutor, y este servicio
 *    no tiene ningún secreto que le permita hacerlo por su cuenta.
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Injectable()
export class PropuestasService {
  private readonly logger = new Logger(PropuestasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityClientService,
    private readonly identity: IdentityClientService,
    private readonly rewards: RewardsClientService,
    private readonly scoring: ScoringClientService
  ) {}

  /** Punto de entrada del loop: valida los argumentos del modelo y arma la propuesta. */
  async armar(
    nombreHerramienta: string,
    argumentos: Record<string, unknown>,
    contexto: ContextoHerramienta,
    conversacionId: string
  ): Promise<ResultadoArmado> {
    switch (nombreHerramienta) {
      case 'proponer_crear_actividades':
        return await this.armarCrearActividades(argumentos, contexto, conversacionId);

      case 'proponer_editar_actividades':
        return await this.armarEditarActividades(argumentos, contexto, conversacionId);

      case 'proponer_crear_conductas':
        return await this.armarCrearConductas(argumentos, contexto, conversacionId);

      case 'proponer_editar_conductas':
        return await this.armarEditarConductas(argumentos, contexto, conversacionId);

      case 'proponer_configurar_turnos':
        return await this.armarConfigurarTurnos(argumentos, contexto, conversacionId);

      case 'proponer_crear_recompensas':
        return await this.armarCrearRecompensas(argumentos, contexto, conversacionId);

      case 'proponer_editar_recompensas':
        return await this.armarEditarRecompensas(argumentos, contexto, conversacionId);

      case 'proponer_crear_productos':
        return await this.armarCrearProductos(argumentos, contexto, conversacionId);

      case 'proponer_editar_productos':
        return await this.armarEditarProductos(argumentos, contexto, conversacionId);

      case 'proponer_etiquetas':
        return await this.armarEtiquetas(argumentos, contexto, conversacionId);

      case 'proponer_rendimientos_monedas':
        return await this.armarRendimientos(argumentos, contexto, conversacionId);

      case 'proponer_umbrales_zona':
        return await this.armarUmbralesZona(argumentos, contexto, conversacionId);

      case 'proponer_roles_grupo':
        return await this.armarRolesGrupo(argumentos, contexto, conversacionId);

      case 'proponer_equipos':
        return await this.armarEquipos(argumentos, contexto, conversacionId);

      default:
        return { ok: false, error: `No existe una herramienta llamada "${nombreHerramienta}".` };
    }
  }

  private async armarCrearActividades(
    argumentos: Record<string, unknown>,
    contexto: ContextoHerramienta,
    conversacionId: string
  ): Promise<ResultadoArmado> {
    const filas = this.arrayDe(argumentos, 'actividades');

    if (filas.length === 0) {
      return { ok: false, error: 'Mandá al menos una actividad en "actividades".' };
    }

    const referencias = await this.referenciasDelGrupo(contexto.grupoId);
    const operaciones: OperacionPropuesta[] = [];

    for (const [indice, fila] of filas.entries()) {
      const parseado = esquemaCrearActividad.safeParse(
        // En un alta, `null` es «no lo puse»: el modelo no puede omitir campos.
        limpiarVacios(fila as Record<string, unknown>, true)
      );

      if (!parseado.success) {
        return { ok: false, error: this.errorDeFila('actividades', indice, parseado.error) };
      }

      // Los invariantes CRUZADOS, que Zod no puede expresar campo por campo.
      // Sin esto la propuesta se guarda impecable y falla entera al aplicar.
      const invariante = violacionDeInvariantes(parseado.data, false);

      if (invariante) {
        return { ok: false, error: `actividades.${indice}: ${invariante}` };
      }

      const cruce = this.validarReferencias(parseado.data, referencias);

      if (cruce) {
        return { ok: false, error: `actividades.${indice}: ${cruce}` };
      }

      // Se rechaza lo ambiguo y se normaliza lo determinado: los campos que el
      // tipoLimiteTiempo no admite se sacan acá en vez de mandarle al modelo un
      // error que no puede resolver.
      const cuerpo = normalizarLimiteTiempo(parseado.data);

      operaciones.push({
        opId: `op-${indice + 1}`,
        metodo: 'POST',
        ruta: `/activity/grupos/${contexto.grupoId}/actividades`,
        body: cuerpo,
        etiqueta: `Crear «${cuerpo.nombre}» (${cuerpo.tipoPuntaje.toLowerCase()}, ${
          cuerpo.valorPuntos
        } puntos)`,
      });
    }

    return await this.guardar(
      'CREAR_ACTIVIDADES',
      operaciones,
      { actividadesExistentes: referencias.actividades.map((a) => a.id) },
      contexto,
      conversacionId
    );
  }

  private async armarEditarActividades(
    argumentos: Record<string, unknown>,
    contexto: ContextoHerramienta,
    conversacionId: string
  ): Promise<ResultadoArmado> {
    const filas = this.arrayDe(argumentos, 'ediciones');

    if (filas.length === 0) {
      return { ok: false, error: 'Mandá al menos una edición en "ediciones".' };
    }

    const referencias = await this.referenciasDelGrupo(contexto.grupoId);
    const operaciones: OperacionPropuesta[] = [];
    const snapshot: Array<{ id: string; nombre: string }> = [];

    for (const [indice, fila] of filas.entries()) {
      const { actividadId, ...cambios } = fila as Record<string, unknown>;
      const existente = referencias.actividades.find((a) => a.id === actividadId);

      // Editar algo que no existe en ESTE grupo no es un error de shape: es el
      // modelo apuntando a un id de otro lado o inventado. Se lo devolvemos con
      // el detalle para que corrija, no lo guardamos.
      if (!existente) {
        return {
          ok: false,
          error: `ediciones.${indice}.actividadId: no hay ninguna actividad con ese id en este grupo.`,
        };
      }

      // En un PATCH `null` se conserva: es la forma de BORRAR un campo
      // (fase-14-24), y tratarlo como ausente perdería esa capacidad.
      const parseado = esquemaEditarActividad.safeParse(limpiarVacios(cambios, false));

      if (!parseado.success) {
        return { ok: false, error: this.errorDeFila('ediciones', indice, parseado.error) };
      }

      if (Object.keys(parseado.data).length === 0) {
        return { ok: false, error: `ediciones.${indice}: no mandaste ningún campo para cambiar.` };
      }

      const invariante = violacionDeInvariantes(parseado.data, true);

      if (invariante) {
        return { ok: false, error: `ediciones.${indice}: ${invariante}` };
      }

      const cruce = this.validarReferencias(parseado.data, referencias);

      if (cruce) {
        return { ok: false, error: `ediciones.${indice}: ${cruce}` };
      }

      const cuerpo = normalizarLimiteTiempo(parseado.data);

      operaciones.push({
        opId: `op-${indice + 1}`,
        metodo: 'PATCH',
        ruta: `/activity/actividades/${String(actividadId)}`,
        body: cuerpo,
        etiqueta: `Editar «${existente.nombre}»: ${Object.keys(cuerpo).join(', ')}`,
      });
      snapshot.push({ id: existente.id, nombre: existente.nombre });
    }

    return await this.guardar(
      'EDITAR_ACTIVIDADES',
      operaciones,
      { actividades: snapshot },
      contexto,
      conversacionId
    );
  }

  /**
   * Conductas nuevas (fase-14-30 tanda 4).
   *
   * ───────────────────────────────────────────────────────────────────────────
   * POR QUÉ ACÁ EL `null` ES «NO LO PUSE» EN LAS DOS RAMAS, Y EN ACTIVIDADES NO:
   *
   * En un PATCH de actividad, `null` **borra** el campo (fase-14-24: así se
   * quita una vigencia), así que tratarlo como ausente perdería esa capacidad.
   * El contrato de conducta **no tiene un solo campo anulable**: sus cuatro
   * campos son `string`, enum, `number` y `boolean`. O sea que un `null` acá no
   * puede significar «borralo», solo puede significar «no lo puse».
   *
   * Y el modelo lo va a mandar, porque no puede omitir una propiedad declarada
   * (lo aprendió la tanda 5 del #29). Si el `null` no se sacara, **toda edición
   * de un solo campo fallaría** con un error que el modelo no puede resolver.
   * ───────────────────────────────────────────────────────────────────────────
   */
  private async armarCrearConductas(
    argumentos: Record<string, unknown>,
    contexto: ContextoHerramienta,
    conversacionId: string
  ): Promise<ResultadoArmado> {
    const filas = this.arrayDe(argumentos, 'conductas');

    if (filas.length === 0) {
      return { ok: false, error: 'Mandá al menos una conducta en "conductas".' };
    }

    const existentes = await this.activity.conductas(contexto.grupoId);
    const operaciones: OperacionPropuesta[] = [];

    for (const [indice, fila] of filas.entries()) {
      const parseado = esquemaCrearConducta.safeParse(
        limpiarVacios(fila as Record<string, unknown>, true)
      );

      if (!parseado.success) {
        return { ok: false, error: this.errorDeFila('conductas', indice, parseado.error) };
      }

      const cuerpo = parseado.data;

      operaciones.push({
        opId: `op-${indice + 1}`,
        metodo: 'POST',
        ruta: `/activity/grupos/${contexto.grupoId}/conductas`,
        body: cuerpo,
        etiqueta: `Crear conducta «${cuerpo.nombre}» (${cuerpo.tipo.toLowerCase()}, ${
          cuerpo.valorPuntos
        } puntos)`,
      });
    }

    return await this.guardar(
      'CREAR_CONDUCTAS',
      operaciones,
      { conductasExistentes: existentes.map((conducta) => conducta.id) },
      contexto,
      conversacionId
    );
  }

  private async armarEditarConductas(
    argumentos: Record<string, unknown>,
    contexto: ContextoHerramienta,
    conversacionId: string
  ): Promise<ResultadoArmado> {
    const filas = this.arrayDe(argumentos, 'ediciones');

    if (filas.length === 0) {
      return { ok: false, error: 'Mandá al menos una edición en "ediciones".' };
    }

    // Decisión 2: la referencia se valida contra el estado real del grupo antes
    // de guardar nada. La decisión 1 le da al modelo de dónde sacar el id; esto
    // evita que mande uno de otra entidad, que ahora que los ids abundan es el
    // error probable.
    const existentes = await this.activity.conductas(contexto.grupoId);
    const porId = new Map(existentes.map((conducta) => [conducta.id, conducta]));
    const operaciones: OperacionPropuesta[] = [];
    const snapshot: Array<{ id: string; nombre: string; valorPuntos: number }> = [];

    for (const [indice, fila] of filas.entries()) {
      const { conductaId, ...cambios } = fila as Record<string, unknown>;
      const existente = typeof conductaId === 'string' ? porId.get(conductaId) : undefined;

      if (!existente) {
        return {
          ok: false,
          error:
            `ediciones.${indice}.conductaId: no hay ninguna conducta con ese id en este grupo. ` +
            'Llamá a listar_conductas y usá un id de ahí.',
        };
      }

      const parseado = esquemaEditarConducta.safeParse(limpiarVacios(cambios, true));

      if (!parseado.success) {
        return { ok: false, error: this.errorDeFila('ediciones', indice, parseado.error) };
      }

      if (Object.keys(parseado.data).length === 0) {
        return { ok: false, error: `ediciones.${indice}: no mandaste ningún campo para cambiar.` };
      }

      operaciones.push({
        opId: `op-${indice + 1}`,
        metodo: 'PATCH',
        ruta: `/activity/conductas/${existente.id}`,
        body: parseado.data,
        etiqueta: `Editar «${existente.nombre}»: ${Object.keys(parseado.data).join(', ')}`,
      });
      snapshot.push({
        id: existente.id,
        nombre: existente.nombre,
        valorPuntos: existente.valorPuntos,
      });
    }

    return await this.guardar(
      'EDITAR_CONDUCTAS',
      operaciones,
      { conductas: snapshot },
      contexto,
      conversacionId
    );
  }

  /**
   * Rotaciones (fase-14-30 tanda 4).
   *
   * El modelo manda la secuencia como una lista plana de ids y acá se convierte
   * a la forma del request destino (`[{ usuarioId }]`). La conversión vive de
   * este lado a propósito: así el esquema Zod puede seguir siendo el contrato
   * exacto —que es lo que hace que un cambio en activity rompa este build— sin
   * cobrarle al modelo un objeto de una sola clave por cada posición.
   *
   * Se replican las tres reglas que el endpoint destino **rechaza**: la
   * actividad tiene que ser OBLIGATORIA e INDIVIDUAL, y las posiciones tienen
   * que ser participantes del grupo y, si la actividad está dirigida a personas
   * concretas, salir de esa lista (fase-14-24 decisión 6 — un turno para quien
   * no la ve es un castigo que cae sobre una pantalla vacía).
   */
  private async armarConfigurarTurnos(
    argumentos: Record<string, unknown>,
    contexto: ContextoHerramienta,
    conversacionId: string
  ): Promise<ResultadoArmado> {
    const filas = this.arrayDe(argumentos, 'turnos');

    if (filas.length === 0) {
      return { ok: false, error: 'Mandá al menos una rotación en "turnos".' };
    }

    const [actividades, participantes, turnosActuales] = await Promise.all([
      this.activity.actividades(contexto.grupoId),
      this.identity.participantes(contexto.grupoId),
      this.activity.turnos(contexto.grupoId),
    ]);
    const porId = new Map(actividades.map((actividad) => [actividad.id, actividad]));
    const delGrupo = new Set(participantes.map((usuario) => usuario.id));
    const rotaHoy = new Set(turnosActuales.map((turno) => turno.actividadId));
    const operaciones: OperacionPropuesta[] = [];
    const snapshot: Array<{ id: string; nombre: string; teniaTurno: boolean }> = [];

    for (const [indice, fila] of filas.entries()) {
      const { actividadId, posiciones, ...resto } = fila as Record<string, unknown>;
      const actividad = typeof actividadId === 'string' ? porId.get(actividadId) : undefined;

      if (!actividad) {
        return {
          ok: false,
          error:
            `turnos.${indice}.actividadId: no hay ninguna actividad con ese id en este grupo. ` +
            'Llamá a listar_actividades y usá un id de ahí.',
        };
      }

      const parseado = esquemaConfigurarTurno.safeParse({
        ...limpiarVacios(resto, true),
        posiciones: Array.isArray(posiciones)
          ? posiciones.map((usuarioId) => ({ usuarioId }))
          : posiciones,
      });

      if (!parseado.success) {
        return { ok: false, error: this.errorDeFila('turnos', indice, parseado.error) };
      }

      const rechazo = this.violacionDeTurno(actividad, parseado.data.posiciones, delGrupo);

      if (rechazo) {
        return { ok: false, error: `turnos.${indice}: ${rechazo}` };
      }

      operaciones.push({
        opId: `op-${indice + 1}`,
        metodo: 'PUT',
        ruta: `/activity/actividades/${actividad.id}/turno`,
        body: parseado.data,
        etiqueta:
          `Rotar «${actividad.nombre}» entre ${parseado.data.posiciones.length} posiciones ` +
          `(${parseado.data.modo === 'AZAR' ? 'al azar' : 'orden fijo'}, cambia por ` +
          `${parseado.data.frecuencia === 'SESION' ? 'día' : 'sección'})` +
          (parseado.data.activo === false ? ' — apagada' : ''),
      });
      snapshot.push({
        id: actividad.id,
        nombre: actividad.nombre,
        teniaTurno: rotaHoy.has(actividad.id),
      });
    }

    return await this.guardar('TURNOS', operaciones, { turnos: snapshot }, contexto, conversacionId);
  }

  /** Las reglas que `PUT /activity/actividades/:id/turno` rechaza, replicadas. */
  private violacionDeTurno(
    actividad: {
      tipoPuntaje: string;
      alcance: string;
      usuariosPermitidos: string[];
    },
    posiciones: Array<{ usuarioId: string }>,
    delGrupo: Set<string>
  ): string | null {
    if (actividad.tipoPuntaje !== 'OBLIGATORIA') {
      return 'solo rota una actividad OBLIGATORIA: la rotación dice quién TIENE que hacerla hoy.';
    }

    if (actividad.alcance !== 'INDIVIDUAL') {
      return 'solo rota una actividad de alcance INDIVIDUAL, no una de equipo.';
    }

    const ajeno = posiciones.find((posicion) => !delGrupo.has(posicion.usuarioId));

    if (ajeno) {
      return `posiciones: "${ajeno.usuarioId}" no es un participante de este grupo.`;
    }

    // Si la actividad tiene destinatario nominal, el pozo de la rotación sale de
    // ahí y no de todo el grupo (fase-14-24 decisión 6).
    if (actividad.usuariosPermitidos.length > 0) {
      const fuera = posiciones.find(
        (posicion) => !actividad.usuariosPermitidos.includes(posicion.usuarioId)
      );

      if (fuera) {
        return (
          `posiciones: "${fuera.usuarioId}" no está entre las personas a las que está dirigida ` +
          'esta actividad, así que nunca la vería en su pantalla.'
        );
      }
    }

    return null;
  }

  /**
   * Premios y castigos nuevos (fase-14-30 tanda 5).
   *
   * La única regla del endpoint destino que rechaza es la zona: en modo
   * DIRECTO `umbralZonaId` es obligatorio y tiene que ser una zona de ESTE
   * grupo; en modo TIENDA se ignora. Por eso se lee el modo antes.
   *
   * **Si no se pudo leer el modo, no se inventa**: se valida la zona si vino y
   * el endpoint decide. Suponer DIRECTO haría fallar propuestas correctas de un
   * grupo con tienda, y suponer TIENDA dejaría pasar propuestas que van a
   * morir al aplicar — el mismo criterio de la tanda 3 con `null` en vez de un
   * default.
   */
  private async armarCrearRecompensas(
    argumentos: Record<string, unknown>,
    contexto: ContextoHerramienta,
    conversacionId: string
  ): Promise<ResultadoArmado> {
    const filas = this.arrayDe(argumentos, 'recompensas');

    if (filas.length === 0) {
      return { ok: false, error: 'Mandá al menos un premio o castigo en "recompensas".' };
    }

    const [configuracion, umbrales] = await Promise.all([
      this.rewards.configuracion(contexto.grupoId),
      this.scoring.umbrales(contexto.grupoId),
    ]);
    const zonas = new Set(umbrales.map((umbral) => umbral.id));
    const operaciones: OperacionPropuesta[] = [];

    for (const [indice, fila] of filas.entries()) {
      const parseado = esquemaCrearRecompensa.safeParse(
        limpiarVacios(fila as Record<string, unknown>, true)
      );

      if (!parseado.success) {
        return { ok: false, error: this.errorDeFila('recompensas', indice, parseado.error) };
      }

      const cuerpo = parseado.data;
      const zona = this.violacionDeZona(cuerpo.umbralZonaId, configuracion?.modo, zonas, true);

      if (zona) {
        return { ok: false, error: `recompensas.${indice}: ${zona}` };
      }

      operaciones.push({
        opId: `op-${indice + 1}`,
        metodo: 'POST',
        ruta: `/rewards/grupos/${contexto.grupoId}/recompensas`,
        body: cuerpo,
        etiqueta: `Crear ${cuerpo.tipo === 'CASTIGO' ? 'castigo' : 'premio'} «${cuerpo.nombre}»`,
      });
    }

    return await this.guardar('CREAR_RECOMPENSAS', operaciones, {}, contexto, conversacionId);
  }

  private async armarEditarRecompensas(
    argumentos: Record<string, unknown>,
    contexto: ContextoHerramienta,
    conversacionId: string
  ): Promise<ResultadoArmado> {
    const filas = this.arrayDe(argumentos, 'ediciones');

    if (filas.length === 0) {
      return { ok: false, error: 'Mandá al menos una edición en "ediciones".' };
    }

    const [recompensas, configuracion, umbrales] = await Promise.all([
      this.rewards.recompensas(contexto.grupoId),
      this.rewards.configuracion(contexto.grupoId),
      this.scoring.umbrales(contexto.grupoId),
    ]);
    const porId = new Map(recompensas.map((recompensa) => [recompensa.id, recompensa]));
    const zonas = new Set(umbrales.map((umbral) => umbral.id));
    const operaciones: OperacionPropuesta[] = [];
    const snapshot: Array<{ id: string; nombre: string }> = [];

    for (const [indice, fila] of filas.entries()) {
      const { recompensaId, ...cambios } = fila as Record<string, unknown>;
      const existente = typeof recompensaId === 'string' ? porId.get(recompensaId) : undefined;

      if (!existente) {
        return {
          ok: false,
          error:
            `ediciones.${indice}.recompensaId: no hay ningún premio ni castigo con ese id en ` +
            'este grupo. Llamá a listar_recompensas y usá un id de ahí.',
        };
      }

      // En un PATCH de recompensa `null` SÍ significa algo —`descripcion` es
      // anulable en el contrato—, así que se conserva. Es al revés que en una
      // conducta, y la diferencia la decide el contrato destino, no la costumbre.
      const parseado = esquemaEditarRecompensa.safeParse(limpiarVacios(cambios, false));

      if (!parseado.success) {
        return { ok: false, error: this.errorDeFila('ediciones', indice, parseado.error) };
      }

      if (Object.keys(parseado.data).length === 0) {
        return { ok: false, error: `ediciones.${indice}: no mandaste ningún campo para cambiar.` };
      }

      // En una edición la zona no es obligatoria: si no viene, queda la que ya
      // tiene. Solo se valida la que se manda.
      const zona = this.violacionDeZona(
        parseado.data.umbralZonaId,
        configuracion?.modo,
        zonas,
        false
      );

      if (zona) {
        return { ok: false, error: `ediciones.${indice}: ${zona}` };
      }

      operaciones.push({
        opId: `op-${indice + 1}`,
        metodo: 'PATCH',
        ruta: `/rewards/recompensas/${existente.id}`,
        body: parseado.data,
        etiqueta: `Editar «${existente.nombre}»: ${Object.keys(parseado.data).join(', ')}`,
      });
      snapshot.push({ id: existente.id, nombre: existente.nombre });
    }

    return await this.guardar(
      'EDITAR_RECOMPENSAS',
      operaciones,
      { recompensas: snapshot },
      contexto,
      conversacionId
    );
  }

  /**
   * Bolsas y productos, en una propuesta y en ese orden (fase-14-30 tanda 5).
   *
   * ───────────────────────────────────────────────────────────────────────────
   * EL LÍMITE QUE NO SE PUEDE SALTEAR, Y POR QUÉ SE EXPLICA EN VEZ DE FALLAR:
   *
   * Una bolsa recién existe cuando el Tutor aprieta «Aplicar», así que **su id
   * no puede referenciarse en la misma propuesta**. Es el mismo límite que la
   * decisión 5 evitó a nivel propuesta —nada de operaciones con dependencias
   * entre sí—, acá adentro de una.
   *
   * El producto que apunta a una bolsa desconocida se rechaza con un error que
   * le dice al modelo QUÉ HACER —proponer la bolsa primero y los productos
   * después, en dos tandas—, no solo que se equivocó. Es la lección de
   * `invariantes.ts`: un error que describe el formato empuja al modelo a
   * inventar un valor; uno que describe la acción lo saca del pozo.
   * ───────────────────────────────────────────────────────────────────────────
   */
  private async armarCrearProductos(
    argumentos: Record<string, unknown>,
    contexto: ContextoHerramienta,
    conversacionId: string
  ): Promise<ResultadoArmado> {
    const bolsas = this.arrayDe(argumentos, 'bolsas');
    const productos = this.arrayDe(argumentos, 'productos');

    if (bolsas.length === 0 && productos.length === 0) {
      return { ok: false, error: 'Mandá al menos una bolsa en "bolsas" o un producto en "productos".' };
    }

    const [recompensas, tienda] = await Promise.all([
      this.rewards.recompensas(contexto.grupoId),
      this.rewards.tienda(contexto.grupoId),
    ]);
    const porId = new Map(recompensas.map((recompensa) => [recompensa.id, recompensa]));
    const operaciones: OperacionPropuesta[] = [];

    // Las bolsas van primero para que el Tutor las aplique antes que los
    // productos. No alcanza para que un producto de ESTA propuesta las use
    // —el id todavía no existe— pero sí para que la próxima propuesta pueda.
    for (const [indice, fila] of bolsas.entries()) {
      const parseado = esquemaGuardarBolsa.safeParse(
        limpiarVacios(fila as Record<string, unknown>, true)
      );

      if (!parseado.success) {
        return { ok: false, error: this.errorDeFila('bolsas', indice, parseado.error) };
      }

      const invalido = this.premioAjeno(parseado.data.recompensaIds, porId);

      if (invalido) {
        return { ok: false, error: `bolsas.${indice}.recompensaIds: ${invalido}` };
      }

      operaciones.push({
        opId: `op-${operaciones.length + 1}`,
        metodo: 'POST',
        ruta: `/rewards/grupos/${contexto.grupoId}/bolsas`,
        body: parseado.data,
        etiqueta: `Crear bolsa «${parseado.data.nombre}» con ${parseado.data.recompensaIds.length} premios`,
      });
    }

    for (const [indice, fila] of productos.entries()) {
      const parseado = esquemaCrearProducto.safeParse(
        limpiarVacios(fila as Record<string, unknown>, true)
      );

      if (!parseado.success) {
        return { ok: false, error: this.errorDeFila('productos', indice, parseado.error) };
      }

      const referencia = this.violacionDeProducto(parseado.data, porId, tienda, bolsas.length > 0);

      if (referencia) {
        return { ok: false, error: `productos.${indice}: ${referencia}` };
      }

      operaciones.push({
        opId: `op-${operaciones.length + 1}`,
        metodo: 'POST',
        ruta: `/rewards/grupos/${contexto.grupoId}/productos`,
        body: parseado.data,
        etiqueta: `Publicar «${parseado.data.nombre}» a ${parseado.data.precio} monedas`,
      });
    }

    return await this.guardar('PRODUCTOS_TIENDA', operaciones, {}, contexto, conversacionId);
  }

  /**
   * Cambios sobre productos que ya están en la vitrina.
   *
   * Se llamaba `armarPreciosTienda` y cubría solo el precio (fase-14-29). El
   * subconjunto era arbitrario —el mismo PATCH acepta el resto— y la decisión 7
   * lo amplió. **El tipo persistido sigue siendo `PRECIOS_TIENDA`**: hay filas
   * en la base con ese valor.
   *
   * La validación mira el estado FUSIONADO —el producto que ya existe más los
   * cambios—, igual que el endpoint destino: subirle el precio a un producto de
   * fuente BOLSA no puede exigir que el request repita el `bolsaId`.
   */
  private async armarEditarProductos(
    argumentos: Record<string, unknown>,
    contexto: ContextoHerramienta,
    conversacionId: string
  ): Promise<ResultadoArmado> {
    const filas = this.arrayDe(argumentos, 'ediciones');

    if (filas.length === 0) {
      return { ok: false, error: 'Mandá al menos una edición en "ediciones".' };
    }

    // fase-14-30 decisión 2: la referencia se valida contra el estado REAL del
    // grupo antes de guardar nada. La decisión 1 hace que el modelo tenga de
    // dónde sacar el id; esto evita que mande uno de otra entidad —o de otro
    // grupo— y que el Tutor se entere recién cuando la fila sale en rojo.
    const [tienda, recompensas] = await Promise.all([
      this.rewards.tienda(contexto.grupoId),
      this.rewards.recompensas(contexto.grupoId),
    ]);
    const productos = new Map(tienda.productos.map((producto) => [producto.id, producto]));
    const porId = new Map(recompensas.map((recompensa) => [recompensa.id, recompensa]));
    const operaciones: OperacionPropuesta[] = [];
    const snapshot: Array<{ id: string; nombre: string; precio: number }> = [];

    for (const [indice, fila] of filas.entries()) {
      const { productoId, ...cambios } = fila as Record<string, unknown>;
      const existente = typeof productoId === 'string' ? productos.get(productoId) : undefined;

      if (!existente) {
        return {
          ok: false,
          error:
            `ediciones.${indice}.productoId: no hay ningún producto con ese id en la tienda de ` +
            'este grupo. Llamá a listar_tienda y usá un id de ahí.',
        };
      }

      const parseado = esquemaEditarProducto.safeParse(limpiarVacios(cambios, false));

      if (!parseado.success) {
        return { ok: false, error: this.errorDeFila('ediciones', indice, parseado.error) };
      }

      if (Object.keys(parseado.data).length === 0) {
        return { ok: false, error: `ediciones.${indice}: no mandaste ningún campo para cambiar.` };
      }

      const fusionado = { ...existente, ...parseado.data };
      const referencia = this.violacionDeProducto(fusionado, porId, tienda, false);

      if (referencia) {
        return { ok: false, error: `ediciones.${indice}: ${referencia}` };
      }

      operaciones.push({
        opId: `op-${indice + 1}`,
        metodo: 'PATCH',
        // NOTA: la Parte D del fase-14-29 decía `/rewards/recompensas/:id`, pero
        // el precio no vive en la Recompensa sino en el ProductoTienda. Ver la
        // desviación registrada en docs/progreso.
        ruta: `/rewards/productos/${existente.id}`,
        body: parseado.data,
        etiqueta:
          parseado.data.precio !== undefined
            ? `«${existente.nombre}»: ${existente.precio} → ${parseado.data.precio} monedas`
            : `Editar «${existente.nombre}»: ${Object.keys(parseado.data).join(', ')}`,
      });
      snapshot.push({ id: existente.id, nombre: existente.nombre, precio: existente.precio });
    }

    return await this.guardar(
      'PRECIOS_TIENDA',
      operaciones,
      { productos: snapshot },
      contexto,
      conversacionId
    );
  }

  /**
   * Etiquetas nuevas y a qué ítem va cada una.
   *
   * Mismo límite que las bolsas: una etiqueta recién creada no se puede asignar
   * en la misma propuesta, y el error lo explica en vez de solo rechazar.
   *
   * El `PUT` de asignación **reemplaza la lista completa** (fase-14-26), así que
   * una lista vacía es una operación legítima —saca todas las etiquetas de ese
   * ítem— y no un «no lo puse»: por eso `etiquetaIds` no pasa por `limpiarVacios`.
   */
  private async armarEtiquetas(
    argumentos: Record<string, unknown>,
    contexto: ContextoHerramienta,
    conversacionId: string
  ): Promise<ResultadoArmado> {
    const crear = this.arrayDe(argumentos, 'crear');
    const asignar = this.arrayDe(argumentos, 'asignar');

    if (crear.length === 0 && asignar.length === 0) {
      return { ok: false, error: 'Mandá al menos una etiqueta en "crear" o una asignación en "asignar".' };
    }

    const [recompensas, etiquetas] = await Promise.all([
      this.rewards.recompensas(contexto.grupoId),
      this.rewards.etiquetas(contexto.grupoId, 'ACTIVA'),
    ]);
    const porId = new Map(recompensas.map((recompensa) => [recompensa.id, recompensa]));
    const disponibles = new Set(etiquetas.map((etiqueta) => etiqueta.id));
    const operaciones: OperacionPropuesta[] = [];

    for (const [indice, fila] of crear.entries()) {
      const parseado = esquemaCrearEtiqueta.safeParse(
        limpiarVacios(fila as Record<string, unknown>, true)
      );

      if (!parseado.success) {
        return { ok: false, error: this.errorDeFila('crear', indice, parseado.error) };
      }

      operaciones.push({
        opId: `op-${operaciones.length + 1}`,
        metodo: 'POST',
        ruta: `/rewards/grupos/${contexto.grupoId}/etiquetas`,
        body: parseado.data,
        etiqueta: `Crear etiqueta «${parseado.data.nombre}»`,
      });
    }

    for (const [indice, fila] of asignar.entries()) {
      const { recompensaId, etiquetaIds } = fila as Record<string, unknown>;
      const existente = typeof recompensaId === 'string' ? porId.get(recompensaId) : undefined;

      if (!existente) {
        return {
          ok: false,
          error:
            `asignar.${indice}.recompensaId: no hay ningún premio ni castigo con ese id en este ` +
            'grupo. Llamá a listar_recompensas y usá un id de ahí.',
        };
      }

      const parseado = esquemaAsignarEtiquetas.safeParse({ etiquetaIds });

      if (!parseado.success) {
        return { ok: false, error: this.errorDeFila('asignar', indice, parseado.error) };
      }

      const desconocida = parseado.data.etiquetaIds.find((id) => !disponibles.has(id));

      if (desconocida) {
        return {
          ok: false,
          error:
            `asignar.${indice}.etiquetaIds: "${desconocida}" no es una etiqueta activa de este ` +
            'grupo. Si la estás creando en esta misma propuesta, todavía no existe: proponé ' +
            'primero las etiquetas y en un segundo paso a quién se las ponés.',
        };
      }

      operaciones.push({
        opId: `op-${operaciones.length + 1}`,
        metodo: 'PUT',
        ruta: `/rewards/recompensas/${existente.id}/etiquetas`,
        body: parseado.data,
        etiqueta:
          parseado.data.etiquetaIds.length === 0
            ? `Sacarle todas las etiquetas a «${existente.nombre}»`
            : `«${existente.nombre}»: ${parseado.data.etiquetaIds.length} etiqueta(s)`,
      });
    }

    return await this.guardar('ETIQUETAS', operaciones, {}, contexto, conversacionId);
  }

  /** La regla de zona de `POST/PATCH /rewards/…/recompensas`, replicada. */
  private violacionDeZona(
    umbralZonaId: string | undefined,
    modo: string | undefined,
    zonas: Set<string>,
    esAlta: boolean
  ): string | null {
    if (umbralZonaId !== undefined && !zonas.has(umbralZonaId)) {
      return `umbralZonaId: "${umbralZonaId}" no es una zona de este grupo.`;
    }

    if (esAlta && modo === 'DIRECTO' && umbralZonaId === undefined) {
      return (
        'umbralZonaId: este grupo entrega las recompensas por zona (modo DIRECTO), así que hay ' +
        'que decir a qué zona corresponde. Sacá el id de listar_umbrales_zona.'
      );
    }

    return null;
  }

  /** Los premios de una bolsa: del grupo y nunca castigos (fase-14-26 decisión 20). */
  private premioAjeno(
    recompensaIds: string[],
    porId: Map<string, { nombre: string; tipo: string }>
  ): string | null {
    for (const id of recompensaIds) {
      const item = porId.get(id);

      if (!item) {
        return `"${id}" no es un premio de este grupo. Sacá los ids de listar_recompensas.`;
      }

      if (item.tipo === 'CASTIGO') {
        return `«${item.nombre}» es un castigo, y una bolsa es siempre de premios.`;
      }
    }

    return null;
  }

  /**
   * Las reglas de referencia que `POST/PATCH /rewards/…/productos` rechaza.
   *
   * `bolsaNueva` dice si esta misma propuesta está creando bolsas: cambia el
   * mensaje, no la decisión — un `bolsaId` que no está en la tienda se rechaza
   * igual, pero si el modelo acaba de proponer bolsas, lo más probable es que
   * haya inventado el id de una de ellas y lo que necesita saber es el orden.
   */
  private violacionDeProducto(
    producto: {
      fuente?: string;
      recompensaId?: string | null;
      bolsaId?: string | null;
    },
    porId: Map<string, { nombre: string; tipo: string }>,
    tienda: { bolsas: Array<{ id: string; recompensaIds: string[]; estado: string }> },
    bolsaNueva: boolean
  ): string | null {
    if (producto.fuente === 'ITEM') {
      if (!producto.recompensaId || producto.bolsaId) {
        return 'con fuente ITEM va recompensaId y NO bolsaId.';
      }

      const item = porId.get(producto.recompensaId);

      if (!item) {
        return `recompensaId: "${producto.recompensaId}" no es un ítem de este grupo.`;
      }

      if (item.tipo === 'CASTIGO') {
        return `«${item.nombre}» es un castigo: un castigo no se compra en la tienda.`;
      }

      return null;
    }

    if (!producto.bolsaId || producto.recompensaId) {
      return 'con fuente BOLSA va bolsaId y NO recompensaId.';
    }

    const bolsa = tienda.bolsas.find((fila) => fila.id === producto.bolsaId);

    if (!bolsa) {
      return bolsaNueva
        ? 'bolsaId: esa bolsa todavía no existe. Una bolsa recién creada no tiene id hasta que ' +
            'el Tutor aplica la propuesta, así que va en dos tandas: primero proponé las bolsas ' +
            'y después, en otra propuesta, los productos que las venden.'
        : `bolsaId: "${producto.bolsaId}" no es una bolsa de este grupo. Sacá el id de listar_tienda.`;
    }

    if (bolsa.estado !== 'ACTIVA') {
      return `la bolsa «${bolsa.id}» está archivada, así que no puede vender nada.`;
    }

    if (bolsa.recompensaIds.length === 0) {
      return 'esa bolsa está vacía: un producto que la venda fallaría recién al comprarse.';
    }

    return null;
  }

  /**
   * El `PUT` de rendimientos es **un solo request con todo adentro**, no uno
   * por acción: así lo definió el fase-14-28. Por eso esta propuesta tiene una
   * sola operación aunque toque veinte acciones — la granularidad de «aplicar
   * por fila» la da el endpoint destino, no este servicio.
   */
  private async armarRendimientos(
    argumentos: Record<string, unknown>,
    contexto: ContextoHerramienta,
    conversacionId: string
  ): Promise<ResultadoArmado> {
    const parseado = esquemaRendimientos.safeParse(argumentos);

    if (!parseado.success) {
      return { ok: false, error: explicarError(parseado.error) };
    }

    const rendible = await this.activity.actividades(contexto.grupoId, 'ACTIVA');
    const conductas = await this.activity.conductas(contexto.grupoId, 'ACTIVA');
    const idsValidos = new Set([
      ...rendible.map((actividad) => actividad.id),
      ...conductas.filter((conducta) => conducta.tipo === 'BUENA').map((conducta) => conducta.id),
    ]);

    for (const [indice, rendimiento] of parseado.data.rendimientos.entries()) {
      if (!idsValidos.has(rendimiento.origenId)) {
        return {
          ok: false,
          error:
            `rendimientos.${indice}.origenId: no es una actividad activa ni una conducta buena ` +
            'de este grupo. Una conducta mala no puede pagar monedas.',
        };
      }
    }

    const operaciones: OperacionPropuesta[] = [
      {
        opId: 'op-1',
        metodo: 'PUT',
        ruta: `/rewards/grupos/${contexto.grupoId}/rendimientos-acciones`,
        body: parseado.data,
        etiqueta: `Actualizar lo que pagan ${parseado.data.rendimientos.length} acciones`,
      },
    ];

    return await this.guardar('RENDIMIENTOS_MONEDAS', operaciones, {}, contexto, conversacionId);
  }

  /**
   * La escala de zonas y la base de puntos (fase-14-30 tanda 6).
   *
   * ───────────────────────────────────────────────────────────────────────────
   * LAS DOS COSAS QUE ESTA FAMILIA HACE DISTINTO A TODAS LAS DEMÁS:
   *
   * 1. **Se valida el conjunto, no la fila.** Un umbral suelto no es correcto ni
   *    incorrecto; lo es la escala que queda. Por eso el chequeo corre sobre el
   *    estado RESULTANTE —lo que hay más lo que la propuesta cambia— y no sobre
   *    lo que la propuesta trae: una edición que sola parece rota puede ser
   *    correcta junto a las otras.
   *
   * 2. **Hay que encontrarle un orden de aplicado.** scoring valida el conjunto
   *    en cada escritura, y aplicar es un `for` (decisión 6 del fase-14-29): una
   *    propuesta cuyo estado final cierra igual puede fallar en el paso 1 si el
   *    intermedio deja un hueco. `ordenAplicable` busca un orden donde todos los
   *    pasos cierran; si no existe, la propuesta no se guarda y el error le
   *    explica al modelo por qué. Es la decisión 11 llevada al orden.
   *
   * Y una tercera que es del dominio y no del código: es la única propuesta del
   * ítem cuyo efecto **no se limita a lo que pase de acá en adelante** (decisión
   * 6). Por eso lleva aviso, con el conteo de a cuántos les cambia la zona.
   * ───────────────────────────────────────────────────────────────────────────
   */
  private async armarUmbralesZona(
    argumentos: Record<string, unknown>,
    contexto: ContextoHerramienta,
    conversacionId: string
  ): Promise<ResultadoArmado> {
    const crear = this.arrayDe(argumentos, 'crear');
    const editar = this.arrayDe(argumentos, 'editar');
    const baseParseada = esquemaConfiguracionScoring.safeParse({
      puntosIniciales: argumentos['puntosIniciales'],
    });
    const tocaLaBase = baseParseada.success;

    if (crear.length === 0 && editar.length === 0 && !tocaLaBase) {
      return {
        ok: false,
        error:
          'Mandá al menos una zona en "crear" o en "editar", o un valor nuevo en ' +
          '"puntosIniciales".',
      };
    }

    const [umbrales, configuracion, resumen] = await Promise.all([
      this.scoring.umbrales(contexto.grupoId),
      this.scoring.configuracion(contexto.grupoId),
      this.scoring.resumenPuntajes(contexto.grupoId),
    ]);
    const actuales: ZonaDeLaEscala[] = umbrales.map((umbral) => ({
      id: umbral.id,
      nombreZona: umbral.nombreZona,
      orden: umbral.orden,
      puntosMin: umbral.puntosMin,
      puntosMax: umbral.puntosMax,
    }));
    const porId = new Map(actuales.map((zona) => [zona.id, zona]));
    const pasos: PasoConOperacion[] = [];

    for (const [indice, fila] of crear.entries()) {
      const parseado = esquemaCrearUmbral.safeParse(limpiarZona(fila as Record<string, unknown>));

      if (!parseado.success) {
        return { ok: false, error: this.errorDeFila('crear', indice, parseado.error) };
      }

      const campos = zonaCompleta(parseado.data);

      if (!campos) {
        return { ok: false, error: `crear.${indice}: ${ZONA_INCOMPLETA}` };
      }

      const zona = { id: '', ...campos };

      pasos.push({
        tipo: 'crear',
        zona,
        metodo: 'POST',
        ruta: `/scoring/grupos/${contexto.grupoId}/umbrales`,
        body: campos,
        etiqueta: `Crear zona «${zona.nombreZona}», ${rangoLegible(zona)}`,
      });
    }

    for (const [indice, fila] of editar.entries()) {
      const { umbralZonaId, ...cambios } = fila as Record<string, unknown>;
      const existente = typeof umbralZonaId === 'string' ? porId.get(umbralZonaId) : undefined;

      // Decisión 2: la referencia se valida contra el estado real del grupo.
      if (!existente) {
        return {
          ok: false,
          error:
            `editar.${indice}.umbralZonaId: no hay ninguna zona con ese id en este grupo. ` +
            'Llamá a listar_umbrales_zona y usá un id de ahí.',
        };
      }

      const parseado = esquemaEditarUmbral.safeParse(limpiarZona(cambios));

      if (!parseado.success) {
        return { ok: false, error: this.errorDeFila('editar', indice, parseado.error) };
      }

      const campos = zonaCompleta(parseado.data);

      if (!campos) {
        return { ok: false, error: `editar.${indice}: ${ZONA_INCOMPLETA}` };
      }

      const zona = { id: existente.id, ...campos };

      pasos.push({
        tipo: 'editar',
        zona,
        metodo: 'PATCH',
        ruta: `/scoring/umbrales/${existente.id}`,
        // El body lleva la zona ENTERA, con `puntosMax` explícito: scoring
        // conserva el techo viejo si el campo no viene, y entonces el estado
        // que se validó acá no sería el que queda.
        body: campos,
        etiqueta:
          `«${existente.nombreZona}»` +
          (zona.nombreZona === existente.nombreZona ? '' : ` → «${zona.nombreZona}»`) +
          `: ${rangoLegible(existente)} → ${rangoLegible(zona)}`,
      });
    }

    const resultante = estadoResultante(actuales, pasos);

    if (pasos.length > 0) {
      const violacion = violacionDeLaEscala(resultante, { exigirCima: true });

      if (violacion) {
        return { ok: false, error: `la escala que queda no cierra: ${violacion}` };
      }
    }

    const ordenados = pasos.length > 0 ? ordenAplicable(actuales, pasos) : [];

    if (!ordenados) {
      return {
        ok: false,
        error:
          'estos cambios no se pueden aplicar de a uno: el grupo valida la escala completa en ' +
          'CADA guardado, así que un paso intermedio con un hueco falla aunque el resultado ' +
          'final cierre. Mover varios límites a la vez casi nunca tiene un orden posible. ' +
          'Proponé un cambio que sí lo tenga —agregar una zona arriba poniéndole techo a la ' +
          'más alta, por ejemplo— y decile al Tutor que una escala nueva entera se rehace desde ' +
          'la pantalla de Zonas.',
      };
    }

    const operaciones: OperacionPropuesta[] = ordenados.map((paso, indice) => ({
      opId: `op-${indice + 1}`,
      metodo: paso.metodo,
      ruta: paso.ruta,
      body: paso.body,
      etiqueta: paso.etiqueta,
    }));

    if (baseParseada.success) {
      const anterior = configuracion?.puntosIniciales;

      operaciones.push({
        opId: `op-${operaciones.length + 1}`,
        metodo: 'PUT',
        ruta: `/scoring/grupos/${contexto.grupoId}/configuracion`,
        body: baseParseada.data,
        etiqueta:
          `Cada sección arranca con ${baseParseada.data.puntosIniciales} puntos` +
          (anterior === undefined || anterior === baseParseada.data.puntosIniciales
            ? ''
            : ` (antes ${anterior})`),
      });
    }

    return await this.guardar(
      'UMBRALES_ZONA',
      operaciones,
      {
        zonas: actuales,
        aviso: this.avisoDeEscala(resumen, actuales, resultante, {
          base: baseParseada.success ? baseParseada.data.puntosIniciales : null,
          baseActual: configuracion?.puntosIniciales ?? null,
        }),
      },
      contexto,
      conversacionId
    );
  }

  /**
   * El aviso de la decisión 6, con el conteo del criterio de aceptación 10.
   *
   * Se calcula acá y no en el frontend porque el dato con el que se calcula —el
   * resumen de puntajes— es una lectura interna de este servicio: la pantalla
   * tendría que resolver primero la Sección en curso contra un tercer servicio
   * para pedir lo mismo. Y calculado acá queda guardado con la propuesta, así
   * que reabrir la conversación mañana muestra el mismo número que el Tutor vio
   * al decidir, no uno recalculado contra un grupo que ya cambió.
   *
   * **Un conteo que no se puede calcular se dice, no se inventa**: un «0
   * participantes» falso sobre la única propuesta que cambia el pasado sería
   * exactamente el aviso que hace aprobar sin mirar.
   */
  private avisoDeEscala(
    resumen: { origen: string; puntajes: Array<{ puntajeTotal: number; descalificado: boolean }> } | null,
    antes: ZonaDeLaEscala[],
    despues: ZonaDeLaEscala[],
    puntos: { base: number | null; baseActual: number | null }
  ): string {
    const encabezado =
      'Esto cambia el pasado: el puntaje se calcula al leerlo, así que mover un rango recalcula ' +
      'la zona de todos en el acto, también en las secciones que ya se cerraron.';

    // Con la base en juego el conteo necesita saber de cuánto es el salto, y eso
    // sale de la configuración actual. Sin ella no se cuenta.
    const ajuste =
      puntos.base === null
        ? 0
        : puntos.baseActual === null
          ? null
          : puntos.base - puntos.baseActual;

    if (!resumen || resumen.puntajes.length === 0 || ajuste === null) {
      return `${encabezado} No pude leer cómo viene cada uno ahora, así que no sé a cuántos les cambia la zona.`;
    }

    // Un puntaje ya evaluado quedó guardado con la base de aquel momento y no se
    // recalcula, así que subir la base no lo mueve: el ajuste solo aplica a los
    // puntajes que se derivan en vivo.
    const cambian = cuantosCambianDeZona(
      resumen.puntajes,
      antes,
      despues,
      resumen.origen === 'EN_VIVO' ? ajuste : 0
    );
    const total = resumen.puntajes.length;

    if (cambian === 0) {
      return `${encabezado} Con los puntajes de ahora, ninguno de los ${total} participantes cambia de zona.`;
    }

    return (
      `${encabezado} Con los puntajes de ahora, ${cambian} de ${total} ` +
      `${total === 1 ? 'participante cambia' : 'participantes cambian'} de zona.`
    );
  }

  /**
   * Los roles funcionales del grupo y quién tiene cada uno (fase-14-30 tanda 7).
   *
   * ───────────────────────────────────────────────────────────────────────────
   * LA LÍNEA QUE ESTA FAMILIA NO CRUZA (decisión 4):
   *
   * **La IA organiza a quien ya está; no da de alta ni de baja personas.** Un
   * rol se crea, se renombra y se asigna; invitar a alguien, darlo de alta o
   * sacarlo del grupo queda afuera del ítem entero. La línea no es de riesgo
   * técnico —esos endpoints están igual de probados— sino de qué clase de cosa
   * es una propuesta: sumar una persona a un grupo es un acto que empieza fuera
   * de la app, en una conversación que el modelo no vio.
   *
   * `estado` tampoco se expone: archivar un rol **desasigna a todos** los que
   * lo tenían, o sea que es archivar por otro camino (decisión 3).
   * ───────────────────────────────────────────────────────────────────────────
   */
  private async armarRolesGrupo(
    argumentos: Record<string, unknown>,
    contexto: ContextoHerramienta,
    conversacionId: string
  ): Promise<ResultadoArmado> {
    const crear = this.arrayDe(argumentos, 'crear');
    const editar = this.arrayDe(argumentos, 'editar');
    const asignar = this.arrayDe(argumentos, 'asignar');

    if (crear.length === 0 && editar.length === 0 && asignar.length === 0) {
      return {
        ok: false,
        error:
          'Mandá al menos un rol en "crear" o en "editar", o una asignación en "asignar".',
      };
    }

    const [roles, participantes] = await Promise.all([
      this.identity.roles(contexto.grupoId),
      this.identity.participantes(contexto.grupoId),
    ]);
    const porId = new Map(roles.map((rol) => [rol.id, rol]));
    const gente = new Map(participantes.map((usuario) => [usuario.id, usuario]));
    // El nombre choca sin distinguir mayúsculas ni espacios, igual que en
    // identity — y contra los ARCHIVADOS también, porque el unique del schema
    // es por grupo y nombre, sin mirar el estado.
    const nombresTomados = new Map(roles.map((rol) => [normalizar(rol.nombre), rol.nombre]));
    const operaciones: OperacionPropuesta[] = [];

    for (const [indice, fila] of crear.entries()) {
      const parseado = esquemaCrearRol.safeParse(
        limpiarVacios(fila as Record<string, unknown>, true)
      );

      if (!parseado.success) {
        return { ok: false, error: this.errorDeFila('crear', indice, parseado.error) };
      }

      const choque = nombresTomados.get(normalizar(parseado.data.nombre));

      if (choque) {
        return {
          ok: false,
          error: `crear.${indice}.nombre: ya hay un rol llamado «${choque}» en este grupo.`,
        };
      }

      nombresTomados.set(normalizar(parseado.data.nombre), parseado.data.nombre);
      operaciones.push({
        opId: `op-${operaciones.length + 1}`,
        metodo: 'POST',
        ruta: `/identity/grupos/${contexto.grupoId}/roles`,
        body: parseado.data,
        etiqueta: `Crear rol «${parseado.data.nombre}»`,
      });
    }

    for (const [indice, fila] of editar.entries()) {
      const { rolId, ...cambios } = fila as Record<string, unknown>;
      const existente = typeof rolId === 'string' ? porId.get(rolId) : undefined;

      if (!existente) {
        return {
          ok: false,
          error:
            `editar.${indice}.rolId: no hay ningún rol con ese id en este grupo. ` +
            'Llamá a listar_participantes, que trae el catálogo de roles, y usá un id de ahí.',
        };
      }

      // Sin campos anulables en el contrato: acá `null` solo puede ser «no lo
      // puse» (la regla de la tanda 4).
      const parseado = esquemaEditarRol.safeParse(limpiarVacios(cambios, true));

      if (!parseado.success) {
        return { ok: false, error: this.errorDeFila('editar', indice, parseado.error) };
      }

      if (Object.keys(parseado.data).length === 0) {
        return { ok: false, error: `editar.${indice}: no mandaste ningún campo para cambiar.` };
      }

      if (parseado.data.nombre !== undefined) {
        const choque = nombresTomados.get(normalizar(parseado.data.nombre));

        if (choque && normalizar(choque) !== normalizar(existente.nombre)) {
          return {
            ok: false,
            error: `editar.${indice}.nombre: ya hay un rol llamado «${choque}» en este grupo.`,
          };
        }

        nombresTomados.delete(normalizar(existente.nombre));
        nombresTomados.set(normalizar(parseado.data.nombre), parseado.data.nombre);
      }

      operaciones.push({
        opId: `op-${operaciones.length + 1}`,
        metodo: 'PATCH',
        ruta: `/identity/roles/${existente.id}`,
        body: parseado.data,
        etiqueta:
          parseado.data.nombre !== undefined && parseado.data.nombre !== existente.nombre
            ? `Renombrar «${existente.nombre}» → «${parseado.data.nombre}»`
            : `Cambiar el color de «${existente.nombre}»`,
      });
    }

    for (const [indice, fila] of asignar.entries()) {
      const { participanteId, rolId } = fila as Record<string, unknown>;
      const persona = typeof participanteId === 'string' ? gente.get(participanteId) : undefined;

      if (!persona) {
        return {
          ok: false,
          error:
            `asignar.${indice}.participanteId: no hay ningún participante con ese id en este ` +
            'grupo. Llamá a listar_participantes y usá un usuarioId de ahí.',
        };
      }

      // `null` es un valor y no una ausencia: deja a la persona sin rol. No hay
      // ambigüedad posible —la entrada existe para fijar el rol— así que el
      // esquema lo acepta tal cual, sin pasar por `limpiarVacios`.
      const parseado = esquemaAsignarRol.safeParse({ rolGrupoId: rolId ?? null });

      if (!parseado.success) {
        return { ok: false, error: this.errorDeFila('asignar', indice, parseado.error) };
      }

      const rolNuevo = parseado.data.rolGrupoId ? porId.get(parseado.data.rolGrupoId) : null;

      if (parseado.data.rolGrupoId && !rolNuevo) {
        return {
          ok: false,
          error:
            `asignar.${indice}.rolId: ` +
            (crear.length > 0
              ? 'ese rol todavía no existe. Un rol recién creado no tiene id hasta que el Tutor ' +
                'aplica la propuesta, así que va en dos pasos: primero proponé los roles y ' +
                'después, en otra propuesta, a quién se los ponés.'
              : 'no es un rol de este grupo. Sacá el id de listar_participantes.'),
        };
      }

      if (rolNuevo && rolNuevo.estado !== 'ACTIVO') {
        return {
          ok: false,
          error: `asignar.${indice}.rolId: «${rolNuevo.nombre}» está archivado, así que no se puede asignar.`,
        };
      }

      const rolActual = persona.rolGrupo?.nombre;

      operaciones.push({
        opId: `op-${operaciones.length + 1}`,
        metodo: 'PUT',
        ruta: `/identity/grupos/${contexto.grupoId}/usuarios/${persona.id}/rol`,
        body: parseado.data,
        etiqueta:
          `${persona.nombre}: ${rolActual ? `«${rolActual}»` : 'sin rol'} → ` +
          `${rolNuevo ? `«${rolNuevo.nombre}»` : 'sin rol'}`,
      });
    }

    return await this.guardar('ROLES_GRUPO', operaciones, {}, contexto, conversacionId);
  }

  /**
   * Los equipos de trabajo: quiénes los forman y quién manda (fase-14-30 tanda 7).
   *
   * ───────────────────────────────────────────────────────────────────────────
   * LA REGLA DEL DESTINO QUE MÁS PROPUESTAS VA A RECHAZAR:
   *
   * **una persona está en UN SOLO equipo por grupo**. identity lo rechaza con
   * `UsuarioYaEnEquipoException` mirando TODOS los equipos del grupo, así que no
   * alcanza con que la propuesta no se contradiga a sí misma: hay que mirar
   * también dónde está cada uno hoy. Y como el chequeo es sobre el estado que la
   * propuesta va dejando, se lleva la cuenta de a quién ya ubicó ella misma.
   *
   * Quitar a alguien de un equipo **no está** (es un `DELETE`, decisión 3), así
   * que una propuesta que quiera mudar a una persona de equipo se rechaza y el
   * error dice qué hacer: sacarla a mano primero.
   * ───────────────────────────────────────────────────────────────────────────
   */
  private async armarEquipos(
    argumentos: Record<string, unknown>,
    contexto: ContextoHerramienta,
    conversacionId: string
  ): Promise<ResultadoArmado> {
    const crear = this.arrayDe(argumentos, 'crear');
    const editar = this.arrayDe(argumentos, 'editar');

    if (crear.length === 0 && editar.length === 0) {
      return {
        ok: false,
        error: 'Mandá al menos un equipo en "crear" o un cambio en "editar".',
      };
    }

    const [equipos, participantes] = await Promise.all([
      this.identity.equipos(contexto.grupoId),
      this.identity.participantes(contexto.grupoId),
    ]);
    const gente = new Map(participantes.map((usuario) => [usuario.id, usuario.nombre]));
    const porId = new Map(equipos.map((equipo) => [equipo.equipoId, equipo]));
    const conEquipo = new Map<string, string>();

    for (const equipo of equipos) {
      for (const miembro of equipo.miembros) {
        conEquipo.set(miembro.usuarioId, equipo.nombre);
      }
    }

    const operaciones: OperacionPropuesta[] = [];
    /** El motivo por el que una persona no puede sumarse, o `null`. */
    const ocupada = (id: string): string | null => {
      const donde = conEquipo.get(id);

      return donde
        ? `${gente.get(id) ?? id} ya está en el equipo «${donde}», y nadie puede estar en dos. ` +
            'Sacalo de ese equipo desde la pantalla de equipos y después proponé el cambio.'
        : null;
    };

    for (const [indice, fila] of crear.entries()) {
      const { nombre, jefeParticipanteId, participantesIds } = fila as Record<string, unknown>;
      const parseado = esquemaCrearEquipo.safeParse({
        // `miembrosIds` va aparte de `limpiarVacios`: la lista vacía es
        // legítima —un equipo de una sola persona, el jefe— y ese limpiador
        // descarta los arrays vacíos por diseño.
        ...limpiarVacios({ nombre, jefeUsuarioId: jefeParticipanteId }, true),
        miembrosIds: Array.isArray(participantesIds) ? participantesIds : [],
      });

      if (!parseado.success) {
        return { ok: false, error: this.errorDeFila('crear', indice, parseado.error) };
      }

      // identity deduplica al jefe si vino también en la lista, así que mandarlo
      // en los dos lados no es un error: se normaliza.
      const todos = [
        parseado.data.jefeUsuarioId,
        ...parseado.data.miembrosIds.filter((id) => id !== parseado.data.jefeUsuarioId),
      ];
      const ajeno = todos.find((id) => !gente.has(id));

      if (ajeno) {
        return {
          ok: false,
          error: `crear.${indice}: "${ajeno}" no es un participante de este grupo.`,
        };
      }

      const impedido = todos.map((id) => ocupada(id)).find((motivo) => motivo !== null);

      if (impedido) {
        return { ok: false, error: `crear.${indice}: ${impedido}` };
      }

      for (const id of todos) {
        conEquipo.set(id, parseado.data.nombre);
      }

      operaciones.push({
        opId: `op-${operaciones.length + 1}`,
        metodo: 'POST',
        ruta: `/identity/grupos/${contexto.grupoId}/equipos`,
        body: parseado.data,
        etiqueta:
          `Crear equipo «${parseado.data.nombre}» con ${todos.length} ` +
          `${todos.length === 1 ? 'integrante' : 'integrantes'} ` +
          `(jefe: ${gente.get(parseado.data.jefeUsuarioId) ?? '—'})`,
      });
    }

    for (const [indice, fila] of editar.entries()) {
      const { equipoId, nombre, sumarParticipantesIds, nuevoJefeParticipanteId } =
        fila as Record<string, unknown>;
      const equipo = typeof equipoId === 'string' ? porId.get(equipoId) : undefined;

      if (!equipo) {
        return {
          ok: false,
          error:
            `editar.${indice}.equipoId: no hay ningún equipo con ese id en este grupo. ` +
            'Llamá a listar_participantes, que trae los equipos, y usá un id de ahí.',
        };
      }

      const seSuman = Array.isArray(sumarParticipantesIds)
        ? (sumarParticipantesIds as unknown[]).filter((id): id is string => typeof id === 'string')
        : [];
      const cambios = limpiarVacios({ nombre }, true);
      const cambiaJefe = typeof nuevoJefeParticipanteId === 'string';

      if (Object.keys(cambios).length === 0 && seSuman.length === 0 && !cambiaJefe) {
        return { ok: false, error: `editar.${indice}: no mandaste ningún cambio.` };
      }

      if (Object.keys(cambios).length > 0) {
        const parseado = esquemaEditarEquipo.safeParse(cambios);

        if (!parseado.success) {
          return { ok: false, error: this.errorDeFila('editar', indice, parseado.error) };
        }

        operaciones.push({
          opId: `op-${operaciones.length + 1}`,
          metodo: 'PATCH',
          ruta: `/identity/equipos/${equipo.equipoId}`,
          body: parseado.data,
          etiqueta: `Renombrar «${equipo.nombre}» → «${parseado.data.nombre}»`,
        });
      }

      for (const id of seSuman) {
        const parseado = esquemaAgregarMiembro.safeParse({ usuarioId: id });

        if (!parseado.success) {
          return { ok: false, error: this.errorDeFila('editar', indice, parseado.error) };
        }

        if (!gente.has(id)) {
          return {
            ok: false,
            error: `editar.${indice}: "${id}" no es un participante de este grupo.`,
          };
        }

        const impedido = ocupada(id);

        if (impedido) {
          return { ok: false, error: `editar.${indice}: ${impedido}` };
        }

        conEquipo.set(id, equipo.nombre);
        operaciones.push({
          opId: `op-${operaciones.length + 1}`,
          metodo: 'POST',
          ruta: `/identity/equipos/${equipo.equipoId}/miembros`,
          body: parseado.data,
          etiqueta: `Sumar a ${gente.get(id)} al equipo «${equipo.nombre}»`,
        });
      }

      if (cambiaJefe) {
        const parseado = esquemaSustituirJefe.safeParse({
          nuevoJefeUsuarioId: nuevoJefeParticipanteId,
        });

        if (!parseado.success) {
          return { ok: false, error: this.errorDeFila('editar', indice, parseado.error) };
        }

        // El jefe tiene que ser miembro, y se juzga sobre el estado que deja
        // ESTA entrada: sumarlo y ascenderlo en el mismo cambio es válido
        // porque las operaciones se aplican en orden, y el POST del miembro va
        // antes que el del jefe.
        const miembrosLuego = new Set([
          ...equipo.miembros.map((miembro) => miembro.usuarioId),
          ...seSuman,
        ]);

        if (!miembrosLuego.has(parseado.data.nuevoJefeUsuarioId)) {
          return {
            ok: false,
            error:
              `editar.${indice}.nuevoJefeParticipanteId: ` +
              `${gente.get(parseado.data.nuevoJefeUsuarioId) ?? 'esa persona'} no es miembro de ` +
              `«${equipo.nombre}». Sumalo al equipo en este mismo cambio y ahí sí puede ser jefe.`,
          };
        }

        operaciones.push({
          opId: `op-${operaciones.length + 1}`,
          metodo: 'POST',
          ruta: `/identity/equipos/${equipo.equipoId}/jefe`,
          body: parseado.data,
          etiqueta:
            `«${equipo.nombre}»: el jefe pasa a ser ` +
            `${gente.get(parseado.data.nuevoJefeUsuarioId) ?? '—'}`,
        });
      }
    }

    return await this.guardar('EQUIPOS', operaciones, {}, contexto, conversacionId);
  }

  // ── Endpoints públicos ────────────────────────────────────────────────────

  async detalle(tenant: TenantContext, id: string): Promise<PropuestaIaDto> {
    return this.aDto(await this.buscarPropia(tenant, id));
  }

  async descartar(tenant: TenantContext, id: string): Promise<PropuestaIaDto> {
    const propuesta = await this.buscarPropia(tenant, id);

    if (propuesta.estado !== 'BORRADOR') {
      throw new PropuestaNoAplicableException();
    }

    await this.prisma.client.propuesta.updateMany({
      where: { id },
      data: { estado: 'DESCARTADA' },
    });

    return this.aDto(await this.buscarPropia(tenant, id));
  }

  /**
   * El frontend informa qué pasó con cada operación después de aplicarlas
   * (decisión 13). **Este endpoint no escribe en ningún otro servicio**: solo
   * registra lo que el frontend ya hizo con el JWT del Tutor.
   *
   * El vencimiento se chequea acá y no solo en el frontend: una propuesta de
   * hace tres días leyó un catálogo que ya cambió (decisión 12).
   */
  async registrarAplicada(
    tenant: TenantContext,
    id: string,
    resultado: ResultadoOperacionIa[]
  ): Promise<PropuestaIaDto> {
    const propuesta = await this.buscarPropia(tenant, id);

    if (propuesta.estado !== 'BORRADOR') {
      throw new PropuestaNoAplicableException();
    }

    if (propuesta.venceEn.getTime() <= Date.now()) {
      throw new PropuestaVencidaException();
    }

    const fallaron = resultado.filter((fila) => !fila.ok).length;
    const estado = fallaron === 0 ? 'APLICADA' : 'APLICADA_PARCIAL';

    if (fallaron > 0) {
      this.logger.warn(
        `Propuesta ${id} aplicada parcialmente: ${fallaron} de ${resultado.length} operaciones fallaron`
      );
    }

    await this.prisma.client.propuesta.updateMany({
      where: { id },
      data: {
        estado,
        // `as never`: Prisma tipa las columnas Json con su propio InputJsonValue
        // y un array de interfaces no lo satisface. Mismo caso que `operaciones`
        // al guardar — el shape real lo garantiza el DTO validado del controller.
        resultado: resultado as unknown as never,
        aplicadaEn: new Date(),
        aplicadaPorUsuarioId: tenant.principalId,
      },
    });

    return this.aDto(await this.buscarPropia(tenant, id));
  }

  /** Las propuestas de una conversación, para el detalle. */
  async deConversacion(conversacionId: string): Promise<PropuestaIaDto[]> {
    const propuestas = await this.prisma.client.propuesta.findMany({
      where: { conversacionId },
      orderBy: { createdAt: 'asc' },
    });

    return propuestas.map((propuesta) => this.aDto(propuesta));
  }

  // ── Interno ───────────────────────────────────────────────────────────────

  private async guardar(
    tipo: TipoPropuesta,
    operaciones: OperacionPropuesta[],
    snapshot: unknown,
    contexto: ContextoHerramienta,
    conversacionId: string
  ): Promise<ResultadoArmado> {
    const propuesta = await this.prisma.client.propuesta.create({
      data: {
        conversacionId,
        organizacionId: contexto.organizacionId,
        grupoId: contexto.grupoId,
        tipo,
        operaciones: operaciones as unknown as never,
        snapshot: snapshot as never,
        venceEn: new Date(Date.now() + HORAS_DE_VIGENCIA * 60 * 60 * 1000),
      },
    });

    return {
      ok: true,
      propuestaId: propuesta.id,
      cantidad: operaciones.length,
      propuesta: this.aDto(propuesta),
      mensaje:
        `Propuesta armada con ${operaciones.length} operación(es). La app se la está mostrando ` +
        'al Tutor para que decida. Contale en una línea qué le propusiste; no digas que ya se aplicó.',
    };
  }

  /**
   * Catálogo del grupo para validar las referencias cruzadas del modelo.
   *
   * Esto es lo que la decisión 11 llama «las reglas que el endpoint destino va
   * a exigir de todos modos»: un `rolesPermitidos` con un id que no existe lo
   * rechazaría activity, y descubrirlo recién al aplicar dejaría al Tutor con
   * una fila roja que se podía haber evitado.
   */
  private async referenciasDelGrupo(grupoId: string) {
    const [actividades, roles, participantes, equipos] = await Promise.all([
      this.activity.actividades(grupoId),
      this.identity.roles(grupoId),
      this.identity.participantes(grupoId),
      this.identity.equipos(grupoId),
    ]);

    return {
      actividades,
      roles: new Set(roles.filter((rol) => rol.estado === 'ACTIVO').map((rol) => rol.id)),
      usuarios: new Set(participantes.map((usuario) => usuario.id)),
      equipos: new Set(
        equipos.filter((equipo) => equipo.estado === 'ACTIVO').map((equipo) => equipo.equipoId)
      ),
    };
  }

  /** Devuelve el motivo si alguna referencia no existe; `null` si está todo bien. */
  private validarReferencias(
    datos: {
      rolesPermitidos?: string[];
      usuariosPermitidos?: string[];
      equiposPermitidos?: string[];
    },
    referencias: { roles: Set<string>; usuarios: Set<string>; equipos: Set<string> }
  ): string | null {
    const controles: Array<[string, string[] | undefined, Set<string>, string]> = [
      ['rolesPermitidos', datos.rolesPermitidos, referencias.roles, 'un rol activo'],
      ['usuariosPermitidos', datos.usuariosPermitidos, referencias.usuarios, 'un participante'],
      ['equiposPermitidos', datos.equiposPermitidos, referencias.equipos, 'un equipo activo'],
    ];

    for (const [campo, valores, validos, que] of controles) {
      const desconocido = (valores ?? []).find((id) => !validos.has(id));

      if (desconocido) {
        return `${campo}: "${desconocido}" no es ${que} de este grupo.`;
      }
    }

    // Los tres modos de destinatario son EXCLUYENTES (fase-14-24): el endpoint
    // destino devuelve DESTINATARIO_AMBIGUO, así que se corta antes.
    const modosUsados = controles.filter(([, valores]) => (valores ?? []).length > 0).length;

    if (modosUsados > 1) {
      return 'elegí un solo modo de destinatario: roles, personas o equipos, no varios a la vez.';
    }

    return null;
  }

  private errorDeFila(campo: string, indice: number, error: z.ZodError): string {
    return `${campo}.${indice} — ${explicarError(error)}`;
  }

  private arrayDe(argumentos: Record<string, unknown>, clave: string): unknown[] {
    const valor = argumentos[clave];

    return Array.isArray(valor) ? valor : [];
  }

  private esUuid(valor: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);
  }

  /** 404 y no 403 cuando es de otro: no se confirma la existencia (criterio del monorepo). */
  private async buscarPropia(tenant: TenantContext, id: string) {
    const propuesta = await this.prisma.client.propuesta.findFirst({
      where: { id },
      include: { conversacion: { select: { usuarioId: true } } },
    });

    if (!propuesta || propuesta.conversacion.usuarioId !== tenant.principalId) {
      throw new NotFoundException('Propuesta no encontrada');
    }

    return propuesta;
  }

  private aDto(propuesta: {
    id: string;
    conversacionId: string;
    grupoId: string;
    tipo: string;
    operaciones: unknown;
    snapshot?: unknown;
    estado: string;
    venceEn: Date;
    aplicadaEn: Date | null;
    resultado: unknown;
    createdAt: Date;
  }): PropuestaIaDto {
    const vencida = propuesta.estado === 'BORRADOR' && propuesta.venceEn.getTime() <= Date.now();

    return {
      id: propuesta.id,
      conversacionId: propuesta.conversacionId,
      grupoId: propuesta.grupoId,
      tipo: propuesta.tipo as PropuestaIaDto['tipo'],
      operaciones: (propuesta.operaciones as OperacionPropuesta[]).map((operacion) => ({
        opId: operacion.opId,
        metodo: operacion.metodo,
        ruta: operacion.ruta,
        body: operacion.body,
        etiqueta: operacion.etiqueta,
      })),
      // El estado VENCIDA se DERIVA de la fecha, no se persiste con un job que
      // recorra la tabla: un cron para marcar filas viejas es trabajo (y un
      // modo de falla) a cambio de nada — la fecha ya está guardada.
      estado: vencida ? 'VENCIDA' : (propuesta.estado as PropuestaIaDto['estado']),
      venceEn: propuesta.venceEn.toISOString(),
      aplicadaEn: propuesta.aplicadaEn?.toISOString() ?? null,
      resultado: (propuesta.resultado as ResultadoOperacionIa[] | null) ?? null,
      // Sale del snapshot y no de una columna propia: es información de una
      // familia sola (la escala) y el snapshot ya existe para exactamente esto
      // —lo que la tarjeta necesita saber del estado de entonces—.
      aviso: (propuesta.snapshot as { aviso?: string } | null)?.aviso ?? null,
      createdAt: propuesta.createdAt.toISOString(),
    };
  }
}

/** Los cinco campos de una zona, ya completos. */
interface CamposDeZona {
  nombreZona: string;
  orden: number;
  puntosMin: number;
  puntosMax: number | null;
  colorHex: string;
}

/** Un paso de la escala con la operación que lo va a ejecutar. */
interface PasoConOperacion extends PasoDeEscala {
  metodo: OperacionPropuesta['metodo'];
  ruta: string;
  body: unknown;
  etiqueta: string;
}

const ZONA_INCOMPLETA =
  'la zona se manda entera, con nombreZona, orden, puntosMin, puntosMax y colorHex, aunque solo ' +
  'cambie uno. puntosMax va con un número o con null (sin techo), nunca vacío.';

/**
 * Saca lo que el modelo manda de relleno, **menos `puntosMax`**.
 *
 * Es la excepción a `limpiarVacios` y el motivo es el único caso del ítem donde
 * `null` es un valor y no una ausencia: `puntosMax: null` significa «sin techo»,
 * o sea la zona más alta. Sacarlo como se saca cualquier otro null perdería la
 * única forma de decirlo.
 */
function limpiarZona(fila: Record<string, unknown>): Record<string, unknown> {
  const limpia: Record<string, unknown> = {};

  for (const [clave, valor] of Object.entries(fila)) {
    if (valor === '' || valor === undefined) {
      continue;
    }

    if (valor === null && clave !== 'puntosMax') {
      continue;
    }

    limpia[clave] = valor;
  }

  return limpia;
}

/**
 * La zona con sus cinco campos, o `null` si el modelo no los mandó todos.
 *
 * `puntosMax` se distingue de los demás: `null` es un valor válido y
 * `undefined` es la ausencia, así que un `!== undefined` y no un `!= null`.
 */
function zonaCompleta(datos: Partial<CamposDeZona>): CamposDeZona | null {
  const { nombreZona, orden, puntosMin, puntosMax, colorHex } = datos;

  if (
    nombreZona === undefined ||
    orden === undefined ||
    puntosMin === undefined ||
    puntosMax === undefined ||
    colorHex === undefined
  ) {
    return null;
  }

  return { nombreZona, orden, puntosMin, puntosMax, colorHex };
}

/**
 * Normalización para el choque de nombres de rol, igual que en identity: ahí el
 * `@@unique([grupoId, nombre])` es la red y el chequeo real es este, porque
 * Postgres compara con distinción de mayúsculas y «Cocina»/«cocina» pasarían.
 */
function normalizar(nombre: string): string {
  return nombre.trim().toLowerCase();
}

/** «de 0 a 20 puntos» / «de 61 puntos para arriba», para la etiqueta. */
function rangoLegible(zona: { puntosMin: number; puntosMax: number | null }): string {
  return zona.puntosMax === null
    ? `de ${zona.puntosMin} puntos para arriba`
    : `de ${zona.puntosMin} a ${zona.puntosMax} puntos`;
}
