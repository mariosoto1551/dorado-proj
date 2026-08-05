import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import {
  ConversacionIaDetalleDto,
  ConversacionIaDto,
  MensajeIaDto,
  TenantContext,
} from '@dorado/shared-types';

import { AccesoGrupoService, ContextoHerramienta } from '../comun/acceso-grupo.service';
import {
  CuotaIaAgotadaException,
  FeatureNoDisponibleException,
  IaNoHabilitadaException,
} from '../comun/excepciones';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { PrismaService } from '../prisma/prisma.service';
import { ItemEntrada } from '../proveedor/tipos';
import { ErrorConConsumo, LoopService, MensajeAPersistir, ResultadoLoop } from './loop.service';

/** Largo máximo del título derivado del primer mensaje. */
const LARGO_TITULO = 60;

@Injectable()
export class ConversacionesService {
  private readonly logger = new Logger(ConversacionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
    private readonly acceso: AccesoGrupoService,
    private readonly loop: LoopService
  ) {}

  async listar(tenant: TenantContext, grupoId: string): Promise<ConversacionIaDto[]> {
    await this.asegurarUsable(tenant);
    await this.acceso.contextoPara(tenant, grupoId);

    const conversaciones = await this.prisma.client.conversacion.findMany({
      // Una conversación es de su autor: otro Tutor del mismo grupo no la lee
      // (decisión de privacidad entre adultos del mismo tenant).
      where: { grupoId, usuarioId: tenant.principalId },
      orderBy: { updatedAt: 'desc' },
    });

    return conversaciones.map((conversacion) => this.aDto(conversacion));
  }

  async detalle(tenant: TenantContext, id: string): Promise<ConversacionIaDetalleDto> {
    await this.asegurarUsable(tenant);

    const conversacion = await this.buscarPropia(tenant, id);
    const mensajes = await this.mensajesDe(id);

    return { ...this.aDto(conversacion), mensajes };
  }

  /** Crea la conversación y contesta el primer mensaje en la misma llamada. */
  async crear(
    tenant: TenantContext,
    datos: { grupoId: string; primerMensaje: string }
  ): Promise<ConversacionIaDetalleDto> {
    await this.asegurarUsable(tenant);

    const contexto = await this.acceso.contextoPara(tenant, datos.grupoId);
    const conversacion = await this.prisma.client.conversacion.create({
      data: {
        organizacionId: tenant.organizacionId,
        grupoId: datos.grupoId,
        usuarioId: tenant.principalId,
        titulo: this.tituloDe(datos.primerMensaje),
      },
    });

    await this.responder(tenant, conversacion.id, datos.primerMensaje, contexto);

    return {
      ...this.aDto(conversacion),
      mensajes: await this.mensajesDe(conversacion.id),
    };
  }

  /** Manda un mensaje a una conversación existente y devuelve lo nuevo. */
  async enviarMensaje(
    tenant: TenantContext,
    id: string,
    texto: string
  ): Promise<{ mensajes: MensajeIaDto[]; tokensConsumidosMes: number }> {
    await this.asegurarUsable(tenant);

    const conversacion = await this.buscarPropia(tenant, id);
    const contexto = await this.acceso.contextoPara(tenant, conversacion.grupoId);
    const desde = new Date();

    await this.responder(tenant, id, texto, contexto);

    const nuevos = await this.prisma.client.mensaje.findMany({
      where: { conversacionId: id, createdAt: { gte: desde } },
      orderBy: { createdAt: 'asc' },
    });

    return {
      mensajes: nuevos.map((mensaje) => this.mensajeADto(mensaje)),
      tokensConsumidosMes: await this.configuracion.tokensConsumidosMes(tenant.organizacionId),
    };
  }

  async archivar(tenant: TenantContext, id: string): Promise<ConversacionIaDto> {
    await this.buscarPropia(tenant, id);

    // updateMany (no update): pasa por el filtro automático de tenant.
    await this.prisma.client.conversacion.updateMany({
      where: { id },
      data: { archivada: true },
    });

    return this.aDto(await this.buscarPropia(tenant, id));
  }

  /**
   * El turno completo: escribe el mensaje del usuario, corre el loop y
   * persiste todo lo que consumió.
   *
   * **El `finally` no es prolijidad, es la Parte E punto 6**: los tokens de
   * entrada se pagan aunque la llamada falle o el cliente corte la conexión.
   * Contabilizar solo los turnos que terminan bien deja abierta la puerta a
   * consumir gratis cortando a mitad de camino.
   */
  private async responder(
    tenant: TenantContext,
    conversacionId: string,
    texto: string,
    contexto: ContextoHerramienta
  ): Promise<void> {
    await this.prisma.client.mensaje.create({
      data: {
        conversacionId,
        organizacionId: tenant.organizacionId,
        rol: 'USUARIO',
        contenido: texto,
      },
    });

    const historial = await this.historialPara(conversacionId);
    let resultado: ResultadoLoop | null = null;

    try {
      resultado = await this.loop.ejecutar(historial, contexto, {
        safetyIdentifier: this.safetyIdentifier(tenant),
        promptCacheKey: this.promptCacheKey(tenant.organizacionId, contexto.grupoId),
      });
    } catch (error) {
      if (error instanceof ErrorConConsumo) {
        // Lo gastado hasta el fallo queda para que el `finally` lo escriba, y
        // hacia arriba viaja la causa real (la excepción de dominio del
        // proveedor), no este envoltorio interno.
        resultado = error.parcial;

        throw error.causa;
      }

      throw error;
    } finally {
      if (resultado) {
        await this.persistir(conversacionId, tenant.organizacionId, resultado.mensajes);
      }

      await this.prisma.client.conversacion.updateMany({
        where: { id: conversacionId },
        data: { updatedAt: new Date() },
      });
    }
  }

  private async persistir(
    conversacionId: string,
    organizacionId: string,
    mensajes: MensajeAPersistir[]
  ): Promise<void> {
    if (mensajes.length === 0) {
      return;
    }

    await this.prisma.client.mensaje.createMany({
      data: mensajes.map((mensaje) => ({
        conversacionId,
        organizacionId,
        rol: mensaje.rol,
        contenido: mensaje.contenido,
        herramienta: mensaje.herramienta,
        tokensEntrada: mensaje.tokensEntrada,
        tokensSalida: mensaje.tokensSalida,
        costoMicroUsd: mensaje.costoMicroUsd,
        modelo: mensaje.modelo,
      })),
    });
  }

  /**
   * Historial que se le manda al modelo: solo el texto conversado.
   *
   * **Las llamadas a herramientas NO se reproducen.** El ledger guarda un
   * resumen de cada una («ok (1234 bytes)»), no los datos, así que no habría
   * con qué rearmar la respuesta — y no es una limitación sino la decisión
   * correcta: si el Tutor pregunta algo dos horas después, conviene que el
   * modelo vuelva a leer el catálogo en vez de razonar sobre la foto vieja.
   * Es la decisión «memoria entre conversaciones: ninguna, el contexto lo dan
   * las herramientas» aplicada también entre turnos.
   *
   * Los turnos del asistente que fueron solo llamadas a herramientas quedan
   * afuera por tener texto vacío: reenviarlos sería mandar un mensaje en
   * blanco.
   */
  private async historialPara(conversacionId: string): Promise<ItemEntrada[]> {
    const mensajes = await this.prisma.client.mensaje.findMany({
      where: { conversacionId, rol: { in: ['USUARIO', 'ASISTENTE'] } },
      orderBy: { createdAt: 'asc' },
    });

    return mensajes
      .filter((mensaje) => mensaje.contenido.trim() !== '')
      .map((mensaje) => ({
        role: mensaje.rol === 'USUARIO' ? ('user' as const) : ('assistant' as const),
        content: mensaje.contenido,
      }));
  }

  /**
   * Gate de uso, **en este orden y no en otro** (regla que dejó anotada la
   * tanda 1): primero la feature del plan, después el switch del dueño, y
   * recién al final la cuota.
   *
   * El orden importa porque `cuotaTokensMensuales === null` significa SIN
   * LÍMITE, que es lo contrario de lo seguro: leer la cuota sin haber pasado
   * por el gate de la feature convertiría a una organización sin plan en una
   * organización sin tope.
   */
  private async asegurarUsable(tenant: TenantContext): Promise<void> {
    const estado = await this.configuracion.obtener(tenant);

    if (!estado.disponibleEnPlan) {
      throw new FeatureNoDisponibleException();
    }

    if (!estado.habilitada) {
      throw new IaNoHabilitadaException();
    }

    // Pre-flight (Parte E, punto 5a): se corta ANTES de llamar al proveedor.
    // Cortar después ya gastó el dinero que este chequeo existe para no gastar.
    if (
      estado.cuotaTokensMensuales !== null &&
      estado.tokensConsumidosMes >= estado.cuotaTokensMensuales
    ) {
      this.logger.warn(
        `Cuota agotada para la organización ${tenant.organizacionId}: ` +
          `${estado.tokensConsumidosMes}/${estado.cuotaTokensMensuales}`
      );

      throw new CuotaIaAgotadaException(estado.tokensConsumidosMes, estado.cuotaTokensMensuales);
    }
  }

  /**
   * 404 y no 403 cuando la conversación es de otro: no se confirma la
   * existencia de algo que no le corresponde ver (mismo criterio que el resto
   * del monorepo).
   */
  private async buscarPropia(tenant: TenantContext, id: string) {
    const conversacion = await this.prisma.client.conversacion.findFirst({
      where: { id, usuarioId: tenant.principalId },
    });

    if (!conversacion) {
      throw new NotFoundException('Conversación no encontrada');
    }

    return conversacion;
  }

  private async mensajesDe(conversacionId: string): Promise<MensajeIaDto[]> {
    const mensajes = await this.prisma.client.mensaje.findMany({
      where: { conversacionId },
      orderBy: { createdAt: 'asc' },
    });

    return mensajes.map((mensaje) => this.mensajeADto(mensaje));
  }

  /**
   * Identificador que viaja al proveedor (Parte E, punto 7): hash estable de
   * organización y usuario, **no reversible a una persona**. Sirve para que el
   * proveedor pueda correlacionar abusos sin que le mandemos quién es nadie.
   */
  private safetyIdentifier(tenant: TenantContext): string {
    return createHash('sha256')
      .update(`${tenant.organizacionId}:${tenant.principalId}`)
      .digest('hex')
      .slice(0, 64);
  }

  /**
   * Clave de caché de prompt: lo que hace que el catálogo repetido de una misma
   * conversación entre por caché (el token cacheado sale 10 veces menos).
   *
   * **Desviación registrada de la spec, y no es cosmética.** La spec fija
   * `org:${organizacionId}:grupo:${grupoId}`, que con dos uuid da 83
   * caracteres — y el proveedor rechaza este parámetro por encima de **64**
   * (verificado: 64 pasa, 65 devuelve `string_above_max_length`). Con la
   * fórmula literal, TODA conversación terminaba en 503; no había forma de que
   * el asistente funcionara una sola vez.
   *
   * El hash arregla además un segundo problema que la spec se hace a sí misma:
   * su Parte E punto 7 dice que el id de organización NO sale en claro hacia el
   * proveedor, y esa fórmula lo mandaba en claro en cada llamada.
   *
   * Se conserva lo único que la clave tiene que cumplir: misma organización y
   * mismo grupo ⇒ misma clave; distinto grupo ⇒ distinta. Un sha-256 en hex
   * mide exactamente 64, así que entra justo sin recortar (recortar subiría la
   * probabilidad de colisión sin ganar nada).
   */
  private promptCacheKey(organizacionId: string, grupoId: string): string {
    return createHash('sha256').update(`org:${organizacionId}:grupo:${grupoId}`).digest('hex');
  }

  private tituloDe(primerMensaje: string): string {
    const limpio = primerMensaje.trim().replace(/\s+/g, ' ');

    return limpio.length <= LARGO_TITULO ? limpio : `${limpio.slice(0, LARGO_TITULO - 1)}…`;
  }

  private aDto(conversacion: {
    id: string;
    grupoId: string;
    titulo: string;
    archivada: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): ConversacionIaDto {
    return {
      id: conversacion.id,
      grupoId: conversacion.grupoId,
      titulo: conversacion.titulo,
      archivada: conversacion.archivada,
      createdAt: conversacion.createdAt.toISOString(),
      updatedAt: conversacion.updatedAt.toISOString(),
    };
  }

  private mensajeADto(mensaje: {
    id: string;
    rol: string;
    contenido: string;
    herramienta: string | null;
    createdAt: Date;
  }): MensajeIaDto {
    return {
      id: mensaje.id,
      rol: mensaje.rol as MensajeIaDto['rol'],
      contenido: mensaje.contenido,
      herramienta: mensaje.herramienta,
      createdAt: mensaje.createdAt.toISOString(),
    };
  }
}
