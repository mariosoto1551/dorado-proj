import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { EntitlementsDto, TenantContext } from '@dorado/shared-types';

import type { BillingClientService } from '../clientes/billing-client.service';
import type { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { LimitePlanAlcanzadoException } from '../comun/excepciones';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Actividad } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActividadesService } from './actividades.service';
import type { CrearActividadRequest } from './dto/actividades.dto';

const ENTITLEMENTS_FREE: EntitlementsDto = {
  plan: 'FREE',
  limites: { tutores: 2, usuarios: 5, grupos: 1, actividadesPorGrupo: 15 },
  features: { whiteLabel: false, reportesAvanzados: false },
} as EntitlementsDto;

const ENTITLEMENTS_PRO: EntitlementsDto = {
  plan: 'PRO',
  limites: { tutores: null, usuarios: null, grupos: null, actividadesPorGrupo: null },
  features: { whiteLabel: true, reportesAvanzados: true },
} as EntitlementsDto;

const ACTIVIDAD_BASE: Actividad = {
  id: 'act-1',
  organizacionId: 'org-1',
  grupoId: 'grupo-1',
  nombre: 'Tender la cama',
  descripcion: null,
  tipoPuntaje: 'OPCIONAL',
  valorPuntos: 10,
  tipoLimiteTiempo: 'SIN_LIMITE',
  deadlineHora: null,
  duracionCronometroMinutos: null,
  repeticionesMaximasSesion: 1,
  repeticionesMaximasSeccion: null,
  comportamientoAlCierre: 'ASUME_HECHA',
  alcance: 'INDIVIDUAL',
  bonoJefePuntos: 0,
  origen: 'TUTOR',
  creadaPorUsuarioId: null,
  diasSemana: [],
  siempreVisible: false,
  estado: 'ACTIVA',
  creadaPorTutorId: 'tutor-1',
  createdAt: new Date(),
  updatedAt: new Date(),
} as Actividad;

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

function requestDePrueba(
  sobrescribir: Partial<CrearActividadRequest> = {}
): CrearActividadRequest {
  return {
    nombre: 'Tender la cama',
    tipoPuntaje: 'OPCIONAL',
    valorPuntos: 10,
    tipoLimiteTiempo: 'SIN_LIMITE',
    ...sobrescribir,
  } as CrearActividadRequest;
}

interface OpcionesMock {
  entitlements?: EntitlementsDto | null;
  actividadesActuales?: number;
  existente?: Actividad | null;
}

function crearServicio(opciones: OpcionesMock = {}) {
  const crear = vi
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...ACTIVIDAD_BASE, ...data })
    );
  const actualizar = vi.fn().mockResolvedValue({ count: 1 });
  const buscarPrimera = vi.fn().mockResolvedValue(opciones.existente ?? null);
  const listarFilas = vi.fn().mockResolvedValue([ACTIVIDAD_BASE]);
  const contar = vi.fn().mockResolvedValue(opciones.actividadesActuales ?? 0);

  const prisma = {
    client: {
      actividad: {
        create: crear,
        updateMany: actualizar,
        findFirst: buscarPrimera,
        findMany: listarFilas,
        count: contar,
      },
    },
  } as unknown as PrismaService;

  const resolveEntitlements = vi
    .fn()
    .mockResolvedValue(opciones.entitlements === undefined ? ENTITLEMENTS_FREE : opciones.entitlements);
  const billing = { resolveEntitlements } as unknown as BillingClientService;

  const asegurarAccesoEscritura = vi.fn().mockResolvedValue(undefined);
  const asegurarAccesoLectura = vi.fn();
  const acceso = {
    asegurarAccesoEscritura,
    asegurarAccesoLectura,
  } as unknown as AccesoGrupoService;
  const eventos = {
    publicar: vi.fn(),
    publicarAccionAdministrativa: vi.fn(),
  } as unknown as EventosPublisherService;

  return {
    servicio: new ActividadesService(prisma, billing, acceso, eventos),
    crear,
    actualizar,
    buscarPrimera,
    listarFilas,
    contar,
    resolveEntitlements,
    asegurarAccesoEscritura,
  };
}

describe('ActividadesService — crear (límite de plan, spec fase-05)', () => {
  it('crea la actividad con organizacionId del JWT y creadaPorTutorId del principal', async () => {
    const { servicio, crear } = crearServicio();

    await servicio.crear(tenantDePrueba(), 'grupo-1', requestDePrueba());

    expect(crear).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizacionId: 'org-1',
        grupoId: 'grupo-1',
        creadaPorTutorId: 'tutor-1',
      }),
    });
    // estado nunca viene del request: lo pone el default ACTIVA del schema.
    const data = crear.mock.calls[0][0].data as Record<string, unknown>;
    expect('estado' in data).toBe(false);
  });

  it('403 LIMITE_PLAN_ALCANZADO con recurso=actividades al alcanzar el límite FREE', async () => {
    const { servicio, crear } = crearServicio({ actividadesActuales: 15 });

    const intento = servicio.crear(tenantDePrueba(), 'grupo-1', requestDePrueba());

    await expect(intento).rejects.toThrow(LimitePlanAlcanzadoException);
    await intento.catch((error: LimitePlanAlcanzadoException) => {
      expect(error.code).toBe('LIMITE_PLAN_ALCANZADO');
      expect(error.getStatus()).toBe(403);
      expect(error.extras).toEqual({ recurso: 'actividades' });
    });
    expect(crear).not.toHaveBeenCalled();
  });

  it('solo cuenta actividades ACTIVA del grupo para el límite (las archivadas liberan cupo)', async () => {
    const { servicio, contar } = crearServicio({ actividadesActuales: 3 });

    await servicio.crear(tenantDePrueba(), 'grupo-1', requestDePrueba());

    expect(contar).toHaveBeenCalledWith({
      where: { grupoId: 'grupo-1', estado: 'ACTIVA' },
    });
  });

  it('con billing caído omite el chequeo y crea igual (fail-open, decisión fase-04)', async () => {
    const { servicio, crear, contar } = crearServicio({ entitlements: null });

    await servicio.crear(tenantDePrueba(), 'grupo-1', requestDePrueba());

    expect(contar).not.toHaveBeenCalled();
    expect(crear).toHaveBeenCalled();
  });

  it('límite null (PRO) crea sin contar', async () => {
    const { servicio, crear, contar } = crearServicio({ entitlements: ENTITLEMENTS_PRO });

    await servicio.crear(tenantDePrueba(), 'grupo-1', requestDePrueba());

    expect(contar).not.toHaveBeenCalled();
    expect(crear).toHaveBeenCalled();
  });
});

describe('ActividadesService — campos condicionales al crear (spec fase-05)', () => {
  it('DEADLINE persiste deadlineHora y duración null', async () => {
    const { servicio, crear } = crearServicio();

    await servicio.crear(
      tenantDePrueba(),
      'grupo-1',
      requestDePrueba({ tipoLimiteTiempo: 'DEADLINE', deadlineHora: '20:30' })
    );

    expect(crear).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipoLimiteTiempo: 'DEADLINE',
        deadlineHora: '20:30',
        duracionCronometroMinutos: null,
      }),
    });
  });

  it('CRONOMETRO persiste la duración y deadlineHora null', async () => {
    const { servicio, crear } = crearServicio();

    await servicio.crear(
      tenantDePrueba(),
      'grupo-1',
      requestDePrueba({ tipoLimiteTiempo: 'CRONOMETRO', duracionCronometroMinutos: 45 })
    );

    expect(crear).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipoLimiteTiempo: 'CRONOMETRO',
        deadlineHora: null,
        duracionCronometroMinutos: 45,
      }),
    });
  });

  it('DEADLINE sin deadlineHora es 400', async () => {
    const { servicio, crear } = crearServicio();

    await expect(
      servicio.crear(
        tenantDePrueba(),
        'grupo-1',
        requestDePrueba({ tipoLimiteTiempo: 'DEADLINE' })
      )
    ).rejects.toThrow(BadRequestException);
    expect(crear).not.toHaveBeenCalled();
  });

  it('SIN_LIMITE con duración presente es 400', async () => {
    const { servicio } = crearServicio();

    await expect(
      servicio.crear(
        tenantDePrueba(),
        'grupo-1',
        requestDePrueba({ duracionCronometroMinutos: 10 })
      )
    ).rejects.toThrow(BadRequestException);
  });
});

describe('ActividadesService — comportamientoAlCierre (fase-14-08)', () => {
  it('OPCIONAL por defecto persiste ASUME_HECHA', async () => {
    const { servicio, crear } = crearServicio();

    await servicio.crear(tenantDePrueba(), 'grupo-1', requestDePrueba());

    expect(crear).toHaveBeenCalledWith({
      data: expect.objectContaining({ comportamientoAlCierre: 'ASUME_HECHA' }),
    });
  });

  it('OPCIONAL + REQUIERE_CONFIRMACION es 400', async () => {
    const { servicio, crear } = crearServicio();

    await expect(
      servicio.crear(
        tenantDePrueba(),
        'grupo-1',
        requestDePrueba({ tipoPuntaje: 'OPCIONAL', comportamientoAlCierre: 'REQUIERE_CONFIRMACION' })
      )
    ).rejects.toThrow(BadRequestException);
    expect(crear).not.toHaveBeenCalled();
  });

  it('OBLIGATORIA + REQUIERE_CONFIRMACION persiste el comportamiento', async () => {
    const { servicio, crear } = crearServicio();

    await servicio.crear(
      tenantDePrueba(),
      'grupo-1',
      requestDePrueba({ tipoPuntaje: 'OBLIGATORIA', comportamientoAlCierre: 'REQUIERE_CONFIRMACION' })
    );

    expect(crear).toHaveBeenCalledWith({
      data: expect.objectContaining({ comportamientoAlCierre: 'REQUIERE_CONFIRMACION' }),
    });
  });

  it('cambiar de OBLIGATORIA confirmable a OPCIONAL fuerza ASUME_HECHA (sin mandarlo)', async () => {
    const { servicio, actualizar } = crearServicio({
      existente: {
        ...ACTIVIDAD_BASE,
        tipoPuntaje: 'OBLIGATORIA',
        comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
      } as Actividad,
    });

    await servicio.editar(tenantDePrueba(), 'act-1', { tipoPuntaje: 'OPCIONAL' });

    expect(actualizar).toHaveBeenCalledWith({
      where: { id: 'act-1' },
      data: expect.objectContaining({ comportamientoAlCierre: 'ASUME_HECHA' }),
    });
  });
});

describe('ActividadesService — visibilidad por rol (spec fase-05)', () => {
  it('USUARIO solo ve ACTIVA aunque pida ?estado=ARCHIVADA (param ignorado), y solo el contenido propio o del tutor', async () => {
    const { servicio, listarFilas } = crearServicio();
    const usuario = tenantDePrueba({
      rol: 'USUARIO',
      principalType: 'USUARIO',
      principalId: 'usuario-1',
    } as Partial<TenantContext>);

    await servicio.listar(usuario, 'grupo-1', { estado: 'ARCHIVADA' });

    expect(listarFilas).toHaveBeenCalledWith({
      where: {
        grupoId: 'grupo-1',
        estado: 'ACTIVA',
        // fase-14-10 (Parte C): nunca las actividades personales de otro integrante.
        OR: [{ origen: 'TUTOR' }, { creadaPorUsuarioId: 'usuario-1' }],
      },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('TUTOR sin filtro ve todo; con ?estado= filtra', async () => {
    const { servicio, listarFilas } = crearServicio();

    await servicio.listar(tenantDePrueba(), 'grupo-1', {});
    expect(listarFilas).toHaveBeenLastCalledWith({
      where: { grupoId: 'grupo-1' },
      orderBy: { createdAt: 'asc' },
    });

    await servicio.listar(tenantDePrueba(), 'grupo-1', { estado: 'ARCHIVADA' });
    expect(listarFilas).toHaveBeenLastCalledWith({
      where: { grupoId: 'grupo-1', estado: 'ARCHIVADA' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('USUARIO no ve el detalle de una actividad ARCHIVADA (404)', async () => {
    const { servicio } = crearServicio({
      existente: { ...ACTIVIDAD_BASE, estado: 'ARCHIVADA' } as Actividad,
    });
    const usuario = tenantDePrueba({
      rol: 'USUARIO',
      principalType: 'USUARIO',
    } as Partial<TenantContext>);

    await expect(servicio.detalle(usuario, 'act-1')).rejects.toThrow(NotFoundException);
  });

  it('TUTOR sí ve el detalle de una ARCHIVADA', async () => {
    const { servicio } = crearServicio({
      existente: { ...ACTIVIDAD_BASE, estado: 'ARCHIVADA' } as Actividad,
    });

    await expect(servicio.detalle(tenantDePrueba(), 'act-1')).resolves.toEqual(
      expect.objectContaining({ id: 'act-1', estado: 'ARCHIVADA' })
    );
  });
});

describe('ActividadesService — editar y archivar (spec fase-05)', () => {
  it('cambiar el tipo resetea los condicionales del tipo anterior (no arrastra basura)', async () => {
    const { servicio, actualizar } = crearServicio({
      existente: {
        ...ACTIVIDAD_BASE,
        tipoLimiteTiempo: 'DEADLINE',
        deadlineHora: '20:30',
      } as Actividad,
    });

    await servicio.editar(tenantDePrueba(), 'act-1', {
      tipoLimiteTiempo: 'CRONOMETRO',
      duracionCronometroMinutos: 45,
    });

    expect(actualizar).toHaveBeenCalledWith({
      where: { id: 'act-1' },
      data: expect.objectContaining({
        tipoLimiteTiempo: 'CRONOMETRO',
        deadlineHora: null,
        duracionCronometroMinutos: 45,
      }),
    });
  });

  it('cambiar a DEADLINE sin mandar deadlineHora es 400', async () => {
    const { servicio } = crearServicio({ existente: ACTIVIDAD_BASE });

    await expect(
      servicio.editar(tenantDePrueba(), 'act-1', { tipoLimiteTiempo: 'DEADLINE' })
    ).rejects.toThrow(BadRequestException);
  });

  it('editar una actividad inaccesible (otro tenant/grupo) es 404', async () => {
    const { servicio } = crearServicio({ existente: null });

    await expect(
      servicio.editar(tenantDePrueba(), 'act-ajena', { nombre: 'X' })
    ).rejects.toThrow(NotFoundException);
  });

  it('archivar hace soft delete (estado ARCHIVADA), nunca DELETE físico', async () => {
    const { servicio, actualizar } = crearServicio({ existente: ACTIVIDAD_BASE });

    const resultado = await servicio.archivar(tenantDePrueba(), 'act-1');

    expect(actualizar).toHaveBeenCalledWith({
      where: { id: 'act-1' },
      data: { estado: 'ARCHIVADA' },
    });
    expect(resultado.estado).toBe('ARCHIVADA');
  });
});
