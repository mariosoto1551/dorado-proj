import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { InternalSecretGuard } from '@dorado/shared-auth';
import {
  ConfiguracionRecompensasInternaDto,
  EtiquetaInternaDto,
  FuenteProducto,
  MecanicaProducto,
  RecompensaDto,
  RendimientoAccionInternoDto,
  TiendaInternaDto,
  TipoAccionRendimiento,
} from '@dorado/shared-types';

import { recompensaADto } from '../comun/mapeadores';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { EtiquetasService } from '../etiquetas/etiquetas.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Endpoints internos servicio-a-servicio (ADR-00 §4): protegidos por
 * `x-internal-secret`, NUNCA expuestos vía Gateway público. Trabajan con IDs
 * explícitos (el llamador interno es confiable) — sin contexto de tenant.
 *
 * **Nace en fase-14-29** (la spec de Fase 8 no definía ninguno para rewards, y
 * hasta acá el módulo interno solo tenía el health). Su único consumidor es
 * `ai-service`, para las herramientas de lectura `listar_recompensas` y
 * `listar_rendimientos_monedas` — el asistente tiene que ver los precios y lo
 * que paga cada acción para poder calibrar la economía.
 *
 * Los cinco son de LECTURA y así se quedan: la decisión 6 de aquel ítem dice
 * que la IA no escribe en ningún servicio, y una escritura interna nueva acá
 * sería exactamente la superficie que el diseño existe para no tener.
 */
@Controller('internal/rewards')
@UseGuards(InternalSecretGuard)
export class InternalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly etiquetas: EtiquetasService,
    private readonly configuracion: ConfiguracionService
  ) {}

  /**
   * Catálogo de recompensas del Grupo, con sus etiquetas del fase-14-26.
   *
   * Devuelve también las ARCHIVADAS salvo que se filtre: para proponer precios
   * hace falta ver qué se dejó de ofrecer y por qué, no solo lo vigente.
   */
  @Get('grupos/:grupoId/recompensas')
  async recompensasDelGrupo(
    @Param('grupoId') grupoId: string,
    @Query('estado') estado?: string
  ): Promise<RecompensaDto[]> {
    const recompensas = await this.prisma.client.recompensa.findMany({
      where: {
        grupoId,
        ...(estado === 'ACTIVA' || estado === 'ARCHIVADA' ? { estado } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    const porRecompensa = await this.etiquetas.mapaPorRecompensa(grupoId);

    return recompensas.map((recompensa) =>
      recompensaADto(recompensa, porRecompensa.get(recompensa.id) ?? [])
    );
  }

  /**
   * Lo que paga cada acción en monedas (fase-14-28), tal como está guardado.
   *
   * **Sin cruzar con el catálogo de activity**, a diferencia de la pantalla del
   * Tutor: quien consume esto tiene su propia herramienta para listar el
   * catálogo, y hacer el fan-out acá metería una llamada rewards→activity en un
   * camino de solo lectura que no la necesita. `nombreSnapshot` alcanza para
   * que se entienda de qué acción se está hablando.
   *
   * Una acción sin rendimiento configurado simplemente no tiene fila — no paga
   * nada, que es el default del ítem.
   */
  @Get('grupos/:grupoId/rendimientos')
  async rendimientosDelGrupo(
    @Param('grupoId') grupoId: string
  ): Promise<RendimientoAccionInternoDto[]> {
    const rendimientos = await this.prisma.client.rendimientoAccion.findMany({
      where: { grupoId },
      orderBy: { nombreSnapshot: 'asc' },
    });

    return rendimientos.map((rendimiento) => ({
      tipoAccion: rendimiento.tipoAccion as TipoAccionRendimiento,
      origenId: rendimiento.origenId,
      nombreSnapshot: rendimiento.nombreSnapshot,
      monedas: rendimiento.monedas,
      monedasBonoJefe: rendimiento.monedasBonoJefe,
    }));
  }

  /**
   * Catálogo de etiquetas del Grupo (fase-14-30 tanda 3).
   *
   * Las etiquetas no tienen ningún efecto de negocio: organizan el catálogo del
   * Tutor. Existe este endpoint porque **sin los ids no se puede asignar
   * ninguna**, que es la única forma en que el asistente puede ofrecerlas.
   */
  @Get('grupos/:grupoId/etiquetas')
  async etiquetasDelGrupo(
    @Param('grupoId') grupoId: string,
    @Query('estado') estado?: string
  ): Promise<EtiquetaInternaDto[]> {
    const etiquetas = await this.prisma.client.etiquetaCatalogo.findMany({
      where: {
        grupoId,
        ...(estado === 'ACTIVA' || estado === 'ARCHIVADA' ? { estado } : {}),
      },
      orderBy: { nombre: 'asc' },
    });

    return etiquetas.map((etiqueta) => ({
      id: etiqueta.id,
      nombre: etiqueta.nombre,
      colorHex: etiqueta.colorHex,
      estado: etiqueta.estado as 'ACTIVA' | 'ARCHIVADA',
    }));
  }

  /**
   * Configuración de recompensas del Grupo (fase-14-30 tanda 3).
   *
   * El `modo` es el dato que evita el error más caro: proponer precios en un
   * grupo `DIRECTO` es proponer sobre una tienda que nadie ve. Delega en el
   * service que ya resuelve los defaults — un grupo sin fila es `DIRECTO`.
   */
  @Get('grupos/:grupoId/configuracion')
  async configuracionDelGrupo(
    @Param('grupoId') grupoId: string
  ): Promise<ConfiguracionRecompensasInternaDto> {
    const config = await this.configuracion.leer(grupoId);

    return {
      modo: config.modo,
      modoPendiente: config.modoPendiente,
      nombreMoneda: config.nombreMoneda,
      iconoMoneda: config.iconoMoneda,
    };
  }

  /**
   * Productos y bolsas del Grupo (fase-14-30 tanda 1).
   *
   * **Es el prerrequisito de que `proponer_precios_tienda` pueda funcionar**: el
   * precio vive en el `ProductoTienda`, no en la `Recompensa`, así que sin este
   * endpoint el asistente no tenía de dónde sacar un `productoId` y solo podía
   * inventarlo — la propuesta moría cuando el Tutor apretaba «Aplicar».
   *
   * Devuelve también las ARCHIVADAS, por el mismo criterio que las recompensas:
   * para calibrar precios hace falta ver qué se dejó de ofrecer.
   *
   * Sin `puedeComprar` ni `faltan`: se calculan contra el saldo de una persona
   * y acá no hay ninguna.
   */
  @Get('grupos/:grupoId/tienda')
  async tiendaDelGrupo(@Param('grupoId') grupoId: string): Promise<TiendaInternaDto> {
    const [productos, bolsas] = await Promise.all([
      this.prisma.client.productoTienda.findMany({
        where: { grupoId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.client.bolsaPremios.findMany({
        where: { grupoId },
        orderBy: { createdAt: 'asc' },
        include: { items: { select: { recompensaId: true } } },
      }),
    ]);

    return {
      productos: productos.map((producto) => ({
        id: producto.id,
        nombre: producto.nombre,
        descripcion: producto.descripcion,
        precio: producto.precio,
        fuente: producto.fuente as FuenteProducto,
        mecanica: producto.mecanica as MecanicaProducto,
        recompensaId: producto.recompensaId,
        bolsaId: producto.bolsaId,
        estado: producto.estado as 'ACTIVA' | 'ARCHIVADA',
      })),
      bolsas: bolsas.map((bolsa) => ({
        id: bolsa.id,
        nombre: bolsa.nombre,
        estado: bolsa.estado as 'ACTIVA' | 'ARCHIVADA',
        recompensaIds: bolsa.items.map((item) => item.recompensaId),
      })),
    };
  }
}
