import { BadRequestException } from '@nestjs/common';

/** Campos de UmbralZona que participan del cálculo/validación (puros). */
export interface RangoUmbral {
  orden: number;
  puntosMin: number;
  puntosMax: number | null;
}

/**
 * Regla central de zona (spec fase-07 / arquitectura-base 4.7):
 * el umbral del grupo donde puntosMin <= puntaje <= puntosMax (tope null =
 * sin tope). Con el conjunto validado (contiguo, sin solapamientos) matchea a
 * lo sumo uno; un puntaje por debajo de la zona más baja no tiene zona (null).
 */
export function zonaParaPuntaje<T extends RangoUmbral>(
  umbrales: T[],
  puntaje: number
): T | null {
  return (
    umbrales.find(
      (umbral) =>
        umbral.puntosMin <= puntaje &&
        (umbral.puntosMax === null || puntaje <= umbral.puntosMax)
    ) ?? null
  );
}

/**
 * Invariantes del conjunto de umbrales de un grupo (spec fase-07, POST/PATCH
 * de umbrales): órdenes consecutivos desde 1 (sin huecos ni duplicados),
 * rangos válidos, contiguos entre sí (el siguiente arranca exactamente donde
 * terminó el anterior) y solo la zona más alta puede no tener tope. Lanza 400
 * con el detalle; DELETE traduce esto a 409 (romper contigüidad es conflicto
 * de estado, no request malformado).
 */
export function validarConjuntoUmbrales(umbrales: RangoUmbral[]): void {
  const ordenados = [...umbrales].sort((a, b) => a.orden - b.orden);

  ordenados.forEach((umbral, indice) => {
    if (umbral.orden !== indice + 1) {
      throw new BadRequestException(
        'Los órdenes de los umbrales deben ser consecutivos desde 1, sin huecos ni duplicados'
      );
    }

    if (umbral.puntosMax !== null && umbral.puntosMax < umbral.puntosMin) {
      throw new BadRequestException(
        `El umbral de orden ${umbral.orden} tiene puntosMax menor que puntosMin`
      );
    }

    if (umbral.puntosMax === null && indice < ordenados.length - 1) {
      throw new BadRequestException(
        'Solo la zona más alta (último orden) puede no tener tope (puntosMax null)'
      );
    }

    if (indice > 0) {
      const anterior = ordenados[indice - 1];

      if (anterior.puntosMax !== null && umbral.puntosMin !== anterior.puntosMax + 1) {
        throw new BadRequestException(
          `El umbral de orden ${umbral.orden} debe arrancar en ${
            (anterior.puntosMax ?? 0) + 1
          } (contiguo al anterior, sin huecos ni solapamientos)`
        );
      }
    }
  });
}
