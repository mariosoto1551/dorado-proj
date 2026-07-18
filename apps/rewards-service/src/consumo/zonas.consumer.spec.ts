import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import type { EventEnvelope, ZonaAlcanzadaPayload } from '@dorado/shared-events';

import { crearBdEnMemoria } from '../comun/testing/bd-en-memoria';
import { ZonasConsumer } from './zonas.consumer';

const MENSAJE = { fields: { redelivered: false } };

function envelopeDePrueba(esEvaluacionFinal: boolean): EventEnvelope<ZonaAlcanzadaPayload> {
  return {
    eventId: randomUUID(),
    eventType: 'ZonaAlcanzada',
    producedBy: 'scoring-service',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    occurredAt: new Date().toISOString(),
    correlationId: randomUUID(),
    payload: {
      usuarioId: 'usuario-1',
      seccionId: 'seccion-1',
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
      puntajeTotal: 180,
      umbralZonaId: 'umbral-dorado',
      nombreZona: 'Dorado',
      esEvaluacionFinal,
    },
  };
}

describe('ZonasConsumer — ZonaAlcanzada (sin efecto de negocio, spec fase-08)', () => {
  it('esEvaluacionFinal=false se descarta explícitamente sin marcar EventoProcesado', async () => {
    const bd = crearBdEnMemoria();
    const consumer = new ZonasConsumer(bd.prisma);

    const resultado = await consumer.onZonaAlcanzada(envelopeDePrueba(false), MENSAJE);

    expect(resultado).toBeUndefined();
    expect(bd.procesados).toHaveLength(0);
  });

  it('esEvaluacionFinal=true se marca en EventoProcesado (infra lista para el futuro)', async () => {
    const bd = crearBdEnMemoria();
    const consumer = new ZonasConsumer(bd.prisma);

    await consumer.onZonaAlcanzada(envelopeDePrueba(true), MENSAJE);

    expect(bd.procesados).toHaveLength(1);
    expect(bd.procesados[0].consumidor).toBe('rewards-service');
  });

  it('la reentrega del mismo eventId no duplica la marca ni falla', async () => {
    const bd = crearBdEnMemoria();
    const consumer = new ZonasConsumer(bd.prisma);
    const envelope = envelopeDePrueba(true);

    await consumer.onZonaAlcanzada(envelope, MENSAJE);
    const resultado = await consumer.onZonaAlcanzada(envelope, { fields: { redelivered: true } });

    expect(resultado).toBeUndefined();
    expect(bd.procesados).toHaveLength(1);
  });
});
