import { BadRequestException, ConflictException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MecanicaProducto, type TenantContext } from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  configuracionDePrueba,
  crearBdEnMemoria,
  movimientoDePrueba,
  productoDePrueba,
  recompensaDePrueba,
  type BdEnMemoria,
} from '../comun/testing/bd-en-memoria';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { ComprasService } from './compras.service';

function tenantUsuario(usuarioId = 'usuario-1'): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'USUARIO',
    principalId: usuarioId,
    principalType: 'USUARIO',
  } as TenantContext;
}

function tenantTutor(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'TUTOR',
    principalId: 'tutor-1',
    principalType: 'TUTOR',
  } as TenantContext;
}

function crearServicio(bd: BdEnMemoria) {
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

  return {
    servicio: new ComprasService(
      bd.prisma,
      acceso,
      new ConfiguracionService(bd.prisma, acceso, eventos),
      eventos
    ),
    bd,
    eventos,
  };
}

/** Grupo en modo TIENDA con saldo y un producto directo de 10. */
function bdBase(extra: Parameters<typeof crearBdEnMemoria>[0] = {}) {
  const premio = recompensaDePrueba({ nombre: 'Bici', umbralZonaId: null });

  return {
    premio,
    bd: crearBdEnMemoria({
      configuraciones: [configuracionDePrueba({ modo: 'TIENDA' })],
      recompensas: [premio],
      monedas: [movimientoDePrueba({ monto: 30 })],
      productos: [
        productoDePrueba({
          nombre: 'Bici directa',
          precio: 10,
          fuente: 'ITEM',
          recompensaId: premio.id,
        }),
      ],
      ...extra,
    }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ComprasService — comprar', () => {
  it('descuenta el precio y deja la compra pendiente de entrega', async () => {
    const { bd } = bdBase();
    const { servicio, eventos } = crearServicio(bd);

    const compra = await servicio.comprar(tenantUsuario(), 'grupo-1', {
      productoId: bd.productos[0].id,
    });

    expect(compra.precioSnapshot).toBe(10);
    expect(compra.nombreRecompensaSnapshot).toBe('Bici');
    expect(compra.obtenidoPorAzar).toBe(false);
    expect(compra.estado).toBe('PENDIENTE_ENTREGA');

    // El movimiento del ledger, con signo y apuntando a la compra.
    const movimiento = bd.monedas[bd.monedas.length - 1];

    expect(movimiento.tipo).toBe('COMPRA');
    expect(movimiento.monto).toBe(-10);
    expect(movimiento.origenId).toBe(compra.id);
    expect(bd.monedas.reduce((total, fila) => total + fila.monto, 0)).toBe(20);

    expect(eventos.publicar).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'CompraRealizada' })
    );
  });

  it('EL BUG CARO: sin saldo suficiente da 409 y NO escribe nada', async () => {
    const { bd } = bdBase({ monedas: [movimientoDePrueba({ monto: 5 })] });
    const { servicio } = crearServicio(bd);

    await expect(
      servicio.comprar(tenantUsuario(), 'grupo-1', { productoId: bd.productos[0].id })
    ).rejects.toThrow(ConflictException);

    expect(bd.compras).toHaveLength(0);
    expect(bd.monedas).toHaveLength(1);
    expect(bd.monedas.reduce((total, fila) => total + fila.monto, 0)).toBe(5);
  });

  it('toma el advisory lock ANTES de leer el saldo (serializa el doble gasto)', async () => {
    const { bd } = bdBase();
    const { servicio } = crearServicio(bd);

    // El orden importa: leer el saldo ANTES de tomar el lock deja abierta
    // justo la ventana que el lock existe para cerrar.
    const orden: string[] = [];
    const cliente = bd.prisma.client as unknown as {
      $executeRaw: (...args: unknown[]) => Promise<number>;
      eventoMoneda: { aggregate: (...args: unknown[]) => Promise<unknown> };
    };

    const original = cliente.eventoMoneda.aggregate.bind(cliente.eventoMoneda);

    cliente.$executeRaw = async () => {
      orden.push('lock');

      return 0;
    };
    cliente.eventoMoneda.aggregate = async (...args: unknown[]) => {
      orden.push('saldo');

      return await original(...args);
    };

    await servicio.comprar(tenantUsuario(), 'grupo-1', { productoId: bd.productos[0].id });

    expect(orden).toEqual(['lock', 'saldo']);
  });

  it('un grupo en modo DIRECTO no tiene tienda → 409 MODO_DIRECTO', async () => {
    const { bd } = bdBase({ configuraciones: [configuracionDePrueba({ modo: 'DIRECTO' })] });
    const { servicio } = crearServicio(bd);

    await expect(
      servicio.comprar(tenantUsuario(), 'grupo-1', { productoId: bd.productos[0].id })
    ).rejects.toThrow(ConflictException);

    expect(bd.compras).toHaveLength(0);
  });

  it('un producto archivado ya no se puede comprar', async () => {
    const { bd } = bdBase();

    bd.productos[0].estado = 'ARCHIVADA';

    const { servicio } = crearServicio(bd);

    await expect(
      servicio.comprar(tenantUsuario(), 'grupo-1', { productoId: bd.productos[0].id })
    ).rejects.toThrow(ConflictException);
  });

  it('el Tutor puede comprar en nombre de un participante', async () => {
    const { bd } = bdBase({
      monedas: [movimientoDePrueba({ monto: 30, usuarioId: 'ana' })],
    });
    const { servicio } = crearServicio(bd);

    const compra = await servicio.comprar(tenantTutor(), 'grupo-1', {
      productoId: bd.productos[0].id,
      usuarioId: 'ana',
    });

    expect(compra.usuarioId).toBe('ana');
  });

  it('el Tutor sin indicar participante → 400', async () => {
    const { bd } = bdBase();
    const { servicio } = crearServicio(bd);

    await expect(
      servicio.comprar(tenantTutor(), 'grupo-1', { productoId: bd.productos[0].id })
    ).rejects.toThrow(BadRequestException);
  });
});

describe('ComprasService — los dos ejes (decisión 18)', () => {
  function bdConBolsa(mecanica: MecanicaProducto) {
    const uno = recompensaDePrueba({ nombre: 'Helado', umbralZonaId: null });
    const otro = recompensaDePrueba({ nombre: 'Cine', umbralZonaId: null });
    const bolsaId = 'bolsa-1';

    return {
      uno,
      otro,
      bd: crearBdEnMemoria({
        configuraciones: [configuracionDePrueba({ modo: 'TIENDA' })],
        recompensas: [uno, otro],
        monedas: [movimientoDePrueba({ monto: 30 })],
        bolsas: [
          {
            id: bolsaId,
            organizacionId: 'org-1',
            grupoId: 'grupo-1',
            nombre: 'Sorpresas',
            estado: 'ACTIVA',
            createdAt: new Date(),
            updatedAt: new Date(),
          } as never,
        ],
        itemsBolsa: [
          { id: 'i1', bolsaId, recompensaId: uno.id } as never,
          { id: 'i2', bolsaId, recompensaId: otro.id } as never,
        ],
        productos: [
          productoDePrueba({
            nombre: 'Sorpresa',
            precio: 10,
            fuente: 'BOLSA',
            mecanica,
            bolsaId,
          }),
        ],
      }),
    };
  }

  it('BOLSA + AZAR devuelve un ítem de la bolsa, marcado como obtenido al azar', async () => {
    const { bd, uno } = bdConBolsa(MecanicaProducto.AZAR);
    const { servicio } = crearServicio(bd);

    vi.spyOn(Math, 'random').mockReturnValue(0);

    const compra = await servicio.comprar(tenantUsuario(), 'grupo-1', {
      productoId: bd.productos[0].id,
    });

    expect(compra.recompensaId).toBe(uno.id);
    expect(compra.obtenidoPorAzar).toBe(true);
  });

  it('BOLSA + ELECCION exige elegir → 400 ELECCION_REQUERIDA', async () => {
    const { bd } = bdConBolsa(MecanicaProducto.ELECCION);
    const { servicio } = crearServicio(bd);

    await expect(
      servicio.comprar(tenantUsuario(), 'grupo-1', { productoId: bd.productos[0].id })
    ).rejects.toThrow(BadRequestException);
  });

  it('BOLSA + ELECCION con un ítem que no está en la bolsa → 400', async () => {
    const { bd } = bdConBolsa(MecanicaProducto.ELECCION);
    const ajeno = recompensaDePrueba({ nombre: 'Ajeno', umbralZonaId: null });

    bd.recompensas.push(ajeno);

    const { servicio } = crearServicio(bd);

    await expect(
      servicio.comprar(tenantUsuario(), 'grupo-1', {
        productoId: bd.productos[0].id,
        recompensaId: ajeno.id,
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('BOLSA + ELECCION con un ítem de la bolsa: se lleva ese, sin azar', async () => {
    const { bd, otro } = bdConBolsa(MecanicaProducto.ELECCION);
    const { servicio } = crearServicio(bd);

    const compra = await servicio.comprar(tenantUsuario(), 'grupo-1', {
      productoId: bd.productos[0].id,
      recompensaId: otro.id,
    });

    expect(compra.recompensaId).toBe(otro.id);
    expect(compra.obtenidoPorAzar).toBe(false);
  });

  it('EL CRITERIO DEL ÍTEM: el mismo premio en un producto directo caro y en una bolsa barata', async () => {
    const { bd, uno } = bdConBolsa(MecanicaProducto.AZAR);

    // Alcanza para las dos compras (10 + 25): acá se mide qué sale, no el saldo.
    bd.monedas.push(movimientoDePrueba({ monto: 10 }));

    bd.productos.push(
      productoDePrueba({
        nombre: 'Helado directo',
        precio: 25,
        fuente: 'ITEM',
        recompensaId: uno.id,
      })
    );

    const { servicio } = crearServicio(bd);

    vi.spyOn(Math, 'random').mockReturnValue(0);

    const sorteado = await servicio.comprar(tenantUsuario(), 'grupo-1', {
      productoId: bd.productos[0].id,
    });
    const directo = await servicio.comprar(tenantUsuario(), 'grupo-1', {
      productoId: bd.productos[1].id,
    });

    // El MISMO ítem, por dos puertas distintas, sin un solo flag en la Recompensa.
    expect(sorteado.recompensaId).toBe(uno.id);
    expect(directo.recompensaId).toBe(uno.id);
    expect(sorteado.obtenidoPorAzar).toBe(true);
    expect(directo.obtenidoPorAzar).toBe(false);
    expect(sorteado.precioSnapshot).toBe(10);
    expect(directo.precioSnapshot).toBe(25);
  });
});

describe('ComprasService — revertir, anular y entregar', () => {
  it('revertir devuelve el precio como movimiento nuevo, sin editar el original', async () => {
    const { bd } = bdBase();
    const { servicio } = crearServicio(bd);

    const compra = await servicio.comprar(tenantUsuario(), 'grupo-1', {
      productoId: bd.productos[0].id,
    });
    const movimientoCompra = bd.monedas[bd.monedas.length - 1];

    await servicio.revertir(tenantTutor(), compra.id, { motivo: 'Se arrepintió' });

    const reversion = bd.monedas[bd.monedas.length - 1];

    expect(reversion.tipo).toBe('REVERSION');
    expect(reversion.monto).toBe(10);
    // El movimiento de compra sigue intacto: compensación, no edición.
    expect(movimientoCompra.monto).toBe(-10);
    expect(bd.monedas.reduce((total, fila) => total + fila.monto, 0)).toBe(30);
    expect(bd.compras[0].revertidaEn).not.toBeNull();
  });

  it('no se puede revertir dos veces', async () => {
    const { bd } = bdBase();
    const { servicio } = crearServicio(bd);

    const compra = await servicio.comprar(tenantUsuario(), 'grupo-1', {
      productoId: bd.productos[0].id,
    });

    await servicio.revertir(tenantTutor(), compra.id, {});

    await expect(servicio.revertir(tenantTutor(), compra.id, {})).rejects.toThrow(
      ConflictException
    );
  });

  it('no se puede revertir una compra ya entregada', async () => {
    const { bd } = bdBase();
    const { servicio } = crearServicio(bd);

    const compra = await servicio.comprar(tenantUsuario(), 'grupo-1', {
      productoId: bd.productos[0].id,
    });

    await servicio.entregarCompra(tenantTutor(), compra.id);

    await expect(servicio.revertir(tenantTutor(), compra.id, {})).rejects.toThrow(
      ConflictException
    );
  });

  it('anular un castigo NO toca el ledger: el saldo sigue en 0 (decisión 21)', async () => {
    const bd = crearBdEnMemoria({
      configuraciones: [configuracionDePrueba({ modo: 'TIENDA' })],
      castigos: [
        {
          id: 'castigo-1',
          organizacionId: 'org-1',
          grupoId: 'grupo-1',
          usuarioId: 'usuario-1',
          seccionId: 'seccion-1',
          recompensaId: 'r1',
          nombreRecompensaSnapshot: 'Sin postre',
          deudaSaldada: 2,
          estado: 'PENDIENTE_ENTREGA',
          entregadaPorTutorId: null,
          entregadaEn: null,
          anuladoEn: null,
          anuladoPorTutorId: null,
          motivoAnulacion: null,
          createdAt: new Date(),
        } as never,
      ],
    });
    const { servicio } = crearServicio(bd);

    await servicio.anularCastigo(tenantTutor(), 'castigo-1', { motivo: 'Segunda oportunidad' });

    expect(bd.castigos[0].anuladoEn).not.toBeNull();
    expect(bd.castigos[0].motivoAnulacion).toBe('Segunda oportunidad');
    expect(bd.castigos[0].anuladoPorTutorId).toBe('tutor-1');
    // Lo que define la decisión 21: el ledger no se toca.
    expect(bd.monedas).toHaveLength(0);
  });

  it('anular dos veces → 409', async () => {
    const bd = crearBdEnMemoria({
      castigos: [
        {
          id: 'castigo-1',
          organizacionId: 'org-1',
          grupoId: 'grupo-1',
          usuarioId: 'usuario-1',
          seccionId: 'seccion-1',
          recompensaId: 'r1',
          nombreRecompensaSnapshot: 'Sin postre',
          deudaSaldada: 2,
          estado: 'PENDIENTE_ENTREGA',
          entregadaPorTutorId: null,
          entregadaEn: null,
          anuladoEn: new Date(),
          anuladoPorTutorId: 'tutor-1',
          motivoAnulacion: 'ya',
          createdAt: new Date(),
        } as never,
      ],
    });
    const { servicio } = crearServicio(bd);

    await expect(
      servicio.anularCastigo(tenantTutor(), 'castigo-1', { motivo: 'otra vez' })
    ).rejects.toThrow(ConflictException);
  });

  it('pendientes-entrega une compras y castigos, y excluye lo revertido y lo anulado', async () => {
    const { bd } = bdBase();
    const { servicio } = crearServicio(bd);

    const primera = await servicio.comprar(tenantUsuario(), 'grupo-1', {
      productoId: bd.productos[0].id,
    });

    await servicio.comprar(tenantUsuario(), 'grupo-1', {
      productoId: bd.productos[0].id,
    });
    await servicio.revertir(tenantTutor(), primera.id, {});

    bd.castigos.push({
      id: 'castigo-1',
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
      usuarioId: 'usuario-1',
      seccionId: 'seccion-1',
      recompensaId: 'r1',
      nombreRecompensaSnapshot: 'Sin postre',
      deudaSaldada: 2,
      estado: 'PENDIENTE_ENTREGA',
      entregadaPorTutorId: null,
      entregadaEn: null,
      anuladoEn: null,
      anuladoPorTutorId: null,
      motivoAnulacion: null,
      createdAt: new Date(),
    } as never);

    const pendientes = await servicio.pendientesDeEntrega(tenantTutor(), 'grupo-1');

    expect(pendientes).toHaveLength(2);
    expect(pendientes.map((p) => p.origen).sort()).toEqual(['CASTIGO', 'COMPRA']);
  });
});
