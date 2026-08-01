import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  FuenteProducto,
  MecanicaProducto,
  TipoItemCatalogo,
  type TenantContext,
} from '@dorado/shared-types';

import { BilleteraService } from '../billetera/billetera.service';
import type { IdentityClientService } from '../clientes/identity-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  crearBdEnMemoria,
  movimientoDePrueba,
  recompensaDePrueba,
  type BdEnMemoria,
} from '../comun/testing/bd-en-memoria';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { BolsasService } from './bolsas.service';
import { ProductosService } from './productos.service';

function tenantTutor(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'TUTOR',
    principalId: 'tutor-1',
    principalType: 'TUTOR',
  } as TenantContext;
}

function tenantUsuario(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'USUARIO',
    principalId: 'usuario-1',
    principalType: 'USUARIO',
  } as TenantContext;
}

function crearServicios(bd: BdEnMemoria) {
  const identity = {
    obtenerGrupo: vi.fn(),
    obtenerUsuario: vi.fn(),
    usuariosDelGrupo: vi.fn().mockResolvedValue([]),
  } as unknown as IdentityClientService;

  const eventos = {
    publicar: vi.fn(),
    publicarAccionAdministrativa: vi.fn(),
  } as unknown as EventosPublisherService;

  const acceso = new AccesoGrupoService(identity);
  const configuracion = new ConfiguracionService(bd.prisma, acceso, eventos);
  const billetera = new BilleteraService(
    bd.prisma,
    acceso,
    identity,
    configuracion,
    eventos
  );

  return {
    bolsas: new BolsasService(bd.prisma, acceso, eventos),
    productos: new ProductosService(bd.prisma, acceso, billetera, eventos),
    bd,
  };
}

describe('BolsasService — las bolsas son SIEMPRE de premios (decisión 20)', () => {
  it('crea una bolsa con sus ítems', async () => {
    const premio = recompensaDePrueba({ nombre: 'Helado', umbralZonaId: null });
    const bd = crearBdEnMemoria({ recompensas: [premio] });
    const { bolsas } = crearServicios(bd);

    const bolsa = await bolsas.crear(tenantTutor(), 'grupo-1', {
      nombre: 'Sorpresas',
      recompensaIds: [premio.id],
    });

    expect(bolsa.recompensaIds).toEqual([premio.id]);
    expect(bolsa.estado).toBe('ACTIVA');
  });

  it('PUERTA 1: un CASTIGO no puede entrar a una bolsa → 400', async () => {
    const castigo = recompensaDePrueba({
      tipo: 'CASTIGO',
      nombre: 'Sin tele',
      umbralZonaId: null,
    });
    const bd = crearBdEnMemoria({ recompensas: [castigo] });
    const { bolsas } = crearServicios(bd);

    await expect(
      bolsas.crear(tenantTutor(), 'grupo-1', {
        nombre: 'Trampa',
        recompensaIds: [castigo.id],
      })
    ).rejects.toThrow(BadRequestException);

    expect(bd.bolsas).toHaveLength(0);
  });

  it('un ítem de otro grupo no entra', async () => {
    const ajeno = recompensaDePrueba({ grupoId: 'grupo-2', umbralZonaId: null });
    const bd = crearBdEnMemoria({ recompensas: [ajeno] });
    const { bolsas } = crearServicios(bd);

    await expect(
      bolsas.crear(tenantTutor(), 'grupo-1', {
        nombre: 'Ajena',
        recompensaIds: [ajeno.id],
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('editar REEMPLAZA la lista completa: es explícita, no incremental', async () => {
    const uno = recompensaDePrueba({ nombre: 'Helado', umbralZonaId: null });
    const otro = recompensaDePrueba({ nombre: 'Cine', umbralZonaId: null });
    const bd = crearBdEnMemoria({ recompensas: [uno, otro] });
    const { bolsas } = crearServicios(bd);

    const bolsa = await bolsas.crear(tenantTutor(), 'grupo-1', {
      nombre: 'Sorpresas',
      recompensaIds: [uno.id, otro.id],
    });

    const editada = await bolsas.editar(tenantTutor(), bolsa.id, {
      nombre: 'Sorpresas chicas',
      recompensaIds: [otro.id],
    });

    expect(editada.nombre).toBe('Sorpresas chicas');
    expect(editada.recompensaIds).toEqual([otro.id]);
  });
});

describe('ProductosService — los dos ejes y la puerta 2', () => {
  it('crea un producto de fuente ITEM', async () => {
    const premio = recompensaDePrueba({ nombre: 'Bici', umbralZonaId: null });
    const bd = crearBdEnMemoria({ recompensas: [premio] });
    const { productos } = crearServicios(bd);

    const producto = await productos.crear(tenantTutor(), 'grupo-1', {
      nombre: 'Bici directa',
      precio: 25,
      fuente: FuenteProducto.ITEM,
      recompensaId: premio.id,
    });

    expect(producto).toMatchObject({
      fuente: 'ITEM',
      recompensaId: premio.id,
      bolsaId: null,
      precio: 25,
    });
  });

  it('PUERTA 2: un CASTIGO no puede ser producto → 400 CASTIGO_NO_ES_COMPRABLE', async () => {
    const castigo = recompensaDePrueba({
      tipo: 'CASTIGO',
      nombre: 'Sin tele',
      umbralZonaId: null,
    });
    const bd = crearBdEnMemoria({ recompensas: [castigo] });
    const { productos } = crearServicios(bd);

    await expect(
      productos.crear(tenantTutor(), 'grupo-1', {
        nombre: 'Trampa',
        precio: 5,
        fuente: FuenteProducto.ITEM,
        recompensaId: castigo.id,
      })
    ).rejects.toThrow(BadRequestException);

    expect(bd.productos).toHaveLength(0);
  });

  it('fuente ITEM sin recompensaId → 400 REFERENCIA_INVALIDA', async () => {
    const bd = crearBdEnMemoria();
    const { productos } = crearServicios(bd);

    await expect(
      productos.crear(tenantTutor(), 'grupo-1', {
        nombre: 'Sin referencia',
        precio: 5,
        fuente: FuenteProducto.ITEM,
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('fuente BOLSA con recompensaId cargado también → 400', async () => {
    const premio = recompensaDePrueba({ umbralZonaId: null });
    const bd = crearBdEnMemoria({ recompensas: [premio] });
    const { bolsas, productos } = crearServicios(bd);

    const bolsa = await bolsas.crear(tenantTutor(), 'grupo-1', {
      nombre: 'Sorpresas',
      recompensaIds: [premio.id],
    });

    await expect(
      productos.crear(tenantTutor(), 'grupo-1', {
        nombre: 'Confuso',
        precio: 5,
        fuente: FuenteProducto.BOLSA,
        bolsaId: bolsa.id,
        recompensaId: premio.id,
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('crea un producto de fuente BOLSA con mecánica ELECCION', async () => {
    const premio = recompensaDePrueba({ umbralZonaId: null });
    const bd = crearBdEnMemoria({ recompensas: [premio] });
    const { bolsas, productos } = crearServicios(bd);

    const bolsa = await bolsas.crear(tenantTutor(), 'grupo-1', {
      nombre: 'Sorpresas',
      recompensaIds: [premio.id],
    });

    const producto = await productos.crear(tenantTutor(), 'grupo-1', {
      nombre: 'Elegí vos',
      precio: 30,
      fuente: FuenteProducto.BOLSA,
      mecanica: MecanicaProducto.ELECCION,
      bolsaId: bolsa.id,
    });

    expect(producto).toMatchObject({
      fuente: 'BOLSA',
      mecanica: 'ELECCION',
      bolsaId: bolsa.id,
      recompensaId: null,
    });
  });

  it('precio menor a 1 → 400 PRECIO_INVALIDO', async () => {
    const premio = recompensaDePrueba({ umbralZonaId: null });
    const bd = crearBdEnMemoria({ recompensas: [premio] });
    const { productos } = crearServicios(bd);

    await expect(
      productos.crear(tenantTutor(), 'grupo-1', {
        nombre: 'Gratis',
        precio: 0,
        fuente: FuenteProducto.ITEM,
        recompensaId: premio.id,
      })
    ).rejects.toThrow(BadRequestException);
  });
});

describe('ProductosService — la vitrina', () => {
  async function vitrina(saldo: number) {
    const premio = recompensaDePrueba({ umbralZonaId: null });
    const bd = crearBdEnMemoria({
      recompensas: [premio],
      monedas: saldo > 0 ? [movimientoDePrueba({ monto: saldo })] : [],
    });
    const { productos } = crearServicios(bd);

    await productos.crear(tenantTutor(), 'grupo-1', {
      nombre: 'Bici',
      precio: 25,
      fuente: FuenteProducto.ITEM,
      recompensaId: premio.id,
    });

    return await productos.listar(tenantUsuario(), 'grupo-1');
  }

  it('con saldo suficiente, puedeComprar y no falta nada', async () => {
    const lista = await vitrina(30);

    expect(lista[0]).toMatchObject({ puedeComprar: true, faltan: 0 });
  });

  it('sin saldo suficiente dice cuánto falta (el motor del ahorro)', async () => {
    const lista = await vitrina(10);

    expect(lista[0]).toMatchObject({ puedeComprar: false, faltan: 15 });
  });

  it('el participante nunca ve productos archivados', async () => {
    const premio = recompensaDePrueba({ umbralZonaId: null });
    const bd = crearBdEnMemoria({ recompensas: [premio] });
    const { productos } = crearServicios(bd);

    const producto = await productos.crear(tenantTutor(), 'grupo-1', {
      nombre: 'Bici',
      precio: 25,
      fuente: FuenteProducto.ITEM,
      recompensaId: premio.id,
    });

    await productos.archivar(tenantTutor(), producto.id);

    await expect(productos.listar(tenantUsuario(), 'grupo-1')).resolves.toEqual([]);
    // El Tutor sí puede verlos si los pide.
    await expect(
      productos.listar(tenantTutor(), 'grupo-1', true)
    ).resolves.toHaveLength(1);
  });

  it('archivar no rompe nada: el ítem del catálogo sigue existiendo', async () => {
    const premio = recompensaDePrueba({ nombre: 'Bici', umbralZonaId: null });
    const bd = crearBdEnMemoria({ recompensas: [premio] });
    const { productos } = crearServicios(bd);

    const producto = await productos.crear(tenantTutor(), 'grupo-1', {
      nombre: 'Bici directa',
      precio: 25,
      fuente: FuenteProducto.ITEM,
      recompensaId: premio.id,
    });

    const archivado = await productos.archivar(tenantTutor(), producto.id);

    expect(archivado.estado).toBe('ARCHIVADA');
    expect(bd.recompensas[0].tipo).toBe(TipoItemCatalogo.PREMIO);
  });
});
