import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import {
  FuenteProducto,
  MecanicaProducto,
  ModoRecompensas,
  ProductosDesdeEtiquetaDto,
  ProductoTiendaDto,
  Rol,
  TenantContext,
} from '@dorado/shared-types';

import { BilleteraService } from '../billetera/billetera.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { SinItemsParaCrearException, SoloEnModoTiendaException } from '../comun/excepciones';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import type { ProductosDesdeEtiquetaRequest } from '../etiquetas/dto/etiquetas.dto';
import { EtiquetasService } from '../etiquetas/etiquetas.service';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Recompensa } from '../generated/prisma/client';
import { EstadoCatalogo } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { CrearProductoRequest, EditarProductoRequest } from './dto/tienda.dto';

/** Ítem que la creación masiva dejó afuera, con el porqué (fase-14-26). */
type ItemSalteado = ProductosDesdeEtiquetaDto['salteados'][number];

/** Producto de Prisma + los dos campos derivados contra el saldo de quien mira. */
type ProductoFila = {
  id: string;
  organizacionId: string;
  grupoId: string;
  nombre: string;
  descripcion: string | null;
  imagenUrl: string | null;
  precio: number;
  fuente: string;
  mecanica: string;
  recompensaId: string | null;
  bolsaId: string | null;
  estado: string;
};

/**
 * La tienda (spec fase-14-22 decisión 18). Un producto son DOS EJES: de dónde
 * sale (`fuente`) y cómo se obtiene (`mecanica`). Esa separación es el punto
 * del ítem — el mismo premio puede estar a la vez en un producto directo caro
 * y dentro de una bolsa sorteada barata, sin ningún flag en la `Recompensa`.
 */
@Injectable()
export class ProductosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoGrupoService,
    private readonly billetera: BilleteraService,
    private readonly eventos: EventosPublisherService,
    private readonly configuracion: ConfiguracionService,
    private readonly etiquetas: EtiquetasService
  ) {}

  async crear(
    tenant: TenantContext,
    grupoId: string,
    datos: CrearProductoRequest
  ): Promise<ProductoTiendaDto> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);
    await this.validarReferencias(grupoId, datos);

    const producto = await this.prisma.client.productoTienda.create({
      data: {
        // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
        organizacionId: tenant.organizacionId,
        grupoId,
        nombre: datos.nombre,
        descripcion: datos.descripcion ?? null,
        imagenUrl: datos.imagenUrl ?? null,
        precio: datos.precio,
        fuente: datos.fuente,
        mecanica: datos.mecanica ?? MecanicaProducto.AZAR,
        recompensaId: datos.fuente === FuenteProducto.ITEM ? datos.recompensaId : null,
        bolsaId: datos.fuente === FuenteProducto.BOLSA ? datos.bolsaId : null,
        creadoPorTutorId: tenant.principalId,
      },
    });

    await this.auditar(tenant, grupoId, 'PRODUCTO_CREADO', producto.id, {
      despues: sinDerivados(producto),
    });

    return aDto(producto, 0);
  }

  /**
   * Creación masiva desde una etiqueta (fase-14-26 decisión 11). **Saltea en
   * vez de fallar**: correr el atajo dos veces no puede duplicar la tienda, y
   * el Tutor se entera de qué quedó afuera y por qué.
   *
   * Es la tercera puerta contra los castigos comprables, y la única que no
   * necesita cerrarse a golpes: acá directamente no se los busca.
   */
  async crearDesdeEtiqueta(
    tenant: TenantContext,
    grupoId: string,
    datos: ProductosDesdeEtiquetaRequest
  ): Promise<ProductosDesdeEtiquetaDto> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    if ((await this.configuracion.obtenerModo(grupoId)) !== ModoRecompensas.TIENDA) {
      throw new SoloEnModoTiendaException();
    }

    await this.etiquetas.asegurarEtiquetaDelGrupo(grupoId, datos.etiquetaId);

    const candidatos = await this.candidatosDeEtiqueta(grupoId, datos.etiquetaId);
    const salteados = await this.salteadosPorProductoPrevio(grupoId, candidatos.premios);
    const yaSalteados = new Set(salteados.map((fila) => fila.recompensaId));
    const aCrear = candidatos.premios.filter((premio) => !yaSalteados.has(premio.id));

    if (aCrear.length === 0) {
      throw new SinItemsParaCrearException();
    }

    await this.prisma.client.productoTienda.createMany({
      data: aCrear.map((premio) => ({
        // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
        organizacionId: tenant.organizacionId,
        grupoId,
        nombre: premio.nombre,
        descripcion: premio.descripcion,
        precio: datos.precio,
        fuente: FuenteProducto.ITEM,
        // Se ignora con fuente ITEM; se manda el default explícito igual.
        mecanica: MecanicaProducto.AZAR,
        recompensaId: premio.id,
        creadoPorTutorId: tenant.principalId,
      })),
    });

    const creados = await this.prisma.client.productoTienda.findMany({
      where: {
        grupoId,
        estado: EstadoCatalogo.ACTIVA,
        recompensaId: { in: aCrear.map((premio) => premio.id) },
      },
    });

    const todosLosSalteados = [...salteados, ...candidatos.castigos];

    // Un solo registro de auditoría, no uno por producto: la acción del Tutor
    // fue una sola y el detalle ya dice sobre cuántos ítems cayó.
    await this.auditar(
      tenant,
      grupoId,
      'PRODUCTOS_CREADOS_DESDE_ETIQUETA',
      datos.etiquetaId,
      {
        despues: {
          etiquetaId: datos.etiquetaId,
          precio: datos.precio,
          creados: aCrear.map((premio) => premio.id),
          salteados: todosLosSalteados,
        },
      }
    );

    return {
      creados: creados.map((producto) => aDto(producto, 0)),
      salteados: todosLosSalteados,
    };
  }

  /** Ítems activos con esa etiqueta, partidos en premios publicables y castigos. */
  private async candidatosDeEtiqueta(
    grupoId: string,
    etiquetaId: string
  ): Promise<{ premios: Recompensa[]; castigos: ItemSalteado[] }> {
    const ids = await this.etiquetas.recompensasDeEtiqueta(etiquetaId);

    if (ids.length === 0) {
      return { premios: [], castigos: [] };
    }

    const items = await this.prisma.client.recompensa.findMany({
      where: { grupoId, estado: EstadoCatalogo.ACTIVA, id: { in: ids } },
    });

    return {
      premios: items.filter((item) => item.tipo !== 'CASTIGO'),
      castigos: items
        .filter((item) => item.tipo === 'CASTIGO')
        .map((item) => ({
          recompensaId: item.id,
          nombre: item.nombre,
          motivo: 'ES_CASTIGO' as const,
        })),
    };
  }

  /** Los que ya tienen un producto ACTIVA de fuente ITEM apuntándolos. */
  private async salteadosPorProductoPrevio(
    grupoId: string,
    premios: Recompensa[]
  ): Promise<ItemSalteado[]> {
    if (premios.length === 0) {
      return [];
    }

    const existentes = await this.prisma.client.productoTienda.findMany({
      where: {
        grupoId,
        estado: EstadoCatalogo.ACTIVA,
        fuente: FuenteProducto.ITEM,
        recompensaId: { in: premios.map((premio) => premio.id) },
      },
    });

    const conProducto = new Set(existentes.map((producto) => producto.recompensaId));

    return premios
      .filter((premio) => conProducto.has(premio.id))
      .map((premio) => ({
        recompensaId: premio.id,
        nombre: premio.nombre,
        motivo: 'YA_TIENE_PRODUCTO' as const,
      }));
  }

  /**
   * La vitrina. `puedeComprar` y `faltan` se calculan contra el saldo de quien
   * pregunta — para un Tutor, que no tiene billetera, el saldo es 0 y los
   * campos no significan nada (la pantalla del Tutor no los usa).
   */
  async listar(
    tenant: TenantContext,
    grupoId: string,
    incluirArchivados = false
  ): Promise<ProductoTiendaDto[]> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    const productos = await this.prisma.client.productoTienda.findMany({
      where: {
        grupoId,
        // El participante nunca ve archivados; el Tutor los ve si los pide.
        ...((!incluirArchivados || tenant.rol === Rol.USUARIO) && {
          estado: EstadoCatalogo.ACTIVA,
        }),
      },
      orderBy: { precio: 'asc' },
    });

    const saldo =
      tenant.rol === Rol.USUARIO
        ? await this.billetera.saldoDe(grupoId, tenant.principalId)
        : 0;

    return productos.map((producto) => aDto(producto, saldo));
  }

  async editar(
    tenant: TenantContext,
    id: string,
    datos: EditarProductoRequest
  ): Promise<ProductoTiendaDto> {
    const existente = await this.buscarAccesible(id);
    const fusionado = { ...sinDerivados(existente), ...datos } as CrearProductoRequest;

    await this.validarReferencias(existente.grupoId, fusionado);

    await this.prisma.client.productoTienda.updateMany({
      where: { id },
      data: {
        ...(datos.nombre !== undefined && { nombre: datos.nombre }),
        ...(datos.descripcion !== undefined && { descripcion: datos.descripcion }),
        ...(datos.imagenUrl !== undefined && { imagenUrl: datos.imagenUrl }),
        ...(datos.precio !== undefined && { precio: datos.precio }),
        ...(datos.fuente !== undefined && { fuente: datos.fuente }),
        ...(datos.mecanica !== undefined && { mecanica: datos.mecanica }),
        // Las referencias se reescriben juntas con la fuente: dejar la vieja
        // colgada sería el estado inconsistente que la validación evita.
        ...(datos.fuente !== undefined && {
          recompensaId:
            datos.fuente === FuenteProducto.ITEM ? fusionado.recompensaId ?? null : null,
          bolsaId: datos.fuente === FuenteProducto.BOLSA ? fusionado.bolsaId ?? null : null,
        }),
      },
    });

    await this.auditar(tenant, existente.grupoId, 'PRODUCTO_EDITADO', id, {
      antes: sinDerivados(existente),
      despues: datos,
    });

    return await this.obtener(id);
  }

  /** Archiva. Las compras ya hechas conservan sus snapshots y no se tocan. */
  async archivar(tenant: TenantContext, id: string): Promise<ProductoTiendaDto> {
    const existente = await this.buscarAccesible(id);

    await this.prisma.client.productoTienda.updateMany({
      where: { id },
      data: { estado: EstadoCatalogo.ARCHIVADA },
    });

    await this.auditar(tenant, existente.grupoId, 'PRODUCTO_ARCHIVADO', id, {
      antes: sinDerivados(existente),
    });

    return await this.obtener(id);
  }

  /**
   * Las dos puertas que impiden que un castigo llegue a la tienda (decisión
   * 20): acá la de fuente ITEM, y en `BolsasService` la de las bolsas.
   */
  private async validarReferencias(
    grupoId: string,
    datos: Pick<CrearProductoRequest, 'fuente' | 'recompensaId' | 'bolsaId' | 'precio'>
  ): Promise<void> {
    if (datos.precio !== undefined && datos.precio < 1) {
      throw new BadRequestException({
        message: 'El precio debe ser al menos 1',
        code: 'PRECIO_INVALIDO',
      });
    }

    if (datos.fuente === FuenteProducto.ITEM) {
      if (!datos.recompensaId || datos.bolsaId) {
        throw new BadRequestException({
          message: 'Con fuente ITEM hay que mandar recompensaId y no bolsaId',
          code: 'REFERENCIA_INVALIDA',
        });
      }

      const item = await this.prisma.client.recompensa.findFirst({
        where: { id: datos.recompensaId, grupoId },
      });

      if (!item) {
        throw new BadRequestException({
          message: 'El ítem no existe o no es de este grupo',
          code: 'REFERENCIA_INVALIDA',
        });
      }

      if (item.tipo === 'CASTIGO') {
        throw new BadRequestException({
          message: 'Un castigo no puede ser un producto de la tienda',
          code: 'CASTIGO_NO_ES_COMPRABLE',
        });
      }

      return;
    }

    if (!datos.bolsaId || datos.recompensaId) {
      throw new BadRequestException({
        message: 'Con fuente BOLSA hay que mandar bolsaId y no recompensaId',
        code: 'REFERENCIA_INVALIDA',
      });
    }

    const bolsa = await this.prisma.client.bolsaPremios.findFirst({
      where: { id: datos.bolsaId, grupoId, estado: EstadoCatalogo.ACTIVA },
      include: { items: true },
    });

    if (!bolsa) {
      throw new BadRequestException({
        message: 'La bolsa no existe, está archivada o no es de este grupo',
        code: 'REFERENCIA_INVALIDA',
      });
    }

    if (bolsa.items.length === 0) {
      throw new BadRequestException({
        message: 'La bolsa está vacía',
        code: 'BOLSA_VACIA',
      });
    }
  }

  private async obtener(id: string): Promise<ProductoTiendaDto> {
    const producto = await this.prisma.client.productoTienda.findFirst({ where: { id } });

    if (!producto) {
      throw new NotFoundException('Producto no encontrado');
    }

    return aDto(producto, 0);
  }

  private async buscarAccesible(id: string): Promise<ProductoFila> {
    const producto = await this.prisma.client.productoTienda.findFirst({ where: { id } });

    if (!producto) {
      throw new NotFoundException('Producto no encontrado');
    }

    return producto;
  }

  private async auditar(
    tenant: TenantContext,
    grupoId: string,
    accion: string,
    entidadId: string,
    detalle: Record<string, unknown>
  ): Promise<void> {
    await this.eventos.publicarAccionAdministrativa({
      organizacionId: tenant.organizacionId,
      grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion,
      entidadTipo: 'ProductoTienda',
      entidadId,
      detalle,
    });
  }
}

function sinDerivados(producto: ProductoFila) {
  return {
    nombre: producto.nombre,
    descripcion: producto.descripcion,
    imagenUrl: producto.imagenUrl,
    precio: producto.precio,
    fuente: producto.fuente,
    mecanica: producto.mecanica,
    recompensaId: producto.recompensaId,
    bolsaId: producto.bolsaId,
  };
}

export function aDto(producto: ProductoFila, saldo: number): ProductoTiendaDto {
  return {
    id: producto.id,
    organizacionId: producto.organizacionId,
    grupoId: producto.grupoId,
    nombre: producto.nombre,
    descripcion: producto.descripcion,
    imagenUrl: producto.imagenUrl,
    precio: producto.precio,
    fuente: producto.fuente as FuenteProducto,
    mecanica: producto.mecanica as MecanicaProducto,
    recompensaId: producto.recompensaId,
    bolsaId: producto.bolsaId,
    estado: producto.estado as 'ACTIVA' | 'ARCHIVADA',
    puedeComprar: saldo >= producto.precio,
    // El motor del ahorro: la vitrina muestra «te faltan N».
    faltan: Math.max(0, producto.precio - saldo),
  };
}
