import { describe, expect, it } from 'vitest';

import { FuenteProducto, TipoItemCatalogo } from '@dorado/shared-types';
import type {
  EtiquetaCatalogoDto,
  ProductoTiendaDto,
  RecompensaDto,
} from '@dorado/shared-types';

import { conEtiqueta, particionarParaTienda, premiosParaBolsa } from './etiquetas-catalogo';

const PANTALLA: EtiquetaCatalogoDto = {
  id: 'et-pantalla',
  organizacionId: 'org-1',
  grupoId: 'grupo-1',
  nombre: 'Pantalla',
  colorHex: '#8B5CF6',
  estado: 'ACTIVA',
};

const SALIDAS: EtiquetaCatalogoDto = { ...PANTALLA, id: 'et-salidas', nombre: 'Salidas' };

function item(sobrescribir: Partial<RecompensaDto> & { id: string }): RecompensaDto {
  return {
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    nombre: sobrescribir.id,
    descripcion: null,
    imagenUrl: null,
    tipo: TipoItemCatalogo.PREMIO,
    umbralZonaId: null,
    nombreZonaSnapshot: null,
    permiteSeleccion: false,
    permiteAzar: false,
    estado: 'ACTIVA',
    etiquetas: [],
    ...sobrescribir,
  } as RecompensaDto;
}

function producto(sobrescribir: Partial<ProductoTiendaDto>): ProductoTiendaDto {
  return {
    id: 'p-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    nombre: 'Producto',
    descripcion: null,
    imagenUrl: null,
    precio: 10,
    fuente: FuenteProducto.ITEM,
    mecanica: 'AZAR',
    recompensaId: null,
    bolsaId: null,
    estado: 'ACTIVA',
    puedeComprar: false,
    faltan: 0,
    ...sobrescribir,
  } as ProductoTiendaDto;
}

describe('conEtiqueta (fase-14-26)', () => {
  it('devuelve solo los ítems que la llevan', () => {
    const items = [
      item({ id: 'consola', etiquetas: [PANTALLA] }),
      item({ id: 'helado' }),
      item({ id: 'cine', etiquetas: [SALIDAS] }),
    ];

    expect(conEtiqueta(items, PANTALLA.id).map((i) => i.id)).toEqual(['consola']);
  });

  it('un ítem con VARIAS etiquetas aparece bajo cada una (decisión 2)', () => {
    const items = [item({ id: 'bici', etiquetas: [PANTALLA, SALIDAS] })];

    expect(conEtiqueta(items, PANTALLA.id)).toHaveLength(1);
    expect(conEtiqueta(items, SALIDAS.id)).toHaveLength(1);
  });
});

describe('premiosParaBolsa (fase-14-26 decisión 10)', () => {
  it('precarga los premios y cuenta los castigos salteados', () => {
    const items = [
      item({ id: 'helado', etiquetas: [PANTALLA] }),
      item({ id: 'sin-tele', tipo: TipoItemCatalogo.CASTIGO, etiquetas: [PANTALLA] }),
      item({ id: 'sin-postre', tipo: TipoItemCatalogo.CASTIGO, etiquetas: [PANTALLA] }),
    ];

    const { premios, castigosSalteados } = premiosParaBolsa(items, PANTALLA.id);

    expect(premios.map((p) => p.id)).toEqual(['helado']);
    expect(castigosSalteados).toBe(2);
  });

  it('sin castigos no hay nada que avisar', () => {
    const items = [item({ id: 'helado', etiquetas: [PANTALLA] })];

    expect(premiosParaBolsa(items, PANTALLA.id).castigosSalteados).toBe(0);
  });
});

describe('particionarParaTienda (fase-14-26 decisión 11)', () => {
  it('saltea el que ya tiene producto activo y publica el resto', () => {
    const items = [
      item({ id: 'helado', etiquetas: [PANTALLA] }),
      item({ id: 'sticker', etiquetas: [PANTALLA] }),
    ];
    const productos = [producto({ recompensaId: 'helado' })];

    const { aPublicar, salteados } = particionarParaTienda(items, productos, PANTALLA.id);

    expect(aPublicar.map((i) => i.id)).toEqual(['sticker']);
    expect(salteados.map((i) => i.id)).toEqual(['helado']);
  });

  it('un producto ARCHIVADO no bloquea: se vuelve a publicar', () => {
    const items = [item({ id: 'helado', etiquetas: [PANTALLA] })];
    const productos = [producto({ recompensaId: 'helado', estado: 'ARCHIVADA' })];

    expect(particionarParaTienda(items, productos, PANTALLA.id).aPublicar).toHaveLength(1);
  });

  it('un producto de fuente BOLSA no cuenta como producto del ítem', () => {
    const items = [item({ id: 'helado', etiquetas: [PANTALLA] })];
    // Un premio dentro de una bolsa sorteada puede además venderse suelto: son
    // los dos ejes del #22, y publicar el directo no es un duplicado.
    const productos = [producto({ fuente: FuenteProducto.BOLSA, bolsaId: 'b-1', recompensaId: null })];

    expect(particionarParaTienda(items, productos, PANTALLA.id).aPublicar).toHaveLength(1);
  });

  it('los castigos de la etiqueta nunca llegan a publicarse', () => {
    const items = [item({ id: 'sin-tele', tipo: TipoItemCatalogo.CASTIGO, etiquetas: [PANTALLA] })];

    expect(particionarParaTienda(items, [], PANTALLA.id).aPublicar).toEqual([]);
  });

  it('todo ya publicado deja la lista vacía: el botón queda deshabilitado', () => {
    const items = [item({ id: 'helado', etiquetas: [PANTALLA] })];
    const productos = [producto({ recompensaId: 'helado' })];

    expect(particionarParaTienda(items, productos, PANTALLA.id).aPublicar).toEqual([]);
  });
});
