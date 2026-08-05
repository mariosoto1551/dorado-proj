import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { z } from 'zod';

import { PropuestaIaDto, ResultadoOperacionIa, TenantContext } from '@dorado/shared-types';

import { ActivityClientService } from '../clientes/activity-client.service';
import { IdentityClientService } from '../clientes/identity-client.service';
import { RewardsClientService } from '../clientes/rewards-client.service';
import { ContextoHerramienta } from '../comun/acceso-grupo.service';
import { PropuestaNoAplicableException, PropuestaVencidaException } from '../comun/excepciones';
import { PrismaService } from '../prisma/prisma.service';
import {
  esquemaCrearActividad,
  esquemaEditarActividad,
  esquemaEditarProducto,
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
  | 'PRECIOS_TIENDA'
  | 'RENDIMIENTOS_MONEDAS';

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
    private readonly rewards: RewardsClientService
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

      case 'proponer_precios_tienda':
        return await this.armarPreciosTienda(argumentos, contexto, conversacionId);

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

  private async armarPreciosTienda(
    argumentos: Record<string, unknown>,
    contexto: ContextoHerramienta,
    conversacionId: string
  ): Promise<ResultadoArmado> {
    const filas = this.arrayDe(argumentos, 'precios');

    if (filas.length === 0) {
      return { ok: false, error: 'Mandá al menos un precio en "precios".' };
    }

    const operaciones: OperacionPropuesta[] = [];

    for (const [indice, fila] of filas.entries()) {
      const { productoId, ...cambios } = fila as Record<string, unknown>;

      if (typeof productoId !== 'string' || !this.esUuid(productoId)) {
        return { ok: false, error: `precios.${indice}.productoId: falta o no es un uuid.` };
      }

      const parseado = esquemaEditarProducto.safeParse(limpiarVacios(cambios, false));

      if (!parseado.success) {
        return { ok: false, error: this.errorDeFila('precios', indice, parseado.error) };
      }

      if (parseado.data.precio === undefined) {
        return { ok: false, error: `precios.${indice}.precio: falta el precio nuevo.` };
      }

      operaciones.push({
        opId: `op-${indice + 1}`,
        metodo: 'PATCH',
        // NOTA: la Parte D de la spec dice `/rewards/recompensas/:id`, pero el
        // precio no vive en la Recompensa sino en el ProductoTienda. Ver la
        // desviación registrada en docs/progreso.
        ruta: `/rewards/productos/${productoId}`,
        body: parseado.data,
        etiqueta: `Precio nuevo: ${parseado.data.precio} monedas`,
      });
    }

    return await this.guardar('PRECIOS_TIENDA', operaciones, {}, contexto, conversacionId);
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
