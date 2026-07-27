import { describe, expect, it, vi } from 'vitest';

import type { EntitlementsDto, TenantContext } from '@dorado/shared-types';
import { ModoCreacionContenidoUsuario } from '@dorado/shared-types';

import type { BillingClientService } from '../clientes/billing-client.service';
import type { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  CreacionPorUsuarioDeshabilitadaException,
  LimiteActividadesPropiasAlcanzadoException,
  LimitePlanAlcanzadoException,
  PuntosSobreTopeDelGrupoException,
} from '../comun/excepciones';
import type {
  EventoAPublicar,
  EventosPublisherService,
} from '../eventos/eventos-publisher.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ConfiguracionContenidoService } from './configuracion-contenido.service';
import { MisActividadesService } from './mis-actividades.service';

const ENTITLEMENTS_PRO: EntitlementsDto = {
  plan: 'PRO',
  limites: { tutores: null, usuarios: null, grupos: null, actividadesPorGrupo: null },
  features: { whiteLabel: true, reportesAvanzados: true },
} as EntitlementsDto;

function tenantUsuario(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'USUARIO',
    principalId: 'usuario-1',
    principalType: 'USUARIO',
  } as TenantContext;
}

interface Opciones {
  modo?: ModoCreacionContenidoUsuario;
  maxPuntos?: number;
  maxActivas?: number;
  /** Actividades propias ACTIVA ya existentes (para el cupo). */
  activasPropias?: number;
  /** Propuestas PENDIENTE ya existentes (también cuentan al cupo). */
  pendientes?: number;
  /** Actividades ACTIVA del grupo, para el límite del plan. */
  actividadesDelGrupo?: number;
  entitlements?: EntitlementsDto | null;
}

function crearServicio(opciones: Opciones = {}) {
  const crearActividad = vi
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'act-nueva',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      })
    );
  const crearPropuesta = vi
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'prop-1',
        estado: 'PENDIENTE',
        resueltoPorId: null,
        resueltoPorTipo: null,
        resueltoEn: null,
        motivoRechazo: null,
        actividadId: null,
        descripcion: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      })
    );
  const contarActividades = vi
    .fn()
    .mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        where['creadaPorUsuarioId'] !== undefined
          ? (opciones.activasPropias ?? 0)
          : (opciones.actividadesDelGrupo ?? 0)
      )
    );

  const client = {
    actividad: {
      create: crearActividad,
      count: contarActividades,
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    propuestaActividad: {
      create: crearPropuesta,
      count: vi.fn().mockResolvedValue(opciones.pendientes ?? 0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => await fn(client),
  };
  const prisma = { client } as unknown as PrismaService;

  const billing = {
    resolveEntitlements: vi
      .fn()
      .mockResolvedValue(
        opciones.entitlements === undefined ? ENTITLEMENTS_PRO : opciones.entitlements
      ),
  } as unknown as BillingClientService;

  const acceso = {
    asegurarAccesoEscritura: vi.fn().mockResolvedValue(undefined),
    asegurarAccesoLectura: vi.fn(),
  } as unknown as AccesoGrupoService;

  const configuracion = {
    resolver: vi.fn().mockResolvedValue({
      grupoId: 'grupo-1',
      modoCreacionUsuario: opciones.modo ?? ModoCreacionContenidoUsuario.LIBRE,
      maxPuntosActividadUsuario: opciones.maxPuntos ?? 5,
      maxActividadesActivasPorUsuario: opciones.maxActivas ?? 5,
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
    servicio: new MisActividadesService(prisma, billing, acceso, configuracion, eventos),
    crearActividad,
    crearPropuesta,
    publicados,
  };
}

const REQUEST = { nombre: 'Practicar guitarra', valorPuntos: 3 };

describe('MisActividadesService — crear (fase-14-10)', () => {
  it('modo RESTRICTIVO: 403 CREACION_POR_USUARIO_DESHABILITADA (default de todo grupo)', async () => {
    const { servicio, crearActividad, crearPropuesta } = crearServicio({
      modo: ModoCreacionContenidoUsuario.RESTRICTIVO,
    });

    await expect(servicio.crear(tenantUsuario(), 'grupo-1', REQUEST)).rejects.toThrow(
      CreacionPorUsuarioDeshabilitadaException
    );
    expect(crearActividad).not.toHaveBeenCalled();
    expect(crearPropuesta).not.toHaveBeenCalled();
  });

  it('modo LIBRE: crea la Actividad ACTIVA al instante + propuesta APROBADA por SYSTEM', async () => {
    const { servicio, crearActividad, crearPropuesta, publicados } = crearServicio({
      modo: ModoCreacionContenidoUsuario.LIBRE,
    });

    const respuesta = await servicio.crear(tenantUsuario(), 'grupo-1', REQUEST);

    expect(crearActividad).toHaveBeenCalledOnce();
    expect(crearActividad.mock.calls[0][0].data).toMatchObject({
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
      estado: 'ACTIVA',
      origen: 'USUARIO',
      creadaPorUsuarioId: 'usuario-1',
      // Sin tutor detrás: nadie revisó.
      creadaPorTutorId: null,
      // Campos FIJOS (decisión 8): el integrante no elige nada de esto.
      tipoPuntaje: 'OPCIONAL',
      tipoLimiteTiempo: 'SIN_LIMITE',
      alcance: 'INDIVIDUAL',
      comportamientoAlCierre: 'ASUME_HECHA',
      bonoJefePuntos: 0,
    });
    expect(crearPropuesta.mock.calls[0][0].data).toMatchObject({
      estado: 'APROBADA',
      resueltoPorTipo: 'SYSTEM',
      modoAlCrear: 'LIBRE',
      actividadId: 'act-nueva',
    });
    expect(respuesta.actividad).not.toBeNull();
    expect(publicados[0]).toMatchObject({
      eventType: 'ActividadPropuestaCreada',
      routingKey: 'activity.actividad_propuesta_creada',
    });
    expect(publicados[0].payload).toMatchObject({ requiereAprobacion: false });
  });

  it('modo BAJO_APROBACION: solo la propuesta PENDIENTE — no existe Actividad todavía', async () => {
    const { servicio, crearActividad, crearPropuesta, publicados } = crearServicio({
      modo: ModoCreacionContenidoUsuario.BAJO_APROBACION,
    });

    const respuesta = await servicio.crear(tenantUsuario(), 'grupo-1', REQUEST);

    expect(crearActividad).not.toHaveBeenCalled();
    expect(crearPropuesta).toHaveBeenCalledOnce();
    expect(respuesta.actividad).toBeNull();
    expect(respuesta.propuesta.estado).toBe('PENDIENTE');
    expect(publicados[0].payload).toMatchObject({ requiereAprobacion: true });
  });

  it('valorPuntos sobre el tope del grupo: 400 PUNTOS_SOBRE_TOPE_DEL_GRUPO', async () => {
    const { servicio } = crearServicio({ maxPuntos: 5 });

    await expect(
      servicio.crear(tenantUsuario(), 'grupo-1', { nombre: 'Respirar', valorPuntos: 50 })
    ).rejects.toThrow(PuntosSobreTopeDelGrupoException);
  });

  it('cupo propio alcanzado (activas + pendientes): 409 LIMITE_ACTIVIDADES_PROPIAS_ALCANZADO', async () => {
    const { servicio } = crearServicio({ maxActivas: 2, activasPropias: 1, pendientes: 1 });

    await expect(servicio.crear(tenantUsuario(), 'grupo-1', REQUEST)).rejects.toThrow(
      LimiteActividadesPropiasAlcanzadoException
    );
  });

  it('modo LIBRE respeta el límite del plan del grupo (no es un bypass de FREE)', async () => {
    const { servicio } = crearServicio({
      modo: ModoCreacionContenidoUsuario.LIBRE,
      actividadesDelGrupo: 15,
      entitlements: {
        plan: 'FREE',
        limites: { tutores: 2, usuarios: 5, grupos: 1, actividadesPorGrupo: 15 },
        features: { whiteLabel: false, reportesAvanzados: false },
      } as EntitlementsDto,
    });

    await expect(servicio.crear(tenantUsuario(), 'grupo-1', REQUEST)).rejects.toThrow(
      LimitePlanAlcanzadoException
    );
  });

  it('en BAJO_APROBACION el límite del plan NO corta al proponer (se revalida al aprobar)', async () => {
    const { servicio, crearPropuesta } = crearServicio({
      modo: ModoCreacionContenidoUsuario.BAJO_APROBACION,
      actividadesDelGrupo: 15,
      entitlements: {
        plan: 'FREE',
        limites: { tutores: 2, usuarios: 5, grupos: 1, actividadesPorGrupo: 15 },
        features: { whiteLabel: false, reportesAvanzados: false },
      } as EntitlementsDto,
    });

    await servicio.crear(tenantUsuario(), 'grupo-1', REQUEST);

    expect(crearPropuesta).toHaveBeenCalledOnce();
  });
});
