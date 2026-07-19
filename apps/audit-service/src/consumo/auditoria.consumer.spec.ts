import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import type { EventEnvelope } from '@dorado/shared-events';

import { crearBdEnMemoria } from '../comun/testing/bd-en-memoria';
import { AuditoriaConsumer } from './auditoria.consumer';

const MENSAJE = { fields: { redelivered: false } };

function envelopeDePrueba(eventType = 'UsuarioUnido'): EventEnvelope<unknown> {
  return {
    eventId: randomUUID(),
    eventType,
    producedBy: 'identity-service',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    occurredAt: new Date().toISOString(),
    correlationId: randomUUID(),
    payload: { usuarioId: 'usuario-1', organizacionId: 'org-1', grupoId: 'grupo-1', nombre: 'Juan', invitacionId: 'i-1' },
  };
}

describe('AuditoriaConsumer — escritura solo por eventos, idempotente', () => {
  it('crea la fila de auditoría y marca EventoProcesado', async () => {
    const bd = crearBdEnMemoria();
    const consumer = new AuditoriaConsumer(bd.prisma);

    const resultado = await consumer.onEvento(envelopeDePrueba(), MENSAJE);

    expect(resultado).toBeUndefined();
    expect(bd.registros).toHaveLength(1);
    expect(bd.registros[0]).toMatchObject({ accion: 'USUARIO_UNIDO', entidadTipo: 'Usuario' });
    expect(bd.procesados).toHaveLength(1);
  });

  it('la reentrega del mismo eventId no duplica la fila (idempotencia)', async () => {
    const bd = crearBdEnMemoria();
    const consumer = new AuditoriaConsumer(bd.prisma);
    const envelope = envelopeDePrueba();

    await consumer.onEvento(envelope, MENSAJE);
    await consumer.onEvento(envelope, { fields: { redelivered: true } });

    expect(bd.registros).toHaveLength(1);
    expect(bd.procesados).toHaveLength(1);
  });

  it('un eventType inesperado no escribe nada; reintenta una vez y luego va a la DLQ', async () => {
    const bd = crearBdEnMemoria();
    const consumer = new AuditoriaConsumer(bd.prisma);

    const primera = await consumer.onEvento(envelopeDePrueba('EventoFantasma'), MENSAJE);
    const segunda = await consumer.onEvento(envelopeDePrueba('EventoFantasma'), {
      fields: { redelivered: true },
    });

    // Primera entrega requeue; ya reentregado → DLQ. Nunca escribe.
    expect((primera as { requeue: boolean }).requeue).toBe(true);
    expect((segunda as { requeue: boolean }).requeue).toBe(false);
    expect(bd.registros).toHaveLength(0);
  });
});
