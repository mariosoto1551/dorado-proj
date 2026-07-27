import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type { EventEnvelope } from '@dorado/shared-events';
import type { ActividadDto, ConductaDto, TutorDto, UsuarioDto } from '@dorado/shared-types';

import type { ActivityClientService } from '../clientes/activity-client.service';
import type { IdentityClientService } from '../clientes/identity-client.service';
import { PlantillasService } from './plantillas.service';

function tutorDePrueba(id: string): TutorDto {
  return {
    id,
    organizacionId: 'org-1',
    email: `${id}@test.dev`,
    nombre: id,
    rol: 'TUTOR',
    grupoIds: ['grupo-1'],
    estado: 'ACTIVO',
    createdAt: new Date().toISOString(),
  } as TutorDto;
}

function usuarioDePrueba(id: string): UsuarioDto {
  return {
    id,
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    username: id,
    nombre: `Nombre de ${id}`,
    avatarId: 'a1',
    estado: 'ACTIVO',
    createdAt: new Date().toISOString(),
  };
}

function envelopeDePrueba<T>(eventType: string, payload: T): EventEnvelope<T> {
  return {
    eventId: randomUUID(),
    eventType,
    producedBy: 'test',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    occurredAt: new Date().toISOString(),
    correlationId: randomUUID(),
    payload,
  };
}

function crearServicio(opciones: {
  tutores?: TutorDto[];
  usuarios?: UsuarioDto[];
  actividad?: ActividadDto | null;
  conducta?: ConductaDto | null;
} = {}) {
  const identity = {
    tutoresDelGrupo: vi.fn().mockResolvedValue(opciones.tutores ?? [tutorDePrueba('tutor-1'), tutorDePrueba('tutor-2')]),
    usuariosDelGrupo: vi.fn().mockResolvedValue(opciones.usuarios ?? [usuarioDePrueba('usuario-1')]),
    obtenerUsuario: vi.fn(async (id: string) => usuarioDePrueba(id)),
  } as unknown as IdentityClientService;
  const activity = {
    obtenerActividad: vi
      .fn()
      .mockResolvedValue(
        opciones.actividad === undefined ? ({ nombre: 'Leer 30 minutos' } as ActividadDto) : opciones.actividad
      ),
    obtenerConducta: vi
      .fn()
      .mockResolvedValue(
        opciones.conducta === undefined ? ({ nombre: 'Pelea' } as ConductaDto) : opciones.conducta
      ),
  } as unknown as ActivityClientService;

  return new PlantillasService(identity, activity);
}

describe('PlantillasService — destinatarios y mensajes (tabla de la spec)', () => {
  it('InvitacionGenerada notifica a los tutores del grupo EXCEPTO quien la generó', async () => {
    const servicio = crearServicio();

    const filas = await servicio.armar(
      envelopeDePrueba('InvitacionGenerada', {
        invitacionId: 'inv-1',
        organizacionId: 'org-1',
        grupoId: 'grupo-1',
        tipoInvitado: 'USUARIO',
        codigo: 'ABC123',
        expiraEn: new Date().toISOString(),
        creadoPorTutorId: 'tutor-1',
      })
    );

    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      destinatarioId: 'tutor-2',
      destinatarioTipo: 'TUTOR',
      tipo: 'INVITACION_GENERADA',
      mensaje: 'Se generó una invitación de USUARIO para el grupo.',
    });
  });

  it('NoHizoRegistrado notifica al usuario con el nombre de la actividad', async () => {
    const servicio = crearServicio();

    const filas = await servicio.armar(
      envelopeDePrueba('NoHizoRegistrado', {
        registroId: 'r-1',
        usuarioId: 'usuario-1',
        actividadId: 'act-1',
        sesionId: 's-1',
        seccionId: 'sec-1',
        valorPuntosSnapshot: -20,
        registradoPorId: 'tutor-1',
        registradoPorTipo: 'TUTOR',
      })
    );

    expect(filas).toHaveLength(1);
    expect(filas[0].mensaje).toBe('Se registró que no hiciste: Leer 30 minutos.');
  });

  it('si activity responde 404, el mensaje usa el fallback (no se pierde la notificación)', async () => {
    const servicio = crearServicio({ actividad: null });

    const filas = await servicio.armar(
      envelopeDePrueba('NoHizoRegistrado', {
        registroId: 'r-1',
        usuarioId: 'usuario-1',
        actividadId: 'act-borrada',
        sesionId: 's-1',
        seccionId: 'sec-1',
        valorPuntosSnapshot: -20,
        registradoPorId: 'tutor-1',
        registradoPorTipo: 'TUTOR',
      })
    );

    expect(filas[0].mensaje).toBe('Se registró que no hiciste: una actividad.');
  });

  it('ConductaRegistrada por TUTOR notifica; el autoreporte NO (el usuario ya lo sabe)', async () => {
    const servicio = crearServicio();
    const base = {
      registroId: 'r-1',
      usuarioId: 'usuario-1',
      conductaId: 'con-1',
      tipo: 'MALA' as const,
      sesionId: 's-1',
      seccionId: 'sec-1',
      valorPuntosSnapshot: -5,
      registradoPorId: 'tutor-1',
    };

    const porTutor = await servicio.armar(
      envelopeDePrueba('ConductaRegistrada', { ...base, registradoPorTipo: 'TUTOR' as const })
    );
    const autoreporte = await servicio.armar(
      envelopeDePrueba('ConductaRegistrada', {
        ...base,
        registradoPorId: 'usuario-1',
        registradoPorTipo: 'USUARIO' as const,
      })
    );

    expect(porTutor).toHaveLength(1);
    expect(porTutor[0].mensaje).toBe('Se registró una conducta MALA: Pelea.');
    expect(autoreporte).toHaveLength(0);
  });

  it('SeccionEntroEvaluacion notifica a usuarios y tutores con mensajes DISTINTOS', async () => {
    const servicio = crearServicio({
      usuarios: [usuarioDePrueba('usuario-1'), usuarioDePrueba('usuario-2')],
      tutores: [tutorDePrueba('tutor-1')],
    });

    const filas = await servicio.armar(
      envelopeDePrueba('SeccionEntroEvaluacion', {
        seccionId: 'sec-1',
        organizacionId: 'org-1',
        grupoId: 'grupo-1',
        numero: 1,
      })
    );

    expect(filas).toHaveLength(3);
    const deUsuarios = filas.filter((fila) => fila.destinatarioTipo === 'USUARIO');
    const deTutores = filas.filter((fila) => fila.destinatarioTipo === 'TUTOR');
    expect(deUsuarios.every((fila) => fila.mensaje === '¡Terminó la semana! Ya podés ver tu resultado.')).toBe(true);
    expect(deTutores[0].mensaje).toBe('La Sección entró en evaluación, revisá los resultados.');
  });

  it('ZonaAlcanzada final notifica al usuario; la intermedia se descarta', async () => {
    const servicio = crearServicio();
    const base = {
      usuarioId: 'usuario-1',
      seccionId: 'sec-1',
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
      puntajeTotal: 180,
      umbralZonaId: 'u-dorado',
      nombreZona: 'Dorado',
    };

    const final = await servicio.armar(
      envelopeDePrueba('ZonaAlcanzada', { ...base, esEvaluacionFinal: true })
    );
    const intermedia = await servicio.armar(
      envelopeDePrueba('ZonaAlcanzada', { ...base, esEvaluacionFinal: false })
    );

    expect(final).toHaveLength(1);
    expect(final[0].mensaje).toBe('Llegaste a la zona Dorado esta Sección.');
    expect(intermedia).toHaveLength(0);
  });

  it('UsuarioDescalificado notifica al usuario Y a los tutores con el motivo', async () => {
    const servicio = crearServicio({ tutores: [tutorDePrueba('tutor-1')] });

    const filas = await servicio.armar(
      envelopeDePrueba('UsuarioDescalificado', {
        usuarioId: 'usuario-1',
        seccionId: 'sec-1',
        organizacionId: 'org-1',
        grupoId: 'grupo-1',
        motivo: 'trampa',
        registradaPorTutorId: 'tutor-1',
      })
    );

    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({
      destinatarioId: 'usuario-1',
      mensaje: 'Fuiste descalificado de esta Sección: trampa.',
    });
    expect(filas[1]).toMatchObject({
      destinatarioId: 'tutor-1',
      mensaje: 'Nombre de usuario-1 fue descalificado: trampa.',
    });
  });

  it('RecompensaCanjeada notifica a los tutores con el nombre del usuario', async () => {
    const servicio = crearServicio({ tutores: [tutorDePrueba('tutor-1')] });

    const filas = await servicio.armar(
      envelopeDePrueba('RecompensaCanjeada', {
        canjeId: 'c-1',
        usuarioId: 'usuario-1',
        seccionId: 'sec-1',
        recompensaId: 'r-1',
        mecanica: 'SELECCION',
        organizacionId: 'org-1',
        grupoId: 'grupo-1',
      })
    );

    expect(filas).toHaveLength(1);
    expect(filas[0].mensaje).toBe('Nombre de usuario-1 canjeó una recompensa, pendiente de entrega.');
  });
  it('ActividadPropuestaCreada en BAJO_APROBACION pide revisión a los tutores (fase-14-10)', async () => {
    const servicio = crearServicio({ tutores: [tutorDePrueba('tutor-1')] });

    const filas = await servicio.armar(
      envelopeDePrueba('ActividadPropuestaCreada', {
        propuestaId: 'prop-1',
        organizacionId: 'org-1',
        grupoId: 'grupo-1',
        creadaPorUsuarioId: 'usuario-1',
        nombre: 'Practicar guitarra',
        valorPuntos: 3,
        estado: 'PENDIENTE',
        requiereAprobacion: true,
        actividadId: null,
      })
    );

    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      destinatarioId: 'tutor-1',
      destinatarioTipo: 'TUTOR',
      tipo: 'ACTIVIDAD_PROPUESTA_CREADA',
    });
    expect(filas[0].mensaje).toBe(
      'Nombre de usuario-1 propuso la actividad «Practicar guitarra» (3 pts) — revisala para aprobarla o rechazarla.'
    );
  });

  it('ActividadPropuestaCreada en modo LIBRE avisa igual, pero informativo', async () => {
    const servicio = crearServicio({ tutores: [tutorDePrueba('tutor-1')] });

    const filas = await servicio.armar(
      envelopeDePrueba('ActividadPropuestaCreada', {
        propuestaId: 'prop-1',
        organizacionId: 'org-1',
        grupoId: 'grupo-1',
        creadaPorUsuarioId: 'usuario-1',
        nombre: 'Practicar guitarra',
        valorPuntos: 3,
        estado: 'APROBADA',
        requiereAprobacion: false,
        actividadId: 'act-1',
      })
    );

    expect(filas[0].mensaje).toBe(
      'Nombre de usuario-1 creó la actividad «Practicar guitarra» (3 pts).'
    );
  });

  it('ActividadPropuestaResuelta avisa al AUTOR; la auto-aprobación (SYSTEM) no notifica', async () => {
    const servicio = crearServicio();
    const base = {
      propuestaId: 'prop-1',
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
      creadaPorUsuarioId: 'usuario-1',
      nombre: 'Practicar guitarra',
      resueltoPorId: 'tutor-1',
      actividadId: 'act-1',
      motivoRechazo: null,
    };

    const aprobada = await servicio.armar(
      envelopeDePrueba('ActividadPropuestaResuelta', {
        ...base,
        estado: 'APROBADA',
        resueltoPorTipo: 'TUTOR',
      })
    );

    expect(aprobada).toHaveLength(1);
    expect(aprobada[0]).toMatchObject({
      destinatarioId: 'usuario-1',
      destinatarioTipo: 'USUARIO',
      tipo: 'ACTIVIDAD_PROPUESTA_RESUELTA',
    });
    expect(aprobada[0].mensaje).toBe(
      'Tu actividad «Practicar guitarra» fue aprobada — ya la podés marcar como hecha.'
    );

    const rechazada = await servicio.armar(
      envelopeDePrueba('ActividadPropuestaResuelta', {
        ...base,
        estado: 'RECHAZADA',
        resueltoPorTipo: 'TUTOR',
        actividadId: null,
        motivoRechazo: 'Ya está cubierta por otra',
      })
    );

    expect(rechazada[0].mensaje).toBe(
      'Tu actividad «Practicar guitarra» fue rechazada: Ya está cubierta por otra'
    );

    const automatica = await servicio.armar(
      envelopeDePrueba('ActividadPropuestaResuelta', {
        ...base,
        estado: 'APROBADA',
        resueltoPorTipo: 'SYSTEM',
      })
    );

    expect(automatica).toEqual([]);
  });
});
