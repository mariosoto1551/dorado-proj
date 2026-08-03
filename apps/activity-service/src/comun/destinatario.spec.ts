import { describe, expect, it } from 'vitest';

import {
  ContextoParticipante,
  DestinatarioDeActividad,
  equiposDelParticipante,
  esDestinatario,
  hayRestriccionesDeEquipo,
  modoDestinatario,
} from './destinatario';

const ANA = 'usr-ana';
const LUIS = 'usr-luis';
const ROL_COCINA = 'rol-cocina';
const EQUIPO_ROJO = 'eq-rojo';

/** Actividad del catálogo del tutor, sin ninguna restricción: el default. */
function actividad(parcial: Partial<DestinatarioDeActividad> = {}): DestinatarioDeActividad {
  return {
    origen: 'TUTOR',
    creadaPorUsuarioId: null,
    rolesPermitidos: [],
    usuariosPermitidos: [],
    equiposPermitidos: [],
    ...parcial,
  };
}

function contexto(parcial: Partial<ContextoParticipante> = {}): ContextoParticipante {
  return { usuarioId: ANA, rolGrupoId: null, equipoIds: [], ...parcial };
}

describe('modoDestinatario', () => {
  it('sin ningún array lleno el modo es TODOS: el default y lo que hay hoy', () => {
    expect(modoDestinatario(actividad())).toBe('TODOS');
  });

  it('deriva el modo del array que esté lleno', () => {
    expect(modoDestinatario(actividad({ rolesPermitidos: [ROL_COCINA] }))).toBe('ROLES');
    expect(modoDestinatario(actividad({ usuariosPermitidos: [ANA] }))).toBe('USUARIOS');
    expect(modoDestinatario(actividad({ equiposPermitidos: [EQUIPO_ROJO] }))).toBe('EQUIPOS');
  });
});

describe('esDestinatario — el default no cambia para nadie', () => {
  it('una actividad sin restricciones es de todos', () => {
    expect(esDestinatario(actividad(), contexto())).toBe(true);
    expect(esDestinatario(actividad(), contexto({ usuarioId: LUIS }))).toBe(true);
  });
});

describe('esDestinatario — por personas (fase-14-24)', () => {
  const dePiano = actividad({ usuariosPermitidos: [ANA] });

  it('la ve el asignado', () => {
    expect(esDestinatario(dePiano, contexto({ usuarioId: ANA }))).toBe(true);
  });

  it('NO la ve quien no está en la lista (decisión 4: se oculta)', () => {
    expect(esDestinatario(dePiano, contexto({ usuarioId: LUIS }))).toBe(false);
  });

  it('con varios asignados, la ven todos ellos', () => {
    const deAmbos = actividad({ usuariosPermitidos: [ANA, LUIS] });

    expect(esDestinatario(deAmbos, contexto({ usuarioId: ANA }))).toBe(true);
    expect(esDestinatario(deAmbos, contexto({ usuarioId: LUIS }))).toBe(true);
    expect(esDestinatario(deAmbos, contexto({ usuarioId: 'usr-otro' }))).toBe(false);
  });
});

describe('esDestinatario — por equipos (decisión 5)', () => {
  const delRojo = actividad({ equiposPermitidos: [EQUIPO_ROJO] });

  it('la ve quien pertenece al equipo', () => {
    expect(esDestinatario(delRojo, contexto({ equipoIds: [EQUIPO_ROJO] }))).toBe(true);
  });

  it('NO la ve quien está en otro equipo, ni quien no está en ninguno', () => {
    expect(esDestinatario(delRojo, contexto({ equipoIds: ['eq-azul'] }))).toBe(false);
    expect(esDestinatario(delRojo, contexto({ equipoIds: [] }))).toBe(false);
  });
});

describe('esDestinatario — las tres reglas están COMPUESTAS, no sueltas', () => {
  // Es el punto entero del archivo: aplicar una y olvidar las otras es el modo
  // de falla que los ítems 10 y 19 anotaron cada uno en su momento.

  it('sigue aplicando la regla de autoría del ítem 10', () => {
    const personalDeLuis = actividad({ origen: 'USUARIO', creadaPorUsuarioId: LUIS });

    expect(esDestinatario(personalDeLuis, contexto({ usuarioId: LUIS }))).toBe(true);
    expect(esDestinatario(personalDeLuis, contexto({ usuarioId: ANA }))).toBe(false);
  });

  it('sigue aplicando la regla de rol del ítem 19', () => {
    const deCocina = actividad({ rolesPermitidos: [ROL_COCINA] });

    expect(esDestinatario(deCocina, contexto({ rolGrupoId: ROL_COCINA }))).toBe(true);
    expect(esDestinatario(deCocina, contexto({ rolGrupoId: 'rol-otro' }))).toBe(false);
    expect(esDestinatario(deCocina, contexto({ rolGrupoId: null }))).toBe(false);
  });

  it('ante un estado imposible (dos modos llenos) devuelve el conjunto MÁS CHICO', () => {
    // La validación de escritura impide llegar acá, pero si un bug lo lograra,
    // con una regla de visibilidad fallar cerrando es lo correcto.
    const rota = actividad({ rolesPermitidos: [ROL_COCINA], usuariosPermitidos: [ANA] });

    expect(esDestinatario(rota, contexto({ usuarioId: ANA, rolGrupoId: ROL_COCINA }))).toBe(
      true
    );
    expect(esDestinatario(rota, contexto({ usuarioId: ANA, rolGrupoId: null }))).toBe(false);
    expect(esDestinatario(rota, contexto({ usuarioId: LUIS, rolGrupoId: ROL_COCINA }))).toBe(
      false
    );
  });
});

describe('hayRestriccionesDeEquipo — costo cero para quien no usa el ítem', () => {
  it('false cuando ninguna actividad usa el modo equipos', () => {
    expect(hayRestriccionesDeEquipo([actividad(), actividad({ usuariosPermitidos: [ANA] })])).toBe(
      false
    );
  });

  it('true con una sola que lo use', () => {
    expect(
      hayRestriccionesDeEquipo([actividad(), actividad({ equiposPermitidos: [EQUIPO_ROJO] })])
    ).toBe(true);
  });
});

describe('equiposDelParticipante', () => {
  const equipos = [
    { equipoId: EQUIPO_ROJO, estado: 'ACTIVO', miembros: [{ usuarioId: ANA }] },
    { equipoId: 'eq-azul', estado: 'ACTIVO', miembros: [{ usuarioId: LUIS }] },
    { equipoId: 'eq-viejo', estado: 'INACTIVO', miembros: [{ usuarioId: ANA }] },
  ];

  it('devuelve solo los equipos ACTIVO donde el participante es miembro', () => {
    expect(equiposDelParticipante(equipos, ANA)).toEqual([EQUIPO_ROJO]);
    expect(equiposDelParticipante(equipos, LUIS)).toEqual(['eq-azul']);
  });

  it('un equipo INACTIVO no cuenta: su tarea no debería aparecerle a nadie', () => {
    expect(equiposDelParticipante(equipos, ANA)).not.toContain('eq-viejo');
  });

  it('sin membresía devuelve vacío', () => {
    expect(equiposDelParticipante(equipos, 'usr-nuevo')).toEqual([]);
  });
});
