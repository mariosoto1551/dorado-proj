import { describe, expect, it } from 'vitest';

import { resumenDeReparto } from './turnos';

const NOMBRES: Record<string, string> = {
  jose: 'José',
  luciana: 'Luciana',
  alejandra: 'Alejandra',
};

const nombreDe = (id: string) => NOMBRES[id] ?? id;

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
