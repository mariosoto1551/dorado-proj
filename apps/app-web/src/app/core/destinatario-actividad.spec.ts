import { describe, expect, it } from 'vitest';

import type { ActividadDto } from '@dorado/shared-types';

import {
  agruparPorDestinatario,
  estaVencida,
  filtrarPorNombre,
  formatearFecha,
  modoDestinatario,
  textoDestinatario,
  textoVigencia,
  venceHoy,
  type Nombres,
} from './destinatario-actividad';

const ANA = 'usr-ana';
const LUIS = 'usr-luis';
const SOL = 'usr-sol';

function actividad(parcial: Partial<ActividadDto> = {}): ActividadDto {
  return {
    id: 'act-1',
    nombre: 'Tender la cama',
    rolesPermitidos: [],
    usuariosPermitidos: [],
    equiposPermitidos: [],
    vigenteDesde: null,
    vigenteHasta: null,
    ...parcial,
  } as ActividadDto;
}

const NOMBRES: Nombres = {
  usuarios: new Map([
    [ANA, 'Ana'],
    [LUIS, 'Luis'],
    [SOL, 'Sol'],
  ]),
  roles: new Map([['rol-cocina', 'Cocina']]),
  equipos: new Map([['eq-rojo', 'Equipo Rojo']]),
};

describe('modoDestinatario', () => {
  it('sin nada configurado es TODOS: el default y lo que hay hoy', () => {
    expect(modoDestinatario(actividad())).toBe('TODOS');
  });

  it('deriva el modo del array lleno', () => {
    expect(modoDestinatario(actividad({ rolesPermitidos: ['rol-cocina'] }))).toBe('ROLES');
    expect(modoDestinatario(actividad({ usuariosPermitidos: [ANA] }))).toBe('USUARIOS');
    expect(modoDestinatario(actividad({ equiposPermitidos: ['eq-rojo'] }))).toBe('EQUIPOS');
  });
});

describe('agruparPorDestinatario', () => {
  const generales = actividad({ id: 'a-general' });
  const deCocina = actividad({ id: 'a-cocina', rolesPermitidos: ['rol-cocina'] });
  const deAna = actividad({ id: 'a-ana', usuariosPermitidos: [ANA] });

  it('agrupa en el orden fijo: de lo general a lo específico', () => {
    const grupos = agruparPorDestinatario([deAna, generales, deCocina]);

    expect(grupos.map((grupo) => grupo.modo)).toEqual(['TODOS', 'ROLES', 'USUARIOS']);
    expect(grupos[0].actividades.map((item) => item.id)).toEqual(['a-general']);
  });

  it('NO devuelve las secciones vacías', () => {
    // Un grupo que no usa equipos no debería ver «De equipos (0)» para siempre.
    const grupos = agruparPorDestinatario([generales]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].titulo).toBe('De todo el grupo');
  });

  it('con lista vacía no devuelve ninguna sección', () => {
    expect(agruparPorDestinatario([])).toEqual([]);
  });

  it('el buscador filtra DENTRO de las secciones y descarta las que quedan vacías', () => {
    const piano = actividad({ id: 'a-piano', nombre: 'Practicar piano', usuariosPermitidos: [ANA] });
    const grupos = agruparPorDestinatario([generales, piano], 'piano');

    expect(grupos).toHaveLength(1);
    expect(grupos[0].modo).toBe('USUARIOS');
  });
});

describe('filtrarPorNombre', () => {
  const lista = [
    actividad({ id: 'a1', nombre: 'Práctica de piano' }),
    actividad({ id: 'a2', nombre: 'Tender la cama' }),
  ];

  it('ignora mayúsculas y acentos', () => {
    // Escribir «practica» sin tilde tiene que encontrar «Práctica».
    expect(filtrarPorNombre(lista, 'practica').map((item) => item.id)).toEqual(['a1']);
    expect(filtrarPorNombre(lista, 'PIANO').map((item) => item.id)).toEqual(['a1']);
  });

  it('busca por fragmento, no solo por prefijo', () => {
    expect(filtrarPorNombre(lista, 'cama').map((item) => item.id)).toEqual(['a2']);
  });

  it('sin término devuelve todo (incluye solo espacios)', () => {
    expect(filtrarPorNombre(lista, '')).toHaveLength(2);
    expect(filtrarPorNombre(lista, '   ')).toHaveLength(2);
  });
});

describe('textoDestinatario', () => {
  it('null cuando es de todo el grupo: el chip sería ruido', () => {
    expect(textoDestinatario(actividad(), NOMBRES)).toBeNull();
  });

  it('enumera en castellano', () => {
    expect(textoDestinatario(actividad({ usuariosPermitidos: [ANA] }), NOMBRES)).toBe('Ana');
    expect(textoDestinatario(actividad({ usuariosPermitidos: [ANA, LUIS] }), NOMBRES)).toBe(
      'Ana y Luis'
    );
    expect(
      textoDestinatario(actividad({ usuariosPermitidos: [ANA, LUIS, SOL] }), NOMBRES)
    ).toBe('Ana, Luis y Sol');
  });

  it('usa el diccionario que corresponde a cada modo', () => {
    expect(textoDestinatario(actividad({ rolesPermitidos: ['rol-cocina'] }), NOMBRES)).toBe(
      'Cocina'
    );
    expect(textoDestinatario(actividad({ equiposPermitidos: ['eq-rojo'] }), NOMBRES)).toBe(
      'Equipo Rojo'
    );
  });

  it('un id sin nombre conocido se omite, no se muestra crudo', () => {
    // Pasa cuando el participante se fue del grupo: un uuid en la tarjeta no le
    // dice nada a nadie.
    expect(textoDestinatario(actividad({ usuariosPermitidos: ['usr-fantasma'] }), NOMBRES)).toBeNull();
    expect(
      textoDestinatario(actividad({ usuariosPermitidos: [ANA, 'usr-fantasma'] }), NOMBRES)
    ).toBe('Ana');
  });
});

describe('textoVigencia', () => {
  const hoy = new Date('2026-08-03T12:00:00');

  it('null cuando es permanente: el default', () => {
    expect(textoVigencia(actividad())).toBeNull();
  });

  it('desde = hasta se dice «solo el», no como un rango de un día', () => {
    const navidad = actividad({ vigenteDesde: '2026-12-24', vigenteHasta: '2026-12-24' });

    expect(textoVigencia(navidad)).toBe(`solo el ${formatearFecha('2026-12-24', hoy)}`);
  });

  it('cada extremo por separado', () => {
    expect(textoVigencia(actividad({ vigenteDesde: '2026-03-01' }))).toContain('desde el');
    expect(textoVigencia(actividad({ vigenteHasta: '2026-03-30' }))).toContain('hasta el');
  });

  it('el rango completo', () => {
    const marzo = actividad({ vigenteDesde: '2026-03-01', vigenteHasta: '2026-03-30' });

    expect(textoVigencia(marzo)).toMatch(/^del .* al .*$/);
  });
});

describe('formatearFecha', () => {
  const hoy = new Date('2026-08-03T12:00:00');

  it('omite el año cuando es el corriente', () => {
    expect(formatearFecha('2026-12-24', hoy)).toBe('24/12');
  });

  it('lo muestra cuando es otro', () => {
    expect(formatearFecha('2027-01-05', hoy)).toBe('05/01/2027');
  });
});

describe('estaVencida / venceHoy', () => {
  const hoy = new Date('2026-08-03T12:00:00');

  it('permanente nunca vence', () => {
    expect(estaVencida(actividad(), hoy)).toBe(false);
    expect(venceHoy(actividad(), hoy)).toBe(false);
  });

  it('vencida es la que quedó atrás; el mismo día todavía no', () => {
    expect(estaVencida(actividad({ vigenteHasta: '2026-08-02' }), hoy)).toBe(true);
    expect(estaVencida(actividad({ vigenteHasta: '2026-08-03' }), hoy)).toBe(false);
    expect(estaVencida(actividad({ vigenteHasta: '2026-08-04' }), hoy)).toBe(false);
  });

  it('«vence hoy» es el aviso que evita la sorpresa del archivado', () => {
    expect(venceHoy(actividad({ vigenteHasta: '2026-08-03' }), hoy)).toBe(true);
    expect(venceHoy(actividad({ vigenteHasta: '2026-08-04' }), hoy)).toBe(false);
  });
});
