import { describe, expect, it } from 'vitest';

import {
  FrecuenciaTurno,
  ModoTurno,
  type TurnoActividadDto,
  type UsuarioDto,
} from '@dorado/shared-types';

import {
  accionDeTurno,
  elegiblesParaTurno,
  type EstadoTurnoForm,
  podarSecuencia,
  resumenDeReparto,
  textoDelChipDeTurno,
} from './turnos';

const NOMBRES: Record<string, string> = {
  jose: 'José',
  luciana: 'Luciana',
  alejandra: 'Alejandra',
};

const nombreDe = (id: string) => NOMBRES[id] ?? id;

function usuario(id: string, estado: 'ACTIVO' | 'INACTIVO' = 'ACTIVO'): UsuarioDto {
  return {
    id,
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    username: id,
    nombre: nombreDe(id),
    avatarId: 'avatar-1',
    estado,
    createdAt: '2026-08-03T10:00:00.000Z',
  };
}

describe('elegiblesParaTurno (fase-14-24, decisión 6)', () => {
  const padron = [usuario('jose'), usuario('luciana'), usuario('alejandra')];

  it('sin destinatario el pozo es todo el grupo', () => {
    expect(elegiblesParaTurno(padron, []).map((u) => u.id)).toEqual([
      'jose',
      'luciana',
      'alejandra',
    ]);
  });

  it('con destinatario nominal solo se puede rotar entre los destinatarios', () => {
    const elegibles = elegiblesParaTurno(padron, ['luciana', 'alejandra']);

    expect(elegibles.map((u) => u.id)).toEqual(['luciana', 'alejandra']);
  });

  it('los dos filtros se acumulan: un destinatario dado de baja tampoco se ofrece', () => {
    const conBaja = [usuario('luciana'), usuario('alejandra', 'INACTIVO')];

    const elegibles = elegiblesParaTurno(conBaja, ['luciana', 'alejandra']);

    expect(elegibles.map((u) => u.id)).toEqual(['luciana']);
  });

  it('conserva el orden del padrón, no el del destinatario', () => {
    const elegibles = elegiblesParaTurno(padron, ['alejandra', 'jose']);

    expect(elegibles.map((u) => u.id)).toEqual(['jose', 'alejandra']);
  });
});

describe('podarSecuencia (fase-14-24, decisión 6)', () => {
  it('saca de la rotación a quien dejó de ser destinatario', () => {
    const podada = podarSecuencia(['jose', 'luciana', 'jose'], ['luciana']);

    expect(podada).toEqual(['luciana']);
  });

  it('sin destinatario no poda nada: la actividad es de todo el grupo', () => {
    const secuencia = ['jose', 'luciana'];

    expect(podarSecuencia(secuencia, [])).toBe(secuencia);
  });

  it('devuelve la MISMA referencia si no hay nada que sacar — el efecto no debe reemitir', () => {
    const secuencia = ['jose', 'luciana'];

    expect(podarSecuencia(secuencia, ['jose', 'luciana', 'alejandra'])).toBe(secuencia);
  });

  it('conserva los repetidos de quien sigue siendo destinatario', () => {
    const podada = podarSecuencia(['jose', 'luciana', 'jose'], ['jose']);

    expect(podada).toEqual(['jose', 'jose']);
  });

  it('quitar a todos los de la secuencia la deja vacía, no la deja inválida', () => {
    expect(podarSecuencia(['jose'], ['luciana'])).toEqual([]);
  });
});

describe('resumenDeReparto (fase-14-21)', () => {
  it('avisa quién tiene turnos de más: el caso José - Luciana - José - Alejandra', () => {
    const resumen = resumenDeReparto(
      ['jose', 'luciana', 'jose', 'alejandra'],
      nombreDe
    );

    expect(resumen).toBe('José: 2 de cada 4.');
  });

  it('con todos una vez no repite lo obvio, solo dice el largo de la vuelta', () => {
    expect(resumenDeReparto(['jose', 'luciana'], nombreDe)).toBe('Vuelta de 2 turnos.');
  });

  it('menciona a cada repetido cuando hay varios', () => {
    const resumen = resumenDeReparto(
      ['jose', 'luciana', 'jose', 'luciana', 'alejandra'],
      nombreDe
    );

    expect(resumen).toContain('José: 2 de cada 5');
    expect(resumen).toContain('Luciana: 2 de cada 5');
  });

  it('una secuencia de un solo turno se dice en singular', () => {
    expect(resumenDeReparto(['jose'], nombreDe)).toBe('Vuelta de 1 turno.');
  });

  it('sin secuencia no hay nada que resumir', () => {
    expect(resumenDeReparto([], nombreDe)).toBeNull();
  });
});

describe('textoDelChipDeTurno (fase-14-23)', () => {
  it('dice a quién le toca hoy', () => {
    expect(textoDelChipDeTurno(true, 'Luciana')).toBe('Hoy: Luciana');
  });

  it('sin asignación vigente anuncia la rotación pero no arriesga un nombre', () => {
    expect(textoDelChipDeTurno(true, null)).toBe('Por turnos');
  });

  it('sin turno activo no hay chip: la ausencia es la que dice «es de todos»', () => {
    expect(textoDelChipDeTurno(false, null)).toBeNull();
  });

  it('sin turno activo no hay chip ni aunque quedara una asignación vieja colgada', () => {
    expect(textoDelChipDeTurno(false, 'Luciana')).toBeNull();
  });
});

describe('accionDeTurno (fase-14-23)', () => {
  const guardado = (secuencia: string[], activo = true): TurnoActividadDto => ({
    actividadId: 'act-1',
    modo: ModoTurno.ORDEN_FIJO,
    frecuencia: FrecuenciaTurno.SESION,
    activo,
    posiciones: secuencia.map((usuarioId, orden) => ({
      usuarioId,
      orden,
      nombre: nombreDe(usuarioId),
      aviso: null,
    })),
    asignacionVigente: null,
    proximos: [],
  });

  const enPantalla = (
    secuencia: string[],
    extra: Partial<EstadoTurnoForm> = {}
  ): EstadoTurnoForm => ({
    activo: true,
    modo: ModoTurno.ORDEN_FIJO,
    frecuencia: FrecuenciaTurno.SESION,
    secuencia,
    ...extra,
  });

  it('guarda una rotación nueva', () => {
    expect(accionDeTurno(null, enPantalla(['jose', 'luciana']))).toBe('guardar');
  });

  it('guarda cuando cambió el orden, aunque sean los mismos nombres', () => {
    const accion = accionDeTurno(
      guardado(['jose', 'luciana']),
      enPantalla(['luciana', 'jose'])
    );

    expect(accion).toBe('guardar');
  });

  it('guarda cuando se repitió a alguien: el largo de la vuelta cambió', () => {
    const accion = accionDeTurno(
      guardado(['jose', 'luciana']),
      enPantalla(['jose', 'luciana', 'jose'])
    );

    expect(accion).toBe('guardar');
  });

  it('guarda cuando solo cambió la frecuencia', () => {
    const accion = accionDeTurno(
      guardado(['jose']),
      enPantalla(['jose'], { frecuencia: FrecuenciaTurno.SECCION })
    );

    expect(accion).toBe('guardar');
  });

  it('no manda nada si no se tocó nada: guardar la actividad no debe sellar una vuelta nueva', () => {
    const accion = accionDeTurno(
      guardado(['jose', 'luciana']),
      enPantalla(['jose', 'luciana'])
    );

    expect(accion).toBe('ninguna');
  });

  it('apaga cuando se destilda una rotación que existía', () => {
    const accion = accionDeTurno(guardado(['jose']), enPantalla(['jose'], { activo: false }));

    expect(accion).toBe('apagar');
  });

  it('no manda un DELETE si la actividad nunca rotó', () => {
    expect(accionDeTurno(null, enPantalla([], { activo: false }))).toBe('ninguna');
  });

  it('no manda un DELETE si la rotación ya estaba apagada en el servidor', () => {
    const accion = accionDeTurno(
      guardado(['jose'], false),
      enPantalla(['jose'], { activo: false })
    );

    expect(accion).toBe('ninguna');
  });

  it('no intenta guardar una secuencia vacía: eso es un error de formulario, no un 400', () => {
    expect(accionDeTurno(null, enPantalla([]))).toBe('ninguna');
  });

  it('reactivar una rotación apagada vuelve a guardarla aunque la secuencia sea la misma', () => {
    const accion = accionDeTurno(guardado(['jose', 'luciana'], false), enPantalla(['jose', 'luciana']));

    expect(accion).toBe('guardar');
  });
});
