import { describe, expect, it } from 'vitest';

import {
  barajar,
  sellarOrdenDeVuelta,
  siguienteTurno,
  vueltaAgotada,
} from './rotacion-turnos';

/** El ejemplo de la spec: José recibe 2 de cada 4 turnos porque aparece dos veces. */
const SECUENCIA = ['jose', 'luciana', 'jose', 'alejandra'];

/** Todos pueden recibir el turno. */
const TODOS_VALIDOS = () => null;

describe('sellarOrdenDeVuelta (fase-14-21)', () => {
  it('ORDEN_FIJO copia la secuencia tal cual, repeticiones incluidas', () => {
    expect(sellarOrdenDeVuelta(SECUENCIA, 'ORDEN_FIJO')).toEqual(SECUENCIA);
  });

  it('AZAR conserva la PROPORCIÓN: José sigue teniendo 2 de 4 (decisión 13)', () => {
    // Barajar personas en vez de posiciones destruiría el patrón que el Tutor
    // definió; este test es el que lo impide.
    const barajada = sellarOrdenDeVuelta(SECUENCIA, 'AZAR', () => 0.42);

    expect(barajada).toHaveLength(4);
    expect(barajada.filter((id) => id === 'jose')).toHaveLength(2);
    expect(barajada.filter((id) => id === 'luciana')).toHaveLength(1);
    expect(barajada.filter((id) => id === 'alejandra')).toHaveLength(1);
  });

  it('no muta la secuencia original', () => {
    const original = [...SECUENCIA];

    barajar(SECUENCIA, () => 0.9);

    expect(SECUENCIA).toEqual(original);
  });
});

describe('siguienteTurno (fase-14-21)', () => {
  it('recorre la secuencia en orden: José, Luciana, José, Alejandra', () => {
    const recorrido: string[] = [];
    let indice = 0;

    for (let dia = 0; dia < 4; dia++) {
      const avance = siguienteTurno(SECUENCIA, indice, TODOS_VALIDOS);

      expect(avance.candidato).not.toBeNull();
      recorrido.push(avance.candidato!.usuarioId);
      indice = avance.candidato!.indice + 1;
    }

    expect(recorrido).toEqual(['jose', 'luciana', 'jose', 'alejandra']);
  });

  it('saltea a quien ya no está en el grupo y sigue al siguiente (decisión 14)', () => {
    const avance = siguienteTurno(SECUENCIA, 1, (usuarioId) =>
      usuarioId === 'luciana' ? 'YA_NO_ESTA_EN_EL_GRUPO' : null
    );

    expect(avance.candidato).toEqual({ usuarioId: 'jose', indice: 2 });
    expect(avance.salteadas).toEqual([
      { indice: 1, usuarioId: 'luciana', motivo: 'YA_NO_ESTA_EN_EL_GRUPO' },
    ]);
  });

  it('saltea a quien perdió el rol que la actividad exige (decisión 18)', () => {
    const avance = siguienteTurno(SECUENCIA, 0, (usuarioId) =>
      usuarioId === 'jose' ? 'SIN_EL_ROL' : null
    );

    expect(avance.candidato).toEqual({ usuarioId: 'luciana', indice: 1 });
    expect(avance.salteadas).toHaveLength(1);
  });

  it('sin nadie válido devuelve null: ese día no le toca a nadie (decisión 19)', () => {
    // Preferible a elegir un reemplazante que el Tutor no decidió.
    const avance = siguienteTurno(SECUENCIA, 0, () => 'YA_NO_ESTA_EN_EL_GRUPO');

    expect(avance.candidato).toBeNull();
    expect(avance.salteadas).toHaveLength(4);
  });

  it('no da la vuelta sola al pasarse del final: eso lo decide el llamador', () => {
    // Cerrar la vuelta implica sellar la SIGUIENTE (releyendo la secuencia, que
    // pudo cambiar), y esa decisión no es de esta función.
    const avance = siguienteTurno(SECUENCIA, 4, TODOS_VALIDOS);

    expect(avance.candidato).toBeNull();
  });
});

describe('vueltaAgotada (fase-14-21)', () => {
  it('sin turnos consumidos la vuelta no está agotada', () => {
    expect(vueltaAgotada(SECUENCIA, null)).toBe(false);
  });

  it('con el último índice consumido, sí', () => {
    expect(vueltaAgotada(SECUENCIA, 3)).toBe(true);
    expect(vueltaAgotada(SECUENCIA, 2)).toBe(false);
  });
});
