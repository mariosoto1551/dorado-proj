import { describe, expect, it, vi } from 'vitest';

import {
  EstadoSeccion,
  EstadoSesion,
  TipoEventoHistorial,
  TipoRegistroHistorial,
} from '@dorado/shared-types';
import type {
  EquipoInternoDto,
  GrupoDto,
  TenantContext,
  TutorDto,
  UsuarioDto,
} from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import type {
  SeccionActualInterna,
  SessionClientService,
} from '../clientes/session-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { CursorHistorialInvalidoException } from '../comun/excepciones';
import {
  crearBdHistorialEnMemoria,
  type BdHistorialEnMemoria,
} from '../comun/testing/bd-historial-en-memoria';
import {
  actividadDePrueba,
  conductaDePrueba,
} from '../comun/testing/bd-registro-en-memoria';
import type {
  NotaRegistro,
  RegistroActividad,
  RegistroConducta,
  RegistroTareaEquipo,
} from '../generated/prisma/client';
import { HistorialService } from './historial.service';

const GRUPO: GrupoDto = {
  id: 'grupo-1',
  organizacionId: 'org-1',
  nombre: 'Grupo Uno',
  timezone: 'America/La_Paz',
  createdAt: new Date().toISOString(),
};

const ANA: UsuarioDto = {
  id: 'usuario-1',
  organizacionId: 'org-1',
  grupoId: 'grupo-1',
  username: 'ana',
  nombre: 'Ana',
  avatarId: 'a1',
  estado: 'ACTIVO',
  createdAt: new Date().toISOString(),
};

const LUIS: UsuarioDto = { ...ANA, id: 'usuario-2', username: 'luis', nombre: 'Luis' };

const TUTORA: TutorDto = {
  id: 'tutor-1',
  organizacionId: 'org-1',
  email: 'tutora@dorado.test',
  nombre: 'Marta',
  rol: 'TUTOR' as TutorDto['rol'],
  grupoIds: ['grupo-1'],
  estado: 'ACTIVO',
  createdAt: new Date().toISOString(),
};

const EQUIPO: EquipoInternoDto = {
  equipoId: 'equipo-1',
  organizacionId: 'org-1',
  grupoId: 'grupo-1',
  nombre: 'Los Rojos',
  estado: 'ACTIVO',
  jefeUsuarioId: 'usuario-1',
  miembros: [],
};

function tenantTutor(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'TUTOR',
    principalId: 'tutor-1',
    principalType: 'TUTOR',
  } as TenantContext;
}

function seccionConSesionAbierta(): SeccionActualInterna {
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

function actividadRegistrada(
  sobrescribir: Partial<RegistroActividad> = {}
): RegistroActividad {
  return {
    id: 'reg-act-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    usuarioId: 'usuario-1',
    actividadId: 'actividad-1',
    sesionId: 'sesion-1',
    seccionId: 'seccion-1',
    tipo: 'COMPLETADA',
    valorPuntosSnapshot: 5,
    registradoPorId: 'usuario-1',
    registradoPorTipo: 'USUARIO',
    eliminado: false,
    eliminadoPorTutorId: null,
    eliminadoEn: null,
    motivoTutor: null,
    revertidoPorTutorId: null,
    revertidoEn: null,
    createdAt: new Date('2026-07-13T14:00:00.000Z'),
    ...sobrescribir,
  } as RegistroActividad;
}

function conductaRegistrada(sobrescribir: Partial<RegistroConducta> = {}): RegistroConducta {
  return {
    id: 'reg-con-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    usuarioId: 'usuario-2',
    conductaId: 'conducta-1',
    sesionId: 'sesion-1',
    seccionId: 'seccion-1',
    valorPuntosSnapshot: -5,
    registradoPorId: 'tutor-1',
    registradoPorTipo: 'TUTOR',
    eliminado: false,
    eliminadoPorTutorId: null,
    eliminadoEn: null,
    createdAt: new Date('2026-07-13T15:00:00.000Z'),
    ...sobrescribir,
  } as RegistroConducta;
}

function tareaEquipoRegistrada(
  sobrescribir: Partial<RegistroTareaEquipo> = {}
): RegistroTareaEquipo {
  return {
    id: 'reg-eq-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    equipoId: 'equipo-1',
    actividadId: 'actividad-2',
    sesionId: 'sesion-1',
    seccionId: 'seccion-1',
    valorPuntosSnapshot: 8,
    bonoJefeSnapshot: 3,
    jefeUsuarioIdSnapshot: 'usuario-1',
    miembrosSnapshot: [
      { usuarioId: 'usuario-1', esJefe: true, puntos: 11 },
      { usuarioId: 'usuario-2', esJefe: false, puntos: 8 },
    ],
    completadaPorId: 'usuario-1',
    completadaPorTipo: 'USUARIO',
    eliminado: false,
    eliminadoPorTutorId: null,
    eliminadoEn: null,
    motivoTutor: null,
    revertidoPorTutorId: null,
    revertidoEn: null,
    createdAt: new Date('2026-07-13T16:00:00.000Z'),
    ...sobrescribir,
  } as RegistroTareaEquipo;
}

function armar(
  bd: BdHistorialEnMemoria,
  seccion: SeccionActualInterna | null = seccionConSesionAbierta()
): { servicio: HistorialService; identity: { equiposDelGrupo: ReturnType<typeof vi.fn> } } {
  const session = {
    obtenerSeccionActual: vi.fn().mockResolvedValue(seccion),
  } as unknown as SessionClientService;

  const identity = {
    obtenerGrupo: vi.fn().mockResolvedValue(GRUPO),
    usuariosDelGrupo: vi.fn().mockResolvedValue([ANA, LUIS]),
    tutoresDelGrupo: vi.fn().mockResolvedValue([TUTORA]),
    equiposDelGrupo: vi.fn().mockResolvedValue([EQUIPO]),
  };

  const servicio = new HistorialService(
    bd.prisma,
    session,
    identity as unknown as IdentityClientService,
    new AccesoGrupoService(identity as unknown as IdentityClientService)
  );

  return { servicio, identity };
}

describe('HistorialService (fase-14-18)', () => {
  it('une las tres tablas en un solo timeline, más reciente primero', async () => {
    const bd = crearBdHistorialEnMemoria({
      actividades: [
        actividadDePrueba({ id: 'actividad-1', nombre: 'Tender la cama' }),
        actividadDePrueba({ id: 'actividad-2', nombre: 'Limpiar el patio' }),
      ],
      conductas: [conductaDePrueba({ id: 'conducta-1', nombre: 'Pelea' })],
      registrosActividad: [actividadRegistrada()],
      registrosConducta: [conductaRegistrada()],
      registrosTareaEquipo: [tareaEquipoRegistrada()],
    });

    const { servicio } = armar(bd);
    const historial = await servicio.historialDeLaSesion(tenantTutor(), 'grupo-1', {});

    expect(historial.sesionId).toBe('sesion-1');
    expect(historial.sesionEstado).toBe(EstadoSesion.ABIERTA);
    expect(historial.timezoneGrupo).toBe('America/La_Paz');
    expect(historial.eventos.map((evento) => evento.tipo)).toEqual([
      TipoEventoHistorial.TAREA_EQUIPO,
      TipoEventoHistorial.CONDUCTA,
      TipoEventoHistorial.ACTIVIDAD_COMPLETADA,
    ]);
    expect(historial.cursorSiguiente).toBeNull();
  });

  it('resuelve nombres de participante, ítem y autor', async () => {
    const bd = crearBdHistorialEnMemoria({
      actividades: [actividadDePrueba({ id: 'actividad-1', nombre: 'Tender la cama' })],
      registrosActividad: [actividadRegistrada()],
    });

    const { servicio } = armar(bd);
    const { eventos } = await servicio.historialDeLaSesion(tenantTutor(), 'grupo-1', {});

    expect(eventos[0]).toMatchObject({
      usuarioNombre: 'Ana',
      itemNombre: 'Tender la cama',
      registradoPorNombre: 'Ana',
      puntos: 5,
    });
  });

  it('muestra el castigo automático del cierre como "Automático al cerrar el día"', async () => {
    const bd = crearBdHistorialEnMemoria({
      actividades: [actividadDePrueba({ id: 'actividad-1', nombre: 'Tarea de mate' })],
      registrosActividad: [
        actividadRegistrada({
          tipo: 'NO_HIZO',
          valorPuntosSnapshot: -10,
          registradoPorId: 'SYSTEM',
          registradoPorTipo: 'SYSTEM',
        }),
      ],
    });

    const { servicio } = armar(bd);
    const { eventos } = await servicio.historialDeLaSesion(tenantTutor(), 'grupo-1', {});

    expect(eventos[0]).toMatchObject({
      tipo: TipoEventoHistorial.ACTIVIDAD_NO_HIZO,
      registradoPorNombre: 'Automático al cerrar el día',
      puntos: -10,
    });
  });

  it('incluye la confirmación de una obligatoria aunque valga 0 puntos', async () => {
    const bd = crearBdHistorialEnMemoria({
      actividades: [actividadDePrueba({ id: 'actividad-1', nombre: 'Lavarse los dientes' })],
      registrosActividad: [actividadRegistrada({ valorPuntosSnapshot: 0 })],
    });

    const { servicio } = armar(bd);
    const { eventos } = await servicio.historialDeLaSesion(tenantTutor(), 'grupo-1', {});

    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.puntos).toBe(0);
  });

  it('muestra lo anulado con su rastro, y lo esconde solo si se lo piden', async () => {
    const bd = crearBdHistorialEnMemoria({
      actividades: [actividadDePrueba({ id: 'actividad-1', nombre: 'Tender la cama' })],
      registrosActividad: [
        actividadRegistrada({
          eliminado: true,
          eliminadoPorTutorId: 'tutor-1',
          eliminadoEn: new Date('2026-07-13T18:00:00.000Z'),
          motivoTutor: 'La deshizo al rato',
        }),
      ],
    });

    const { servicio } = armar(bd);
    const conAnulados = await servicio.historialDeLaSesion(tenantTutor(), 'grupo-1', {});

    expect(conAnulados.eventos[0]).toMatchObject({
      anulado: true,
      anuladoPorNombre: 'Marta',
      motivoTutor: 'La deshizo al rato',
    });

    const sinAnulados = await servicio.historialDeLaSesion(tenantTutor(), 'grupo-1', {
      incluirAnulados: false,
    });

    expect(sinAnulados.eventos).toHaveLength(0);
  });

  it('la tarea de equipo trae equipo, puntos por miembro y bono del jefe', async () => {
    const bd = crearBdHistorialEnMemoria({
      actividades: [actividadDePrueba({ id: 'actividad-2', nombre: 'Limpiar el patio' })],
      registrosTareaEquipo: [tareaEquipoRegistrada()],
    });

    const { servicio } = armar(bd);
    const { eventos } = await servicio.historialDeLaSesion(tenantTutor(), 'grupo-1', {});

    expect(eventos[0]).toMatchObject({
      tipo: TipoEventoHistorial.TAREA_EQUIPO,
      usuarioId: null,
      equipoNombre: 'Los Rojos',
      puntos: 8,
      bonoJefe: 3,
      cantidadMiembros: 2,
      registradoPorNombre: 'Ana',
    });
  });

  it('filtra por participante, incluidas las tareas de equipo por snapshot', async () => {
    const bd = crearBdHistorialEnMemoria({
      actividades: [
        actividadDePrueba({ id: 'actividad-1', nombre: 'Tender la cama' }),
        actividadDePrueba({ id: 'actividad-2', nombre: 'Limpiar el patio' }),
      ],
      registrosActividad: [actividadRegistrada()],
      registrosTareaEquipo: [
        tareaEquipoRegistrada(),
        tareaEquipoRegistrada({
          id: 'reg-eq-2',
          miembrosSnapshot: [{ usuarioId: 'usuario-3', esJefe: true, puntos: 8 }],
        }),
      ],
    });

    const { servicio } = armar(bd);
    const { eventos } = await servicio.historialDeLaSesion(tenantTutor(), 'grupo-1', {
      usuarioId: 'usuario-1',
    });

    expect(eventos.map((evento) => evento.id)).toEqual(['reg-eq-1', 'reg-act-1']);
  });

  it('filtra por tipo de registro', async () => {
    const bd = crearBdHistorialEnMemoria({
      actividades: [actividadDePrueba({ id: 'actividad-1' })],
      conductas: [conductaDePrueba({ id: 'conducta-1' })],
      registrosActividad: [actividadRegistrada()],
      registrosConducta: [conductaRegistrada()],
    });

    const { servicio } = armar(bd);
    const { eventos } = await servicio.historialDeLaSesion(tenantTutor(), 'grupo-1', {
      tipo: TipoRegistroHistorial.CONDUCTA,
    });

    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.tipo).toBe(TipoEventoHistorial.CONDUCTA);
  });

  it('pagina por cursor sin repetir ni saltear, con el id como desempate', async () => {
    // Las tres del MISMO instante: sin desempate por id, la página 2 repetiría.
    const mismoInstante = new Date('2026-07-13T14:00:00.000Z');
    const bd = crearBdHistorialEnMemoria({
      actividades: [actividadDePrueba({ id: 'actividad-1', nombre: 'Tender la cama' })],
      registrosActividad: [
        actividadRegistrada({ id: 'reg-a', createdAt: mismoInstante }),
        actividadRegistrada({ id: 'reg-b', createdAt: mismoInstante }),
        actividadRegistrada({ id: 'reg-c', createdAt: mismoInstante }),
      ],
    });

    const { servicio } = armar(bd);
    const primera = await servicio.historialDeLaSesion(tenantTutor(), 'grupo-1', { limite: 2 });

    expect(primera.eventos.map((evento) => evento.id)).toEqual(['reg-c', 'reg-b']);
    expect(primera.cursorSiguiente).not.toBeNull();

    const segunda = await servicio.historialDeLaSesion(tenantTutor(), 'grupo-1', {
      limite: 2,
      cursor: primera.cursorSiguiente ?? undefined,
    });

    expect(segunda.eventos.map((evento) => evento.id)).toEqual(['reg-a']);
    expect(segunda.cursorSiguiente).toBeNull();
  });

  it('rechaza un cursor corrupto con 400', async () => {
    const bd = crearBdHistorialEnMemoria();
    const { servicio } = armar(bd);

    await expect(
      servicio.historialDeLaSesion(tenantTutor(), 'grupo-1', { cursor: 'no-es-un-cursor' })
    ).rejects.toBeInstanceOf(CursorHistorialInvalidoException);
  });

  it('sin Sección vigente devuelve vacío, no un error', async () => {
    const bd = crearBdHistorialEnMemoria();
    const { servicio } = armar(bd, null);
    const historial = await servicio.historialDeLaSesion(tenantTutor(), 'grupo-1', {});

    expect(historial).toMatchObject({ sesionId: null, sesionEstado: null, eventos: [] });
  });

  it('sin Sesión abierta cae en la última ya empezada, en solo lectura', async () => {
    const seccion = seccionConSesionAbierta();
    const [plantilla] = seccion.sesiones;

    seccion.estado = EstadoSeccion.EVALUACION;
    seccion.sesiones = [
      { ...plantilla, id: 'sesion-0', estado: EstadoSesion.CERRADA },
      {
        ...plantilla,
        id: 'sesion-1',
        estado: EstadoSesion.CERRADA,
        fechaInicio: '2026-07-14T04:00:00.000Z',
      },
    ];

    const bd = crearBdHistorialEnMemoria({
      actividades: [actividadDePrueba({ id: 'actividad-1' })],
      registrosActividad: [actividadRegistrada()],
    });

    const { servicio } = armar(bd, seccion);
    const historial = await servicio.historialDeLaSesion(tenantTutor(), 'grupo-1', {});

    expect(historial.sesionId).toBe('sesion-1');
    expect(historial.sesionEstado).toBe(EstadoSesion.CERRADA);
  });

  it('cae en fallbacks legibles cuando el autor ya no está en el grupo', async () => {
    const bd = crearBdHistorialEnMemoria({
      actividades: [actividadDePrueba({ id: 'actividad-1', nombre: 'Tender la cama' })],
      registrosActividad: [
        actividadRegistrada({ registradoPorId: 'tutor-viejo', registradoPorTipo: 'TUTOR' }),
      ],
    });

    const { servicio } = armar(bd);
    const { eventos } = await servicio.historialDeLaSesion(tenantTutor(), 'grupo-1', {});

    expect(eventos[0]?.registradoPorNombre).toBe('Tutor (ya no está en el grupo)');
  });

  it('adjunta las notas internas y marca cuáles son propias', async () => {
    const nota = (sobrescribir: Partial<NotaRegistro>): NotaRegistro =>
      ({
        id: 'nota-1',
        organizacionId: 'org-1',
        grupoId: 'grupo-1',
        registroTipo: 'ACTIVIDAD',
        registroId: 'reg-act-1',
        texto: 'Lo hablamos en la reunión',
        autorTutorId: 'tutor-1',
        createdAt: new Date('2026-07-13T17:00:00.000Z'),
        ...sobrescribir,
      }) as NotaRegistro;

    const bd = crearBdHistorialEnMemoria({
      actividades: [actividadDePrueba({ id: 'actividad-1' })],
      registrosActividad: [actividadRegistrada()],
      notas: [nota({}), nota({ id: 'nota-2', autorTutorId: 'tutor-9' })],
    });

    const { servicio } = armar(bd);
    const { eventos } = await servicio.historialDeLaSesion(tenantTutor(), 'grupo-1', {});

    expect(eventos[0]?.notas).toHaveLength(2);
    expect(eventos[0]?.notas[0]).toMatchObject({ autorNombre: 'Marta', esPropia: true });
    expect(eventos[0]?.notas[1]?.esPropia).toBe(false);
  });

  it('no llama al interno de equipos si la página no tiene tareas de equipo', async () => {
    const bd = crearBdHistorialEnMemoria({
      actividades: [actividadDePrueba({ id: 'actividad-1' })],
      registrosActividad: [actividadRegistrada()],
    });

    const { servicio, identity } = armar(bd);

    await servicio.historialDeLaSesion(tenantTutor(), 'grupo-1', {});

    expect(identity.equiposDelGrupo).not.toHaveBeenCalled();
  });
});
