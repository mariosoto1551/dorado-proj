import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { TenantContext, UsuarioDto } from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  configuracionDePrueba,
  crearBdEnMemoria,
  movimientoDePrueba,
  productoDePrueba,
  type BdEnMemoria,
} from '../comun/testing/bd-en-memoria';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { BilleteraService } from './billetera.service';
import { ObjetivoService } from './objetivo.service';

/** Todo grupo con objetivo está en modo TIENDA (decisión 7). */
const EN_MODO_TIENDA = () => configuracionDePrueba({ modo: 'TIENDA' });

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

function crearServicio(opciones: { bd?: BdEnMemoria; usuarios?: UsuarioDto[] } = {}) {
  const bd = opciones.bd ?? crearBdEnMemoria();
  const identity = {
    obtenerGrupo: vi.fn(),
    obtenerUsuario: vi.fn(),
    usuariosDelGrupo: vi.fn().mockResolvedValue(opciones.usuarios ?? []),
  } as unknown as IdentityClientService;
  const eventos = {
    publicar: vi.fn(),
    publicarAccionAdministrativa: vi.fn(),
  } as unknown as EventosPublisherService;

  const acceso = new AccesoGrupoService(identity);
  const configuracion = new ConfiguracionService(bd.prisma, acceso, eventos);
  const objetivos = new ObjetivoService(bd.prisma, acceso, configuracion);

  return {
    objetivos,
    billetera: new BilleteraService(
      bd.prisma,
      acceso,
      identity,
      configuracion,
      eventos,
      objetivos
    ),
    bd,
  };
}

describe('ObjetivoService — fijar y quitar (fase-14-25)', () => {
  it('guarda el objetivo con las monedas que le faltan', async () => {
    const producto = productoDePrueba({ id: 'prod-1', nombre: 'Bici', precio: 25 });
    const bd = crearBdEnMemoria({
      configuraciones: [EN_MODO_TIENDA()],
      productos: [producto],
      monedas: [movimientoDePrueba({ monto: 14 })],
    });
    const { objetivos } = crearServicio({ bd });

    const objetivo = await objetivos.fijar(tenantUsuario(), 'grupo-1', {
      productoId: 'prod-1',
    });

    expect(objetivo).toMatchObject({ productoId: 'prod-1', nombre: 'Bici', faltan: 11 });
    expect(bd.objetivos).toHaveLength(1);
  });

  it('cambiar de objetivo pisa el anterior, no acumula (decisión 2)', async () => {
    const bd = crearBdEnMemoria({
      configuraciones: [EN_MODO_TIENDA()],
      productos: [
        productoDePrueba({ id: 'prod-1', precio: 25 }),
        productoDePrueba({ id: 'prod-2', precio: 40 }),
      ],
    });
    const { objetivos } = crearServicio({ bd });

    await objetivos.fijar(tenantUsuario(), 'grupo-1', { productoId: 'prod-1' });
    await objetivos.fijar(tenantUsuario(), 'grupo-1', { productoId: 'prod-2' });

    expect(bd.objetivos).toHaveLength(1);
    expect(bd.objetivos[0]['productoId']).toBe('prod-2');
  });

  it('quitar el objetivo lo borra, y hacerlo dos veces no falla', async () => {
    const bd = crearBdEnMemoria({
      configuraciones: [EN_MODO_TIENDA()],
      productos: [productoDePrueba({ id: 'prod-1' })],
    });
    const { objetivos } = crearServicio({ bd });

    await objetivos.fijar(tenantUsuario(), 'grupo-1', { productoId: 'prod-1' });
    await objetivos.quitar(tenantUsuario(), 'grupo-1');
    await objetivos.quitar(tenantUsuario(), 'grupo-1');

    expect(bd.objetivos).toHaveLength(0);
  });

  it('en modo DIRECTO no hay objetivo posible (decisión 7)', async () => {
    const bd = crearBdEnMemoria({
      configuraciones: [configuracionDePrueba({ modo: 'DIRECTO' })],
      productos: [productoDePrueba({ id: 'prod-1' })],
    });
    const { objetivos } = crearServicio({ bd });

    await expect(
      objetivos.fijar(tenantUsuario(), 'grupo-1', { productoId: 'prod-1' })
    ).rejects.toThrow(ConflictException);
  });

  it('rechaza un producto archivado o de otro grupo', async () => {
    const bd = crearBdEnMemoria({
      configuraciones: [EN_MODO_TIENDA()],
      productos: [
        productoDePrueba({ id: 'archivado', estado: 'ARCHIVADA' }),
        productoDePrueba({ id: 'ajeno', grupoId: 'grupo-2' }),
      ],
    });
    const { objetivos } = crearServicio({ bd });

    await expect(
      objetivos.fijar(tenantUsuario(), 'grupo-1', { productoId: 'archivado' })
    ).rejects.toThrow(BadRequestException);
    await expect(
      objetivos.fijar(tenantUsuario(), 'grupo-1', { productoId: 'ajeno' })
    ).rejects.toThrow(NotFoundException);
  });

  it('un TUTOR no tiene objetivo propio', async () => {
    const bd = crearBdEnMemoria({
      configuraciones: [EN_MODO_TIENDA()],
      productos: [productoDePrueba({ id: 'prod-1' })],
    });
    const { objetivos } = crearServicio({ bd });

    await expect(
      objetivos.fijar(tenantTutor(), 'grupo-1', { productoId: 'prod-1' })
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('ObjetivoService — cómo se lee (fase-14-25)', () => {
  it('viaja dentro de mi-billetera, con el faltante contra el saldo del momento', async () => {
    const bd = crearBdEnMemoria({
      configuraciones: [EN_MODO_TIENDA()],
      productos: [productoDePrueba({ id: 'prod-1', nombre: 'Bici', precio: 25 })],
      monedas: [movimientoDePrueba({ monto: 20 })],
    });
    const { objetivos, billetera } = crearServicio({ bd });

    await objetivos.fijar(tenantUsuario(), 'grupo-1', { productoId: 'prod-1' });
    const respuesta = await billetera.miBilletera(tenantUsuario(), 'grupo-1', {});

    expect(respuesta.objetivo).toMatchObject({ nombre: 'Bici', faltan: 5 });
  });

  it('sin objetivo elegido viaja null', async () => {
    const bd = crearBdEnMemoria({ configuraciones: [EN_MODO_TIENDA()] });
    const { billetera } = crearServicio({ bd });

    const respuesta = await billetera.miBilletera(tenantUsuario(), 'grupo-1', {});

    expect(respuesta.objetivo).toBeNull();
  });

  it('si el producto se archiva viaja null, pero la fila NO se borra (decisión 6)', async () => {
    const producto = productoDePrueba({ id: 'prod-1' });
    const bd = crearBdEnMemoria({
      configuraciones: [EN_MODO_TIENDA()],
      productos: [producto],
    });
    const { objetivos, billetera } = crearServicio({ bd });

    await objetivos.fijar(tenantUsuario(), 'grupo-1', { productoId: 'prod-1' });
    producto.estado = 'ARCHIVADA';

    const respuesta = await billetera.miBilletera(tenantUsuario(), 'grupo-1', {});

    expect(respuesta.objetivo).toBeNull();
    // Si el Tutor lo desarchiva, el objetivo vuelve solo.
    expect(bd.objetivos).toHaveLength(1);
  });

  it('el Tutor ve para qué ahorra cada integrante (decisión 4)', async () => {
    const bd = crearBdEnMemoria({
      configuraciones: [EN_MODO_TIENDA()],
      productos: [productoDePrueba({ id: 'prod-1', nombre: 'Bici', precio: 25 })],
      monedas: [movimientoDePrueba({ monto: 10, usuarioId: 'ana' })],
    });
    const { objetivos, billetera } = crearServicio({
      bd,
      usuarios: [
        { id: 'ana', nombre: 'Ana' } as UsuarioDto,
        { id: 'luis', nombre: 'Luis' } as UsuarioDto,
      ],
    });

    await objetivos.fijar(tenantUsuario('ana'), 'grupo-1', { productoId: 'prod-1' });
    const billeteras = await billetera.billeterasDelGrupo(tenantTutor(), 'grupo-1');

    expect(billeteras.find((fila) => fila.usuarioId === 'ana')).toMatchObject({
      objetivoNombre: 'Bici',
      objetivoFaltan: 15,
    });
    expect(billeteras.find((fila) => fila.usuarioId === 'luis')).toMatchObject({
      objetivoNombre: null,
      objetivoFaltan: null,
    });
  });
});
