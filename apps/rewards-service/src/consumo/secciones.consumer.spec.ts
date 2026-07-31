import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type { EventEnvelope, SeccionEventoPayload } from '@dorado/shared-events';

import type { IdentityClientService } from '../clientes/identity-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  configuracionDePrueba,
  crearBdEnMemoria,
  type BdEnMemoria,
} from '../comun/testing/bd-en-memoria';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { SeccionesConsumer } from './secciones.consumer';

const MENSAJE = { fields: { redelivered: false } };

function envelopeDePrueba(grupoId = 'grupo-1'): EventEnvelope<SeccionEventoPayload> {
  return {
    eventId: randomUUID(),
    eventType: 'SeccionAbierta',
    producedBy: 'session-service',
    organizacionId: 'org-1',
    grupoId,
    occurredAt: new Date().toISOString(),
    correlationId: randomUUID(),
    payload: {
      seccionId: 'seccion-1',
      organizacionId: 'org-1',
      grupoId,
      numero: 7,
    },
  };
}

function crearConsumer(bd: BdEnMemoria) {
  const identity = {
    obtenerGrupo: vi.fn(),
    obtenerUsuario: vi.fn(),
  } as unknown as IdentityClientService;

  const eventos = {
    publicar: vi.fn(),
    publicarAccionAdministrativa: vi.fn(),
  } as unknown as EventosPublisherService;

  const configuracion = new ConfiguracionService(
    bd.prisma,
    new AccesoGrupoService(identity),
    eventos
  );

  return new SeccionesConsumer(bd.prisma, configuracion);
}

describe('SeccionesConsumer — aplica el modo diferido (decisión 9)', () => {
  it('al abrir la Sección, el modo pendiente pasa a ser el vigente', async () => {
    const bd = crearBdEnMemoria({
      configuraciones: [
        configuracionDePrueba({ modo: 'DIRECTO', modoPendiente: 'TIENDA' }),
      ],
    });
    const consumer = crearConsumer(bd);

    const resultado = await consumer.onSeccionAbierta(envelopeDePrueba(), MENSAJE);

    expect(resultado).toBeUndefined();
    expect(bd.configuraciones[0].modo).toBe('TIENDA');
    expect(bd.configuraciones[0].modoPendiente).toBeNull();
    expect(bd.procesados).toHaveLength(1);
  });

  it('un grupo sin nada pendiente no cambia de modo', async () => {
    const bd = crearBdEnMemoria({
      configuraciones: [configuracionDePrueba({ modo: 'TIENDA', modoPendiente: null })],
    });
    const consumer = crearConsumer(bd);

    await consumer.onSeccionAbierta(envelopeDePrueba(), MENSAJE);

    expect(bd.configuraciones[0].modo).toBe('TIENDA');
  });

  it('un grupo SIN configuración no rompe el consumidor', async () => {
    const bd = crearBdEnMemoria();
    const consumer = crearConsumer(bd);

    const resultado = await consumer.onSeccionAbierta(envelopeDePrueba(), MENSAJE);

    expect(resultado).toBeUndefined();
    expect(bd.configuraciones).toHaveLength(0);
  });

  it('solo toca el grupo del evento, no los demás', async () => {
    const bd = crearBdEnMemoria({
      configuraciones: [
        configuracionDePrueba({ grupoId: 'grupo-1', modoPendiente: 'TIENDA' }),
        configuracionDePrueba({ grupoId: 'grupo-2', modoPendiente: 'TIENDA' }),
      ],
    });
    const consumer = crearConsumer(bd);

    await consumer.onSeccionAbierta(envelopeDePrueba('grupo-1'), MENSAJE);

    expect(bd.configuraciones[0].modo).toBe('TIENDA');
    expect(bd.configuraciones[1].modo).toBe('DIRECTO');
    expect(bd.configuraciones[1].modoPendiente).toBe('TIENDA');
  });

  it('la reentrega del mismo eventId no vuelve a aplicar nada (ADR-00 §5)', async () => {
    const bd = crearBdEnMemoria({
      configuraciones: [
        configuracionDePrueba({ modo: 'DIRECTO', modoPendiente: 'TIENDA' }),
      ],
    });
    const consumer = crearConsumer(bd);
    const envelope = envelopeDePrueba();

    await consumer.onSeccionAbierta(envelope, MENSAJE);

    // Entre medio el Tutor deja OTRO cambio pendiente: la reentrega no debe
    // consumirlo — ese es el turno de la Sección siguiente.
    bd.configuraciones[0].modoPendiente = 'DIRECTO';

    const resultado = await consumer.onSeccionAbierta(envelope, {
      fields: { redelivered: true },
    });

    expect(resultado).toBeUndefined();
    expect(bd.configuraciones[0].modo).toBe('TIENDA');
    expect(bd.configuraciones[0].modoPendiente).toBe('DIRECTO');
    expect(bd.procesados).toHaveLength(1);
  });
});
