import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { EntitlementsDto, TenantContext } from '@dorado/shared-types';

import type { BillingClientService } from '../clientes/billing-client.service';
import type { IdentityClientService } from '../clientes/identity-client.service';
import type { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  DestinatarioAmbiguoException,
  DestinatarioIncompatibleConAlcanceException,
  LimitePlanAlcanzadoException,
  RestriccionRolSoloIndividualException,
  RolGrupoInexistenteException,
  UsuarioFueraDelGrupoException,
  VigenciaInvalidaException,
} from '../comun/excepciones';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Actividad } from '../generated/prisma/client';
import { ContextoParticipanteService } from '../comun/contexto-participante.service';
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
  // fase-14-20: solo se usa en OBLIGATORIA + REQUIERE_CONFIRMACION.
  puntosPorCumplir: 0,
  // fase-14-24: sin destinatario nominal ni vigencia = como antes del ítem.
  usuariosPermitidos: [],
  equiposPermitidos: [],
  vigenteDesde: null,
  vigenteHasta: null,
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
  // fase-14-19: vacío = la ven todos (el default y el comportamiento previo).
  rolesPermitidos: [],
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
  /** fase-14-19: catálogo de roles que devuelve identity por REST interno. */
  rolesDelGrupo?: Array<{ id: string; estado: 'ACTIVO' | 'INACTIVO' }>;
  /** fase-14-19: rol del participante que consulta. */
  rolDeUsuario?: string | null;
  /** fase-14-19: filas que devuelve el listado del catálogo. */
  filas?: Actividad[];
  /** fase-14-24: participantes del grupo, para validar el destinatario nominal. */
  usuariosDelGrupo?: Array<{ id: string }>;
  /** fase-14-24: equipos del grupo. */
  equiposDelGrupo?: Array<{
    equipoId: string;
    estado: 'ACTIVO' | 'INACTIVO';
    miembros: Array<{ usuarioId: string }>;
  }>;
}

function crearServicio(opciones: OpcionesMock = {}) {
  const crear = vi
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...ACTIVIDAD_BASE, ...data })
    );
  const actualizar = vi.fn().mockResolvedValue({ count: 1 });
  const buscarPrimera = vi.fn().mockResolvedValue(opciones.existente ?? null);
  const listarFilas = vi.fn().mockResolvedValue(opciones.filas ?? [ACTIVIDAD_BASE]);
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

  // fase-14-19: el cruce REST hacia identity. Los espías permiten verificar que
  // NO se llama cuando el catálogo no tiene restricciones (decisión 13).
  const rolesDelGrupo = vi.fn().mockResolvedValue(opciones.rolesDelGrupo ?? []);
  const rolDeUsuario = vi.fn().mockResolvedValue(opciones.rolDeUsuario ?? null);
  // fase-14-24: los dos internos que valida el destinatario nominal.
  const usuariosDelGrupo = vi.fn().mockResolvedValue(opciones.usuariosDelGrupo ?? []);
  const equiposDelGrupo = vi.fn().mockResolvedValue(opciones.equiposDelGrupo ?? []);
  const identity = {
    rolesDelGrupo,
    rolDeUsuario,
    usuariosDelGrupo,
    equiposDelGrupo,
  } as unknown as IdentityClientService;
  const contexto = new ContextoParticipanteService(identity);

  return {
    servicio: new ActividadesService(prisma, billing, acceso, eventos, identity, contexto),
    crear,
    actualizar,
    buscarPrimera,
    listarFilas,
    contar,
    resolveEntitlements,
    asegurarAccesoEscritura,
    rolesDelGrupo,
    rolDeUsuario,
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

describe('ActividadesService — puntos por cumplir (fase-14-20)', () => {
  it('conserva el premio en una OBLIGATORIA con confirmación', async () => {
    const { servicio, crear } = crearServicio();

    await servicio.crear(
      tenantDePrueba(),
      'grupo-1',
      requestDePrueba({
        tipoPuntaje: 'OBLIGATORIA',
        valorPuntos: 10,
        comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
        puntosPorCumplir: 2,
      })
    );

    // El caso realista de la spec: +2 si la hace, −10 si no.
    expect(crear.mock.calls[0][0].data).toMatchObject({
      valorPuntos: 10,
      puntosPorCumplir: 2,
    });
  });

  it('lo fuerza a 0 donde nadie podría cobrarlo (opcional, ASUME_HECHA, equipo)', async () => {
    const casos: Array<Partial<CrearActividadRequest>> = [
      // Una opcional ya premia con valorPuntos.
      { tipoPuntaje: 'OPCIONAL', puntosPorCumplir: 5 },
      // Sin confirmación no hay acción del integrante que registrar.
      {
        tipoPuntaje: 'OBLIGATORIA',
        comportamientoAlCierre: 'ASUME_HECHA',
        puntosPorCumplir: 5,
      },
      // Una tarea de equipo es siempre OPCIONAL (fase-14-09).
      { tipoPuntaje: 'OPCIONAL', alcance: 'EQUIPO', puntosPorCumplir: 5 },
    ];

    for (const caso of casos) {
      const { servicio, crear } = crearServicio();

      await servicio.crear(tenantDePrueba(), 'grupo-1', requestDePrueba(caso));

      expect(crear.mock.calls[0][0].data).toMatchObject({ puntosPorCumplir: 0 });
    }
  });

  it('un PATCH a ASUME_HECHA apaga el premio aunque el request no lo mande', async () => {
    const existente = {
      ...ACTIVIDAD_BASE,
      tipoPuntaje: 'OBLIGATORIA',
      comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
      puntosPorCumplir: 2,
    } as Actividad;
    const { servicio, actualizar } = crearServicio({ existente });

    await servicio.editar(tenantDePrueba(), 'act-1', {
      comportamientoAlCierre: 'ASUME_HECHA',
    });

    expect(actualizar.mock.calls[0][0].data).toMatchObject({ puntosPorCumplir: 0 });
  });

  it('un PATCH que no toca el tema conserva el premio existente', async () => {
    const existente = {
      ...ACTIVIDAD_BASE,
      tipoPuntaje: 'OBLIGATORIA',
      comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
      puntosPorCumplir: 2,
    } as Actividad;
    const { servicio, actualizar } = crearServicio({ existente });

    await servicio.editar(tenantDePrueba(), 'act-1', { nombre: 'Otro nombre' });

    expect(actualizar.mock.calls[0][0].data).toMatchObject({ puntosPorCumplir: 2 });
  });
});

describe('ActividadesService — restricción por rol (spec fase-14-19, Parte B)', () => {
  const ROLES = [
    { id: '11111111-1111-4111-8111-111111111111', estado: 'ACTIVO' as const },
    { id: '22222222-2222-4222-8222-222222222222', estado: 'INACTIVO' as const },
  ];
  const ROL_COCINA = ROLES[0].id;
  const ROL_ARCHIVADO = ROLES[1].id;

  it('guarda los roles válidos, sin duplicados', async () => {
    const { servicio, crear } = crearServicio({ rolesDelGrupo: ROLES });

    await servicio.crear(
      tenantDePrueba(),
      'grupo-1',
      requestDePrueba({ rolesPermitidos: [ROL_COCINA, ROL_COCINA] })
    );

    expect(crear.mock.calls[0][0].data).toMatchObject({ rolesPermitidos: [ROL_COCINA] });
  });

  it('400 ROL_GRUPO_INEXISTENTE si el rol no existe en el grupo', async () => {
    const { servicio, crear } = crearServicio({ rolesDelGrupo: [] });

    await expect(
      servicio.crear(
        tenantDePrueba(),
        'grupo-1',
        requestDePrueba({ rolesPermitidos: [ROL_COCINA] })
      )
    ).rejects.toBeInstanceOf(RolGrupoInexistenteException);
    expect(crear).not.toHaveBeenCalled();
  });

  it('400 ROL_GRUPO_INEXISTENTE si el rol está archivado', async () => {
    const { servicio } = crearServicio({ rolesDelGrupo: ROLES });

    await expect(
      servicio.crear(
        tenantDePrueba(),
        'grupo-1',
        requestDePrueba({ rolesPermitidos: [ROL_ARCHIVADO] })
      )
    ).rejects.toBeInstanceOf(RolGrupoInexistenteException);
  });

  it('400 RESTRICCION_ROL_SOLO_INDIVIDUAL sobre una tarea de equipo (decisión 10)', async () => {
    const { servicio } = crearServicio({ rolesDelGrupo: ROLES });

    await expect(
      servicio.crear(
        tenantDePrueba(),
        'grupo-1',
        requestDePrueba({ alcance: 'EQUIPO', rolesPermitidos: [ROL_COCINA] })
      )
    ).rejects.toBeInstanceOf(RestriccionRolSoloIndividualException);
  });

  it('sin roles pedidos no consulta el catálogo de identity', async () => {
    const { servicio, rolesDelGrupo } = crearServicio();

    await servicio.crear(tenantDePrueba(), 'grupo-1', requestDePrueba());

    expect(rolesDelGrupo).not.toHaveBeenCalled();
  });

  it('un PATCH que no toca el campo conserva la restricción existente', async () => {
    const existente = { ...ACTIVIDAD_BASE, rolesPermitidos: [ROL_COCINA] } as Actividad;
    const { servicio, actualizar } = crearServicio({ existente, rolesDelGrupo: ROLES });

    await servicio.editar(tenantDePrueba(), 'act-1', { nombre: 'Otro nombre' });

    expect(actualizar.mock.calls[0][0].data).toMatchObject({
      rolesPermitidos: [ROL_COCINA],
    });
  });

  it('un PATCH con lista vacía la libera para todo el grupo', async () => {
    const existente = { ...ACTIVIDAD_BASE, rolesPermitidos: [ROL_COCINA] } as Actividad;
    const { servicio, actualizar } = crearServicio({ existente, rolesDelGrupo: ROLES });

    await servicio.editar(tenantDePrueba(), 'act-1', { rolesPermitidos: [] });

    expect(actualizar.mock.calls[0][0].data).toMatchObject({ rolesPermitidos: [] });
  });

  it('pasar a alcance EQUIPO una actividad restringida falla (no la restringe a escondidas)', async () => {
    const existente = { ...ACTIVIDAD_BASE, rolesPermitidos: [ROL_COCINA] } as Actividad;
    const { servicio, actualizar } = crearServicio({ existente, rolesDelGrupo: ROLES });

    await expect(
      servicio.editar(tenantDePrueba(), 'act-1', { alcance: 'EQUIPO' })
    ).rejects.toBeInstanceOf(RestriccionRolSoloIndividualException);
    expect(actualizar).not.toHaveBeenCalled();
  });
});

describe('ActividadesService — listado filtrado por rol (decisión 6)', () => {
  const ROL_COCINA = '11111111-1111-4111-8111-111111111111';
  const RESTRINGIDA = {
    ...ACTIVIDAD_BASE,
    id: 'act-restringida',
    rolesPermitidos: [ROL_COCINA],
  } as Actividad;

  function tenantUsuario(): TenantContext {
    return {
      ...tenantDePrueba(),
      rol: 'USUARIO',
      principalId: 'usuario-1',
      principalType: 'USUARIO',
    } as TenantContext;
  }

  it('el integrante con el rol la ve', async () => {
    const { servicio } = crearServicio({
      filas: [ACTIVIDAD_BASE, RESTRINGIDA],
      rolDeUsuario: ROL_COCINA,
    });

    const lista = await servicio.listar(tenantUsuario(), 'grupo-1', {});

    expect(lista.map((actividad) => actividad.id)).toEqual(['act-1', 'act-restringida']);
  });

  it('el integrante de otro rol NO la ve', async () => {
    const { servicio } = crearServicio({
      filas: [ACTIVIDAD_BASE, RESTRINGIDA],
      rolDeUsuario: '99999999-9999-4999-8999-999999999999',
    });

    const lista = await servicio.listar(tenantUsuario(), 'grupo-1', {});

    expect(lista.map((actividad) => actividad.id)).toEqual(['act-1']);
  });

  it('el integrante SIN rol tampoco la ve', async () => {
    const { servicio } = crearServicio({
      filas: [ACTIVIDAD_BASE, RESTRINGIDA],
      rolDeUsuario: null,
    });

    const lista = await servicio.listar(tenantUsuario(), 'grupo-1', {});

    expect(lista.map((actividad) => actividad.id)).toEqual(['act-1']);
  });

  it('el Tutor las ve todas y no paga la llamada a identity', async () => {
    const { servicio, rolDeUsuario } = crearServicio({
      filas: [ACTIVIDAD_BASE, RESTRINGIDA],
    });

    const lista = await servicio.listar(tenantDePrueba(), 'grupo-1', {});

    expect(lista).toHaveLength(2);
    expect(rolDeUsuario).not.toHaveBeenCalled();
  });

  it('COSTO CERO: sin restricciones en el catálogo no se llama a identity (decisión 13)', async () => {
    const { servicio, rolDeUsuario } = crearServicio({ filas: [ACTIVIDAD_BASE] });

    await servicio.listar(tenantUsuario(), 'grupo-1', {});

    expect(rolDeUsuario).not.toHaveBeenCalled();
  });
});

// --- Destinatario y vigencia (fase-14-24) ---

describe('ActividadesService — destinatario: los cuatro modos son excluyentes', () => {
  const ANA = '11111111-1111-4111-8111-111111111111';
  const LUIS = '22222222-2222-4222-8222-222222222222';
  const ROL = '33333333-3333-4333-8333-333333333333';
  const EQUIPO = '44444444-4444-4444-8444-444444444444';

  const DEL_GRUPO = [{ id: ANA }, { id: LUIS }];
  const EQUIPOS = [{ equipoId: EQUIPO, estado: 'ACTIVO' as const, miembros: [{ usuarioId: ANA }] }];

  it('persiste el destinatario por personas', async () => {
    const { servicio, crear } = crearServicio({ usuariosDelGrupo: DEL_GRUPO });

    await servicio.crear(
      tenantDePrueba(),
      'grupo-1',
      requestDePrueba({ usuariosPermitidos: [ANA, LUIS] })
    );

    expect(crear).toHaveBeenCalledWith({
      data: expect.objectContaining({
        usuariosPermitidos: [ANA, LUIS],
        rolesPermitidos: [],
        equiposPermitidos: [],
      }),
    });
  });

  it('rol + personas a la vez es DESTINATARIO_AMBIGUO', async () => {
    // La razon esta en la spec: permitir el cruce obliga a fijar una semantica
    // (interseccion o union) que no se puede explicar en una pantalla.
    const { servicio, crear } = crearServicio({
      usuariosDelGrupo: DEL_GRUPO,
      rolesDelGrupo: [{ id: ROL, estado: 'ACTIVO' }],
    });

    const intento = servicio.crear(
      tenantDePrueba(),
      'grupo-1',
      requestDePrueba({ usuariosPermitidos: [ANA], rolesPermitidos: [ROL] })
    );

    await expect(intento).rejects.toThrow(DestinatarioAmbiguoException);
    expect(crear).not.toHaveBeenCalled();
  });

  it('un participante de otro grupo es USUARIO_FUERA_DEL_GRUPO', async () => {
    const { servicio } = crearServicio({ usuariosDelGrupo: [{ id: ANA }] });

    const intento = servicio.crear(
      tenantDePrueba(),
      'grupo-1',
      requestDePrueba({ usuariosPermitidos: [ANA, LUIS] })
    );

    await expect(intento).rejects.toThrow(UsuarioFueraDelGrupoException);
  });

  it('personas sobre una tarea de EQUIPO es incompatible con el alcance', async () => {
    const { servicio } = crearServicio({ usuariosDelGrupo: DEL_GRUPO });

    const intento = servicio.crear(
      tenantDePrueba(),
      'grupo-1',
      requestDePrueba({ alcance: 'EQUIPO', usuariosPermitidos: [ANA] })
    );

    await expect(intento).rejects.toThrow(DestinatarioIncompatibleConAlcanceException);
  });

  it('equipos exige alcance EQUIPO, y con el alcance correcto persiste', async () => {
    const { servicio, crear } = crearServicio({ equiposDelGrupo: EQUIPOS });

    await expect(
      servicio.crear(tenantDePrueba(), 'grupo-1', requestDePrueba({ equiposPermitidos: [EQUIPO] }))
    ).rejects.toThrow(DestinatarioIncompatibleConAlcanceException);

    await servicio.crear(
      tenantDePrueba(),
      'grupo-1',
      requestDePrueba({ alcance: 'EQUIPO', equiposPermitidos: [EQUIPO] })
    );

    expect(crear).toHaveBeenCalledWith({
      data: expect.objectContaining({ equiposPermitidos: [EQUIPO], usuariosPermitidos: [] }),
    });
  });

  it('sin destinatario los tres arrays quedan vacios: el default no cambia', async () => {
    const { servicio, crear } = crearServicio();

    await servicio.crear(tenantDePrueba(), 'grupo-1', requestDePrueba());

    expect(crear).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rolesPermitidos: [],
        usuariosPermitidos: [],
        equiposPermitidos: [],
        vigenteDesde: null,
        vigenteHasta: null,
      }),
    });
  });
});

describe('ActividadesService — vigencia (fase-14-24)', () => {
  it('persiste el rango tal cual', async () => {
    const { servicio, crear } = crearServicio();

    await servicio.crear(
      tenantDePrueba(),
      'grupo-1',
      requestDePrueba({ vigenteDesde: '2026-12-24', vigenteHasta: '2026-12-24' })
    );

    expect(crear).toHaveBeenCalledWith({
      data: expect.objectContaining({
        vigenteDesde: '2026-12-24',
        vigenteHasta: '2026-12-24',
      }),
    });
  });

  it('desde posterior a hasta es VIGENCIA_INVALIDA', async () => {
    const { servicio } = crearServicio();

    const intento = servicio.crear(
      tenantDePrueba(),
      'grupo-1',
      requestDePrueba({ vigenteDesde: '2026-12-25', vigenteHasta: '2026-12-24' })
    );

    await expect(intento).rejects.toThrow(VigenciaInvalidaException);
  });

  it('una fecha que no existe en el calendario tampoco pasa', async () => {
    const { servicio } = crearServicio();

    const intento = servicio.crear(
      tenantDePrueba(),
      'grupo-1',
      requestDePrueba({ vigenteHasta: '2026-02-30' })
    );

    await expect(intento).rejects.toThrow(VigenciaInvalidaException);
  });

  it('un "hasta" ya pasado SE ACEPTA: lo archiva el cierre siguiente', async () => {
    const { servicio, crear } = crearServicio();

    await servicio.crear(
      tenantDePrueba(),
      'grupo-1',
      requestDePrueba({ vigenteHasta: '2020-01-01' })
    );

    expect(crear).toHaveBeenCalled();
  });
});
