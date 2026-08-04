/**
 * Reglas de los atajos por etiqueta (fase-14-26). Están acá y no en los
 * componentes porque las tres son decisiones sobre QUÉ subconjunto del catálogo
 * cae bajo una etiqueta, y eso se testea sin montar una pantalla.
 *
 * Ninguna toca la API: son funciones puras sobre lo que la pantalla ya cargó.
 * La regla del servidor sigue siendo la que manda —el backend revalida todo—;
 * estas existen para que el Tutor vea el resultado ANTES de confirmar.
 */

import { FuenteProducto, TipoItemCatalogo } from '@dorado/shared-types';
import type { ProductoTiendaDto, RecompensaDto } from '@dorado/shared-types';

/** Ítems del catálogo que llevan una etiqueta puntual. Una por vez (decisión 9). */
export function conEtiqueta(items: RecompensaDto[], etiquetaId: string): RecompensaDto[] {
  return items.filter((item) => item.etiquetas.some((etiqueta) => etiqueta.id === etiquetaId));
}

/**
 * Lo que precarga el atajo al armar una bolsa. Los castigos se **saltean** y se
 * cuentan aparte: mandarlos sería un 400 `CASTIGO_NO_VA_EN_BOLSA` del backend,
 * y una bolsa es siempre de premios (decisión 20 del #22).
 */
export function premiosParaBolsa(
  items: RecompensaDto[],
  etiquetaId: string
): { premios: RecompensaDto[]; castigosSalteados: number } {
  const marcados = conEtiqueta(items, etiquetaId);
  const premios = marcados.filter((item) => item.tipo === TipoItemCatalogo.PREMIO);

  return { premios, castigosSalteados: marcados.length - premios.length };
}

/**
 * Cómo queda partida una etiqueta al publicarla en la tienda: qué se crea y qué
 * se saltea por tener ya un producto activo apuntándolo (decisión 11).
 *
 * Un producto **archivado no bloquea**: el Tutor lo sacó de la vitrina a
 * propósito, y volver a publicarlo es una decisión válida. Es la misma regla
 * que aplica `ProductosService`, replicada acá solo para previsualizar.
 */
export function particionarParaTienda(
  items: RecompensaDto[],
  productos: ProductoTiendaDto[],
  etiquetaId: string
): { aPublicar: RecompensaDto[]; salteados: RecompensaDto[] } {
  const { premios } = premiosParaBolsa(items, etiquetaId);
  const publicados = new Set(
    productos
      .filter(
        (producto) =>
          producto.estado === 'ACTIVA' &&
          producto.fuente === FuenteProducto.ITEM &&
          producto.recompensaId !== null
      )
      .map((producto) => producto.recompensaId as string)
  );

  return {
    aPublicar: premios.filter((premio) => !publicados.has(premio.id)),
    salteados: premios.filter((premio) => publicados.has(premio.id)),
  };
}
