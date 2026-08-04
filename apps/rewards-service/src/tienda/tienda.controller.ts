import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import {
  BolsaPremiosDto,
  CompraDto,
  PendienteEntregaDto,
  ProductosDesdeEtiquetaDto,
  ProductoTiendaDto,
  Rol,
  TenantContext,
} from '@dorado/shared-types';

import { ProductosDesdeEtiquetaRequest } from '../etiquetas/dto/etiquetas.dto';
import { BolsasService } from './bolsas.service';
import { ComprasService } from './compras.service';
import {
  AnularCastigoRequest,
  ComprarRequest,
  CrearProductoRequest,
  EditarProductoRequest,
  GuardarBolsaRequest,
  RevertirCompraRequest,
} from './dto/tienda.dto';
import { ProductosService } from './productos.service';

@Controller('rewards')
@UseGuards(TenantContextGuard, RolesGuard)
export class TiendaController {
  constructor(
    private readonly bolsas: BolsasService,
    private readonly productos: ProductosService,
    private readonly compras: ComprasService
  ) {}

  // ---- Bolsas (siempre de premios, decisión 20) ----

  @Post('grupos/:grupoId/bolsas')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async crearBolsa(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Body() datos: GuardarBolsaRequest
  ): Promise<BolsaPremiosDto> {
    return await this.bolsas.crear(tenant, grupoId, datos);
  }

  /**
   * También la lee el participante: con `mecanica = ELECCION` tiene que ver
   * qué hay en la bolsa antes de elegir. `asegurarAccesoLectura` ya acota al
   * grupo y no hay nada sensible en un conjunto de premios.
   */
  @Get('grupos/:grupoId/bolsas')
  @Roles(Rol.USUARIO, Rol.TUTOR, Rol.ORG_ADMIN)
  async listarBolsas(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string
  ): Promise<BolsaPremiosDto[]> {
    return await this.bolsas.listar(tenant, grupoId);
  }

  @Put('bolsas/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async editarBolsa(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() datos: GuardarBolsaRequest
  ): Promise<BolsaPremiosDto> {
    return await this.bolsas.editar(tenant, id, datos);
  }

  @Delete('bolsas/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async archivarBolsa(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ): Promise<BolsaPremiosDto> {
    return await this.bolsas.archivar(tenant, id);
  }

  // ---- Productos ----

  @Post('grupos/:grupoId/productos')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async crearProducto(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Body() datos: CrearProductoRequest
  ): Promise<ProductoTiendaDto> {
    return await this.productos.crear(tenant, grupoId, datos);
  }

  /**
   * Creación masiva desde una etiqueta (fase-14-26). Saltea los ítems que ya
   * tienen producto en vez de fallar, así correrlo dos veces no duplica nada.
   */
  @Post('grupos/:grupoId/productos/desde-etiqueta')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async crearProductosDesdeEtiqueta(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Body() datos: ProductosDesdeEtiquetaRequest
  ): Promise<ProductosDesdeEtiquetaDto> {
    return await this.productos.crearDesdeEtiqueta(tenant, grupoId, datos);
  }

  /** La vitrina: `puedeComprar` y `faltan` van contra el saldo de quien mira. */
  @Get('grupos/:grupoId/tienda')
  @Roles(Rol.USUARIO, Rol.TUTOR, Rol.ORG_ADMIN)
  async tienda(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Query('incluirArchivados') incluirArchivados?: string
  ): Promise<ProductoTiendaDto[]> {
    return await this.productos.listar(tenant, grupoId, incluirArchivados === 'true');
  }

  @Patch('productos/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async editarProducto(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() datos: EditarProductoRequest
  ): Promise<ProductoTiendaDto> {
    return await this.productos.editar(tenant, id, datos);
  }

  @Delete('productos/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async archivarProducto(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ): Promise<ProductoTiendaDto> {
    return await this.productos.archivar(tenant, id);
  }

  // ---- Comprar y entregar ----

  @Post('grupos/:grupoId/comprar')
  @Roles(Rol.USUARIO, Rol.TUTOR, Rol.ORG_ADMIN)
  async comprar(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Body() datos: ComprarRequest
  ): Promise<CompraDto> {
    return await this.compras.comprar(tenant, grupoId, datos);
  }

  @Post('compras/:id/revertir')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async revertir(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() datos: RevertirCompraRequest
  ): Promise<CompraDto> {
    return await this.compras.revertir(tenant, id, datos);
  }

  @Post('castigos/:id/anular')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  @HttpCode(204)
  async anularCastigo(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() datos: AnularCastigoRequest
  ): Promise<void> {
    await this.compras.anularCastigo(tenant, id, datos);
  }

  /** Compras y castigos pendientes en UNA lista (spec Parte D). */
  @Get('grupos/:grupoId/pendientes-entrega')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async pendientes(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string
  ): Promise<PendienteEntregaDto[]> {
    return await this.compras.pendientesDeEntrega(tenant, grupoId);
  }

  @Patch('compras/:id/entregar')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async entregarCompra(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ): Promise<CompraDto> {
    return await this.compras.entregarCompra(tenant, id);
  }

  @Patch('castigos/:id/entregar')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  @HttpCode(204)
  async entregarCastigo(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ): Promise<void> {
    await this.compras.entregarCastigo(tenant, id);
  }
}
