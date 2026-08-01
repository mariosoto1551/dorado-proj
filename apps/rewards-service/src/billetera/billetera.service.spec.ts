import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { TipoMovimientoMoneda, type TenantContext, type UsuarioDto } from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  configuracionDePrueba,
  crearBdEnMemoria,
  movimientoDePrueba,
  type BdEnMemoria,
} from '../comun/testing/bd-en-memoria';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { BilleteraService } from './billetera.service';

function tenantTutor(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'TUTOR',
    principalId: 'tutor-1',
    principalType: 'TUTOR',
  } as TenantContext;
}

function tenantUsuario(usuarioId = 'usuario-1'): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'USUARIO',
    principalId: usuarioId,
    principalType: 'USUARIO',
  } as TenantContext;
}

function usuarioDto(id: string, nombre: string): UsuarioDto {
  return { id, nombre } as UsuarioDto;
}

function crearServicio(
  opciones: { bd?: BdEnMemoria; usuarios?: UsuarioDto[] } = {}
) {
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

  return {
    servicio: new BilleteraService(bd.prisma, acceso, identity, configuracion, eventos),
    bd,
    eventos,
  };
}

describe('BilleteraService — el saldo es derivado (regla 1)', () => {
  it('sin movimientos, el saldo es 0', async () => {
    const { servicio } = crearServicio();

    await expect(servicio.saldoDe('grupo-1', 'usuario-1')).resolves.toBe(0);
  });

  it('el saldo es la SUMA del ledger, con signo', async () => {
    const bd = crearBdEnMemoria({
      monedas: [
        movimientoDePrueba({ monto: 25 }),
        movimientoDePrueba({ monto: -10, tipo: 'COMPRA' }),
        movimientoDePrueba({ monto: 12 }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    await expect(servicio.saldoDe('grupo-1', 'usuario-1')).resolves.toBe(27);
  });

  it('no mezcla el saldo de otro participante ni de otro grupo', async () => {
    const bd = crearBdEnMemoria({
      monedas: [
        movimientoDePrueba({ monto: 100, usuarioId: 'otro-usuario' }),
        movimientoDePrueba({ monto: 100, grupoId: 'grupo-2' }),
        movimientoDePrueba({ monto: 7 }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    await expect(servicio.saldoDe('grupo-1', 'usuario-1')).resolves.toBe(7);
  });

  it('registrarMovimiento solo AGREGA filas, nunca edita', async () => {
    const { servicio, bd } = crearServicio();

    await servicio.registrarMovimiento({
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
      usuarioId: 'usuario-1',
      tipo: TipoMovimientoMoneda.RENDIMIENTO_ZONA,
      monto: 12,
      registradoPorId: 'SYSTEM',
      registradoPorTipo: 'SYSTEM',
    });
    await servicio.registrarMovimiento({
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
      usuarioId: 'usuario-1',
      tipo: TipoMovimientoMoneda.COMPRA,
      monto: -5,
      registradoPorId: 'usuario-1',
      registradoPorTipo: 'USUARIO',
    });

    expect(bd.monedas).toHaveLength(2);
    await expect(servicio.saldoDe('grupo-1', 'usuario-1')).resolves.toBe(7);
  });
});

describe('BilleteraService — mi-billetera', () => {
  it('devuelve saldo, el nombre de la moneda del grupo y los movimientos', async () => {
    const bd = crearBdEnMemoria({
      configuraciones: [
        configuracionDePrueba({ nombreMoneda: 'Doradas', iconoMoneda: '⭐' }),
      ],
      monedas: [movimientoDePrueba({ monto: 12 }), movimientoDePrueba({ monto: -5 })],
    });
    const { servicio } = crearServicio({ bd });

    const billetera = await servicio.miBilletera(tenantUsuario(), 'grupo-1', {});

    expect(billetera.saldo).toBe(7);
    expect(billetera.nombreMoneda).toBe('Doradas');
    expect(billetera.iconoMoneda).toBe('⭐');
    expect(billetera.movimientos).toHaveLength(2);
    expect(billetera.total).toBe(2);
  });

  it('solo trae los movimientos del propio participante', async () => {
    const bd = crearBdEnMemoria({
      monedas: [
        movimientoDePrueba({ monto: 99, usuarioId: 'otro-usuario' }),
        movimientoDePrueba({ monto: 12 }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    const billetera = await servicio.miBilletera(tenantUsuario(), 'grupo-1', {});

    expect(billetera.saldo).toBe(12);
    expect(billetera.movimientos).toHaveLength(1);
  });

  it('pagina el historial', async () => {
    const bd = crearBdEnMemoria({
      monedas: [
        movimientoDePrueba({ monto: 1 }),
        movimientoDePrueba({ monto: 2 }),
        movimientoDePrueba({ monto: 3 }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    const billetera = await servicio.miBilletera(tenantUsuario(), 'grupo-1', {
      offset: 1,
      limite: 1,
    });

    expect(billetera.movimientos).toHaveLength(1);
    // El saldo NO se pagina: sigue siendo la suma completa del ledger.
    expect(billetera.saldo).toBe(6);
    expect(billetera.total).toBe(3);
  });

  it('un TUTOR no tiene billetera propia', async () => {
    const { servicio } = crearServicio();

    await expect(servicio.miBilletera(tenantTutor(), 'grupo-1', {})).rejects.toThrow(
      ForbiddenException
    );
  });

  it('rechaza pedir la billetera de un grupo ajeno', async () => {
    const { servicio } = crearServicio();

    await expect(
      servicio.miBilletera(tenantUsuario(), 'grupo-de-otro', {})
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('BilleteraService — billeteras del grupo (Tutor)', () => {
  it('incluye a los participantes SIN movimientos, en cero', async () => {
    const bd = crearBdEnMemoria({
      monedas: [movimientoDePrueba({ monto: 30, usuarioId: 'ana' })],
    });
    const { servicio } = crearServicio({
      bd,
      usuarios: [usuarioDto('ana', 'Ana'), usuarioDto('luis', 'Luis')],
    });

    const billeteras = await servicio.billeterasDelGrupo(tenantTutor(), 'grupo-1');

    expect(billeteras).toEqual([
      expect.objectContaining({ usuarioId: 'ana', saldo: 30 }),
      expect.objectContaining({ usuarioId: 'luis', saldo: 0 }),
    ]);
  });

  it('agrupa correctamente varios movimientos por participante', async () => {
    const bd = crearBdEnMemoria({
      monedas: [
        movimientoDePrueba({ monto: 25, usuarioId: 'ana' }),
        movimientoDePrueba({ monto: -10, usuarioId: 'ana', tipo: 'COMPRA' }),
        movimientoDePrueba({ monto: 5, usuarioId: 'luis' }),
      ],
    });
    const { servicio } = crearServicio({
      bd,
      usuarios: [usuarioDto('ana', 'Ana'), usuarioDto('luis', 'Luis')],
    });

    const billeteras = await servicio.billeterasDelGrupo(tenantTutor(), 'grupo-1');

    expect(billeteras[0].saldo).toBe(15);
    expect(billeteras[1].saldo).toBe(5);
  });
});

describe('BilleteraService — ajuste del Tutor', () => {
  it('acredita y devuelve el saldo resultante', async () => {
    const { servicio, bd } = crearServicio();

    const billetera = await servicio.ajustar(tenantTutor(), 'grupo-1', 'usuario-1', {
      monto: 15,
      motivo: 'Ayudó con la mudanza',
    });

    expect(billetera.saldo).toBe(15);
    expect(bd.monedas[0].tipo).toBe('AJUSTE_TUTOR');
    expect(bd.monedas[0].motivo).toBe('Ayudó con la mudanza');
    expect(bd.monedas[0].registradoPorTipo).toBe('TUTOR');
  });

  it('descuenta cuando el saldo alcanza', async () => {
    const bd = crearBdEnMemoria({ monedas: [movimientoDePrueba({ monto: 20 })] });
    const { servicio } = crearServicio({ bd });

    const billetera = await servicio.ajustar(tenantTutor(), 'grupo-1', 'usuario-1', {
      monto: -8,
      motivo: 'Rompió el vidrio',
    });

    expect(billetera.saldo).toBe(12);
  });

  it('NO puede dejar el saldo en negativo', async () => {
    const bd = crearBdEnMemoria({ monedas: [movimientoDePrueba({ monto: 5 })] });
    const { servicio } = crearServicio({ bd });

    await expect(
      servicio.ajustar(tenantTutor(), 'grupo-1', 'usuario-1', {
        monto: -10,
        motivo: 'Se pasó de la raya',
      })
    ).rejects.toThrow(BadRequestException);

    // Y no escribió nada: el ledger queda intacto.
    expect(bd.monedas).toHaveLength(1);
  });

  it('rechaza un ajuste de 0', async () => {
    const { servicio, bd } = crearServicio();

    await expect(
      servicio.ajustar(tenantTutor(), 'grupo-1', 'usuario-1', { monto: 0, motivo: 'nada' })
    ).rejects.toThrow(BadRequestException);

    expect(bd.monedas).toHaveLength(0);
  });

  it('la organizacionId sale del JWT, nunca del cliente (regla 3)', async () => {
    const { servicio, bd } = crearServicio();

    await servicio.ajustar(tenantTutor(), 'grupo-1', 'usuario-1', {
      monto: 3,
      motivo: 'Premio suelto',
    });

    expect(bd.monedas[0].organizacionId).toBe('org-1');
  });

  it('publica el rastro de auditoría con el saldo antes y después', async () => {
    const bd = crearBdEnMemoria({ monedas: [movimientoDePrueba({ monto: 20 })] });
    const { servicio, eventos } = crearServicio({ bd });

    await servicio.ajustar(tenantTutor(), 'grupo-1', 'usuario-1', {
      monto: -8,
      motivo: 'Rompió el vidrio',
    });

    expect(eventos.publicarAccionAdministrativa).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'AJUSTE_MONEDAS',
        entidadTipo: 'EventoMoneda',
        detalle: expect.objectContaining({
          usuarioId: 'usuario-1',
          monto: -8,
          saldoAntes: 20,
          saldoDespues: 12,
        }),
      })
    );
  });

  it('rechaza ajustar en un grupo ajeno', async () => {
    const { servicio } = crearServicio();

    await expect(
      servicio.ajustar(tenantTutor(), 'grupo-de-otro', 'usuario-1', {
        monto: 5,
        motivo: 'x',
      })
    ).rejects.toThrow(ForbiddenException);
  });
});
