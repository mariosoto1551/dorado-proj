import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { TenantContext } from '@dorado/shared-types';

import {
  crearBdEnMemoria,
  notificacionDePrueba,
} from '../comun/testing/bd-en-memoria';
import { NotificacionesService } from './notificaciones.service';

function tenantUsuario(principalId = 'usuario-1'): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'USUARIO',
    principalId,
    principalType: 'USUARIO',
  } as TenantContext;
}

describe('NotificacionesService — solo las propias (destinatario del JWT)', () => {
  it('mis-notificaciones devuelve solo las del destinatario, createdAt desc', async () => {
    const bd = crearBdEnMemoria({
      notificaciones: [
        notificacionDePrueba({ id: 'n1', destinatarioId: 'usuario-1', createdAt: new Date('2026-07-18T10:00:00Z') }),
        notificacionDePrueba({ id: 'n2', destinatarioId: 'usuario-1', createdAt: new Date('2026-07-18T12:00:00Z') }),
        notificacionDePrueba({ id: 'n3', destinatarioId: 'usuario-ajeno' }),
      ],
    });
    const servicio = new NotificacionesService(bd.prisma);

    const respuesta = await servicio.misNotificaciones(tenantUsuario(), {});

    expect(respuesta.total).toBe(2);
    expect(respuesta.items.map((n) => n.id)).toEqual(['n2', 'n1']);
  });

  it('filtra por leida=false', async () => {
    const bd = crearBdEnMemoria({
      notificaciones: [
        notificacionDePrueba({ id: 'n1', destinatarioId: 'usuario-1', leida: false }),
        notificacionDePrueba({ id: 'n2', destinatarioId: 'usuario-1', leida: true }),
      ],
    });
    const servicio = new NotificacionesService(bd.prisma);

    const respuesta = await servicio.misNotificaciones(tenantUsuario(), { leida: 'false' });

    expect(respuesta.items.map((n) => n.id)).toEqual(['n1']);
  });

  it('pagina con skip/take', async () => {
    const bd = crearBdEnMemoria({
      notificaciones: Array.from({ length: 5 }, (_, i) =>
        notificacionDePrueba({
          id: `n${i}`,
          destinatarioId: 'usuario-1',
          createdAt: new Date(2026, 6, 18, 10, i),
        })
      ),
    });
    const servicio = new NotificacionesService(bd.prisma);

    const pagina2 = await servicio.misNotificaciones(tenantUsuario(), { pagina: 2, porPagina: 2 });

    expect(pagina2.total).toBe(5);
    expect(pagina2.items).toHaveLength(2);
    // desc por fecha: n4,n3 | n2,n1 | n0 → página 2 = n2,n1
    expect(pagina2.items.map((n) => n.id)).toEqual(['n2', 'n1']);
  });

  it('el contador de no leídas cuenta solo las propias sin leer', async () => {
    const bd = crearBdEnMemoria({
      notificaciones: [
        notificacionDePrueba({ destinatarioId: 'usuario-1', leida: false }),
        notificacionDePrueba({ destinatarioId: 'usuario-1', leida: false }),
        notificacionDePrueba({ destinatarioId: 'usuario-1', leida: true }),
        notificacionDePrueba({ destinatarioId: 'usuario-ajeno', leida: false }),
      ],
    });
    const servicio = new NotificacionesService(bd.prisma);

    const { count } = await servicio.contarNoLeidas(tenantUsuario());

    expect(count).toBe(2);
  });
});

describe('NotificacionesService — marcar leídas', () => {
  it('marcar una leída NO afecta a las demás (criterio 2)', async () => {
    const bd = crearBdEnMemoria({
      notificaciones: [
        notificacionDePrueba({ id: 'n1', destinatarioId: 'usuario-1', leida: false }),
        notificacionDePrueba({ id: 'n2', destinatarioId: 'usuario-1', leida: false }),
      ],
    });
    const servicio = new NotificacionesService(bd.prisma);

    await servicio.marcarLeida(tenantUsuario(), 'n1');

    expect(bd.notificaciones.find((n) => n.id === 'n1')?.leida).toBe(true);
    expect(bd.notificaciones.find((n) => n.id === 'n2')?.leida).toBe(false);
  });

  it('no se puede marcar leída una notificación ajena (404)', async () => {
    const bd = crearBdEnMemoria({
      notificaciones: [notificacionDePrueba({ id: 'n1', destinatarioId: 'usuario-ajeno' })],
    });
    const servicio = new NotificacionesService(bd.prisma);

    await expect(servicio.marcarLeida(tenantUsuario(), 'n1')).rejects.toThrow(NotFoundException);
    expect(bd.notificaciones[0].leida).toBe(false);
  });

  it('leer-todas baja el contador a 0 (criterio 3) sin tocar las ajenas', async () => {
    const bd = crearBdEnMemoria({
      notificaciones: [
        notificacionDePrueba({ destinatarioId: 'usuario-1', leida: false }),
        notificacionDePrueba({ destinatarioId: 'usuario-1', leida: false }),
        notificacionDePrueba({ destinatarioId: 'usuario-ajeno', leida: false }),
      ],
    });
    const servicio = new NotificacionesService(bd.prisma);

    const { actualizadas } = await servicio.marcarTodasLeidas(tenantUsuario());
    const { count } = await servicio.contarNoLeidas(tenantUsuario());

    expect(actualizadas).toBe(2);
    expect(count).toBe(0);
    // La ajena sigue sin leer.
    expect(bd.notificaciones.find((n) => n.destinatarioId === 'usuario-ajeno')?.leida).toBe(false);
  });
});
