import { describe, expect, it } from 'vitest';

import {
  cuantosCambianDeZona,
  estadoResultante,
  ordenAplicable,
  violacionDeLaEscala,
  zonaDe,
  type PasoDeEscala,
  type ZonaDeLaEscala,
} from './escala';

/** La escala del seed: cuatro zonas contiguas y la más alta sin techo. */
const ESCALA: ZonaDeLaEscala[] = [
  { id: 'rojo', nombreZona: 'Rojo', orden: 1, puntosMin: 0, puntosMax: 20 },
  { id: 'amarillo', nombreZona: 'Amarillo', orden: 2, puntosMin: 21, puntosMax: 40 },
  { id: 'verde', nombreZona: 'Verde', orden: 3, puntosMin: 41, puntosMax: 60 },
  { id: 'dorado', nombreZona: 'Dorado', orden: 4, puntosMin: 61, puntosMax: null },
];

function editar(id: string, cambios: Partial<ZonaDeLaEscala>): PasoDeEscala {
  const zona = ESCALA.find((fila) => fila.id === id);

  if (!zona) {
    throw new Error(`No existe la zona "${id}" en la escala de prueba.`);
  }

  return { tipo: 'editar', zona: { ...zona, ...cambios } };
}

function crear(zona: Omit<ZonaDeLaEscala, 'id'>): PasoDeEscala {
  return { tipo: 'crear', zona: { id: '', ...zona } };
}

function borrar(id: string): PasoDeEscala {
  const zona = ESCALA.find((fila) => fila.id === id);

  if (!zona) {
    throw new Error(`No existe la zona "${id}" en la escala de prueba.`);
  }

  return { tipo: 'borrar', zona };
}

describe('la escala de zonas (fase-14-30 tanda 6)', () => {
  describe('el conjunto tiene que cerrar', () => {
    it('la escala del seed cierra', () => {
      expect(violacionDeLaEscala(ESCALA, { exigirCima: true })).toBeNull();
    });

    it('un hueco se rechaza nombrando las dos zonas y el número que falta', () => {
      // «Verde» hasta 55 deja 56-60 sin dueño: nadie con 58 puntos tendría zona.
      const roto = estadoResultante(ESCALA, [editar('verde', { puntosMax: 55 })]);

      const violacion = violacionDeLaEscala(roto, { exigirCima: true });

      expect(violacion).toContain('«Dorado»');
      expect(violacion).toContain('56');
      expect(violacion).toContain('huecos ni solapes');
    });

    it('un solape se rechaza igual que un hueco', () => {
      const roto = estadoResultante(ESCALA, [editar('amarillo', { puntosMax: 45 })]);

      expect(violacionDeLaEscala(roto, { exigirCima: true })).toContain('huecos ni solapes');
    });

    /**
     * Criterio de aceptación 5. Es la regla que va MÁS ALLÁ de lo que rechaza
     * scoring: allá una escala con techo arriba se guarda, y el efecto es que
     * un puntaje por encima se queda sin zona. Acá no se propone.
     */
    it('sin ninguna zona sin techo no se propone, aunque el endpoint lo aceptaría', () => {
      const conTecho = estadoResultante(ESCALA, [editar('dorado', { puntosMax: 200 })]);

      expect(violacionDeLaEscala(conTecho, { exigirCima: true })).toContain('sin zona');
      // Y el mismo conjunto pasa el chequeo del ENDPOINT, que es el que corre
      // sobre los estados intermedios: si no, agregar una zona arriba sería
      // imposible.
      expect(violacionDeLaEscala(conTecho, { exigirCima: false })).toBeNull();
    });

    it('dos zonas sin techo se rechazan diciendo cuál sobra', () => {
      const dosCimas = estadoResultante(ESCALA, [
        crear({ nombreZona: 'Platino', orden: 5, puntosMin: 200, puntosMax: null }),
      ]);

      expect(violacionDeLaEscala(dosCimas, { exigirCima: true })).toContain('«Dorado»');
    });

    it('los órdenes tienen que ir corridos desde 1, sin repetidos', () => {
      const repetido = estadoResultante(ESCALA, [
        crear({ nombreZona: 'Naranja', orden: 2, puntosMin: 21, puntosMax: 30 }),
      ]);

      expect(violacionDeLaEscala(repetido, { exigirCima: true })).toContain('sin huecos ni repetidos');
    });

    it('una escala vacía no es una escala', () => {
      expect(violacionDeLaEscala([], { exigirCima: true })).toContain('sin ninguna zona');
    });
  });

  /**
   * La parte que descubrió esta tanda: scoring valida el conjunto en CADA
   * escritura, y aplicar es un `for`. Que el estado final cierre no alcanza.
   */
  describe('el orden de aplicado', () => {
    it('pone el PATCH que baja el techo ANTES del alta de la zona nueva', () => {
      const pasos = [
        crear({ nombreZona: 'Platino', orden: 5, puntosMin: 81, puntosMax: null }),
        editar('dorado', { puntosMax: 80 }),
      ];

      const orden = ordenAplicable(ESCALA, pasos);

      // Al revés, el primer paso dejaría DOS zonas sin techo y scoring lo
      // rechazaría — con la propuesta ya aprobada por el Tutor.
      expect(orden?.map((paso) => paso.tipo)).toEqual(['editar', 'crear']);
    });

    it('cada paso del orden que devuelve deja el conjunto válido', () => {
      const pasos = [
        crear({ nombreZona: 'Platino', orden: 5, puntosMin: 81, puntosMax: null }),
        editar('dorado', { puntosMax: 80 }),
      ];
      const orden = ordenAplicable(ESCALA, pasos) ?? [];
      let estado = [...ESCALA];

      for (const paso of orden) {
        estado = estadoResultante(estado, [paso]);

        expect(violacionDeLaEscala(estado, { exigirCima: false }), paso.zona.nombreZona).toBeNull();
      }
    });

    /**
     * fase-14-31 tanda 7. Estos cuatro son la demostración de `SOLO_LA_MAS_ALTA`
     * y están juntos a propósito: la regla no está escrita en ningún lado del
     * código —sale de que scoring exige órdenes 1..n en cada escritura— así que
     * lo único que puede sostenerla es esto.
     */
    describe('borrar zonas', () => {
      it('borrar la más alta y abrirle el techo a la que queda tiene orden', () => {
        // Y de paso renombrarla: los nombres y los colores no participan de
        // ninguna validación, así que son gratis en cualquier paso.
        const pasos = [
          borrar('dorado'),
          editar('verde', { nombreZona: 'Dorado', puntosMax: null }),
        ];

        const orden = ordenAplicable(ESCALA, pasos);

        // Primero el DELETE: con «Verde» ya sin techo y «Dorado» todavía vivo
        // habría dos cimas, y scoring rechaza ese paso intermedio.
        expect(orden?.map((paso) => paso.tipo)).toEqual(['borrar', 'editar']);
        expect(
          violacionDeLaEscala(estadoResultante(ESCALA, pasos), { exigirCima: true })
        ).toBeNull();
      });

      it('borrar una del medio no tiene NINGÚN orden, aunque el final cierre', () => {
        // Sacar «Verde» y que «Amarillo» se coma su rango: el estado final es
        // impecable y no hay forma de llegar de a un paso.
        const pasos = [
          borrar('verde'),
          editar('amarillo', { puntosMax: 60 }),
          editar('dorado', { orden: 3 }),
        ];

        expect(
          violacionDeLaEscala(estadoResultante(ESCALA, pasos), { exigirCima: true })
        ).toBeNull();
        expect(ordenAplicable(ESCALA, pasos)).toBeNull();
      });

      /**
       * El límite más fino de los cuatro, y el que corrige lo que esta tanda
       * creía al empezar: **fundir dos zonas tampoco tiene orden**, ni siquiera
       * borrando la más alta. Fundir es mover un límite compartido, y eso ya no
       * tenía orden desde la tanda 6 —el test de acá abajo—; que además haya un
       * borrado no lo arregla.
       *
       * O sea que lo único que se puede acompañar a un borrado es lo que NO
       * mueve un límite: abrirle el techo a la que queda arriba, renombrar,
       * cambiar un color.
       */
      it('fundir dos zonas en una no tiene orden, ni siquiera borrando la más alta', () => {
        // «Amarillo» se come el rango de «Verde» y se borra «Dorado».
        const pasos = [
          borrar('dorado'),
          editar('amarillo', { puntosMax: 60 }),
          editar('verde', { nombreZona: 'Dorado', puntosMin: 61, puntosMax: null }),
        ];

        expect(
          violacionDeLaEscala(estadoResultante(ESCALA, pasos), { exigirCima: true })
        ).toBeNull();
        expect(ordenAplicable(ESCALA, pasos)).toBeNull();
      });

      it('borrar las dos de arriba también tiene orden, de arriba hacia abajo', () => {
        const pasos = [
          borrar('dorado'),
          borrar('verde'),
          editar('amarillo', { puntosMax: null }),
        ];

        const orden = ordenAplicable(ESCALA, pasos);

        expect(orden?.map((paso) => paso.zona.nombreZona)).toEqual([
          'Dorado',
          'Verde',
          'Amarillo',
        ]);
      });
    });

    it('correr dos límites a la vez no tiene ningún orden posible', () => {
      // El estado final cierra perfecto; lo que no existe es un camino de a un
      // paso hasta él, porque mover un límite descoloca al vecino siempre.
      const pasos = [
        editar('amarillo', { puntosMax: 50 }),
        editar('verde', { puntosMin: 51 }),
      ];

      expect(violacionDeLaEscala(estadoResultante(ESCALA, pasos), { exigirCima: true })).toBeNull();
      expect(ordenAplicable(ESCALA, pasos)).toBeNull();
    });
  });

  describe('a cuántos les cambia la zona (decisión 6)', () => {
    const puntajes = [
      { puntajeTotal: 15, descalificado: false },
      { puntajeTotal: 55, descalificado: false },
      { puntajeTotal: 90, descalificado: false },
    ];

    it('cuenta solo a los que cruzan un límite', () => {
      const despues = estadoResultante(ESCALA, [
        editar('dorado', { puntosMax: 80 }),
        crear({ nombreZona: 'Platino', orden: 5, puntosMin: 81, puntosMax: null }),
      ]);

      // El de 90 pasa de Dorado a Platino; los otros dos no se mueven.
      expect(cuantosCambianDeZona(puntajes, ESCALA, despues)).toBe(1);
    });

    it('el descalificado no cuenta: no tiene zona ni antes ni después', () => {
      const despues = estadoResultante(ESCALA, [
        editar('dorado', { puntosMax: 80 }),
        crear({ nombreZona: 'Platino', orden: 5, puntosMin: 81, puntosMax: null }),
      ]);

      expect(
        cuantosCambianDeZona([{ puntajeTotal: 90, descalificado: true }], ESCALA, despues)
      ).toBe(0);
    });

    it('mover la base de puntos mueve a todos sobre la misma escala', () => {
      // Sin tocar una sola zona: bajar la base 100 puntos los deja a los tres
      // debajo de la zona más baja.
      expect(cuantosCambianDeZona(puntajes, ESCALA, ESCALA, -100)).toBe(3);
    });
  });

  it('la zona de un puntaje es la misma regla que la de scoring', () => {
    expect(zonaDe(ESCALA, 0)?.nombreZona).toBe('Rojo');
    expect(zonaDe(ESCALA, 20)?.nombreZona).toBe('Rojo');
    expect(zonaDe(ESCALA, 21)?.nombreZona).toBe('Amarillo');
    expect(zonaDe(ESCALA, 10_000)?.nombreZona).toBe('Dorado');
    // Por debajo de la más baja no hay zona, igual que en scoring.
    expect(zonaDe(ESCALA, -1)).toBeNull();
  });
});
