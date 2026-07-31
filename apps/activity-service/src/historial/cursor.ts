import { CursorHistorialInvalidoException } from '../comun/excepciones';

/** Posición del timeline: instante + id de desempate (spec fase-14-18). */
export interface CursorHistorial {
  createdAt: Date;
  id: string;
}

/**
 * El cursor codifica `createdAt` **e** `id`. El desempate por id no es un
 * lujo: dos registros del mismo milisegundo son perfectamente posibles cuando
 * un tutor carga varios seguidos, y sin él la paginación repetiría o saltearía
 * filas exactamente en el caso más común.
 */
export function codificarCursor(fila: CursorHistorial): string {
  return Buffer.from(`${fila.createdAt.toISOString()}|${fila.id}`, 'utf8').toString('base64url');
}

export function decodificarCursor(valor: string): CursorHistorial {
  const plano = Buffer.from(valor, 'base64url').toString('utf8');
  const separador = plano.indexOf('|');

  if (separador === -1) {
    throw new CursorHistorialInvalidoException();
  }

  const createdAt = new Date(plano.slice(0, separador));
  const id = plano.slice(separador + 1);

  if (Number.isNaN(createdAt.getTime()) || id.length === 0) {
    throw new CursorHistorialInvalidoException();
  }

  return { createdAt, id };
}

/**
 * `where` de "estrictamente más viejo que el cursor" para un orden
 * (createdAt desc, id desc). Se compone con AND contra el resto del filtro.
 */
export function filtroDesdeCursor(
  cursor: CursorHistorial | undefined
): Record<string, unknown> {
  if (!cursor) {
    return {};
  }

  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}
