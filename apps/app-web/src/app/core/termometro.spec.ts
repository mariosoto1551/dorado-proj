import type { UmbralZonaDto } from '@dorado/shared-types';

import { construirEscala, type ParticipanteTermometro } from './termometro';

/** Los cuatro tramos del seed (ver CLAUDE.md), que es el caso real. */
const UMBRALES = [
  { id: '1', orden: 1, nombreZona: 'Rojo', puntosMin: 0, puntosMax: 9, colorHex: '#EF4444' },
  { id: '2', orden: 2, nombreZona: 'Amarillo', puntosMin: 10, puntosMax: 24, colorHex: '#F59E0B' },
  { id: '3', orden: 3, nombreZona: 'Verde', puntosMin: 25, puntosMax: 49, colorHex: '#22C55E' },
  { id: '4', orden: 4, nombreZona: 'Dorado', puntosMin: 50, puntosMax: null, colorHex: '#EAB308' },
] as unknown as UmbralZonaDto[];

function persona(
  nombre: string,
  puntajeTotal: number,
  descalificado = false
): ParticipanteTermometro {
  return { usuarioId: nombre.toLowerCase(), nombre, puntajeTotal, descalificado };
}

describe('construirEscala — bandas', () => {
  it('dibuja una banda por zona, de piso a techo', () => {
    const { tramos } = construirEscala(UMBRALES, []);

    expect(tramos.map((t) => t.nombre)).toEqual(['Rojo', 'Amarillo', 'Verde', 'Dorado']);
    expect(tramos[0].desde).toBe(0);
    expect(tramos[3].hasta).toBe(100);
  });

  it('a la zona abierta le da el alto de la anterior, no un techo dinámico', () => {
    // Verde mide 25 puntos (25→50), así que Dorado va de 50 a 75.
    const { base, tope, tramos } = construirEscala(UMBRALES, []);

    expect(base).toBe(0);
    expect(tope).toBe(75);
    expect(tramos[3].abierta).toBe(true);
  });

  it('el techo NO se mueve cuando alguien saca más puntos', () => {
    const flojos = construirEscala(UMBRALES, [persona('Ana', 12)]);
    const campeones = construirEscala(UMBRALES, [persona('Ana', 900)]);

    expect(campeones.tope).toBe(flojos.tope);
  });

  it('si la zona más alta declara puntosMax, ese es el techo', () => {
    const cerrados = UMBRALES.map((u) =>
      u.nombreZona === 'Dorado' ? { ...u, puntosMax: 99 } : u
    );

    expect(construirEscala(cerrados, []).tope).toBe(100);
  });

  it('con una sola zona abierta igual arma una escala usable', () => {
    const unica = [UMBRALES[3]];

    const { tope, tramos } = construirEscala(unica, []);

    expect(tope).toBe(60);
    expect(tramos).toHaveLength(1);
  });

  it('sin umbrales no rompe: devuelve escala vacía', () => {
    const escala = construirEscala([], [persona('Ana', 30)]);

    expect(escala.tramos).toEqual([]);
    expect(escala.marcas).toEqual([]);
  });

  it('umbrales mal configurados (no monótonos) no colapsan la escala', () => {
    const rotos = [
      { ...UMBRALES[0], puntosMin: 0 },
      { ...UMBRALES[1], puntosMin: 0 },
      { ...UMBRALES[2], puntosMin: 0 },
    ] as unknown as UmbralZonaDto[];

    const { tramos, tope, base } = construirEscala(rotos, []);

    expect(tope).toBeGreaterThan(base);
    expect(tramos.every((t) => t.hasta >= t.desde)).toBe(true);
  });
});

describe('construirEscala — marcas', () => {
  it('ubica cada puntaje en su proporción del tubo', () => {
    // Escala 0–75: 25 puntos es exactamente un tercio.
    const { marcas } = construirEscala(UMBRALES, [persona('Ana', 25)]);

    expect(marcas[0].posicion).toBeCloseTo(33.33, 1);
  });

  it('pinta la marca con el color de la zona donde cae', () => {
    const { marcas } = construirEscala(UMBRALES, [persona('Ana', 30), persona('Beni', 5)]);

    expect(marcas[0].colorHex).toBe('#22C55E');
    expect(marcas[1].colorHex).toBe('#EF4444');
  });

  it('ordena de mayor a menor y desempata alfabético', () => {
    const { marcas } = construirEscala(UMBRALES, [
      persona('Beni', 40),
      persona('Ana', 40),
      persona('Caro', 60),
    ]);

    expect(marcas.map((m) => m.nombre)).toEqual(['Caro', 'Ana', 'Beni']);
  });

  it('marca fuera de escala al que se pasa del techo, sin salirse del tubo', () => {
    const { marcas } = construirEscala(UMBRALES, [persona('Ana', 900)]);

    expect(marcas[0].fueraDeEscala).toBe('ARRIBA');
    expect(marcas[0].posicion).toBe(100);
  });

  it('marca fuera de escala al que queda por debajo del piso', () => {
    const { marcas } = construirEscala(UMBRALES, [persona('Ana', -8)]);

    expect(marcas[0].fueraDeEscala).toBe('ABAJO');
    expect(marcas[0].posicion).toBe(0);
  });
});

describe('construirEscala — separación de etiquetas', () => {
  it('separa las etiquetas que se pisan SIN mover el punto real', () => {
    // 42, 41 y 40 caen a menos de 1,5% entre sí en una escala de 75 puntos.
    const { marcas } = construirEscala(
      UMBRALES,
      [persona('Ana', 42), persona('Beni', 41), persona('Caro', 40)],
      { separacionMinima: 8 }
    );

    for (let i = 1; i < marcas.length; i++) {
      expect(marcas[i - 1].posicionEtiqueta - marcas[i].posicionEtiqueta).toBeCloseTo(8, 5);
    }

    // Lo que se movió es la etiqueta, no la marca: la línea guía sigue apuntando
    // al puntaje real, que es lo que hace que no haga falta hover.
    expect(marcas[1].nombre).toBe('Beni');
    expect(marcas[1].posicion).toBeCloseTo(54.67, 1);
    expect(marcas[1].posicionEtiqueta).toBeCloseTo(48, 1);
  });

  it('deja quieta la etiqueta del que no tiene vecinos cerca', () => {
    const { marcas } = construirEscala(UMBRALES, [persona('Ana', 60), persona('Beni', 5)]);

    expect(marcas[0].posicionEtiqueta).toBeCloseTo(marcas[0].posicion, 5);
    expect(marcas[1].posicionEtiqueta).toBeCloseTo(marcas[1].posicion, 5);
  });

  it('con el grupo entero empatado reparte las etiquetas dentro del tubo', () => {
    const empatados = ['Ana', 'Beni', 'Caro', 'Dani', 'Eli'].map((n) => persona(n, 30));

    const { marcas } = construirEscala(UMBRALES, empatados, { separacionMinima: 8 });

    expect(marcas.every((m) => m.posicionEtiqueta >= 0 && m.posicionEtiqueta <= 100)).toBe(true);

    for (let i = 1; i < marcas.length; i++) {
      expect(marcas[i - 1].posicionEtiqueta - marcas[i].posicionEtiqueta).toBeGreaterThanOrEqual(
        7.99
      );
    }
  });

  it('con muchos participantes comprime la separación en vez de desbordar', () => {
    const multitud = Array.from({ length: 20 }, (_, i) => persona(`P${i}`, 40 + i));

    const { marcas } = construirEscala(UMBRALES, multitud, { separacionMinima: 8 });

    expect(marcas.every((m) => m.posicionEtiqueta >= 0 && m.posicionEtiqueta <= 100)).toBe(true);

    for (let i = 1; i < marcas.length; i++) {
      expect(marcas[i - 1].posicionEtiqueta).toBeGreaterThan(marcas[i].posicionEtiqueta);
    }
  });
});

describe('construirEscala — promedio del grupo', () => {
  it('promedia a los participantes activos', () => {
    const { promedio } = construirEscala(UMBRALES, [persona('Ana', 30), persona('Beni', 10)]);

    expect(promedio).toBe(20);
  });

  it('excluye al descalificado para no arrastrar el mercurio', () => {
    const { promedio } = construirEscala(UMBRALES, [
      persona('Ana', 30),
      persona('Beni', 10),
      persona('Caro', -40, true),
    ]);

    expect(promedio).toBe(20);
  });

  it('sin nadie a quien promediar deja el mercurio en cero y en gris', () => {
    const escala = construirEscala(UMBRALES, [persona('Ana', 30, true)]);

    expect(escala.promedio).toBeNull();
    expect(escala.posicionPromedio).toBe(0);
    expect(escala.colorPromedio).toBe('#94a3b8');
  });

  it('el mercurio toma el color de la zona del promedio', () => {
    const { colorPromedio } = construirEscala(UMBRALES, [persona('Ana', 30), persona('Beni', 40)]);

    expect(colorPromedio).toBe('#22C55E');
  });
});
