import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { EstadoSeccion, EstadoSesion } from '@dorado/shared-types';
import type { EquipoInternoDto, GrupoDto, TenantContext } from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import type {
  SeccionActualInterna,
  SessionClientService,
} from '../clientes/session-client.service';
import {
  LimiteRepeticionesAlcanzadoException,
  MarcaNoReversibleException,
  SesionNoEditableException,
} from '../comun/excepciones';
import {
  actividadDePrueba,
  crearBdRegistroEnMemoria,
  type BdRegistroEnMemoria,
} from '../comun/testing/bd-registro-en-memoria';
import type {
  EventoAPublicar,
  EventosPublisherService,
} from '../eventos/eventos-publisher.service';
import { TareasEquipoService } from './tareas-equipo.service';

const GRUPO: GrupoDto = {
  id: 'grupo-1',
  organizacionId: 'org-1',
  nombre: 'Grupo Uno',
  timezone: 'America/La_Paz',
  createdAt: new Date().toISOString(),
};

/** Tarea de equipo de 10 pts con bono de jefe 3 (el ejemplo de la spec). */
function tareaDeEquipo(sobrescribir: Parameters<typeof actividadDePrueba>[0] = {}) {
  return actividadDePrueba({
    id: 'tarea-1',
    nombre: 'Ordenar la sala',
    alcance: 'EQUIPO',
    valorPuntos: 10,
    bonoJefePuntos: 3,
    ...sobrescribir,
  });
}

function equipoDePrueba(): EquipoInternoDto {
  return {
    equipoId: 'equipo-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    nombre: 'Los Halcones',
    estado: 'ACTIVO',
    jefeUsuarioId: 'jefe',
    miembros: [
      { usuarioId: 'jefe', rol: 'JEFE' },
      { usuarioId: 'miembro-a', rol: 'MIEMBRO' },
      { usuarioId: 'miembro-b', rol: 'MIEMBRO' },
    ],
  } as EquipoInternoDto;
}

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
  } as SeccionActualInterna;
}

function tenantJefe(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'USUARIO',
    principalId: 'jefe',
    principalType: 'USUARIO',
  } as TenantContext;
}

function tenantMiembro(): TenantContext {
  return { ...tenantJefe(), principalId: 'miembro-a' } as TenantContext;
}

function tenantTutor(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'TUTOR',
    principalId: 'tutor-1',
    principalType: 'TUTOR',
  } as TenantContext;
}

function crearServicio(
  opciones: { bd?: BdRegistroEnMemoria; seccionActual?: SeccionActualInterna | null } = {}
) {
  const bd = opciones.bd ?? crearBdRegistroEnMemoria({ actividades: [tareaDeEquipo()] });
  const publicados: EventoAPublicar<unknown>[] = [];

  const identity = {
    obtenerGrupo: vi.fn().mockResolvedValue(GRUPO),
    obtenerEquipo: vi.fn().mockResolvedValue(equipoDePrueba()),
  } as unknown as IdentityClientService;

  const session = {
    obtenerSeccionActual: vi
      .fn()
      .mockResolvedValue(
        opciones.seccionActual === undefined ? seccionActualDePrueba() : opciones.seccionActual
      ),
  } as unknown as SessionClientService;

  const eventos = {
    publicar: vi.fn(async (evento: EventoAPublicar<unknown>) => {
      publicados.push(evento);
    }),
  } as unknown as EventosPublisherService;

  return {
    servicio: new TareasEquipoService(bd.prisma, identity, session, eventos),
    bd,
    publicados,
  };
}

describe('TareasEquipoService — anular una tarea de equipo (fase-14-13)', () => {
  it('el Tutor anula la completada y publica TareaEquipoAnulada', async () => {
    const { servicio, bd, publicados } = crearServicio();

    const hecha = await servicio.completar(tenantJefe(), 'equipo-1', 'tarea-1');
    const anulada = await servicio.anular(
      tenantTutor(),
      hecha.registroTareaEquipoId,
      'No la terminaron'
    );

    expect(anulada).toMatchObject({ eliminado: true, motivoTutor: 'No la terminaron' });
    expect(bd.registrosTareaEquipo[0]).toMatchObject({
      eliminado: true,
      eliminadoPorTutorId: 'tutor-1',
      motivoTutor: 'No la terminaron',
    });

    const evento = publicados.find((e) => e.eventType === 'TareaEquipoAnulada');
    expect(evento).toMatchObject({ routingKey: 'activity.tarea_equipo_anulada' });
    expect(evento?.payload).toMatchObject({
      registroTareaEquipoId: hecha.registroTareaEquipoId,
      equipoId: 'equipo-1',
      tutorId: 'tutor-1',
    });
  });

  it('anular quema el intento: el jefe no puede volver a marcarla hoy', async () => {
    const { servicio } = crearServicio();

    const hecha = await servicio.completar(tenantJefe(), 'equipo-1', 'tarea-1');
    await servicio.anular(tenantTutor(), hecha.registroTareaEquipoId);

    await expect(servicio.completar(tenantJefe(), 'equipo-1', 'tarea-1')).rejects.toThrow(
      LimiteRepeticionesAlcanzadoException
    );
  });

  it('deshacer la anulación publica TareaEquipoRevertida y conserva la historia', async () => {
    const { servicio, bd, publicados } = crearServicio();

    const hecha = await servicio.completar(tenantJefe(), 'equipo-1', 'tarea-1');
    await servicio.anular(tenantTutor(), hecha.registroTareaEquipoId);
    const revertida = await servicio.revertirAnulacion(
      tenantTutor(),
      hecha.registroTareaEquipoId
    );

    expect(revertida).toMatchObject({ eliminado: false });
    // No se limpia el rastro de la anulación (fase-14-12, decisión 7).
    expect(bd.registrosTareaEquipo[0]).toMatchObject({
      eliminado: false,
      eliminadoPorTutorId: 'tutor-1',
      revertidoPorTutorId: 'tutor-1',
    });
    expect(bd.registrosTareaEquipo[0].eliminadoEn).not.toBeNull();

    const evento = publicados.find((e) => e.eventType === 'TareaEquipoRevertida');
    expect(evento).toMatchObject({ routingKey: 'activity.tarea_equipo_revertida' });
  });

  it('anular dos veces la misma completada → 409', async () => {
    const { servicio } = crearServicio();

    const hecha = await servicio.completar(tenantJefe(), 'equipo-1', 'tarea-1');
    await servicio.anular(tenantTutor(), hecha.registroTareaEquipoId);

    await expect(
      servicio.anular(tenantTutor(), hecha.registroTareaEquipoId)
    ).rejects.toThrow(ConflictException);
  });

  it('revertir algo que no está anulado → 409 MARCA_NO_REVERSIBLE', async () => {
    const { servicio } = crearServicio();

    const hecha = await servicio.completar(tenantJefe(), 'equipo-1', 'tarea-1');

    await expect(
      servicio.revertirAnulacion(tenantTutor(), hecha.registroTareaEquipoId)
    ).rejects.toThrow(MarcaNoReversibleException);
  });

  it('una completada de otra organización → 404 (no revela que existe)', async () => {
    const { servicio, bd } = crearServicio();

    const hecha = await servicio.completar(tenantJefe(), 'equipo-1', 'tarea-1');
    const tenantAjeno = { ...tenantTutor(), organizacionId: 'org-2' } as TenantContext;

    await expect(
      servicio.anular(tenantAjeno, hecha.registroTareaEquipoId)
    ).rejects.toThrow(NotFoundException);
    expect(bd.registrosTareaEquipo[0].eliminado).toBe(false);
  });

  // fase-14-33: una completada de otra Sesión de la MISMA Sección sí se toca —
  // el borde ahora es la Sección (misma corrección que en el #12 y el #18).
  it('una completada de otra Sección ya no se toca → 409 SESION_NO_EDITABLE', async () => {
    const { servicio, bd } = crearServicio();

    const hecha = await servicio.completar(tenantJefe(), 'equipo-1', 'tarea-1');
    bd.registrosTareaEquipo[0].sesionId = 'sesion-de-otra-seccion';

    await expect(
      servicio.anular(tenantTutor(), hecha.registroTareaEquipoId)
    ).rejects.toThrow(SesionNoEditableException);
  });
});

describe('TareasEquipoService — tareas de hoy (fase-14-13)', () => {
  it('sin nada hecho: contadores en 0 y tope igual al máximo', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [tareaDeEquipo({ repeticionesMaximasSesion: 2 })],
    });
    const { servicio } = crearServicio({ bd });

    const tareas = await servicio.tareasDeHoy(tenantJefe(), 'equipo-1');

    expect(tareas).toHaveLength(1);
    expect(tareas[0]).toMatchObject({
      actividadId: 'tarea-1',
      nombre: 'Ordenar la sala',
      vecesHechas: 0,
      vecesAnuladas: 0,
      topeEfectivo: 2,
      motivoTutor: null,
      disponibleHoy: true,
    });
  });

  it('con una anulada: baja el tope efectivo y expone el motivo', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [tareaDeEquipo({ repeticionesMaximasSesion: 2 })],
    });
    const { servicio } = crearServicio({ bd });

    const primera = await servicio.completar(tenantJefe(), 'equipo-1', 'tarea-1');
    await servicio.completar(tenantJefe(), 'equipo-1', 'tarea-1');
    await servicio.anular(tenantTutor(), primera.registroTareaEquipoId, 'Quedó a medias');

    const tareas = await servicio.tareasDeHoy(tenantJefe(), 'equipo-1');

    expect(tareas[0]).toMatchObject({
      repeticionesMaximasSesion: 2,
      vecesHechas: 1,
      vecesAnuladas: 1,
      topeEfectivo: 1,
      motivoTutor: 'Quedó a medias',
    });
  });

  it('el USUARIO recibe el estado agregado pero NO los ids con los que se anula', async () => {
    const { servicio } = crearServicio();

    await servicio.completar(tenantJefe(), 'equipo-1', 'tarea-1');

    const paraElMiembro = await servicio.tareasDeHoy(tenantMiembro(), 'equipo-1');
    const paraElTutor = await servicio.tareasDeHoy(tenantTutor(), 'equipo-1');

    expect(paraElMiembro[0].vecesHechas).toBe(1);
    expect(paraElMiembro[0].registros).toEqual([]);
    expect(paraElTutor[0].registros).toHaveLength(1);
  });

  it('cualquier miembro lo puede leer, no solo el jefe (la anulación les costó a todos)', async () => {
    const { servicio } = crearServicio();

    await expect(servicio.tareasDeHoy(tenantMiembro(), 'equipo-1')).resolves.toHaveLength(1);
  });

  it('sin Sesión abierta devuelve las tareas con los contadores en 0, no un error', async () => {
    const { servicio } = crearServicio({ seccionActual: null });

    const tareas = await servicio.tareasDeHoy(tenantJefe(), 'equipo-1');

    expect(tareas[0]).toMatchObject({ vecesHechas: 0, vecesAnuladas: 0 });
  });

  it('solo devuelve tareas de EQUIPO, no las individuales del grupo', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [tareaDeEquipo(), actividadDePrueba({ id: 'individual-1' })],
    });
    const { servicio } = crearServicio({ bd });

    const tareas = await servicio.tareasDeHoy(tenantJefe(), 'equipo-1');

    expect(tareas.map((tarea) => tarea.actividadId)).toEqual(['tarea-1']);
  });
});
