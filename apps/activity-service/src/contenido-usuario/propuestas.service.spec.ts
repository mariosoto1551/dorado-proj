import { describe, expect, it, vi } from 'vitest';

import type { EntitlementsDto, TenantContext, UsuarioDto } from '@dorado/shared-types';
import { ModoCreacionContenidoUsuario } from '@dorado/shared-types';

import type { BillingClientService } from '../clientes/billing-client.service';
import type { IdentityClientService } from '../clientes/identity-client.service';
import type { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  AutorYaNoEstaEnElGrupoException,
  PropuestaNoEncontradaException,
  PropuestaYaResueltaException,
  PuntosSobreTopeDelGrupoException,
} from '../comun/excepciones';
import type {
  EventoAPublicar,
  EventosPublisherService,
} from '../eventos/eventos-publisher.service';
import type { PropuestaActividad } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ConfiguracionContenidoService } from './configuracion-contenido.service';
import { PropuestasService } from './propuestas.service';

const ENTITLEMENTS_PRO: EntitlementsDto = {
  plan: 'PRO',
  limites: { tutores: null, usuarios: null, grupos: null, actividadesPorGrupo: null },
  features: { whiteLabel: true, reportesAvanzados: true },
} as EntitlementsDto;

function tenantTutor(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'TUTOR',
    principalId: 'tutor-1',
    principalType: 'TUTOR',
  } as TenantContext;
}

function propuestaDePrueba(sobrescribir: Partial<PropuestaActividad> = {}): PropuestaActividad {
  return {
    id: 'prop-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    creadaPorUsuarioId: 'usuario-1',
    nombre: 'Practicar guitarra',
    descripcion: null,
    valorPuntos: 3,
    repeticionesMaximasSesion: 1,
    estado: 'PENDIENTE',
    modoAlCrear: 'BAJO_APROBACION',
    resueltoPorId: null,
    resueltoPorTipo: null,
    resueltoEn: null,
    motivoRechazo: null,
    actividadId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...sobrescribir,
  } as PropuestaActividad;
}

function usuarioDePrueba(sobrescribir: Partial<UsuarioDto> = {}): UsuarioDto {
  return {
    id: 'usuario-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    username: 'usuario1',
    nombre: 'Usuario Uno',
    avatarId: 'a1',
    estado: 'ACTIVO',
    createdAt: new Date().toISOString(),
    ...sobrescribir,
  };
}

interface Opciones {
  propuesta?: PropuestaActividad | null;
  usuariosDelGrupo?: UsuarioDto[];
  maxPuntos?: number;
}

function crearServicio(opciones: Opciones = {}) {
  const crearActividad = vi.fn().mockResolvedValue({ id: 'act-nueva' });
  const actualizarPropuesta = vi.fn().mockResolvedValue({ count: 1 });

  const client = {
    actividad: { create: crearActividad, count: vi.fn().mockResolvedValue(0) },
    propuestaActividad: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          opciones.propuesta === undefined ? propuestaDePrueba() : opciones.propuesta
        ),
      findMany: vi.fn().mockResolvedValue([propuestaDePrueba()]),
      updateMany: actualizarPropuesta,
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => await fn(client),
  };
  const prisma = { client } as unknown as PrismaService;

  const billing = {
    resolveEntitlements: vi.fn().mockResolvedValue(ENTITLEMENTS_PRO),
  } as unknown as BillingClientService;

  const identity = {
    usuariosDelGrupo: vi
      .fn()
      .mockResolvedValue(opciones.usuariosDelGrupo ?? [usuarioDePrueba()]),
  } as unknown as IdentityClientService;

  const acceso = {
    asegurarAccesoLectura: vi.fn(),
    asegurarAccesoEscritura: vi.fn().mockResolvedValue(undefined),
  } as unknown as AccesoGrupoService;

  const configuracion = {
    resolver: vi.fn().mockResolvedValue({
      grupoId: 'grupo-1',
      modoCreacionUsuario: ModoCreacionContenidoUsuario.BAJO_APROBACION,
      maxPuntosActividadUsuario: opciones.maxPuntos ?? 5,
      maxActividadesActivasPorUsuario: 5,
    }),
  } as unknown as ConfiguracionContenidoService;

  const publicados: EventoAPublicar<unknown>[] = [];
  const eventos = {
    publicar: vi.fn(async (evento: EventoAPublicar<unknown>) => {
      publicados.push(evento);
    }),
    publicarAccionAdministrativa: vi.fn(),
  } as unknown as EventosPublisherService;

  return {
    servicio: new PropuestasService(
      prisma,
      billing,
      identity,
      acceso,
      configuracion,
      eventos
    ),
    crearActividad,
    actualizarPropuesta,
    publicados,
  };
}

describe('PropuestasService — aprobar (fase-14-10)', () => {
  it('aprobar crea la Actividad personal del AUTOR (no del tutor) y marca APROBADA', async () => {
    const { servicio, crearActividad, actualizarPropuesta, publicados } = crearServicio();

    const resuelta = await servicio.aprobar(tenantTutor(), 'prop-1');

    expect(crearActividad.mock.calls[0][0].data).toMatchObject({
      origen: 'USUARIO',
      creadaPorUsuarioId: 'usuario-1',
      // El Tutor que aprueba es quien la puso en el catálogo.
      creadaPorTutorId: 'tutor-1',
      estado: 'ACTIVA',
      tipoPuntaje: 'OPCIONAL',
      valorPuntos: 3,
    });
    expect(actualizarPropuesta.mock.calls[0][0].data).toMatchObject({
      estado: 'APROBADA',
      resueltoPorTipo: 'TUTOR',
      actividadId: 'act-nueva',
    });
    expect(resuelta.estado).toBe('APROBADA');
    expect(publicados[0]).toMatchObject({
      eventType: 'ActividadPropuestaResuelta',
      routingKey: 'activity.actividad_propuesta_resuelta',
    });
    expect(publicados[0].payload).toMatchObject({
      estado: 'APROBADA',
      creadaPorUsuarioId: 'usuario-1',
    });
  });

  it('aprobar una ya resuelta: 409 PROPUESTA_YA_RESUELTA (no crea una segunda actividad)', async () => {
    const { servicio, crearActividad } = crearServicio({
      propuesta: propuestaDePrueba({ estado: 'APROBADA' }),
    });

    await expect(servicio.aprobar(tenantTutor(), 'prop-1')).rejects.toThrow(
      PropuestaYaResueltaException
    );
    expect(crearActividad).not.toHaveBeenCalled();
  });

  it('propuesta inexistente: 404 PROPUESTA_NO_ENCONTRADA', async () => {
    const { servicio } = crearServicio({ propuesta: null });

    await expect(servicio.aprobar(tenantTutor(), 'prop-1')).rejects.toThrow(
      PropuestaNoEncontradaException
    );
  });

  it('si el tope de puntos bajó después de proponer, la propuesta cara no se aprueba', async () => {
    const { servicio, crearActividad } = crearServicio({ maxPuntos: 2 });

    await expect(servicio.aprobar(tenantTutor(), 'prop-1')).rejects.toThrow(
      PuntosSobreTopeDelGrupoException
    );
    expect(crearActividad).not.toHaveBeenCalled();
  });

  it('autor que ya no está en el grupo: 409 (se puede rechazar, no aprobar)', async () => {
    const { servicio, crearActividad } = crearServicio({ usuariosDelGrupo: [] });

    await expect(servicio.aprobar(tenantTutor(), 'prop-1')).rejects.toThrow(
      AutorYaNoEstaEnElGrupoException
    );
    expect(crearActividad).not.toHaveBeenCalled();
  });
});

describe('PropuestasService — rechazar (fase-14-10)', () => {
  it('rechazar guarda el motivo, no crea Actividad y no toca ningún puntaje', async () => {
    const { servicio, crearActividad, actualizarPropuesta, publicados } = crearServicio();

    const resuelta = await servicio.rechazar(tenantTutor(), 'prop-1', {
      motivo: 'Eso ya lo hacés como parte de otra actividad',
    });

    expect(crearActividad).not.toHaveBeenCalled();
    expect(actualizarPropuesta.mock.calls[0][0].data).toMatchObject({
      estado: 'RECHAZADA',
      resueltoPorTipo: 'TUTOR',
      motivoRechazo: 'Eso ya lo hacés como parte de otra actividad',
    });
    expect(resuelta.estado).toBe('RECHAZADA');
    expect(publicados[0].payload).toMatchObject({
      estado: 'RECHAZADA',
      motivoRechazo: 'Eso ya lo hacés como parte de otra actividad',
      actividadId: null,
    });
  });

  it('rechazar una ya resuelta: 409', async () => {
    const { servicio } = crearServicio({
      propuesta: propuestaDePrueba({ estado: 'RECHAZADA' }),
    });

    await expect(servicio.rechazar(tenantTutor(), 'prop-1', {})).rejects.toThrow(
      PropuestaYaResueltaException
    );
  });
});
