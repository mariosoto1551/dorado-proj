import { expect, test } from '@playwright/test';

import { Api } from './support/api';
import {
  Organizacion,
  crearOrganizacion,
  crearUmbrales,
  invitarYCanjearUsuario,
} from './support/escenario';

/**
 * Fase 14 · Ítem 26 — Etiquetas del catálogo
 * (`fase-14-26-etiquetas-del-catalogo.md`).
 *
 * Lo que solo el stack real puede verificar:
 *
 * - Que el **aislamiento de tenant** lo haga la extensión de Prisma y no un
 *   `if` del service. En los unit tests la BD en memoria no filtra por
 *   organización: una etiqueta de otro tenant «no aparece» porque el fake así
 *   lo devuelve, no porque el sistema la esconda.
 * - Que **archivar y desarchivar** conserve las asignaciones contra Postgres,
 *   con las FK y los índices únicos reales.
 * - Que la creación masiva sea **idempotente contra la base**, no contra un
 *   array en memoria.
 * - Que el **participante no reciba etiquetas por HTTP**, que es donde la
 *   decisión 3 se cumple o se filtra.
 */

interface Etiqueta {
  id: string;
  nombre: string;
  colorHex: string;
  estado: 'ACTIVA' | 'ARCHIVADA';
}

interface Item {
  id: string;
  nombre: string;
  etiquetas: Etiqueta[];
}

async function crearEtiqueta(org: Organizacion, nombre: string): Promise<Etiqueta> {
  return await org.api.postOk<Etiqueta>(`/rewards/grupos/${org.grupoId}/etiquetas`, {
    nombre,
    colorHex: '#8B5CF6',
  });
}

/** Modo TIENDA aplicado al instante: ahí el ítem no necesita zona. */
async function activarTienda(org: Organizacion): Promise<void> {
  await org.api.putOk(`/rewards/grupos/${org.grupoId}/configuracion`, {
    modo: 'TIENDA',
    aplicarAhora: true,
  });
}

async function crearItem(
  org: Organizacion,
  nombre: string,
  tipo: 'PREMIO' | 'CASTIGO' = 'PREMIO'
): Promise<Item> {
  return await org.api.postOk<Item>(`/rewards/grupos/${org.grupoId}/recompensas`, {
    nombre,
    tipo,
  });
}

test.describe('Fase 14 · Ítem 26 — etiquetas del catálogo', () => {
  test('etiquetar, filtrar, y el ciclo archivar → recuperar conserva los ítems', async () => {
    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'etiquetas-ciclo');

    await activarTienda(org);

    const pantalla = await crearEtiqueta(org, 'Pantalla');
    const salidas = await crearEtiqueta(org, 'Salidas');

    const consola = await crearItem(org, 'Hora de consola');
    const cine = await crearItem(org, 'Ir al cine');
    await crearItem(org, 'Helado');

    await org.api.putOk(`/rewards/recompensas/${consola.id}/etiquetas`, {
      etiquetaIds: [pantalla.id],
    });
    await org.api.putOk(`/rewards/recompensas/${cine.id}/etiquetas`, {
      etiquetaIds: [salidas.id],
    });

    // El chip viaja denormalizado, con nombre y color.
    const todos = await org.api.getOk<Item[]>(
      `/rewards/grupos/${org.grupoId}/recompensas?estado=ACTIVA`
    );
    const enConsola = todos.find((item) => item.id === consola.id);

    expect(enConsola?.etiquetas).toHaveLength(1);
    expect(enConsola?.etiquetas[0]).toMatchObject({ nombre: 'Pantalla', colorHex: '#8B5CF6' });

    // El filtro del endpoint (decisión 9): una etiqueta por vez.
    const filtrados = await org.api.getOk<Item[]>(
      `/rewards/grupos/${org.grupoId}/recompensas?etiquetaId=${pantalla.id}`
    );

    expect(filtrados.map((item) => item.id)).toEqual([consola.id]);

    // Renombrar cambia el chip en todos los ítems sin tocarlos de a uno.
    await org.api.patchOk(`/rewards/etiquetas/${pantalla.id}`, {
      nombre: 'Tiempo de pantalla',
    });

    const renombrados = await org.api.getOk<Item[]>(
      `/rewards/grupos/${org.grupoId}/recompensas?etiquetaId=${pantalla.id}`
    );

    expect(renombrados[0].etiquetas[0].nombre).toBe('Tiempo de pantalla');

    // Archivar: desaparece de los chips y de la lista de activas…
    await expect((await org.api.delete(`/rewards/etiquetas/${pantalla.id}`)).status()).toBe(200);

    const activas = await org.api.getOk<Etiqueta[]>(
      `/rewards/grupos/${org.grupoId}/etiquetas`
    );

    expect(activas.map((e) => e.id)).not.toContain(pantalla.id);

    const sinChip = await org.api.getOk<Item[]>(
      `/rewards/grupos/${org.grupoId}/recompensas?estado=ACTIVA`
    );

    expect(sinChip.find((item) => item.id === consola.id)?.etiquetas).toEqual([]);

    // …pero la asignación sigue viva: desarchivar devuelve los MISMOS ítems.
    await org.api.patchOk(`/rewards/etiquetas/${pantalla.id}/desarchivar`, {});

    const recuperados = await org.api.getOk<Item[]>(
      `/rewards/grupos/${org.grupoId}/recompensas?etiquetaId=${pantalla.id}`
    );

    expect(recuperados.map((item) => item.id)).toEqual([consola.id]);
  });

  test('el nombre es único por grupo y el tope de 5 etiquetas se aplica', async () => {
    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'etiquetas-limites');

    await activarTienda(org);
    await crearEtiqueta(org, 'Pantalla');

    const duplicada = await org.api.post(`/rewards/grupos/${org.grupoId}/etiquetas`, {
      nombre: 'Pantalla',
      colorHex: '#111111',
    });

    expect(duplicada.status()).toBe(409);
    expect((await duplicada.json()).code).toBe('ETIQUETA_DUPLICADA');

    const seis: string[] = [];

    for (const nombre of ['A', 'B', 'C', 'D', 'E', 'F']) {
      seis.push((await crearEtiqueta(org, nombre)).id);
    }

    const item = await crearItem(org, 'Bici');
    const excedido = await org.api.put(`/rewards/recompensas/${item.id}/etiquetas`, {
      etiquetaIds: seis,
    });

    // 400 del ValidationPipe (ArrayMaxSize) o del service, según cuál corte
    // primero; lo que importa es que no entren seis.
    expect(excedido.status()).toBe(400);

    await org.api.putOk(`/rewards/recompensas/${item.id}/etiquetas`, {
      etiquetaIds: seis.slice(0, 5),
    });

    const listado = await org.api.getOk<Item[]>(
      `/rewards/grupos/${org.grupoId}/recompensas?estado=ACTIVA`
    );

    expect(listado.find((fila) => fila.id === item.id)?.etiquetas).toHaveLength(5);
  });

  test('una etiqueta de OTRA organización no se puede usar (aislamiento real)', async () => {
    const base = await Api.crear();
    const propia = await crearOrganizacion(base, 'etiquetas-tenant-a');
    const ajena = await crearOrganizacion(base, 'etiquetas-tenant-b');

    await activarTienda(propia);
    await activarTienda(ajena);

    const etiquetaAjena = await crearEtiqueta(ajena, 'Ajena');
    const itemPropio = await crearItem(propia, 'Mío');

    const intento = await propia.api.put(`/rewards/recompensas/${itemPropio.id}/etiquetas`, {
      etiquetaIds: [etiquetaAjena.id],
    });

    expect(intento.status()).toBe(400);
    expect((await intento.json()).code).toBe('ETIQUETA_INVALIDA');

    // Y tocar la etiqueta ajena directamente tampoco: para este tenant no existe.
    expect((await propia.api.delete(`/rewards/etiquetas/${etiquetaAjena.id}`)).status()).toBe(404);
  });

  test('publicar en la tienda desde una etiqueta: saltea castigos y no duplica', async () => {
    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'etiquetas-lote');

    await activarTienda(org);

    const chicos = await crearEtiqueta(org, 'Chicos');
    const helado = await crearItem(org, 'Helado');
    const sticker = await crearItem(org, 'Sticker');
    const sinPostre = await crearItem(org, 'Sin postre', 'CASTIGO');

    for (const item of [helado, sticker, sinPostre]) {
      await org.api.putOk(`/rewards/recompensas/${item.id}/etiquetas`, {
        etiquetaIds: [chicos.id],
      });
    }

    const lote = await org.api.postOk<{
      creados: { id: string; nombre: string; precio: number }[];
      salteados: { recompensaId: string; motivo: string }[];
    }>(`/rewards/grupos/${org.grupoId}/productos/desde-etiqueta`, {
      etiquetaId: chicos.id,
      precio: 10,
    });

    expect(lote.creados.map((p) => p.nombre).sort()).toEqual(['Helado', 'Sticker']);
    expect(lote.creados.every((p) => p.precio === 10)).toBe(true);
    // El castigo no llega a la tienda por ningún camino (decisión 20 del #22).
    expect(lote.salteados).toContainEqual({
      recompensaId: sinPostre.id,
      nombre: 'Sin postre',
      motivo: 'ES_CASTIGO',
    });

    // Correrlo de nuevo no duplica: no queda nada para publicar.
    const repetido = await org.api.post(
      `/rewards/grupos/${org.grupoId}/productos/desde-etiqueta`,
      { etiquetaId: chicos.id, precio: 10 }
    );

    expect(repetido.status()).toBe(400);
    expect((await repetido.json()).code).toBe('SIN_ITEMS_PARA_CREAR');

    const tienda = await org.api.getOk<{ recompensaId: string | null }[]>(
      `/rewards/grupos/${org.grupoId}/tienda`
    );

    expect(tienda).toHaveLength(2);
  });

  test('en modo DIRECTO no existe la publicación masiva', async () => {
    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'etiquetas-directo');

    // Sin tocar la configuración: DIRECTO es el default de todo grupo.
    await crearUmbrales(org);

    const etiqueta = await crearEtiqueta(org, 'Chicos');
    const respuesta = await org.api.post(
      `/rewards/grupos/${org.grupoId}/productos/desde-etiqueta`,
      { etiquetaId: etiqueta.id, precio: 10 }
    );

    expect(respuesta.status()).toBe(400);
    expect((await respuesta.json()).code).toBe('SOLO_EN_MODO_TIENDA');
  });

  test('el participante no recibe NINGUNA etiqueta (decisión 3)', async () => {
    const base = await Api.crear();
    const org = await crearOrganizacion(base, 'etiquetas-privadas');

    await activarTienda(org);

    const pantalla = await crearEtiqueta(org, 'Pantalla');
    const consola = await crearItem(org, 'Hora de consola');

    await org.api.putOk(`/rewards/recompensas/${consola.id}/etiquetas`, {
      etiquetaIds: [pantalla.id],
    });

    const ana = await invitarYCanjearUsuario(base, org);

    const catalogo = await ana.api.getOk<Item[]>(
      `/rewards/grupos/${org.grupoId}/recompensas?etiquetaId=${pantalla.id}`
    );

    // Ve el catálogo entero (el filtro no le aplica) y sin un solo chip.
    expect(catalogo.length).toBeGreaterThan(0);
    expect(catalogo.every((item) => item.etiquetas.length === 0)).toBe(true);

    // Y el catálogo de etiquetas le está vedado por rol.
    expect((await ana.api.get(`/rewards/grupos/${org.grupoId}/etiquetas`)).status()).toBe(403);
  });
});
