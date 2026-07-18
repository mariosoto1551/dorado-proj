import { randomUUID } from 'node:crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { TenantContext, UsuarioDto } from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  crearBdEnMemoria,
  eventoPuntosDePrueba,
  umbralDePrueba,
  type BdEnMemoria,
} from '../comun/testing/bd-en-memoria';
import { EvaluacionService } from '../consumo/evaluacion.service';
import type { SessionClientService } from '../clientes/session-client.service';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { PuntajesService } from './puntajes.service';

const UMBRALES = [
  umbralDePrueba({ id: 'umbral-rojo', nombreZona: 'Rojo', orden: 1, puntosMin: -1000, puntosMax: 49 }),
  umbralDePrueba({ id: 'umbral-verde', nombreZona: 'Verde', orden: 2, puntosMin: 50, puntosMax: null }),
];

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
  };
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

function crearServicio(opciones: { bd?: BdEnMemoria; usuarios?: UsuarioDto[] } = {}) {
  const bd = opciones.bd ?? crearBdEnMemoria({ umbrales: UMBRALES });
  const usuarios = opciones.usuarios ?? [usuarioDePrueba('usuario-1')];

  const identity = {
    obtenerUsuario: vi.fn(async (id: string) => usuarios.find((usuario) => usuario.id === id) ?? null),
    obtenerGrupo: vi.fn(async () => ({
      id: 'grupo-1',
      organizacionId: 'org-1',
      nombre: 'Grupo',
      timezone: 'America/La_Paz',
      createdAt: new Date().toISOString(),
    })),
    usuariosDelGrupo: vi.fn(async () => usuarios),
  } as unknown as IdentityClientService;

  const session = { configuracionDelGrupo: vi.fn() } as unknown as SessionClientService;
  const eventos = { publicar: vi.fn(), publicarTodos: vi.fn() } as unknown as EventosPublisherService;

  const evaluacion = new EvaluacionService(bd.prisma, identity, session, eventos);
  const servicio = new PuntajesService(
    bd.prisma,
    identity,
    new AccesoGrupoService(identity),
    evaluacion
  );

  return { servicio, bd };
}

describe('PuntajesService — puntaje de un usuario', () => {
  it('sin ResultadoSeccion calcula EN VIVO desde el ledger (preview)', async () => {
    const bd = crearBdEnMemoria({
      umbrales: UMBRALES,
      eventosPuntos: [
        eventoPuntosDePrueba({ usuarioId: 'usuario-1', puntosSnapshot: 40 }),
        eventoPuntosDePrueba({ usuarioId: 'usuario-1', puntosSnapshot: 20 }),
        eventoPuntosDePrueba({ usuarioId: 'otro', puntosSnapshot: 500 }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    const puntaje = await servicio.puntajeDeUsuario(tenantDePrueba(), 'usuario-1', 'seccion-1');

    expect(puntaje).toMatchObject({
      usuarioId: 'usuario-1',
      puntajeTotal: 60,
      descalificado: false,
    });
    expect(puntaje.zona?.id).toBe('umbral-verde');
  });

  it('con ResultadoSeccion devuelve el snapshot tal cual, ignorando el ledger posterior', async () => {
    const bd = crearBdEnMemoria({
      umbrales: UMBRALES,
      // El ledger ya tiene una corrección posterior que NO debe afectar el snapshot.
      eventosPuntos: [eventoPuntosDePrueba({ usuarioId: 'usuario-1', puntosSnapshot: 999 })],
    });
    bd.resultados.push({
      id: randomUUID(),
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
      usuarioId: 'usuario-1',
      seccionId: 'seccion-1',
      puntajeTotal: 42,
      umbralZonaId: 'umbral-rojo',
      nombreZona: 'Rojo',
      descalificado: false,
      calculadoEn: new Date(),
    });
    const { servicio } = crearServicio({ bd });

    const puntaje = await servicio.puntajeDeUsuario(tenantDePrueba(), 'usuario-1', 'seccion-1');

    expect(puntaje.puntajeTotal).toBe(42);
    expect(puntaje.zona?.id).toBe('umbral-rojo');
  });

  it('un USUARIO solo puede consultar su propio puntaje', async () => {
    const { servicio } = crearServicio();
    const usuario = tenantDePrueba({
      rol: 'USUARIO',
      principalType: 'USUARIO',
      principalId: 'usuario-1',
    } as Partial<TenantContext>);

    await expect(
      servicio.puntajeDeUsuario(usuario, 'usuario-ajeno', 'seccion-1')
    ).rejects.toThrow(ForbiddenException);
  });

  it('un usuario de OTRA organización responde 404 (no revela existencia)', async () => {
    const { servicio } = crearServicio({
      usuarios: [{ ...usuarioDePrueba('usuario-1'), organizacionId: 'org-ajena' }],
    });

    await expect(
      servicio.puntajeDeUsuario(tenantDePrueba(), 'usuario-1', 'seccion-1')
    ).rejects.toThrow(NotFoundException);
  });

  it('un TUTOR sin el grupo del usuario recibe 403', async () => {
    const { servicio } = crearServicio({ usuarios: [usuarioDePrueba('usuario-1', 'grupo-2')] });

    await expect(
      servicio.puntajeDeUsuario(tenantDePrueba(), 'usuario-1', 'seccion-1')
    ).rejects.toThrow(ForbiddenException);
  });

  it('un usuario descalificado en vivo aparece descalificado y sin zona', async () => {
    const bd = crearBdEnMemoria({ umbrales: UMBRALES });
    bd.descalificaciones.push({
      id: randomUUID(),
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
      usuarioId: 'usuario-1',
      seccionId: 'seccion-1',
      motivo: 'trampa',
      registradaPorTutorId: 'tutor-1',
      createdAt: new Date(),
    });
    const { servicio } = crearServicio({ bd });

    const puntaje = await servicio.puntajeDeUsuario(tenantDePrueba(), 'usuario-1', 'seccion-1');

    expect(puntaje.descalificado).toBe(true);
    expect(puntaje.zona).toBeNull();
  });
});

describe('PuntajesService — puntajes del grupo', () => {
  it('sin snapshots lista en vivo a todos los ACTIVO, de mayor a menor', async () => {
    const bd = crearBdEnMemoria({
      umbrales: UMBRALES,
      eventosPuntos: [
        eventoPuntosDePrueba({ usuarioId: 'usuario-1', puntosSnapshot: 10 }),
        eventoPuntosDePrueba({ usuarioId: 'usuario-2', puntosSnapshot: 80 }),
      ],
    });
    const { servicio } = crearServicio({
      bd,
      usuarios: [usuarioDePrueba('usuario-1'), usuarioDePrueba('usuario-2')],
    });

    const puntajes = await servicio.puntajesDeGrupo(tenantDePrueba(), 'grupo-1', 'seccion-1');

    expect(puntajes.map((puntaje) => puntaje.usuarioId)).toEqual(['usuario-2', 'usuario-1']);
    expect(puntajes[0].zona?.id).toBe('umbral-verde');
  });

  it('con snapshots escritos devuelve los ResultadoSeccion, no el ledger', async () => {
    const bd = crearBdEnMemoria({
      umbrales: UMBRALES,
      eventosPuntos: [eventoPuntosDePrueba({ usuarioId: 'usuario-1', puntosSnapshot: 999 })],
    });
    bd.resultados.push({
      id: randomUUID(),
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
      usuarioId: 'usuario-1',
      seccionId: 'seccion-1',
      puntajeTotal: 30,
      umbralZonaId: 'umbral-rojo',
      nombreZona: 'Rojo',
      descalificado: false,
      calculadoEn: new Date(),
    });
    const { servicio } = crearServicio({ bd });

    const puntajes = await servicio.puntajesDeGrupo(tenantDePrueba(), 'grupo-1', 'seccion-1');

    expect(puntajes).toHaveLength(1);
    expect(puntajes[0].puntajeTotal).toBe(30);
  });

  it('un TUTOR sin el grupo recibe 403 antes de tocar identity', async () => {
    const { servicio } = crearServicio();

    await expect(
      servicio.puntajesDeGrupo(tenantDePrueba(), 'grupo-ajeno', 'seccion-1')
    ).rejects.toThrow(ForbiddenException);
  });
});
