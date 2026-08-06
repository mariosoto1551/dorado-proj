import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { TenantContext, UsuarioDto } from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import type { SeccionActualInterna, SessionClientService } from '../clientes/session-client.service';
import { crearBdEnMemoria, type BdEnMemoria } from '../comun/testing/bd-en-memoria';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { AjustesService } from './ajustes.service';

function usuarioDePrueba(id: string, grupoId = 'grupo-1'): UsuarioDto {
  return {
    id,
    organizacionId: 'org-1',
    grupoId,
    username: id,
    nombre: id,
    avatarId: 'a1',
    estado: 'ACTIVO',
    createdAt: new Date().toISOString(),
  } as UsuarioDto;
}

function tenantDePrueba(sobrescribir: Partial<TenantContext> = {}): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'TUTOR',
    principalId: 'tutor-1',
    principalType: 'TUTOR',
    ...sobrescribir,
  } as TenantContext;
}

function seccionAbierta(): SeccionActualInterna {
  return {
    id: 'seccion-1',
    estado: 'ABIERTA',
    sesiones: [
      { id: 'sesion-0', estado: 'CERRADA' },
      { id: 'sesion-1', estado: 'ABIERTA' },
    ],
  } as unknown as SeccionActualInterna;
}

function crearServicio(
  opciones: {
    bd?: BdEnMemoria;
    usuarios?: UsuarioDto[];
    seccion?: SeccionActualInterna | null;
  } = {}
) {
  const bd = opciones.bd ?? crearBdEnMemoria();
  const usuarios = opciones.usuarios ?? [usuarioDePrueba('usuario-1')];
  const identity = {
    obtenerUsuario: vi.fn(async (id: string) => usuarios.find((u) => u.id === id) ?? null),
  } as unknown as IdentityClientService;
  const session = {
    obtenerSeccionActual: vi.fn(
      async () => (opciones.seccion === undefined ? seccionAbierta() : opciones.seccion)
    ),
  } as unknown as SessionClientService;
  const eventos = {
    publicarAccionAdministrativa: vi.fn(async () => undefined),
  } as unknown as EventosPublisherService;

  return {
    servicio: new AjustesService(bd.prisma, identity, session, eventos),
    bd,
    eventos,
  };
}

describe('AjustesService — ajuste manual de puntos (fase-14-31)', () => {
  it('escribe UNA fila nueva AJUSTE_MANUAL, con su motivo y sin fila de origen', async () => {
    const { servicio, bd } = crearServicio();

    const dto = await servicio.ajustar(tenantDePrueba(), 'grupo-1', 'usuario-1', {
      puntos: 10,
      motivo: 'ayudó con la mudanza',
    });

    expect(bd.eventosPuntos).toHaveLength(1);
    expect(bd.eventosPuntos[0]).toMatchObject({
      usuarioId: 'usuario-1',
      seccionId: 'seccion-1',
      sesionId: 'sesion-1',
      tipoOrigen: 'AJUSTE_MANUAL',
      origenId: null,
      puntosSnapshot: 10,
      motivoCorreccion: 'ayudó con la mudanza',
      registradoPorId: 'tutor-1',
    });
    expect(dto.tipoOrigen).toBe('AJUSTE_MANUAL');
  });

  it('acepta un ajuste negativo sin piso en 0 (a diferencia de las monedas)', async () => {
    const { servicio, bd } = crearServicio();

    await servicio.ajustar(tenantDePrueba(), 'grupo-1', 'usuario-1', {
      puntos: -40,
      motivo: 'rompió el vidrio',
    });

    // Un puntaje negativo es un estado legítimo: la zona Rojo existe y su
    // puntosMin puede ser negativo. Un saldo de monedas negativo no lo es.
    expect(bd.eventosPuntos[0].puntosSnapshot).toBe(-40);
  });

  it('deja rastro en auditoría con la acción PUNTOS_AJUSTADOS', async () => {
    const { servicio, eventos } = crearServicio();

    await servicio.ajustar(tenantDePrueba(), 'grupo-1', 'usuario-1', {
      puntos: 5,
      motivo: 'ayudó',
    });

    expect(eventos.publicarAccionAdministrativa).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'PUNTOS_AJUSTADOS',
        entidadTipo: 'EventoPuntos',
        detalle: expect.objectContaining({ puntos: 5, motivo: 'ayudó', usuarioId: 'usuario-1' }),
      })
    );
  });

  it('sin sesión abierta falla con 409 y NO escribe nada', async () => {
    const { servicio, bd } = crearServicio({ seccion: null });

    await expect(
      servicio.ajustar(tenantDePrueba(), 'grupo-1', 'usuario-1', { puntos: 10, motivo: 'x' })
    ).rejects.toThrow(ConflictException);
    expect(bd.eventosPuntos).toHaveLength(0);
  });

  it('con la sección en EVALUACION tampoco escribe: no hay dónde caer', async () => {
    const seccion = { ...seccionAbierta(), estado: 'EVALUACION' } as SeccionActualInterna;
    const { servicio, bd } = crearServicio({ seccion });

    await expect(
      servicio.ajustar(tenantDePrueba(), 'grupo-1', 'usuario-1', { puntos: 10, motivo: 'x' })
    ).rejects.toThrow(ConflictException);
    expect(bd.eventosPuntos).toHaveLength(0);
  });

  it('un TUTOR sin ese grupo en el JWT no puede ajustar', async () => {
    const { servicio, bd } = crearServicio();

    await expect(
      servicio.ajustar(tenantDePrueba({ grupoIds: ['otro-grupo'] }), 'grupo-1', 'usuario-1', {
        puntos: 10,
        motivo: 'x',
      })
    ).rejects.toThrow(ForbiddenException);
    expect(bd.eventosPuntos).toHaveLength(0);
  });

  it('un usuario de otra organización da 404 (no se revela existencia)', async () => {
    const ajeno = { ...usuarioDePrueba('usuario-2'), organizacionId: 'org-2' } as UsuarioDto;
    const { servicio } = crearServicio({ usuarios: [ajeno] });

    await expect(
      servicio.ajustar(tenantDePrueba(), 'grupo-1', 'usuario-2', { puntos: 10, motivo: 'x' })
    ).rejects.toThrow(NotFoundException);
  });

  it('un usuario de otro grupo de la MISMA organización también da 404', async () => {
    const otroGrupo = usuarioDePrueba('usuario-3', 'grupo-2');
    const { servicio } = crearServicio({ usuarios: [otroGrupo] });

    await expect(
      servicio.ajustar(
        tenantDePrueba({ grupoIds: ['grupo-1', 'grupo-2'] }),
        'grupo-1',
        'usuario-3',
        { puntos: 10, motivo: 'x' }
      )
    ).rejects.toThrow(NotFoundException);
  });
});
