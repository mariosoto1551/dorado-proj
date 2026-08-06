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
  esquemaAsignarEtiquetas,
  esquemaConfigurarTurno,
  esquemaCrearActividad,
  esquemaCrearConducta,
  esquemaCrearEtiqueta,
  esquemaCrearProducto,
  esquemaCrearRecompensa,
  esquemaEditarActividad,
  esquemaEditarConducta,
  esquemaEditarProducto,
  esquemaEditarRecompensa,
  esquemaGuardarBolsa,
  esquemaRendimientos,
  explicarError,
} from './esquemas';
import { limpiarVacios, normalizarLimiteTiempo, violacionDeInvariantes } from './invariantes';

/** Decisión 12: una propuesta vence a las 24 h de armada. */
const HORAS_DE_VIGENCIA = 24;

/** Lo que se guarda por operación: el request destino + cómo aplicarlo. */
export interface OperacionPropuesta {
  /** Id local, para poder reportar por fila (decisión 13). */
  opId: string;
  metodo: 'POST' | 'PATCH' | 'PUT';
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
  | 'ETIQUETAS';

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
      createdAt: propuesta.createdAt.toISOString(),
    };
  }
}
