import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type { EventEnvelope, ZonaAlcanzadaPayload } from '@dorado/shared-events';

import { CierreEconomicoService } from '../cierre/cierre-economico.service';
import type { IdentityClientService } from '../clientes/identity-client.service';
import type {
  ResultadoSeccionInterno,
  ScoringClientService,
} from '../clientes/scoring-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  configuracionDePrueba,
  crearBdEnMemoria,
  recompensaDePrueba,
  rendimientoDePrueba,
  movimientoDePrueba,
  type BdEnMemoria,
} from '../comun/testing/bd-en-memoria';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { ZonasConsumer } from './zonas.consumer';

const MENSAJE = { fields: { redelivered: false } };

function envelopeDePrueba(
  esEvaluacionFinal: boolean,
  sobrescribir: Partial<ZonaAlcanzadaPayload> = {}
): EventEnvelope<ZonaAlcanzadaPayload> {
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
      ...sobrescribir,
    },
  };
}

function resultadoDePrueba(): ResultadoSeccionInterno {
  return {
    id: 'resultado-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    usuarioId: 'usuario-1',
    seccionId: 'seccion-1',
    puntajeTotal: 180,
    umbralZonaId: 'umbral-dorado',
    nombreZona: 'Dorado',
    descalificado: false,
    calculadoEn: new Date().toISOString(),
  };
}

function crearConsumer(bd: BdEnMemoria = crearBdEnMemoria()) {
  const identity = {
    obtenerGrupo: vi.fn(),
    obtenerUsuario: vi.fn(),
  } as unknown as IdentityClientService;

  const scoring = {
    obtenerUmbral: vi.fn(),
    umbralesDelGrupo: vi.fn(),
    obtenerResultado: vi.fn().mockResolvedValue(resultadoDePrueba()),
  } as unknown as ScoringClientService;

  const eventos = {
    publicar: vi.fn(),
    publicarAccionAdministrativa: vi.fn(),
  } as unknown as EventosPublisherService;

  const configuracion = new ConfiguracionService(
    bd.prisma,
    new AccesoGrupoService(identity),
    eventos
  );

  const consumer = new ZonasConsumer(
    bd.prisma,
    configuracion,
    new CierreEconomicoService(bd.prisma, scoring),
    eventos
  );

  return { consumer, bd, eventos };
}

describe('ZonasConsumer — modo DIRECTO (fase-08, sin efecto de negocio)', () => {
  it('esEvaluacionFinal=false se descarta explícitamente sin marcar EventoProcesado', async () => {
    const { consumer, bd } = crearConsumer();

    const resultado = await consumer.onZonaAlcanzada(envelopeDePrueba(false), MENSAJE);

    expect(resultado).toBeUndefined();
    expect(bd.procesados).toHaveLength(0);
  });

  it('esEvaluacionFinal=true se marca en EventoProcesado y NO toca el ledger', async () => {
    const { consumer, bd } = crearConsumer();

    await consumer.onZonaAlcanzada(envelopeDePrueba(true), MENSAJE);

    expect(bd.procesados).toHaveLength(1);
    expect(bd.procesados[0].consumidor).toBe('rewards-service');
    // Lo que garantiza la retro-compatibilidad: en DIRECTO no hay monedas.
    expect(bd.monedas).toHaveLength(0);
  });

  it('la reentrega del mismo eventId no duplica la marca ni falla', async () => {
    const { consumer, bd } = crearConsumer();
    const envelope = envelopeDePrueba(true);

    await consumer.onZonaAlcanzada(envelope, MENSAJE);
    const resultado = await consumer.onZonaAlcanzada(envelope, {
      fields: { redelivered: true },
    });

    expect(resultado).toBeUndefined();
    expect(bd.procesados).toHaveLength(1);
  });
});

describe('ZonasConsumer — modo TIENDA (fase-14-22, cierre económico)', () => {
  function bdConTienda(extra: Parameters<typeof crearBdEnMemoria>[0] = {}) {
    return crearBdEnMemoria({
      configuraciones: [configuracionDePrueba({ modo: 'TIENDA' })],
      ...extra,
    });
  }

  it('acredita el rendimiento de la zona y publica MonedasAcreditadas', async () => {
    const bd = bdConTienda({
      rendimientos: [rendimientoDePrueba({ umbralZonaId: 'umbral-dorado', monedas: 25 })],
    });
    const { consumer, eventos } = crearConsumer(bd);

    await consumer.onZonaAlcanzada(envelopeDePrueba(true), MENSAJE);

    expect(bd.monedas).toHaveLength(1);
    expect(bd.monedas[0].monto).toBe(25);
    expect(eventos.publicar).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'MonedasAcreditadas',
        routingKey: 'rewards.monedas_acreditadas',
        payload: expect.objectContaining({
          monedas: 25,
          saldoResultante: 25,
          castigo: null,
          nombreZona: 'Dorado',
        }),
      })
    );
  });

  it('la bancarrota viaja en el mismo evento que la acreditación', async () => {
    const bd = bdConTienda({
      rendimientos: [rendimientoDePrueba({ umbralZonaId: 'umbral-rojo', monedas: -5 })],
      monedas: [movimientoDePrueba({ monto: 3 })],
      recompensas: [
        recompensaDePrueba({ tipo: 'CASTIGO', nombre: 'Sin postre', umbralZonaId: null }),
      ],
    });
    const { consumer, eventos } = crearConsumer(bd);

    await consumer.onZonaAlcanzada(
      envelopeDePrueba(true, { umbralZonaId: 'umbral-rojo', nombreZona: 'Rojo' }),
      MENSAJE
    );

    expect(eventos.publicar).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          monedas: -5,
          saldoResultante: 0,
          castigo: expect.objectContaining({ nombre: 'Sin postre' }),
        }),
      })
    );
  });

  it('sin rendimiento configurado no publica nada', async () => {
    const bd = bdConTienda();
    const { consumer, eventos } = crearConsumer(bd);

    await consumer.onZonaAlcanzada(envelopeDePrueba(true), MENSAJE);

    expect(eventos.publicar).not.toHaveBeenCalled();
    expect(bd.monedas).toHaveLength(0);
  });

  it('la reentrega no acredita dos veces ni publica dos veces', async () => {
    const bd = bdConTienda({
      rendimientos: [rendimientoDePrueba({ umbralZonaId: 'umbral-dorado', monedas: 25 })],
    });
    const { consumer, eventos } = crearConsumer(bd);
    const envelope = envelopeDePrueba(true);

    await consumer.onZonaAlcanzada(envelope, MENSAJE);
    await consumer.onZonaAlcanzada(envelope, { fields: { redelivered: true } });

    expect(bd.monedas).toHaveLength(1);
    expect(eventos.publicar).toHaveBeenCalledTimes(1);
  });
});
