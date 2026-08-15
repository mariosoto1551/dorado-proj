import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { InternalController } from './internal.controller';
import type { AjustesSesionInternaQuery } from './dto/ajustes-sesion.query';

/**
 * fase-14-34 — `GET /internal/scoring/grupos/:g/sesiones/:s/ajustes`.
 *
 * Se prueba contra un doble de `findMany` y no contra la base en memoria de
 * `comun/testing` a propósito: lo que hay que fijar acá es **el `where` que se
 * arma** —sobre todo que filtre por `AJUSTE_MANUAL`, porque incluir las
 * CORRECCION haría que el timeline contara dos veces la misma anulación— y esa
 * base solo sabe comparar por igualdad.
 */
function armar(filas: unknown[]): {
  controlador: InternalController;
  findMany: ReturnType<typeof vi.fn>;
} {
  const findMany = vi.fn().mockResolvedValue(filas);
  const prisma = { client: { eventoPuntos: { findMany } } } as unknown as PrismaService;

  return { controlador: new InternalController(prisma), findMany };
}

function query(sobrescribir: Partial<AjustesSesionInternaQuery> = {}): AjustesSesionInternaQuery {
  return { organizacionId: 'org-1', ...sobrescribir } as AjustesSesionInternaQuery;
}

function asiento(sobrescribir: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'evento-1',
    usuarioId: 'usuario-1',
    puntosSnapshot: -10,
    motivoCorreccion: 'Rompió un vaso',
    registradoPorId: 'tutor-1',
    registradoPorTipo: 'TUTOR',
    cargadoRetroactivamenteEn: null,
    createdAt: new Date('2026-08-15T13:00:00.000Z'),
    ...sobrescribir,
  };
}

describe('InternalController · ajustes de la sesión (fase-14-34)', () => {
  it('devuelve el asiento con su motivo, su signo y la fecha en ISO', async () => {
    const { controlador } = armar([asiento()]);

    const ajustes = await controlador.ajustesDeLaSesion('grupo-1', 'sesion-1', query());

    expect(ajustes).toEqual([
      {
        id: 'evento-1',
        usuarioId: 'usuario-1',
        puntos: -10,
        motivo: 'Rompió un vaso',
        registradoPorId: 'tutor-1',
        registradoPorTipo: 'TUTOR',
        cargadoRetroactivamenteEn: null,
        createdAt: '2026-08-15T13:00:00.000Z',
      },
    ]);
  });

  it('pide SOLO los AJUSTE_MANUAL de esa sesión y de esa organización', async () => {
    const { controlador, findMany } = armar([]);

    await controlador.ajustesDeLaSesion('grupo-1', 'sesion-1', query({ usuarioId: 'usuario-9' }));

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizacionId: 'org-1',
          grupoId: 'grupo-1',
          sesionId: 'sesion-1',
          tipoOrigen: 'AJUSTE_MANUAL',
          usuarioId: 'usuario-9',
        }),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
    );
  });

  it('el cursor pide lo estrictamente más viejo, con el id de desempate', async () => {
    const { controlador, findMany } = armar([]);

    await controlador.ajustesDeLaSesion(
      'grupo-1',
      'sesion-1',
      query({ cursorCreatedAt: '2026-08-15T13:00:00.000Z', cursorId: 'evento-5', limite: 11 })
    );

    const { where, take } = findMany.mock.calls[0][0];
    const corte = new Date('2026-08-15T13:00:00.000Z');

    expect(take).toBe(11);
    expect(where.OR).toEqual([
      { createdAt: { lt: corte } },
      { createdAt: corte, id: { lt: 'evento-5' } },
    ]);
  });

  it('sin motivo guardado no deja un hueco en el timeline', async () => {
    const { controlador } = armar([asiento({ motivoCorreccion: null })]);

    const ajustes = await controlador.ajustesDeLaSesion('grupo-1', 'sesion-1', query());

    expect(ajustes[0]?.motivo).toBe('Ajuste a mano');
  });

  it('la marca de carga retroactiva viaja como ISO, no como Date', async () => {
    const { controlador } = armar([
      asiento({ cargadoRetroactivamenteEn: new Date('2026-08-15T20:00:00.000Z') }),
    ]);

    const ajustes = await controlador.ajustesDeLaSesion('grupo-1', 'sesion-1', query());

    expect(ajustes[0]?.cargadoRetroactivamenteEn).toBe('2026-08-15T20:00:00.000Z');
  });
});
