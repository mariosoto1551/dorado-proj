import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EstadoSeccion, EstadoSesion } from '@dorado/shared-types';
import type { GrupoDto, TenantContext, UsuarioDto } from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import { ContextoParticipanteService } from '../comun/contexto-participante.service';
import type {
  SeccionActualInterna,
  SessionClientService,
} from '../clientes/session-client.service';
import {
  ActividadDenegadaPorTutorException,
  ActividadNoDisponibleHoyException,
  ActividadPersonalDeOtroUsuarioException,
  CronometroNoIniciadoException,
  CronometroVencidoException,
  DeadlineVencidoException,
  LimiteRepeticionesAlcanzadoException,
  MarcaNoReversibleException,
  NoHaySesionAbiertaException,
  ObligatoriaNoSeCompletaException,
} from '../comun/excepciones';
import {
  actividadDePrueba,
  actividadPersonalDePrueba,
  conductaDePrueba,
  crearBdRegistroEnMemoria,
  type BdRegistroEnMemoria,
} from '../comun/testing/bd-registro-en-memoria';
import type { ConfiguracionContenidoService } from '../contenido-usuario/configuracion-contenido.service';
import type {
  EventoAPublicar,
  EventosPublisherService,
} from '../eventos/eventos-publisher.service';
import type { RegistroActividad } from '../generated/prisma/client';
import { PlanDiaService } from '../plan-dia/plan-dia.service';
import { TurnosService } from '../turnos/turnos.service';
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
  /** fase-14-17: por default apagado — el comportamiento previo al ítem 17. */
  planDelDiaActivo?: boolean;
  /** fase-14-19: rol del participante en el grupo. null = sin rol. */
  rolDeUsuario?: string | null;
} = {}) {
  const bd = opciones.bd ?? crearBdRegistroEnMemoria({ actividades: [actividadDePrueba()] });
  const publicados: EventoAPublicar<unknown>[] = [];

  const rolDeUsuario = vi.fn().mockResolvedValue(opciones.rolDeUsuario ?? null);

  const identity = {
    obtenerGrupo: vi.fn().mockResolvedValue(GRUPO),
    obtenerUsuario: vi
      .fn()
      .mockResolvedValue(
        opciones.usuarioDeIdentity === undefined ? usuarioDePrueba() : opciones.usuarioDeIdentity
      ),
    // fase-14-19: el espía permite verificar que NO se llama cuando la actividad
    // no está restringida (decisión 13).
    rolDeUsuario,
    // fase-14-21: los nombres para «hoy le toca a Ana».
    usuariosDelGrupo: vi
      .fn()
      .mockResolvedValue([
        usuarioDePrueba(),
        usuarioDePrueba({ id: 'usuario-2', nombre: 'Usuario Dos' }),
      ]),
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

  // fase-14-17: PlanDiaService REAL (no un mock) contra la misma bd en memoria,
  // para que los tests vean el alta automática al completar tal como pasa en
  // producción. Lo único falseado es la config del grupo.
  const configuracion = {
    resolver: vi.fn().mockResolvedValue({
      grupoId: 'grupo-1',
      modoCreacionUsuario: 'RESTRICTIVO',
      maxPuntosActividadUsuario: 5,
      maxActividadesActivasPorUsuario: 5,
      planDelDiaActivo: opciones.planDelDiaActivo ?? false,
    }),
  } as unknown as ConfiguracionContenidoService;

  const planDia = new PlanDiaService(
    bd.prisma,
    session,
    identity,
    configuracion,
    { asegurarAccesoLectura: () => undefined } as never,
    new ContextoParticipanteService(identity)
  );

  // fase-14-21: TurnosService REAL contra la misma bd en memoria, igual que el
  // PlanDiaService — así los tests ven el efecto del turno tal como pasa en
  // producción, y una actividad sin rotación no toca nada.
  const turnos = new TurnosService(
    bd.prisma,
    { asegurarAccesoLectura: () => undefined, asegurarAccesoEscritura: async () => undefined } as never,
    identity,
    session,
    eventos
  );

  return {
    servicio: new RegistroService(
      bd.prisma,
      identity,
      session,
      eventos,
      planDia,
      turnos,
      new ContextoParticipanteService(identity)
    ),
    planDia,
    turnos,
    bd,
    publicados,
    rolDeUsuario,
  };
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

  it('OBLIGATORIA REQUIERE_CONFIRMACION: registro COMPLETADA de 0 pts, y el evento se publica igual', async () => {
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
    // fase-14-28 (D.1): antes acá no se publicaba nada, porque un asiento de 0
    // no le sirve a scoring. Ahora el evento significa «esto pasó» y se publica
    // siempre — rewards lo necesita para pagar monedas por una obligatoria que
    // no da puntos (decisión 1). Quien descarta el 0 es scoring.
    expect(publicados).toHaveLength(1);
    expect(publicados[0]).toMatchObject({
      eventType: 'ActividadCompletada',
      payload: expect.objectContaining({ valorPuntosSnapshot: 0 }),
    });
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

describe('RegistroService — las obligatorias también suman (fase-14-20)', () => {
  function bdConPremio(puntosPorCumplir: number): BdRegistroEnMemoria {
    return crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({
          tipoPuntaje: 'OBLIGATORIA',
          comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
          // El caso de la spec: premio chico, castigo grande.
          valorPuntos: 10,
          puntosPorCumplir,
        }),
      ],
    });
  }

  it('confirmar con premio acredita los puntos al instante y publica el evento', async () => {
    const { servicio, publicados } = crearServicio({ bd: bdConPremio(2) });

    const registro = await servicio.completar(tenantUsuario(), 'actividad-1', {});

    expect(registro).toMatchObject({ tipo: 'COMPLETADA', valorPuntosSnapshot: 2 });
    // Deja de ser invisible para scoring: es un asiento del ledger como otro.
    expect(publicados).toHaveLength(1);
    expect(publicados[0]).toMatchObject({
      eventType: 'ActividadCompletada',
      payload: expect.objectContaining({ valorPuntosSnapshot: 2 }),
    });
  });

  it('con premio 0 el registro sigue valiendo 0, y el evento viaja con ese 0 (fase-14-28)', async () => {
    const { servicio, publicados } = crearServicio({ bd: bdConPremio(0) });

    const registro = await servicio.completar(tenantUsuario(), 'actividad-1', {});

    expect(registro.valorPuntosSnapshot).toBe(0);
    // El ledger de puntos sigue sin recibir nada por esto —lo descarta scoring—,
    // pero el hecho se publica: es la única forma de que rewards pueda pagarlo.
    expect(publicados).toHaveLength(1);
    expect(publicados[0]).toMatchObject({
      eventType: 'ActividadCompletada',
      payload: expect.objectContaining({ valorPuntosSnapshot: 0 }),
    });
  });

  it('el "no hizo" sobre una confirmación premiada la compensa en el ledger', async () => {
    const bd = bdConPremio(2);
    const { servicio, publicados } = crearServicio({ bd });

    await servicio.completar(tenantUsuario(), 'actividad-1', {});
    publicados.length = 0;

    await servicio.registrarNoHizo(tenantTutor(), 'actividad-1', { usuarioId: 'usuario-1' });

    // Sin la compensación el integrante se quedaría con el +2 Y el −10.
    const tipos = publicados.map((evento) => evento.eventType);
    expect(tipos).toContain('NoHizoRegistrado');
    expect(tipos).toContain('ActividadRegistroEliminado');

    const eliminado = publicados.find(
      (evento) => evento.eventType === 'ActividadRegistroEliminado'
    );
    const confirmacion = bd.registrosActividad.find(
      (registro) => registro.tipo === 'COMPLETADA'
    );
    expect(eliminado?.payload).toMatchObject({
      registroId: confirmacion?.id,
      usuarioId: 'usuario-1',
    });
    // La confirmación queda dada de baja igual que antes.
    expect(confirmacion?.eliminado).toBe(true);
  });

  it('el "no hizo" sobre una confirmación de 0 pts publica igual, con el snapshot en 0 (fase-14-28)', async () => {
    const bd = bdConPremio(0);
    const { servicio, publicados } = crearServicio({ bd });

    await servicio.completar(tenantUsuario(), 'actividad-1', {});
    publicados.length = 0;

    await servicio.registrarNoHizo(tenantTutor(), 'actividad-1', { usuarioId: 'usuario-1' });

    // La confirmación de 0 puede haber pagado monedas: rewards tiene que poder
    // revertirlas. El `valorPuntosSnapshot: 0` del payload es lo que le dice a
    // scoring que no hay asiento que compensar (sin él iría a la DLQ).
    expect(publicados.map((evento) => evento.eventType)).toEqual([
      'NoHizoRegistrado',
      'ActividadRegistroEliminado',
    ]);
    expect(publicados[1]?.payload).toMatchObject({ valorPuntosSnapshot: 0 });
  });

  it('el castigo automático no cambia: sigue siendo −valorPuntos, no el premio', async () => {
    const bd = bdConPremio(2);
    const { servicio, publicados } = crearServicio({ bd });

    await servicio.registrarNoHizo(tenantTutor(), 'actividad-1', { usuarioId: 'usuario-1' });

    expect(publicados[0]).toMatchObject({
      eventType: 'NoHizoRegistrado',
      payload: expect.objectContaining({ valorPuntosSnapshot: -10 }),
    });
  });
});

describe('RegistroService — mi-estado-hoy (fase-14-08)', () => {
  it('sin Sesión abierta → sesionId null y lista vacía', async () => {
    const { servicio } = crearServicio({ seccionActual: null });

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    expect(estado).toEqual({ sesionId: null, planDelDiaActivo: false, actividades: [] });
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

describe('RegistroService — mi-estado-hoy con el plan del día (fase-14-17)', () => {
  function bdConCatalogoMixto(): BdRegistroEnMemoria {
    return crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({ id: 'opcional' }),
        actividadDePrueba({ id: 'fija', siempreVisible: true }),
        actividadDePrueba({ id: 'obligatoria', tipoPuntaje: 'OBLIGATORIA' }),
        actividadDePrueba({ id: 'equipo', alcance: 'EQUIPO' }),
        actividadPersonalDePrueba('usuario-1'),
      ],
    });
  }

  it('con el modo APAGADO nada requiere selección y todo viaja enPlan (comportamiento previo)', async () => {
    const { servicio } = crearServicio({ bd: bdConCatalogoMixto() });

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    expect(estado.planDelDiaActivo).toBe(false);
    expect(estado.actividades.every((item) => !item.requiereSeleccion)).toBe(true);
    expect(estado.actividades.every((item) => item.enPlan)).toBe(true);
  });

  it('con el modo ACTIVO solo la opcional del tutor requiere selección, y arranca fuera del plan', async () => {
    const { servicio } = crearServicio({
      bd: bdConCatalogoMixto(),
      planDelDiaActivo: true,
    });

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');
    const porId = new Map(estado.actividades.map((item) => [item.actividadId, item]));

    expect(estado.planDelDiaActivo).toBe(true);
    expect(porId.get('opcional')).toMatchObject({ requiereSeleccion: true, enPlan: false });
    // Fija, obligatoria, de equipo y propia: siempre a la vista (decisión 1).
    for (const id of ['fija', 'obligatoria', 'equipo', 'actividad-de-usuario-1']) {
      expect(porId.get(id)).toMatchObject({ requiereSeleccion: false, enPlan: true });
    }
  });

  it('elegirla la deja enPlan', async () => {
    const bd = bdConCatalogoMixto();
    const { servicio, planDia } = crearServicio({ bd, planDelDiaActivo: true });

    await planDia.agregar(tenantUsuario(), 'grupo-1', { actividadId: 'opcional' });

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    expect(estado.actividades.find((item) => item.actividadId === 'opcional')).toMatchObject({
      requiereSeleccion: true,
      enPlan: true,
    });
  });

  it('completarla sin haberla elegido la mete sola en el plan: no puede desaparecer de la lista', async () => {
    const bd = bdConCatalogoMixto();
    const { servicio } = crearServicio({ bd, planDelDiaActivo: true });

    await servicio.completar(tenantUsuario(), 'opcional', {});

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    expect(bd.seleccionesPlanDia).toHaveLength(1);
    expect(estado.actividades.find((item) => item.actividadId === 'opcional')).toMatchObject({
      enPlan: true,
      vecesHechas: 1,
    });
  });

  it('un TUTOR completando en nombre del integrante también la deja en su plan', async () => {
    const bd = bdConCatalogoMixto();
    const { servicio } = crearServicio({ bd, planDelDiaActivo: true });

    await servicio.completar(tenantTutor(), 'opcional', { usuarioId: 'usuario-1' });

    expect(bd.seleccionesPlanDia).toHaveLength(1);
    expect(bd.seleccionesPlanDia[0]).toMatchObject({
      usuarioId: 'usuario-1',
      actividadId: 'opcional',
    });
  });

  it('iniciar el cronómetro también la mete en el plan (empezarla ya es elegirla)', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({
          id: 'crono',
          tipoLimiteTiempo: 'CRONOMETRO',
          duracionCronometroMinutos: 10,
        }),
      ],
    });
    const { servicio } = crearServicio({ bd, planDelDiaActivo: true });

    await servicio.iniciarCronometro(tenantUsuario(), 'crono');

    expect(bd.seleccionesPlanDia).toHaveLength(1);
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

describe('RegistroService — visibilidad de actividades personales (fase-14-10, Parte C)', () => {
  it('mi-estado-hoy: el integrante ve las del tutor y LA SUYA, nunca la de otro', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba(),
        actividadPersonalDePrueba('usuario-1'),
        actividadPersonalDePrueba('usuario-2'),
      ],
    });
    const { servicio } = crearServicio({ bd });

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    expect(estado.actividades.map((item) => item.actividadId)).toEqual([
      'actividad-1',
      'actividad-de-usuario-1',
    ]);
  });

  it('completar la actividad personal de otro integrante: 404 (no revela que existe)', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [actividadPersonalDePrueba('usuario-2')],
    });
    const { servicio, bd: base } = crearServicio({ bd });

    await expect(
      servicio.completar(tenantUsuario(), 'actividad-de-usuario-2', {})
    ).rejects.toThrow(NotFoundException);
    expect(base.registrosActividad).toHaveLength(0);
  });

  it('el autor SÍ completa la suya (suma sus puntos por el camino normal)', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [actividadPersonalDePrueba('usuario-1')],
    });
    const { servicio, publicados } = crearServicio({ bd });

    const registro = await servicio.completar(tenantUsuario(), 'actividad-de-usuario-1', {});

    expect(registro).toMatchObject({ usuarioId: 'usuario-1', valorPuntosSnapshot: 3 });
    expect(publicados[0]).toMatchObject({ eventType: 'ActividadCompletada' });
  });

  it('un tutor no puede registrarle a un usuario la actividad personal de otro (403 con code)', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [actividadPersonalDePrueba('usuario-2')],
    });
    const { servicio } = crearServicio({ bd });

    // El tutor apunta a usuario-1, pero la actividad es personal de usuario-2.
    await expect(
      servicio.completar(tenantTutor(), 'actividad-de-usuario-2', { usuarioId: 'usuario-1' })
    ).rejects.toThrow(ActividadPersonalDeOtroUsuarioException);
  });

  it('iniciar cronómetro de la actividad personal de otro integrante: 404', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadPersonalDePrueba('usuario-2', {
          tipoLimiteTiempo: 'CRONOMETRO',
          duracionCronometroMinutos: 30,
        }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    await expect(
      servicio.iniciarCronometro(tenantUsuario(), 'actividad-de-usuario-2')
    ).rejects.toThrow(NotFoundException);
  });

  it('completadas-opcionales del tutor: no ofrece la actividad personal de otro integrante', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba(),
        actividadPersonalDePrueba('usuario-1'),
        actividadPersonalDePrueba('usuario-2'),
      ],
    });
    const { servicio } = crearServicio({ bd });

    await servicio.completar(tenantUsuario(), 'actividad-1', {});
    await servicio.completar(tenantUsuario(), 'actividad-de-usuario-1', {});

    const completadas = await servicio.listarCompletadasOpcionales(
      tenantTutor(),
      'grupo-1',
      'usuario-1'
    );

    expect(completadas.map((item) => item.actividadId)).toEqual([
      'actividad-1',
      'actividad-de-usuario-1',
    ]);
  });
});

describe('RegistroService — actividades programadas (fase-14-11)', () => {
  // La sesión de prueba arranca el 2026-07-13T04:00:00Z = lunes 00:00 en La Paz.
  const MARTES = 2;
  const LUNES = 1;

  it('completar fuera de sus días → 409 ACTIVIDAD_NO_DISPONIBLE_HOY (con los días en el error)', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [actividadDePrueba({ diasSemana: [MARTES] })],
    });
    const { servicio } = crearServicio({ bd });

    await expect(servicio.completar(tenantUsuario(), 'actividad-1', {})).rejects.toThrow(
      ActividadNoDisponibleHoyException
    );
    expect(bd.registrosActividad).toHaveLength(0);
  });

  it('completar el día que le toca funciona normal', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [actividadDePrueba({ diasSemana: [LUNES] })],
    });
    const { servicio, publicados } = crearServicio({ bd });

    const registro = await servicio.completar(tenantUsuario(), 'actividad-1', {});

    expect(registro).toMatchObject({ tipo: 'COMPLETADA', valorPuntosSnapshot: 10 });
    expect(publicados[0]).toMatchObject({ eventType: 'ActividadCompletada' });
  });

  it('sin días configurados no consulta el grupo ni bloquea (comportamiento previo)', async () => {
    const bd = crearBdRegistroEnMemoria({ actividades: [actividadDePrueba()] });
    const { servicio } = crearServicio({ bd });

    await expect(servicio.completar(tenantUsuario(), 'actividad-1', {})).resolves.toMatchObject({
      tipo: 'COMPLETADA',
    });
  });

  it('iniciar cronómetro fuera de sus días → 409 (no se arranca algo que no se podrá cerrar)', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({
          diasSemana: [MARTES],
          tipoLimiteTiempo: 'CRONOMETRO',
          duracionCronometroMinutos: 30,
        }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    await expect(
      servicio.iniciarCronometro(tenantUsuario(), 'actividad-1')
    ).rejects.toThrow(ActividadNoDisponibleHoyException);
  });

  it('el no-hizo del tutor tampoco castiga fuera de sus días', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [actividadDePrueba({ diasSemana: [MARTES], tipoPuntaje: 'OBLIGATORIA' })],
    });
    const { servicio } = crearServicio({ bd });

    await expect(
      servicio.registrarNoHizo(tenantTutor(), 'actividad-1', { usuarioId: 'usuario-1' })
    ).rejects.toThrow(ActividadNoDisponibleHoyException);
    expect(bd.registrosActividad).toHaveLength(0);
  });

  it('mi-estado-hoy marca disponibleHoy por actividad y devuelve sus días', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({ id: 'act-libre' }),
        actividadDePrueba({ id: 'act-lunes', diasSemana: [LUNES] }),
        actividadDePrueba({ id: 'act-martes', diasSemana: [MARTES] }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    expect(estado.actividades).toEqual([
      expect.objectContaining({ actividadId: 'act-libre', disponibleHoy: true, diasSemana: [] }),
      expect.objectContaining({ actividadId: 'act-lunes', disponibleHoy: true, diasSemana: [LUNES] }),
      expect.objectContaining({
        actividadId: 'act-martes',
        disponibleHoy: false,
        diasSemana: [MARTES],
      }),
    ]);
  });
});

describe('RegistroService — marcas rojas del tutor (fase-14-12)', () => {
  /** La fila que el test da por sentada; falla ruidoso si el flujo no la dejó. */
  function buscarRegistro(
    bd: BdRegistroEnMemoria,
    predicado: (fila: RegistroActividad) => boolean
  ): RegistroActividad {
    const fila = bd.registrosActividad.find(predicado);

    if (!fila) {
      throw new Error('El test esperaba un RegistroActividad que no está en la BD');
    }

    return fila;
  }

  /** Completa `veces` y después el tutor quita las últimas `quitar`. */
  async function completarYQuitar(
    servicio: RegistroService,
    bd: BdRegistroEnMemoria,
    veces: number,
    quitar: number,
    motivo?: string
  ): Promise<void> {
    for (let i = 0; i < veces; i += 1) {
      await servicio.completar(tenantUsuario(), 'actividad-1', {});
    }

    const vivas = bd.registrosActividad.filter((fila) => !fila.eliminado);

    for (let i = 0; i < quitar; i += 1) {
      await servicio.eliminarRegistroActividad(
        tenantTutor(),
        vivas[vivas.length - 1 - i].id,
        motivo
      );
    }
  }

  it('quitar una repetición la deja perdida: baja el tope efectivo, no el máximo', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [actividadDePrueba({ repeticionesMaximasSesion: 3 })],
    });
    const { servicio } = crearServicio({ bd });

    await completarYQuitar(servicio, bd, 3, 1, 'Quedó a medias');

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    expect(estado.actividades[0]).toMatchObject({
      repeticionesMaximasSesion: 3,
      vecesHechas: 2,
      vecesPerdidas: 1,
      topeEfectivo: 2,
      denegada: false,
      motivoTutor: 'Quedó a medias',
    });
  });

  it('el cupo quemado lo hace valer el SERVIDOR: completar de nuevo es 409', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [actividadDePrueba({ repeticionesMaximasSesion: 3 })],
    });
    const { servicio } = crearServicio({ bd });

    await completarYQuitar(servicio, bd, 3, 1);

    // La barrita roja no es decoración: ese intento se gastó.
    await expect(servicio.completar(tenantUsuario(), 'actividad-1', {})).rejects.toThrow(
      LimiteRepeticionesAlcanzadoException
    );
  });

  it('deshacer la quita devuelve la barrita verde y publica la reversión', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [actividadDePrueba({ repeticionesMaximasSesion: 3 })],
    });
    const { servicio, publicados } = crearServicio({ bd });

    await completarYQuitar(servicio, bd, 3, 1);

    const quitado = buscarRegistro(bd, (fila) => fila.eliminado);
    const revertido = await servicio.revertirMarca(tenantTutor(), quitado.id);

    expect(revertido).toMatchObject({ eliminado: false });
    // La historia queda entera: quién quitó Y quién deshizo (decisión 7).
    expect(quitado).toMatchObject({
      eliminado: false,
      eliminadoPorTutorId: 'tutor-1',
      revertidoPorTutorId: 'tutor-1',
    });
    expect(quitado.eliminadoEn).not.toBeNull();

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');
    expect(estado.actividades[0]).toMatchObject({
      vecesHechas: 3,
      vecesPerdidas: 0,
      topeEfectivo: 3,
    });

    const reversion = publicados.find(
      (evento) => evento.eventType === 'ActividadRegistroRevertido'
    );
    expect(reversion).toMatchObject({ routingKey: 'activity.actividad_registro_revertido' });
    expect(reversion?.payload).toMatchObject({
      registroId: quitado.id,
      usuarioId: 'usuario-1',
      revertidoPorTutorId: 'tutor-1',
      tipoRegistro: 'COMPLETADA',
    });
  });

  it('una obligatoria con "no hizo" queda DENEGADA: el usuario no puede re-confirmar', async () => {
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
    await servicio.registrarNoHizo(tenantTutor(), 'actividad-1', {
      usuarioId: 'usuario-1',
      motivo: 'Quedaron sucios',
    });

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');
    expect(estado.actividades[0]).toMatchObject({
      denegada: true,
      confirmada: false,
      motivoTutor: 'Quedaron sucios',
    });

    await expect(servicio.completar(tenantUsuario(), 'actividad-1', {})).rejects.toThrow(
      ActividadDenegadaPorTutorException
    );
  });

  it('deshacer el "no hizo" desbloquea la obligatoria y compensa el castigo', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({
          tipoPuntaje: 'OBLIGATORIA',
          comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
        }),
      ],
    });
    const { servicio, publicados } = crearServicio({ bd });

    await servicio.registrarNoHizo(tenantTutor(), 'actividad-1', { usuarioId: 'usuario-1' });

    const noHizo = buscarRegistro(bd, (fila) => fila.tipo === 'NO_HIZO');
    await servicio.revertirMarca(tenantTutor(), noHizo.id);

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');
    expect(estado.actividades[0]).toMatchObject({ denegada: false });

    const reversion = publicados.find(
      (evento) => evento.eventType === 'ActividadRegistroRevertido'
    );
    expect(reversion?.payload).toMatchObject({ tipoRegistro: 'NO_HIZO' });

    // Desbloqueada: puede volver a confirmar.
    await expect(servicio.completar(tenantUsuario(), 'actividad-1', {})).resolves.toMatchObject({
      tipo: 'COMPLETADA',
    });
  });

  it('revertir algo que no es una marca roja viva → 409 MARCA_NO_REVERSIBLE', async () => {
    const { servicio, bd } = crearServicio();

    await servicio.completar(tenantUsuario(), 'actividad-1', {});

    await expect(servicio.revertirMarca(tenantTutor(), bd.registrosActividad[0].id)).rejects.toThrow(
      MarcaNoReversibleException
    );
  });

  it('revertir una marca de otra organización → 404 (no revela que existe)', async () => {
    const { servicio, bd } = crearServicio();

    await servicio.completar(tenantUsuario(), 'actividad-1', {});
    await servicio.eliminarRegistroActividad(tenantTutor(), bd.registrosActividad[0].id);

    const tenantAjeno = { ...tenantTutor(), organizacionId: 'org-2' } as TenantContext;

    await expect(servicio.revertirMarca(tenantAjeno, bd.registrosActividad[0].id)).rejects.toThrow(
      NotFoundException
    );
  });

  it('revertir una marca de otra Sesión → 409 NO_HAY_SESION_ABIERTA', async () => {
    const { servicio, bd } = crearServicio();

    await servicio.completar(tenantUsuario(), 'actividad-1', {});
    await servicio.eliminarRegistroActividad(tenantTutor(), bd.registrosActividad[0].id);
    // Al día siguiente, con otra Sesión abierta, la marca de ayer ya no se toca.
    bd.registrosActividad[0].sesionId = 'sesion-de-ayer';

    await expect(servicio.revertirMarca(tenantTutor(), bd.registrosActividad[0].id)).rejects.toThrow(
      NoHaySesionAbiertaException
    );
  });

  it('el ciclo completo de una confirmación de 0 pts publica los tres eventos con snapshot 0 (fase-14-28)', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({
          tipoPuntaje: 'OBLIGATORIA',
          comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
        }),
      ],
    });
    const { servicio, publicados } = crearServicio({ bd });

    await servicio.completar(tenantUsuario(), 'actividad-1', {});
    await servicio.eliminarRegistroActividad(tenantTutor(), bd.registrosActividad[0].id);
    await servicio.revertirMarca(tenantTutor(), bd.registrosActividad[0].id);

    // Los tres pasos del camino de monedas: acreditar, revertir con piso en 0 y
    // restituir. Ninguno tocaba a scoring antes de este ítem y ninguno lo toca
    // ahora —el snapshot en 0 se lo dice—, pero rewards los necesita a los tres.
    expect(publicados.map((evento) => evento.eventType)).toEqual([
      'ActividadCompletada',
      'ActividadRegistroEliminado',
      'ActividadRegistroRevertido',
    ]);
    for (const evento of publicados) {
      expect(evento.payload).toMatchObject({ valorPuntosSnapshot: 0 });
    }
  });

  it('el tutor lista las marcas vivas del usuario para deshacerlas', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({ repeticionesMaximasSesion: 3 }),
        actividadDePrueba({
          id: 'actividad-2',
          nombre: 'Lavar los platos',
          tipoPuntaje: 'OBLIGATORIA',
          valorPuntos: 15,
        }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    await completarYQuitar(servicio, bd, 2, 1, 'Quedó a medias');
    await servicio.registrarNoHizo(tenantTutor(), 'actividad-2', {
      usuarioId: 'usuario-1',
      motivo: 'Quedaron sucios',
    });

    const marcas = await servicio.listarMarcasRojas(tenantTutor(), 'grupo-1', 'usuario-1');

    expect(marcas).toHaveLength(2);
    expect(marcas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actividadId: 'actividad-1',
          tipo: 'REPETICION_QUITADA',
          puntos: -10,
          motivoTutor: 'Quedó a medias',
        }),
        expect.objectContaining({
          actividadId: 'actividad-2',
          nombre: 'Lavar los platos',
          tipo: 'NO_HIZO',
          puntos: -15,
          motivoTutor: 'Quedaron sucios',
        }),
      ])
    );
  });

  it('sin marcas del tutor el estado de hoy no cambia en nada (default intacto)', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [actividadDePrueba({ repeticionesMaximasSesion: 2 })],
    });
    const { servicio } = crearServicio({ bd });

    await servicio.completar(tenantUsuario(), 'actividad-1', {});

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    expect(estado.actividades[0]).toMatchObject({
      vecesHechas: 1,
      vecesPerdidas: 0,
      topeEfectivo: 2,
      denegada: false,
      motivoTutor: null,
    });
  });
});

describe('RegistroService — deadlineEn para la cuenta regresiva (fase-14-14)', () => {
  it('resuelve el instante absoluto en la timezone del Grupo (La Paz = UTC−4)', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [actividadDePrueba({ tipoLimiteTiempo: 'DEADLINE', deadlineHora: '14:00' })],
    });
    const { servicio } = crearServicio({ bd });

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    // La Sesión arranca 2026-07-13T04:00:00Z = lunes 00:00 local.
    expect(estado.actividades[0].deadlineEn).toBe('2026-07-13T18:00:00.000Z');
  });

  it('null si la actividad no es DEADLINE', async () => {
    const { servicio } = crearServicio();

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    expect(estado.actividades[0].deadlineEn).toBeNull();
  });

  it('null si no se pudo resolver la timezone: la pantalla cae al texto de siempre', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [actividadDePrueba({ tipoLimiteTiempo: 'DEADLINE', deadlineHora: '14:00' })],
    });
    const { servicio } = crearServicio({ bd });

    // identity caído: mismo criterio que `disponibleHoy` (fase-14-11) — una
    // falla ajena no apaga botones ni rompe la pantalla.
    vi.spyOn(
      (servicio as unknown as { identity: { obtenerGrupo: () => Promise<null> } }).identity,
      'obtenerGrupo'
    ).mockResolvedValue(null);

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    expect(estado.actividades[0]).toMatchObject({ deadlineEn: null, disponibleHoy: true });
  });
});

describe('RegistroService — restricción por rol (fase-14-19)', () => {
  const ROL_COCINA = 'rol-cocina';
  const ROL_LIMPIEZA = 'rol-limpieza';

  function bdConRestringida() {
    return crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba(),
        actividadDePrueba({
          id: 'actividad-cocina',
          nombre: 'Lavar los platos',
          rolesPermitidos: [ROL_COCINA],
        }),
      ],
    });
  }

  it('mi-estado-hoy oculta la actividad de otro rol (decisión 6)', async () => {
    const { servicio } = crearServicio({
      bd: bdConRestringida(),
      rolDeUsuario: ROL_LIMPIEZA,
    });

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    expect(estado.actividades.map((item) => item.actividadId)).toEqual(['actividad-1']);
  });

  it('mi-estado-hoy la muestra a quien SÍ tiene el rol', async () => {
    const { servicio } = crearServicio({
      bd: bdConRestringida(),
      rolDeUsuario: ROL_COCINA,
    });

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    expect(estado.actividades.map((item) => item.actividadId)).toEqual([
      'actividad-1',
      'actividad-cocina',
    ]);
  });

  it('el integrante SIN rol solo ve las no restringidas', async () => {
    const { servicio } = crearServicio({ bd: bdConRestringida(), rolDeUsuario: null });

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    expect(estado.actividades.map((item) => item.actividadId)).toEqual(['actividad-1']);
  });

  it('COSTO CERO: sin restricciones en el catálogo, mi-estado-hoy no llama a identity', async () => {
    const { servicio, rolDeUsuario } = crearServicio();

    await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    expect(rolDeUsuario).not.toHaveBeenCalled();
  });

  it('403 ACTIVIDAD_NO_ES_DE_TU_ROL al completar una actividad de otro rol', async () => {
    // La pantalla ya no la muestra, pero un cliente con la lista vieja en caché
    // no puede colar el registro: el servidor es el que decide.
    const { servicio } = crearServicio({
      bd: bdConRestringida(),
      rolDeUsuario: ROL_LIMPIEZA,
    });

    await expect(
      servicio.completar(tenantUsuario(), 'actividad-cocina', {})
    ).rejects.toMatchObject({ code: 'ACTIVIDAD_NO_ES_DE_TU_ROL' });
  });

  it('quien tiene el rol la completa normalmente', async () => {
    const { servicio } = crearServicio({
      bd: bdConRestringida(),
      rolDeUsuario: ROL_COCINA,
    });

    await expect(
      servicio.completar(tenantUsuario(), 'actividad-cocina', {})
    ).resolves.toMatchObject({ actividadId: 'actividad-cocina' });
  });

  it('400 ACTIVIDAD_NO_ES_DE_SU_ROL: el Tutor no marca "no hizo" fuera del rol', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({
          id: 'obl-cocina',
          tipoPuntaje: 'OBLIGATORIA',
          rolesPermitidos: [ROL_COCINA],
        }),
      ],
    });
    const { servicio } = crearServicio({ bd, rolDeUsuario: ROL_LIMPIEZA });

    await expect(
      servicio.registrarNoHizo(tenantTutor(), 'obl-cocina', { usuarioId: 'usuario-1' })
    ).rejects.toMatchObject({ code: 'ACTIVIDAD_NO_ES_DE_SU_ROL' });
  });
});

describe('RegistroService — turnos rotativos (fase-14-21)', () => {
  const TURNO = {
    id: 'turno-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    actividadId: 'obl-basura',
    modo: 'ORDEN_FIJO',
    frecuencia: 'SESION',
    activo: true,
  };

  const OBLIGATORIA_ROTATIVA = () =>
    actividadDePrueba({
      id: 'obl-basura',
      tipoPuntaje: 'OBLIGATORIA',
      comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
      valorPuntos: 10,
      puntosPorCumplir: 2,
    });

  function asignacionA(usuarioId: string) {
    return {
      id: 'asig-1',
      actividadId: 'obl-basura',
      ambitoId: 'sesion-1',
      sesionId: 'sesion-1',
      seccionId: 'seccion-1',
      usuarioId,
      vueltaNumero: 1,
      indice: 0,
    };
  }

  function bdConTurno(asignadoA: string | null) {
    return crearBdRegistroEnMemoria({
      actividades: [OBLIGATORIA_ROTATIVA()],
      turnos: [TURNO] as never,
      asignacionesTurno: (asignadoA ? [asignacionA(asignadoA)] : []) as never,
    });
  }

  it('el asignado confirma normalmente y cobra el premio del #20', async () => {
    const { servicio } = crearServicio({ bd: bdConTurno('usuario-1') });

    await expect(
      servicio.completar(tenantUsuario(), 'obl-basura', {})
    ).resolves.toMatchObject({ valorPuntosSnapshot: 2 });
  });

  it('403 NO_ES_TU_TURNO si hoy le toca a otro', async () => {
    const { servicio } = crearServicio({ bd: bdConTurno('usuario-2') });

    await expect(
      servicio.completar(tenantUsuario(), 'obl-basura', {})
    ).rejects.toMatchObject({ code: 'NO_ES_TU_TURNO' });
  });

  it('409 SIN_TURNO_VIGENTE si rota pero hoy no se selló turno', async () => {
    // Día no programado (#11) o ninguna posición válida: no se le exige a nadie.
    const { servicio } = crearServicio({ bd: bdConTurno(null) });

    await expect(
      servicio.completar(tenantUsuario(), 'obl-basura', {})
    ).rejects.toMatchObject({ code: 'SIN_TURNO_VIGENTE' });
  });

  it('400 NO_ES_SU_TURNO: el Tutor tampoco marca «no hizo» fuera del turno', async () => {
    const { servicio } = crearServicio({ bd: bdConTurno('usuario-2') });

    await expect(
      servicio.registrarNoHizo(tenantTutor(), 'obl-basura', { usuarioId: 'usuario-1' })
    ).rejects.toMatchObject({ code: 'NO_ES_SU_TURNO' });
  });

  it('mi-estado-hoy dice a quién le toca, con esMio', async () => {
    const propio = crearServicio({ bd: bdConTurno('usuario-1') });
    const estadoPropio = await propio.servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    expect(estadoPropio.actividades[0].turno).toMatchObject({
      usuarioIdAsignado: 'usuario-1',
      esMio: true,
    });

    const ajeno = crearServicio({ bd: bdConTurno('usuario-2') });
    const estadoAjeno = await ajeno.servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    // La tarjeta igual se muestra (decisión 5), sin botón y con el nombre.
    expect(estadoAjeno.actividades[0].turno).toMatchObject({
      usuarioIdAsignado: 'usuario-2',
      esMio: false,
    });
  });

  it('una actividad sin rotación viaja con turno = null (comportamiento previo)', async () => {
    const { servicio } = crearServicio();

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    expect(estado.actividades[0].turno).toBeNull();
  });
});

describe('RegistroService — estado-hoy de OTRO usuario, para el Tutor (fase-14-23 T4)', () => {
  it('devuelve la lista del integrante pedido, no la del principal que consulta', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [actividadDePrueba({ id: 'opt', tipoPuntaje: 'OPCIONAL' })],
    });
    const { servicio } = crearServicio({ bd });

    // Lo marca el integrante para sí mismo…
    await servicio.completar(tenantUsuario(), 'opt', {});

    // …y el Tutor, que nunca marcó nada, lo ve igual al consultar por él.
    const visto = await servicio.estadoHoyDe(tenantTutor(), 'grupo-1', 'usuario-1');
    const opt = visto.actividades.find((a) => a.actividadId === 'opt');

    expect(opt?.vecesHechas).toBe(1);
  });

  it('el Tutor consultando a un integrante que no marcó nada ve la lista en cero', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [actividadDePrueba({ id: 'opt', tipoPuntaje: 'OPCIONAL' })],
    });
    const { servicio } = crearServicio({ bd });

    await servicio.completar(tenantUsuario(), 'opt', {});

    const otro = await servicio.estadoHoyDe(tenantTutor(), 'grupo-1', 'usuario-2');
    const opt = otro.actividades.find((a) => a.actividadId === 'opt');

    // La actividad está (es del catálogo del grupo), pero sin marcas de ESE usuario.
    expect(opt?.vecesHechas).toBe(0);
  });

  it('es la MISMA función que mi-estado-hoy: el integrante ve lo mismo que el Tutor ve de él', async () => {
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

    const propio = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');
    const visto = await servicio.estadoHoyDe(tenantTutor(), 'grupo-1', 'usuario-1');

    // El criterio 2 de la tanda: el Tutor marca sobre lo que el integrante ve.
    expect(visto).toEqual(propio);
  });

  it('sin Sesión abierta responde lo mismo para el Tutor que para el integrante', async () => {
    const { servicio } = crearServicio({ seccionActual: null });

    const visto = await servicio.estadoHoyDe(tenantTutor(), 'grupo-1', 'usuario-1');

    expect(visto).toEqual({ sesionId: null, planDelDiaActivo: false, actividades: [] });
  });
});

describe('RegistroService — destinatario nominal (fase-14-24)', () => {
  function bdConDeAna() {
    return crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba(),
        actividadDePrueba({
          id: 'actividad-piano',
          nombre: 'Practicar piano',
          usuariosPermitidos: ['usuario-1'],
        }),
      ],
    });
  }

  it('mi-estado-hoy la muestra al asignado', async () => {
    const { servicio } = crearServicio({ bd: bdConDeAna() });

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    expect(estado.actividades.map((item) => item.actividadId)).toEqual([
      'actividad-1',
      'actividad-piano',
    ]);
  });

  it('mi-estado-hoy la OCULTA a quien no esta en la lista (decision 4)', async () => {
    const { servicio } = crearServicio({ bd: bdConDeAna() });
    const otro = { ...tenantUsuario(), principalId: 'usuario-2' } as TenantContext;

    const estado = await servicio.miEstadoHoy(otro, 'grupo-1');

    expect(estado.actividades.map((item) => item.actividadId)).toEqual(['actividad-1']);
  });

  it('el no destinatario tampoco la completa: la pantalla no decide, el servidor si', async () => {
    const { servicio } = crearServicio({ bd: bdConDeAna() });
    const otro = { ...tenantUsuario(), principalId: 'usuario-2' } as TenantContext;

    await expect(servicio.completar(otro, 'actividad-piano', {})).rejects.toMatchObject({
      code: 'ACTIVIDAD_NO_ES_DE_TU_ROL',
    });
  });

  it('el asignado la completa normalmente', async () => {
    const { servicio } = crearServicio({ bd: bdConDeAna() });

    await expect(
      servicio.completar(tenantUsuario(), 'actividad-piano', {})
    ).resolves.toMatchObject({ actividadId: 'actividad-piano' });
  });

  it('COSTO CERO: sin restricciones no se llama a identity, como antes del item', async () => {
    const { servicio, rolDeUsuario } = crearServicio();

    await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    expect(rolDeUsuario).not.toHaveBeenCalled();
  });
});

describe('RegistroService — vigencia por fechas (fase-14-24)', () => {
  // La Sesion de la bd en memoria arranca el lunes 13/07/2026 en La Paz (la
  // misma referencia que programacion.spec.ts y deadline.spec.ts). Las fechas
  // van ancladas a ESE dia, no a "hoy": la vigencia se evalua sobre el dia de
  // inicio de la Sesion, no sobre el reloj de quien corre el test.
  const ANTES = '2026-07-01';
  const DESPUES = '2026-07-31';

  it('fuera del rango la actividad NO APARECE en la lista (decision 10)', async () => {
    // Es lo contrario del «hoy no toca» del item 11, que si se ve en gris: un
    // rango que termino no vuelve nunca, y uno que no empezo no dice nada util
    // todavia. La E2E encontro que el bloqueo del registro estaba y el
    // ocultamiento no — se veia igual, con boton, y el clic terminaba en 409.
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba(),
        actividadDePrueba({ id: 'act-vencida', vigenteHasta: ANTES }),
        actividadDePrueba({ id: 'act-futura', vigenteDesde: DESPUES }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');

    expect(estado.actividades.map((item) => item.actividadId)).toEqual(['actividad-1']);
  });

  it('dentro del rango SI aparece, y la de otro dia sigue apareciendo en gris', async () => {
    // El matiz que separa las dos reglas: la vigencia OCULTA, el dia APAGA.
    const otroDia = (new Date('2026-07-13T04:00:00.000Z').getUTCDay() + 1) % 7;
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({ id: 'act-vigente', vigenteDesde: ANTES, vigenteHasta: DESPUES }),
        actividadDePrueba({ id: 'act-otro-dia', diasSemana: [otroDia] }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    const estado = await servicio.miEstadoHoy(tenantUsuario(), 'grupo-1');
    const ids = estado.actividades.map((item) => item.actividadId);

    expect(ids).toEqual(['act-vigente', 'act-otro-dia']);
    expect(
      estado.actividades.find((item) => item.actividadId === 'act-otro-dia')?.disponibleHoy
    ).toBe(false);
  });

  it('fuera del rango NO se puede completar', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({ id: 'act-vencida', vigenteHasta: ANTES }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    await expect(
      servicio.completar(tenantUsuario(), 'act-vencida', {})
    ).rejects.toMatchObject({ code: 'ACTIVIDAD_FUERA_DE_VIGENCIA' });
  });

  it('dentro del rango se completa normalmente', async () => {
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({
          id: 'act-campania',
          vigenteDesde: ANTES,
          vigenteHasta: DESPUES,
        }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    await expect(
      servicio.completar(tenantUsuario(), 'act-campania', {})
    ).resolves.toMatchObject({ actividadId: 'act-campania' });
  });

  it('el error distingue vigencia de "hoy no es su dia" (dos motivos, dos codes)', async () => {
    // Son mensajes distintos para el integrante: "todavia no empieza" no es
    // "los martes", y el cliente necesita el code para saber cual mostrar.
    const bd = crearBdRegistroEnMemoria({
      actividades: [
        actividadDePrueba({ id: 'act-futura', vigenteDesde: DESPUES }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    await expect(
      servicio.completar(tenantUsuario(), 'act-futura', {})
    ).rejects.toMatchObject({ code: 'ACTIVIDAD_FUERA_DE_VIGENCIA' });
  });
});
