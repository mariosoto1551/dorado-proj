import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { EstadoSeccion, EstadoSesion } from '@dorado/shared-types';
import type { GrupoDto, TenantContext } from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import type {
  SeccionActualInterna,
  SessionClientService,
} from '../clientes/session-client.service';
import {
  ActividadNoDisponibleHoyException,
  ActividadNoElegibleParaElPlanException,
  ActividadYaEmpezadaException,
  NoHaySesionAbiertaException,
  PlanDelDiaInactivoException,
} from '../comun/excepciones';
import {
  actividadDePrueba,
  actividadPersonalDePrueba,
  crearBdRegistroEnMemoria,
  type BdRegistroEnMemoria,
} from '../comun/testing/bd-registro-en-memoria';
import type { ConfiguracionContenidoService } from '../contenido-usuario/configuracion-contenido.service';
import type { Actividad, RegistroActividad } from '../generated/prisma/client';
import { PlanDiaService } from './plan-dia.service';

// La Sesión de prueba abre el lunes 2026-07-13 a las 00:00 de America/La_Paz.
const GRUPO: GrupoDto = {
  id: 'grupo-1',
  organizacionId: 'org-1',
  nombre: 'Grupo Uno',
  timezone: 'America/La_Paz',
  createdAt: new Date().toISOString(),
};

const LUNES = 1;

const MARTES = 2;

function seccionActualDePrueba(): SeccionActualInterna {
  return {
    id: 'seccion-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    numero: 1,
    estado: EstadoSeccion.ABIERTA,
    fechaInicio: '2026-07-13T04:00:00.000Z',
    fechaFin: null,
    sesiones: [
      {
        id: 'sesion-1',
        seccionId: 'seccion-1',
        organizacionId: 'org-1',
        grupoId: 'grupo-1',
        numero: 1,
        estado: EstadoSesion.ABIERTA,
        fechaInicio: '2026-07-13T04:00:00.000Z',
        fechaFin: null,
      },
    ],
  };
}

function tenantUsuario(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'USUARIO',
    principalId: 'usuario-1',
    principalType: 'USUARIO',
  } as TenantContext;
}

function completadaDePrueba(sobrescribir: Partial<RegistroActividad> = {}): RegistroActividad {
  return {
    id: 'registro-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    usuarioId: 'usuario-1',
    actividadId: 'actividad-1',
    sesionId: 'sesion-1',
    seccionId: 'seccion-1',
    tipo: 'COMPLETADA',
    valorPuntosSnapshot: 10,
    registradoPorId: 'usuario-1',
    registradoPorTipo: 'USUARIO',
    eliminado: false,
    eliminadoPorTutorId: null,
    eliminadoEn: null,
    motivoTutor: null,
    revertidoPorTutorId: null,
    revertidoEn: null,
    createdAt: new Date(),
    ...sobrescribir,
  } as RegistroActividad;
}

function crearServicio(
  opciones: {
    actividades?: Actividad[];
    registrosActividad?: RegistroActividad[];
    planDelDiaActivo?: boolean;
    seccionActual?: SeccionActualInterna | null;
  } = {}
): { servicio: PlanDiaService; bd: BdRegistroEnMemoria } {
  const bd = crearBdRegistroEnMemoria({
    actividades: opciones.actividades ?? [actividadDePrueba()],
    registrosActividad: opciones.registrosActividad ?? [],
  });

  const session = {
    obtenerSeccionActual: vi
      .fn()
      .mockResolvedValue(
        opciones.seccionActual === undefined ? seccionActualDePrueba() : opciones.seccionActual
      ),
  } as unknown as SessionClientService;

  const identity = {
    obtenerGrupo: vi.fn().mockResolvedValue(GRUPO),
  } as unknown as IdentityClientService;

  const config = {
    resolver: vi.fn().mockResolvedValue({
      grupoId: 'grupo-1',
      modoCreacionUsuario: 'RESTRICTIVO',
      maxPuntosActividadUsuario: 5,
      maxActividadesActivasPorUsuario: 5,
      planDelDiaActivo: opciones.planDelDiaActivo ?? true,
    }),
  } as unknown as ConfiguracionContenidoService;

  const servicio = new PlanDiaService(bd.prisma, session, identity, config, {
    asegurarAccesoLectura: () => undefined,
  } as never);

  return { servicio, bd };
}

describe('PlanDiaService — agregar (fase-14-17)', () => {
  it('mete la actividad en el plan de la Sesión abierta y devuelve el plan', async () => {
    const { servicio, bd } = crearServicio();

    const plan = await servicio.agregar(tenantUsuario(), 'grupo-1', {
      actividadId: 'actividad-1',
    });

    expect(plan).toEqual({ sesionId: 'sesion-1', actividadIds: ['actividad-1'] });
    expect(bd.seleccionesPlanDia).toHaveLength(1);
    expect(bd.seleccionesPlanDia[0]).toMatchObject({
      // organizacionId del JWT, nunca del cliente (regla 3).
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
      usuarioId: 'usuario-1',
      sesionId: 'sesion-1',
    });
  });

  it('es idempotente: elegir dos veces la misma no duplica filas', async () => {
    const { servicio, bd } = crearServicio();

    await servicio.agregar(tenantUsuario(), 'grupo-1', { actividadId: 'actividad-1' });
    const plan = await servicio.agregar(tenantUsuario(), 'grupo-1', {
      actividadId: 'actividad-1',
    });

    expect(bd.seleccionesPlanDia).toHaveLength(1);
    expect(plan.actividadIds).toEqual(['actividad-1']);
  });

  it('rechaza con PLAN_DEL_DIA_INACTIVO si el grupo no usa el plan del día', async () => {
    const { servicio } = crearServicio({ planDelDiaActivo: false });

    await expect(
      servicio.agregar(tenantUsuario(), 'grupo-1', { actividadId: 'actividad-1' })
    ).rejects.toBeInstanceOf(PlanDelDiaInactivoException);
  });

  it('rechaza una OBLIGATORIA: no se elige, siempre está en la lista', async () => {
    const { servicio } = crearServicio({
      actividades: [actividadDePrueba({ tipoPuntaje: 'OBLIGATORIA' })],
    });

    await expect(
      servicio.agregar(tenantUsuario(), 'grupo-1', { actividadId: 'actividad-1' })
    ).rejects.toBeInstanceOf(ActividadNoElegibleParaElPlanException);
  });

  it('rechaza una tarea de EQUIPO y una `siempreVisible` por la misma razón', async () => {
    const equipo = crearServicio({
      actividades: [actividadDePrueba({ alcance: 'EQUIPO' })],
    });
    const fija = crearServicio({
      actividades: [actividadDePrueba({ siempreVisible: true })],
    });

    await expect(
      equipo.servicio.agregar(tenantUsuario(), 'grupo-1', { actividadId: 'actividad-1' })
    ).rejects.toBeInstanceOf(ActividadNoElegibleParaElPlanException);
    await expect(
      fija.servicio.agregar(tenantUsuario(), 'grupo-1', { actividadId: 'actividad-1' })
    ).rejects.toBeInstanceOf(ActividadNoElegibleParaElPlanException);
  });

  it('no deja meter en el plan la actividad personal de otro integrante', async () => {
    const { servicio } = crearServicio({
      actividades: [actividadPersonalDePrueba('usuario-2')],
    });

    await expect(
      servicio.agregar(tenantUsuario(), 'grupo-1', { actividadId: 'actividad-de-usuario-2' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza una actividad programada para otro día (fase-14-11)', async () => {
    const { servicio } = crearServicio({
      // La Sesión arranca un lunes; esta actividad es solo de martes.
      actividades: [actividadDePrueba({ diasSemana: [MARTES] })],
    });

    await expect(
      servicio.agregar(tenantUsuario(), 'grupo-1', { actividadId: 'actividad-1' })
    ).rejects.toBeInstanceOf(ActividadNoDisponibleHoyException);
  });

  it('acepta una programada para HOY', async () => {
    const { servicio, bd } = crearServicio({
      actividades: [actividadDePrueba({ diasSemana: [LUNES] })],
    });

    await servicio.agregar(tenantUsuario(), 'grupo-1', { actividadId: 'actividad-1' });

    expect(bd.seleccionesPlanDia).toHaveLength(1);
  });

  it('sin Sesión abierta no hay plan que armar', async () => {
    const { servicio } = crearServicio({ seccionActual: null });

    await expect(
      servicio.agregar(tenantUsuario(), 'grupo-1', { actividadId: 'actividad-1' })
    ).rejects.toBeInstanceOf(NoHaySesionAbiertaException);
  });
});

describe('PlanDiaService — quitar (fase-14-17)', () => {
  it('saca del plan una elegida que no empezó', async () => {
    const { servicio, bd } = crearServicio();

    await servicio.agregar(tenantUsuario(), 'grupo-1', { actividadId: 'actividad-1' });
    const plan = await servicio.quitar(tenantUsuario(), 'grupo-1', 'actividad-1');

    expect(plan).toEqual({ sesionId: 'sesion-1', actividadIds: [] });
    expect(bd.seleccionesPlanDia).toHaveLength(0);
  });

  it('quitar algo que no estaba en el plan es un no-op, no un error', async () => {
    const { servicio } = crearServicio();

    const plan = await servicio.quitar(tenantUsuario(), 'grupo-1', 'actividad-1');

    expect(plan.actividadIds).toEqual([]);
  });

  it('rechaza con ACTIVIDAD_YA_EMPEZADA si ya la completó hoy', async () => {
    const { servicio } = crearServicio({ registrosActividad: [completadaDePrueba()] });

    await expect(
      servicio.quitar(tenantUsuario(), 'grupo-1', 'actividad-1')
    ).rejects.toBeInstanceOf(ActividadYaEmpezadaException);
  });

  it('tampoco la deja sacar si el tutor le quitó la completada: el intento se gastó', async () => {
    const { servicio } = crearServicio({
      // fase-14-12: una COMPLETADA con `eliminado` sigue contando como empezada.
      registrosActividad: [completadaDePrueba({ eliminado: true })],
    });

    await expect(
      servicio.quitar(tenantUsuario(), 'grupo-1', 'actividad-1')
    ).rejects.toBeInstanceOf(ActividadYaEmpezadaException);
  });

  it('tampoco con el cronómetro corriendo', async () => {
    const { servicio, bd } = crearServicio();

    await bd.prisma.client.cronometroActivo.upsert({
      where: {
        usuarioId_actividadId_sesionId: {
          usuarioId: 'usuario-1',
          actividadId: 'actividad-1',
          sesionId: 'sesion-1',
        },
      },
      create: { usuarioId: 'usuario-1', actividadId: 'actividad-1', sesionId: 'sesion-1' },
      update: {},
    });

    await expect(
      servicio.quitar(tenantUsuario(), 'grupo-1', 'actividad-1')
    ).rejects.toBeInstanceOf(ActividadYaEmpezadaException);
  });

  it('con el modo apagado igual deja quitar: un botón que falla sería peor', async () => {
    const { servicio, bd } = crearServicio();

    await servicio.agregar(tenantUsuario(), 'grupo-1', { actividadId: 'actividad-1' });

    const { servicio: conModoApagado } = crearServicio({ planDelDiaActivo: false });

    await expect(
      conModoApagado.quitar(tenantUsuario(), 'grupo-1', 'actividad-1')
    ).resolves.toBeDefined();
    expect(bd.seleccionesPlanDia).toHaveLength(1);
  });
});

describe('PlanDiaService — alta automática al registrar (fase-14-17, decisión 9)', () => {
  it('agrega al plan una elegible que se completó sin haber sido elegida', async () => {
    const { servicio, bd } = crearServicio();

    await servicio.asegurarEnPlan('org-1', actividadDePrueba(), 'usuario-1', 'sesion-1');

    expect(bd.seleccionesPlanDia).toHaveLength(1);
  });

  it('no toca el plan si el grupo tiene el modo apagado', async () => {
    const { servicio, bd } = crearServicio({ planDelDiaActivo: false });

    await servicio.asegurarEnPlan('org-1', actividadDePrueba(), 'usuario-1', 'sesion-1');

    expect(bd.seleccionesPlanDia).toHaveLength(0);
  });

  it('no escribe nada para una actividad que el plan no esconde', async () => {
    const { servicio, bd } = crearServicio();

    await servicio.asegurarEnPlan(
      'org-1',
      actividadDePrueba({ tipoPuntaje: 'OBLIGATORIA' }),
      'usuario-1',
      'sesion-1'
    );

    expect(bd.seleccionesPlanDia).toHaveLength(0);
  });

  it('nunca lanza: un registro ya commiteado no puede caerse por el plan', async () => {
    const { servicio, bd } = crearServicio();

    vi.spyOn(bd.prisma.client.seleccionPlanDia, 'upsert').mockRejectedValue(
      new Error('base caída')
    );

    await expect(
      servicio.asegurarEnPlan('org-1', actividadDePrueba(), 'usuario-1', 'sesion-1')
    ).resolves.toBeUndefined();
  });
});
