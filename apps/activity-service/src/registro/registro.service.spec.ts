import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EstadoSeccion, EstadoSesion } from '@dorado/shared-types';
import type { GrupoDto, TenantContext, UsuarioDto } from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import type {
  SeccionActualInterna,
  SessionClientService,
} from '../clientes/session-client.service';
import {
  CronometroNoIniciadoException,
  CronometroVencidoException,
  DeadlineVencidoException,
  LimiteRepeticionesAlcanzadoException,
  NoHaySesionAbiertaException,
  ObligatoriaNoSeCompletaException,
} from '../comun/excepciones';
import {
  actividadDePrueba,
  conductaDePrueba,
  crearBdRegistroEnMemoria,
  type BdRegistroEnMemoria,
} from '../comun/testing/bd-registro-en-memoria';
import type {
  EventoAPublicar,
  EventosPublisherService,
} from '../eventos/eventos-publisher.service';
import { RegistroService } from './registro.service';

const GRUPO: GrupoDto = {
  id: 'grupo-1',
  organizacionId: 'org-1',
  nombre: 'Grupo Uno',
  timezone: 'America/La_Paz',
  createdAt: new Date().toISOString(),
};

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

function seccionActualDePrueba(sobrescribir: Partial<SeccionActualInterna> = {}): SeccionActualInterna {
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
    ...sobrescribir,
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

function tenantTutor(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'TUTOR',
    principalId: 'tutor-1',
    principalType: 'TUTOR',
  } as TenantContext;
}

function crearServicio(opciones: {
  bd?: BdRegistroEnMemoria;
  seccionActual?: SeccionActualInterna | null;
  usuarioDeIdentity?: UsuarioDto | null;
} = {}) {
  const bd = opciones.bd ?? crearBdRegistroEnMemoria({ actividades: [actividadDePrueba()] });
  const publicados: EventoAPublicar<unknown>[] = [];

  const identity = {
    obtenerGrupo: vi.fn().mockResolvedValue(GRUPO),
    obtenerUsuario: vi
      .fn()
      .mockResolvedValue(
        opciones.usuarioDeIdentity === undefined ? usuarioDePrueba() : opciones.usuarioDeIdentity
      ),
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

  return { servicio: new RegistroService(bd.prisma, identity, session, eventos), bd, publicados };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('RegistroService — completar', () => {
  it('un USUARIO completa una OPCIONAL: registro con snapshot positivo + evento, siempre self', async () => {
    const { servicio, bd, publicados } = crearServicio();

    // El body trae OTRO usuarioId: para un USUARIO se ignora (regla 3).
    const registro = await servicio.completar(tenantUsuario(), 'actividad-1', {
      usuarioId: 'usuario-ajeno',
    });

    expect(registro).toMatchObject({
      usuarioId: 'usuario-1',
      actividadId: 'actividad-1',
      sesionId: 'sesion-1',
      seccionId: 'seccion-1',
      tipo: 'COMPLETADA',
      valorPuntosSnapshot: 10,
      registradoPorTipo: 'USUARIO',
    });
    expect(bd.registrosActividad).toHaveLength(1);
    expect(publicados).toHaveLength(1);
    expect(publicados[0]).toMatchObject({
      eventType: 'ActividadCompletada',
      routingKey: 'activity.actividad_completada',
      grupoId: 'grupo-1',
    });
    expect(publicados[0].payload).toMatchObject({
      registroId: registro.id,
      usuarioId: 'usuario-1',
      valorPuntosSnapshot: 10,
    });
  });

  it('una OBLIGATORIA no se completa (400 OBLIGATORIA_NO_SE_COMPLETA)', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [actividadDePrueba({ tipoPuntaje: 'OBLIGATORIA' })],
    });
    const { servicio } = crearServicio({ bd });

    await expect(servicio.completar(tenantUsuario(), 'actividad-1', {})).rejects.toThrow(
      ObligatoriaNoSeCompletaException
    );
  });

  it('una actividad ARCHIVADA responde 404', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [actividadDePrueba({ estado: 'ARCHIVADA' })],
    });
    const { servicio } = crearServicio({ bd });

    await expect(servicio.completar(tenantUsuario(), 'actividad-1', {})).rejects.toThrow(
      NotFoundException
    );
  });

  it('sin Sección vigente → 409 NO_HAY_SESION_ABIERTA', async () => {
    const { servicio } = crearServicio({ seccionActual: null });

    await expect(servicio.completar(tenantUsuario(), 'actividad-1', {})).rejects.toThrow(
      NoHaySesionAbiertaException
    );
  });

  it('con la Sección en EVALUACION → 409 (ahí ya no se registra)', async () => {
    const { servicio } = crearServicio({
      seccionActual: seccionActualDePrueba({ estado: EstadoSeccion.EVALUACION }),
    });

    await expect(servicio.completar(tenantUsuario(), 'actividad-1', {})).rejects.toThrow(
      NoHaySesionAbiertaException
    );
  });

  it('con la Sesión cerrada (aunque la Sección siga ABIERTA) → 409', async () => {
    const seccion = seccionActualDePrueba();
    seccion.sesiones[0] = { ...seccion.sesiones[0], estado: EstadoSesion.CERRADA };
    const { servicio } = crearServicio({ seccionActual: seccion });

    await expect(servicio.completar(tenantUsuario(), 'actividad-1', {})).rejects.toThrow(
      NoHaySesionAbiertaException
    );
  });

  it('respeta repeticionesMaximasSesion contando solo COMPLETADA de esa sesión', async () => {
    const { servicio, bd } = crearServicio();

    await servicio.completar(tenantUsuario(), 'actividad-1', {});

    // Segunda vez en la misma sesión, con repeticionesMaximasSesion=1 → 409.
    await expect(servicio.completar(tenantUsuario(), 'actividad-1', {})).rejects.toThrow(
      LimiteRepeticionesAlcanzadoException
    );
    expect(bd.registrosActividad).toHaveLength(1);
  });

  it('TUTOR sin usuarioId en el body recibe 400', async () => {
    const { servicio } = crearServicio();

    await expect(servicio.completar(tenantTutor(), 'actividad-1', {})).rejects.toThrow(
      BadRequestException
    );
  });

  it('TUTOR con un usuario de OTRO grupo recibe 404 (identity manda)', async () => {
    const { servicio } = crearServicio({
      usuarioDeIdentity: usuarioDePrueba({ grupoId: 'grupo-2' }),
    });

    await expect(
      servicio.completar(tenantTutor(), 'actividad-1', { usuarioId: 'usuario-1' })
    ).rejects.toThrow(NotFoundException);
  });

  it('el snapshot congela el valor: editar valorPuntos después no cambia registros previos', async () => {
    const { servicio, bd } = crearServicio();
    const actividad = bd.actividades[0];

    const primero = await servicio.completar(tenantUsuario(), 'actividad-1', {});

    // El tutor edita el valor de la actividad (fase-05) y otro usuario completa.
    actividad.valorPuntos = 99;
    actividad.repeticionesMaximasSesion = 2;
    const segundo = await servicio.completar(tenantUsuario(), 'actividad-1', {});

    expect(primero.valorPuntosSnapshot).toBe(10);
    expect(bd.registrosActividad[0].valorPuntosSnapshot).toBe(10);
    expect(segundo.valorPuntosSnapshot).toBe(99);
  });

  it('DEADLINE vencido en la timezone del Grupo → 409 DEADLINE_VENCIDO', async () => {
    vi.useFakeTimers();
    // Lunes 18:01 en La Paz (22:01Z) — deadline 18:00 del día de la Sesión.
    vi.setSystemTime(new Date('2026-07-13T22:01:00Z'));
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({ tipoLimiteTiempo: 'DEADLINE', deadlineHora: '18:00' }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    await expect(servicio.completar(tenantUsuario(), 'actividad-1', {})).rejects.toThrow(
      DeadlineVencidoException
    );
  });

  it('DEADLINE vigente (misma hora UTC pero aún no en La Paz) completa normal', async () => {
    vi.useFakeTimers();
    // 20:00Z = 16:00 en La Paz, antes de las 18:00.
    vi.setSystemTime(new Date('2026-07-13T20:00:00Z'));
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({ tipoLimiteTiempo: 'DEADLINE', deadlineHora: '18:00' }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    await expect(servicio.completar(tenantUsuario(), 'actividad-1', {})).resolves.toMatchObject({
      valorPuntosSnapshot: 10,
    });
  });

  it('CRONOMETRO sin iniciar → 409 CRONOMETRO_NO_INICIADO', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({ tipoLimiteTiempo: 'CRONOMETRO', duracionCronometroMinutos: 15 }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    await expect(servicio.completar(tenantUsuario(), 'actividad-1', {})).rejects.toThrow(
      CronometroNoIniciadoException
    );
  });

  it('CRONOMETRO vencido → 409 CRONOMETRO_VENCIDO (y la fila queda para reiniciar)', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({ tipoLimiteTiempo: 'CRONOMETRO', duracionCronometroMinutos: 15 }),
      ],
      cronometros: [
        {
          id: 'crono-1',
          usuarioId: 'usuario-1',
          actividadId: 'actividad-1',
          sesionId: 'sesion-1',
          iniciadoEn: new Date(Date.now() - 20 * 60000),
        },
      ],
    });
    const { servicio } = crearServicio({ bd });

    await expect(servicio.completar(tenantUsuario(), 'actividad-1', {})).rejects.toThrow(
      CronometroVencidoException
    );
    expect(bd.cronometros).toHaveLength(1);
  });

  it('CRONOMETRO vigente completa y BORRA la fila de CronometroActivo', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({ tipoLimiteTiempo: 'CRONOMETRO', duracionCronometroMinutos: 15 }),
      ],
      cronometros: [
        {
          id: 'crono-1',
          usuarioId: 'usuario-1',
          actividadId: 'actividad-1',
          sesionId: 'sesion-1',
          iniciadoEn: new Date(Date.now() - 5 * 60000),
        },
      ],
    });
    const { servicio, bd: mismaBd } = crearServicio({ bd });

    await servicio.completar(tenantUsuario(), 'actividad-1', {});

    expect(mismaBd.registrosActividad).toHaveLength(1);
    expect(mismaBd.cronometros).toHaveLength(0);
  });
});

describe('RegistroService — confirmar obligatoria (fase-14-08)', () => {
  it('OBLIGATORIA ASUME_HECHA sigue devolviendo 400 (comportamiento intacto)', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({ tipoPuntaje: 'OBLIGATORIA', comportamientoAlCierre: 'ASUME_HECHA' }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    await expect(servicio.completar(tenantUsuario(), 'actividad-1', {})).rejects.toThrow(
      ObligatoriaNoSeCompletaException
    );
  });

  it('OBLIGATORIA REQUIERE_CONFIRMACION: registro COMPLETADA de 0 pts y SIN evento', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({
          tipoPuntaje: 'OBLIGATORIA',
          comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
          valorPuntos: 30,
        }),
      ],
    });
    const { servicio, publicados } = crearServicio({ bd });

    const registro = await servicio.completar(tenantUsuario(), 'actividad-1', {});

    expect(registro).toMatchObject({
      usuarioId: 'usuario-1',
      tipo: 'COMPLETADA',
      valorPuntosSnapshot: 0,
      registradoPorTipo: 'USUARIO',
    });
    expect(bd.registrosActividad).toHaveLength(1);
    // 0 pts → no toca el ledger de scoring: no publica ningún evento de dominio.
    expect(publicados).toHaveLength(0);
  });

  it('confirmar dos veces la misma obligatoria (reps=1) → 409', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({
          tipoPuntaje: 'OBLIGATORIA',
          comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
        }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    await servicio.completar(tenantUsuario(), 'actividad-1', {});

    await expect(servicio.completar(tenantUsuario(), 'actividad-1', {})).rejects.toThrow(
      LimiteRepeticionesAlcanzadoException
    );
  });
});

describe('RegistroService — mi-estado-hoy (fase-14-08)', () => {
  it('sin Sesión abierta → sesionId null y lista vacía', async () => {
    const { servicio } = crearServicio({ seccionActual: null });

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    expect(estado).toEqual({ sesionId: null, actividades: [] });
  });

  it('devuelve vecesHechas real y confirmada por actividad', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({ id: 'opt', tipoPuntaje: 'OPCIONAL', repeticionesMaximasSesion: 3 }),
        actividadDePrueba({
          id: 'obl',
          tipoPuntaje: 'OBLIGATORIA',
          comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
        }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    await servicio.completar(tenantUsuario(), 'opt', {});
    await servicio.completar(tenantUsuario(), 'opt', {});
    await servicio.completar(tenantUsuario(), 'obl', {});

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');
    const opt = estado.actividades.find((a) => a.actividadId === 'opt');
    const obl = estado.actividades.find((a) => a.actividadId === 'obl');

    expect(estado.sesionId).toBe('sesion-1');
    expect(opt).toMatchObject({ vecesHechas: 2, repeticionesMaximasSesion: 3, confirmada: false });
    expect(obl).toMatchObject({
      vecesHechas: 1,
      confirmada: true,
      comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
    });
  });
});

describe('RegistroService — iniciar cronómetro', () => {
  it('crea/reemplaza la fila para la sesión abierta y devuelve venceEn', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({ tipoLimiteTiempo: 'CRONOMETRO', duracionCronometroMinutos: 15 }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    const primera = await servicio.iniciarCronometro(tenantUsuario(), 'actividad-1');
    const segunda = await servicio.iniciarCronometro(tenantUsuario(), 'actividad-1');

    expect(bd.cronometros).toHaveLength(1);
    expect(primera.sesionId).toBe('sesion-1');
    expect(new Date(segunda.venceEn).getTime()).toBe(
      new Date(segunda.iniciadoEn).getTime() + 15 * 60000
    );
  });

  it('una actividad sin cronómetro responde 400', async () => {
    const { servicio } = crearServicio();

    await expect(servicio.iniciarCronometro(tenantUsuario(), 'actividad-1')).rejects.toThrow(
      BadRequestException
    );
  });
});

describe('RegistroService — no hizo', () => {
  it('una OPCIONAL no se marca como no hecha (400)', async () => {
    const { servicio } = crearServicio();

    await expect(
      servicio.registrarNoHizo(tenantTutor(), 'actividad-1', { usuarioId: 'usuario-1' })
    ).rejects.toThrow(BadRequestException);
  });

  it('resta el valor y NO tiene límite de repeticiones (cada una resta independiente)', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({ tipoPuntaje: 'OBLIGATORIA', valorPuntos: 20, repeticionesMaximasSesion: 1 }),
      ],
    });
    const { servicio, publicados } = crearServicio({ bd });

    const primero = await servicio.registrarNoHizo(tenantTutor(), 'actividad-1', {
      usuarioId: 'usuario-1',
    });
    const segundo = await servicio.registrarNoHizo(tenantTutor(), 'actividad-1', {
      usuarioId: 'usuario-1',
    });

    expect(primero.valorPuntosSnapshot).toBe(-20);
    expect(segundo.valorPuntosSnapshot).toBe(-20);
    expect(bd.registrosActividad).toHaveLength(2);
    expect(publicados.map((evento) => evento.eventType)).toEqual([
      'NoHizoRegistrado',
      'NoHizoRegistrado',
    ]);
    expect(publicados[0].payload).toMatchObject({
      valorPuntosSnapshot: -20,
      registradoPorTipo: 'TUTOR',
    });
  });
});

describe('RegistroService — conductas', () => {
  it('USUARIO autoreporta una MALA que lo permite: self, snapshot negativo', async () => {
    const bd = crearBdRegistroEnMemoria({ conductas: [conductaDePrueba()] });
    const { servicio, publicados } = crearServicio({ bd });

    // usuarioId ajeno en el body: ignorado para USUARIO.
    const registro = await servicio.registrarConducta(tenantUsuario(), 'conducta-1', {
      usuarioId: 'usuario-ajeno',
    });

    expect(registro).toMatchObject({
      usuarioId: 'usuario-1',
      valorPuntosSnapshot: -5,
      registradoPorTipo: 'USUARIO',
    });
    expect(publicados[0].payload).toMatchObject({ tipo: 'MALA', valorPuntosSnapshot: -5 });
  });

  it('USUARIO no puede autoreportar una BUENA (403)', async () => {
    const bd = crearBdRegistroEnMemoria({
      conductas: [conductaDePrueba({ tipo: 'BUENA', permiteAutoreporte: false })],
    });
    const { servicio } = crearServicio({ bd });

    await expect(
      servicio.registrarConducta(tenantUsuario(), 'conducta-1', {})
    ).rejects.toThrow(ForbiddenException);
  });

  it('USUARIO no puede autoreportar una MALA con permiteAutoreporte=false (403)', async () => {
    const bd = crearBdRegistroEnMemoria({
      conductas: [conductaDePrueba({ permiteAutoreporte: false })],
    });
    const { servicio } = crearServicio({ bd });

    await expect(
      servicio.registrarConducta(tenantUsuario(), 'conducta-1', {})
    ).rejects.toThrow(ForbiddenException);
  });

  it('TUTOR registra una BUENA con snapshot positivo para el usuario del body', async () => {
    const bd = crearBdRegistroEnMemoria({
      conductas: [conductaDePrueba({ tipo: 'BUENA', valorPuntos: 8, permiteAutoreporte: false })],
    });
    const { servicio } = crearServicio({ bd });

    const registro = await servicio.registrarConducta(tenantTutor(), 'conducta-1', {
      usuarioId: 'usuario-1',
    });

    expect(registro).toMatchObject({
      usuarioId: 'usuario-1',
      valorPuntosSnapshot: 8,
      registradoPorId: 'tutor-1',
      registradoPorTipo: 'TUTOR',
    });
  });

  it('TUTOR sin usuarioId recibe 400; conducta archivada, 404', async () => {
    const bd = crearBdRegistroEnMemoria({
      conductas: [
        conductaDePrueba(),
        conductaDePrueba({ id: 'conducta-2', estado: 'ARCHIVADA' }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    await expect(servicio.registrarConducta(tenantTutor(), 'conducta-1', {})).rejects.toThrow(
      BadRequestException
    );
    await expect(
      servicio.registrarConducta(tenantTutor(), 'conducta-2', { usuarioId: 'usuario-1' })
    ).rejects.toThrow(NotFoundException);
  });
});

describe('RegistroService — eliminar registro de conducta', () => {
  it('marca eliminado=true y publica ConductaRegistroEliminado (nunca DELETE físico)', async () => {
    const bd = crearBdRegistroEnMemoria({ conductas: [conductaDePrueba()] });
    const { servicio, publicados } = crearServicio({ bd });

    const registro = await servicio.registrarConducta(tenantUsuario(), 'conducta-1', {});
    const eliminado = await servicio.eliminarRegistroConducta(tenantTutor(), registro.id);

    expect(eliminado.eliminado).toBe(true);
    expect(bd.registrosConducta).toHaveLength(1);
    expect(bd.registrosConducta[0]).toMatchObject({
      eliminado: true,
      eliminadoPorTutorId: 'tutor-1',
    });
    expect(publicados.at(-1)).toMatchObject({ eventType: 'ConductaRegistroEliminado' });
    expect(publicados.at(-1)?.payload).toMatchObject({
      registroId: registro.id,
      usuarioId: 'usuario-1',
      eliminadoPorTutorId: 'tutor-1',
    });
  });

  it('eliminarlo dos veces responde 409', async () => {
    const bd = crearBdRegistroEnMemoria({ conductas: [conductaDePrueba()] });
    const { servicio } = crearServicio({ bd });

    const registro = await servicio.registrarConducta(tenantUsuario(), 'conducta-1', {});
    await servicio.eliminarRegistroConducta(tenantTutor(), registro.id);

    await expect(
      servicio.eliminarRegistroConducta(tenantTutor(), registro.id)
    ).rejects.toThrow(ConflictException);
  });
});
