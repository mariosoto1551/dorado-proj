import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { TenantContext } from '@dorado/shared-types';

import { crearBdEnMemoria, registroDePrueba } from '../comun/testing/bd-en-memoria';
import { AuditoriaService } from './auditoria.service';

function tenantTutor(grupoIds = ['grupo-1']): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds,
    rol: 'TUTOR',
    principalId: 'tutor-1',
    principalType: 'TUTOR',
  } as TenantContext;
}

function tenantAdmin(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: [],
    rol: 'ORG_ADMIN',
    principalId: 'tutor-1',
    principalType: 'TUTOR',
  } as TenantContext;
}

describe('AuditoriaService — listar por grupo (solo lectura)', () => {
  it('devuelve los registros del grupo, más recientes primero, paginados', async () => {
    const bd = crearBdEnMemoria({
      registros: [
        registroDePrueba({ id: 'r1', createdAt: new Date('2026-07-18T10:00:00Z') }),
        registroDePrueba({ id: 'r2', createdAt: new Date('2026-07-18T12:00:00Z') }),
        registroDePrueba({ id: 'r3', createdAt: new Date('2026-07-18T11:00:00Z') }),
      ],
    });
    const servicio = new AuditoriaService(bd.prisma);

    const respuesta = await servicio.listarPorGrupo(tenantTutor(), 'grupo-1', {});

    expect(respuesta.total).toBe(3);
    expect(respuesta.items.map((r) => r.id)).toEqual(['r2', 'r3', 'r1']);
  });

  it('filtra por entidadTipo y entidadId', async () => {
    const bd = crearBdEnMemoria({
      registros: [
        registroDePrueba({ id: 'r1', entidadTipo: 'Actividad', entidadId: 'act-1' }),
        registroDePrueba({ id: 'r2', entidadTipo: 'UmbralZona', entidadId: 'u-1' }),
      ],
    });
    const servicio = new AuditoriaService(bd.prisma);

    const respuesta = await servicio.listarPorGrupo(tenantTutor(), 'grupo-1', {
      entidadTipo: 'UmbralZona',
      entidadId: 'u-1',
    });

    expect(respuesta.items.map((r) => r.id)).toEqual(['r2']);
  });

  it('filtra por rango de fechas desde/hasta', async () => {
    const bd = crearBdEnMemoria({
      registros: [
        registroDePrueba({ id: 'r1', createdAt: new Date('2026-07-17T10:00:00Z') }),
        registroDePrueba({ id: 'r2', createdAt: new Date('2026-07-18T10:00:00Z') }),
        registroDePrueba({ id: 'r3', createdAt: new Date('2026-07-19T10:00:00Z') }),
      ],
    });
    const servicio = new AuditoriaService(bd.prisma);

    const respuesta = await servicio.listarPorGrupo(tenantTutor(), 'grupo-1', {
      desde: '2026-07-18T00:00:00Z',
      hasta: '2026-07-18T23:59:59Z',
    });

    expect(respuesta.items.map((r) => r.id)).toEqual(['r2']);
  });

  it('un TUTOR pidiendo un grupo que no es suyo recibe 403', async () => {
    const bd = crearBdEnMemoria();
    const servicio = new AuditoriaService(bd.prisma);

    await expect(
      servicio.listarPorGrupo(tenantTutor(['grupo-1']), 'grupo-ajeno', {})
    ).rejects.toThrow(ForbiddenException);
  });

  it('un ORG_ADMIN (grupoIds vacío) puede consultar cualquier grupo de su organización', async () => {
    const bd = crearBdEnMemoria({ registros: [registroDePrueba({ grupoId: 'grupo-9' })] });
    const servicio = new AuditoriaService(bd.prisma);

    const respuesta = await servicio.listarPorGrupo(tenantAdmin(), 'grupo-9', {});

    expect(respuesta.total).toBe(1);
  });
});

describe('AuditoriaService — timeline de entidad', () => {
  it('devuelve el timeline en orden CRONOLÓGICO (criterio 4: "¿por qué me descalificaron?")', async () => {
    const bd = crearBdEnMemoria({
      registros: [
        registroDePrueba({
          id: 'r-descal',
          entidadTipo: 'Usuario',
          entidadId: 'usuario-1',
          accion: 'USUARIO_DESCALIFICADO',
          detalle: { motivo: 'trampa' },
          createdAt: new Date('2026-07-18T15:00:00Z'),
        }),
        registroDePrueba({
          id: 'r-unido',
          entidadTipo: 'Usuario',
          entidadId: 'usuario-1',
          accion: 'USUARIO_UNIDO',
          createdAt: new Date('2026-07-10T09:00:00Z'),
        }),
        registroDePrueba({ id: 'r-otro', entidadTipo: 'Usuario', entidadId: 'usuario-2' }),
      ],
    });
    const servicio = new AuditoriaService(bd.prisma);

    const timeline = await servicio.timelineDeEntidad(tenantTutor(), 'Usuario', 'usuario-1');

    expect(timeline.map((r) => r.id)).toEqual(['r-unido', 'r-descal']);
    const descal = timeline.find((r) => r.accion === 'USUARIO_DESCALIFICADO');
    expect((descal?.detalle as { motivo: string }).motivo).toBe('trampa');
  });
});
