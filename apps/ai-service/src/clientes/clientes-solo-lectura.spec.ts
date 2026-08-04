import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * TEST ESTRUCTURAL 2 de la tanda 3 (fase-14-29 Parte E, punto 1).
 *
 * **La IA no tiene manos**, y esto lo verifica sobre el código fuente en vez de
 * sobre el comportamiento. Un test de comportamiento probaría que los clientes
 * que HOY existen hacen GET; este prueba que no hay forma de que uno nuevo haga
 * otra cosa sin que alguien lo vea.
 *
 * Leer el archivo en vez de importarlo es a propósito: lo que se quiere fijar
 * es una propiedad del texto que se commitea. Un `method: 'POST'` escondido en
 * una rama que ningún test recorre igual aparece acá.
 *
 * Si esto se pone rojo, la respuesta correcta casi nunca es cambiar el test.
 * Aplicar una propuesta lo hace el frontend con el JWT del Tutor contra los
 * endpoints públicos que ya existen (decisión 6) — que ai-service escriba no
 * es una optimización, es otro ítem.
 */
const CARPETA_CLIENTES = join(__dirname);

function archivosDeCliente(): Array<{ nombre: string; contenido: string }> {
  return readdirSync(CARPETA_CLIENTES)
    .filter((archivo) => archivo.endsWith('.ts') && !archivo.endsWith('.spec.ts'))
    .map((archivo) => ({
      nombre: archivo,
      contenido: readFileSync(join(CARPETA_CLIENTES, archivo), 'utf8'),
    }));
}

/** El comentario que explica la regla usa las palabras prohibidas; se ignoran. */
function sinComentarios(contenido: string): string {
  return contenido.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('clientes internos — solo lectura (decisión 6)', () => {
  const archivos = archivosDeCliente();

  it('hay clientes que revisar (el test no pasa por estar vacío)', () => {
    // Sin esto, borrar la carpeta dejaría la suite en verde — que es el modo de
    // falla clásico de un test que barre archivos.
    expect(archivos.length).toBeGreaterThanOrEqual(5);
    expect(archivos.map((archivo) => archivo.nombre)).toContain('cliente-interno.base.ts');
  });

  it('ningún cliente usa un método HTTP distinto de GET', () => {
    const infractores: string[] = [];

    for (const archivo of archivos) {
      const codigo = sinComentarios(archivo.contenido);
      const metodos = codigo.matchAll(/method\s*:\s*['"`]([A-Za-z]+)['"`]/g);

      for (const metodo of metodos) {
        if (metodo[1].toUpperCase() !== 'GET') {
          infractores.push(`${archivo.nombre}: method: '${metodo[1]}'`);
        }
      }
    }

    expect(
      infractores,
      'ai-service no escribe en ningún otro servicio (fase-14-29 decisión 6). ' +
        'El peor caso de un prompt injection exitoso tiene que seguir siendo una ' +
        'propuesta fea que un humano ve antes de aplicar.'
    ).toEqual([]);
  });

  it('ningún cliente menciona un verbo de escritura en su código', () => {
    // Segunda red, por si alguien construye el método sin el literal
    // `method:` (una variable, un helper, un fetch armado aparte).
    const verbos = /\b(POST|PUT|PATCH|DELETE)\b/;
    const infractores = archivos
      .filter((archivo) => verbos.test(sinComentarios(archivo.contenido)))
      .map((archivo) => archivo.nombre);

    expect(infractores).toEqual([]);
  });

  it('el único método de red lo define la base, y es GET', () => {
    const base = archivos.find((archivo) => archivo.nombre === 'cliente-interno.base.ts');
    const codigoBase = sinComentarios(base?.contenido ?? '');

    // Un solo `fetch` en todo el paquete de clientes: el de la base.
    const conFetch = archivos.filter((archivo) => /\bfetch\s*\(/.test(sinComentarios(archivo.contenido)));

    expect(conFetch.map((archivo) => archivo.nombre)).toEqual(['cliente-interno.base.ts']);
    expect(codigoBase).toContain("method: 'GET'");
  });
});
