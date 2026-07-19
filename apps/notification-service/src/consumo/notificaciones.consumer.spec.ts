import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type { EventEnvelope } from '@dorado/shared-events';

import { crearBdEnMemoria } from '../comun/testing/bd-en-memoria';
import { NotificacionesConsumer } from './notificaciones.consumer';
import type { NotificacionAPersistir, PlantillasService } from './plantillas.service';

const MENSAJE = { fields: { redelivered: false } };

function envelopeDePrueba(): EventEnvelope<unknown> {
  return {
    eventId: randomUUID(),
    eventType: 'UsuarioUnido',
    producedBy: 'identity-service',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    occurredAt: new Date().toISOString(),
    correlationId: randomUUID(),
    payload: {},
  };
}

const FILAS: NotificacionAPersistir[] = [
  {
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    destinatarioId: 'tutor-1',
    destinatarioTipo: 'TUTOR',
    tipo: 'USUARIO_UNIDO',
    mensaje: 'Juan se unió al grupo.',
  },
];

function crearConsumer(filas: NotificacionAPersistir[] = FILAS) {
  const bd = crearBdEnMemoria();
  const plantillas = { armar: vi.fn().mockResolvedValue(filas) } as unknown as PlantillasService;

  return { consumer: new NotificacionesConsumer(bd.prisma, plantillas), bd, plantillas };
}

describe('NotificacionesConsumer — idempotencia y persistencia', () => {
  it('crea las notificaciones y marca EventoProcesado', async () => {
    const { consumer, bd } = crearConsumer();

    const resultado = await consumer.onEvento(envelopeDePrueba(), MENSAJE);

    expect(resultado).toBeUndefined();
    expect(bd.notificaciones).toHaveLength(1);
    expect(bd.procesados).toHaveLength(1);
  });

  it('la reentrega del mismo eventId no duplica notificaciones (idempotencia)', async () => {
    const { consumer, bd } = crearConsumer();
    const envelope = envelopeDePrueba();

    await consumer.onEvento(envelope, MENSAJE);
    await consumer.onEvento(envelope, { fields: { redelivered: true } });

    expect(bd.notificaciones).toHaveLength(1);
    expect(bd.procesados).toHaveLength(1);
  });

  it('un evento que no genera filas igual se marca procesado (no se reprocesa)', async () => {
    const { consumer, bd } = crearConsumer([]);

    await consumer.onEvento(envelopeDePrueba(), MENSAJE);

    expect(bd.notificaciones).toHaveLength(0);
    expect(bd.procesados).toHaveLength(1);
  });

  it('un error en las plantillas devuelve Nack(requeue) la primera vez, Nack(false)→DLQ si ya venía reentregado', async () => {
    const bd = crearBdEnMemoria();
    const plantillas = {
      armar: vi.fn().mockRejectedValue(new Error('identity caído')),
    } as unknown as PlantillasService;
    const consumer = new NotificacionesConsumer(bd.prisma, plantillas);

    const primera = await consumer.onEvento(envelopeDePrueba(), { fields: { redelivered: false } });
    const segunda = await consumer.onEvento(envelopeDePrueba(), { fields: { redelivered: true } });

    // @golevelup Nack: `requeue` en la propiedad del objeto retornado.
    expect((primera as { requeue: boolean }).requeue).toBe(true);
    expect((segunda as { requeue: boolean }).requeue).toBe(false);
    expect(bd.notificaciones).toHaveLength(0);
  });
});
