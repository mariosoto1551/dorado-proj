import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ZonaAlcanzadaPayload } from '@dorado/shared-events';

import type {
  ResultadoSeccionInterno,
  ScoringClientService,
} from '../clientes/scoring-client.service';
import {
  crearBdEnMemoria,
  recompensaDePrueba,
  rendimientoDePrueba,
  movimientoDePrueba,
  type BdEnMemoria,
} from '../comun/testing/bd-en-memoria';
import { CierreEconomicoService } from './cierre-economico.service';

const CONSUMIDOR = 'rewards-service';

function payloadDePrueba(
  sobrescribir: Partial<ZonaAlcanzadaPayload> = {}
): ZonaAlcanzadaPayload {
  return {
    usuarioId: 'usuario-1',
    seccionId: 'seccion-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    puntajeTotal: 90,
    umbralZonaId: 'umbral-verde',
    nombreZona: 'Verde',
    esEvaluacionFinal: true,
    ...sobrescribir,
  };
}

function resultadoDePrueba(descalificado = false): ResultadoSeccionInterno {
  return {
    id: 'resultado-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    usuarioId: 'usuario-1',
    seccionId: 'seccion-1',
    puntajeTotal: 90,
    umbralZonaId: 'umbral-verde',
    nombreZona: 'Verde',
    descalificado,
    calculadoEn: new Date().toISOString(),
  };
}

function crearServicio(
  opciones: { bd?: BdEnMemoria; resultado?: ResultadoSeccionInterno | null } = {}
) {
  const bd = opciones.bd ?? crearBdEnMemoria();

  const scoring = {
    obtenerUmbral: vi.fn(),
    umbralesDelGrupo: vi.fn(),
    obtenerResultado: vi
      .fn()
      .mockResolvedValue(
        opciones.resultado === undefined ? resultadoDePrueba() : opciones.resultado
      ),
  } as unknown as ScoringClientService;

  return { servicio: new CierreEconomicoService(bd.prisma, scoring), bd };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CierreEconomicoService — acreditación normal', () => {
  it('Verde rindiendo 12 deja saldo 12 y un movimiento RENDIMIENTO_ZONA', async () => {
    const bd = crearBdEnMemoria({ rendimientos: [rendimientoDePrueba({ monedas: 12 })] });
    const { servicio } = crearServicio({ bd });

    const resultado = await servicio.aplicar(randomUUID(), CONSUMIDOR, payloadDePrueba());

    expect(resultado).toEqual({ monedas: 12, saldoResultante: 12, castigo: null });
    expect(bd.monedas).toHaveLength(1);
    expect(bd.monedas[0].tipo).toBe('RENDIMIENTO_ZONA');
    expect(bd.monedas[0].seccionId).toBe('seccion-1');
    expect(bd.monedas[0].registradoPorTipo).toBe('SYSTEM');
    expect(bd.castigos).toHaveLength(0);
  });

  it('acumula sobre el saldo previo', async () => {
    const bd = crearBdEnMemoria({
      rendimientos: [rendimientoDePrueba({ monedas: 12 })],
      monedas: [movimientoDePrueba({ monto: 30 })],
    });
    const { servicio } = crearServicio({ bd });

    const resultado = await servicio.aplicar(randomUUID(), CONSUMIDOR, payloadDePrueba());

    expect(resultado?.saldoResultante).toBe(42);
  });

  it('una zona sin rendimiento configurado no ensucia el ledger', async () => {
    const { servicio, bd } = crearServicio();

    const resultado = await servicio.aplicar(randomUUID(), CONSUMIDOR, payloadDePrueba());

    expect(resultado).toBeNull();
    expect(bd.monedas).toHaveLength(0);
    // El evento igual queda marcado: no hay nada que reintentar.
    expect(bd.procesados).toHaveLength(1);
  });
});

describe('CierreEconomicoService — LA REGLA DE LA BANCARROTA (decisión 5)', () => {
  it('saldo 3 y Rojo −5: dos movimientos, castigo sorteado y saldo exactamente 0', async () => {
    const bd = crearBdEnMemoria({
      rendimientos: [rendimientoDePrueba({ umbralZonaId: 'umbral-rojo', monedas: -5 })],
      monedas: [movimientoDePrueba({ monto: 3 })],
      recompensas: [
        recompensaDePrueba({ tipo: 'CASTIGO', nombre: 'Sin postre', umbralZonaId: null }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    const resultado = await servicio.aplicar(
      randomUUID(),
      CONSUMIDOR,
      payloadDePrueba({ umbralZonaId: 'umbral-rojo', nombreZona: 'Rojo' })
    );

    // DOS movimientos nuevos, no uno neteado: el ledger cuenta la historia.
    const nuevos = bd.monedas.slice(1);

    expect(nuevos).toHaveLength(2);
    expect(nuevos[0].tipo).toBe('MULTA_ZONA');
    expect(nuevos[0].monto).toBe(-5);
    expect(nuevos[1].tipo).toBe('SALDO_SALDADO');
    expect(nuevos[1].monto).toBe(2);

    // Saldo exactamente 0.
    const saldo = bd.monedas.reduce((total, fila) => total + fila.monto, 0);

    expect(saldo).toBe(0);
    expect(resultado?.saldoResultante).toBe(0);

    // Y el castigo, con la deuda que saldó.
    expect(bd.castigos).toHaveLength(1);
    expect(bd.castigos[0].nombreRecompensaSnapshot).toBe('Sin postre');
    expect(bd.castigos[0].deudaSaldada).toBe(2);
    expect(bd.castigos[0].estado).toBe('PENDIENTE_ENTREGA');
    expect(resultado?.castigo).toEqual({
      recompensaId: bd.recompensas[0].id,
      nombre: 'Sin postre',
    });
  });

  it('el que ya estaba en 0 también siente la zona roja (el agujero que cerró la regla)', async () => {
    const bd = crearBdEnMemoria({
      rendimientos: [rendimientoDePrueba({ umbralZonaId: 'umbral-rojo', monedas: -5 })],
      recompensas: [recompensaDePrueba({ tipo: 'CASTIGO', umbralZonaId: null })],
    });
    const { servicio } = crearServicio({ bd });

    await servicio.aplicar(
      randomUUID(),
      CONSUMIDOR,
      payloadDePrueba({ umbralZonaId: 'umbral-rojo' })
    );

    expect(bd.castigos).toHaveLength(1);
    expect(bd.castigos[0].deudaSaldada).toBe(5);
    expect(bd.monedas.reduce((total, fila) => total + fila.monto, 0)).toBe(0);
  });

  it('sin ningún ítem CASTIGO activo, el saldo se clava en 0 y no pasa nada más (decisión 6)', async () => {
    const bd = crearBdEnMemoria({
      rendimientos: [rendimientoDePrueba({ umbralZonaId: 'umbral-rojo', monedas: -5 })],
      monedas: [movimientoDePrueba({ monto: 3 })],
    });
    const { servicio } = crearServicio({ bd });

    const resultado = await servicio.aplicar(
      randomUUID(),
      CONSUMIDOR,
      payloadDePrueba({ umbralZonaId: 'umbral-rojo' })
    );

    expect(bd.castigos).toHaveLength(0);
    expect(resultado?.castigo).toBeNull();
    expect(bd.monedas.reduce((total, fila) => total + fila.monto, 0)).toBe(0);
  });

  it('un CASTIGO archivado no entra al pozo del sorteo', async () => {
    const bd = crearBdEnMemoria({
      rendimientos: [rendimientoDePrueba({ umbralZonaId: 'umbral-rojo', monedas: -5 })],
      recompensas: [
        recompensaDePrueba({ tipo: 'CASTIGO', estado: 'ARCHIVADA', umbralZonaId: null }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    const resultado = await servicio.aplicar(
      randomUUID(),
      CONSUMIDOR,
      payloadDePrueba({ umbralZonaId: 'umbral-rojo' })
    );

    expect(bd.castigos).toHaveLength(0);
    expect(resultado?.castigo).toBeNull();
  });

  it('el sorteo NUNCA saca un PREMIO ni un castigo de otro grupo', async () => {
    const bd = crearBdEnMemoria({
      rendimientos: [rendimientoDePrueba({ umbralZonaId: 'umbral-rojo', monedas: -5 })],
      recompensas: [
        recompensaDePrueba({ tipo: 'PREMIO', nombre: 'Bici' }),
        recompensaDePrueba({ tipo: 'CASTIGO', nombre: 'De otro grupo', grupoId: 'grupo-2' }),
        recompensaDePrueba({ tipo: 'CASTIGO', nombre: 'Sin tele', umbralZonaId: null }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    // Con Math.random en 0 saldría el primero del array que le pasen: si el
    // filtro estuviera mal, saldría "Bici".
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const resultado = await servicio.aplicar(
      randomUUID(),
      CONSUMIDOR,
      payloadDePrueba({ umbralZonaId: 'umbral-rojo' })
    );

    expect(resultado?.castigo?.nombre).toBe('Sin tele');
  });

  it('un rendimiento negativo que NO deja el saldo en rojo no dispara castigo', async () => {
    const bd = crearBdEnMemoria({
      rendimientos: [rendimientoDePrueba({ umbralZonaId: 'umbral-rojo', monedas: -5 })],
      monedas: [movimientoDePrueba({ monto: 50 })],
      recompensas: [recompensaDePrueba({ tipo: 'CASTIGO', umbralZonaId: null })],
    });
    const { servicio } = crearServicio({ bd });

    const resultado = await servicio.aplicar(
      randomUUID(),
      CONSUMIDOR,
      payloadDePrueba({ umbralZonaId: 'umbral-rojo' })
    );

    expect(resultado).toEqual({ monedas: -5, saldoResultante: 45, castigo: null });
    expect(bd.castigos).toHaveLength(0);
  });
});

describe('CierreEconomicoService — descalificado e idempotencia', () => {
  it('un descalificado no recibe NADA: ni rendimiento, ni multa, ni castigo (decisión 16)', async () => {
    const bd = crearBdEnMemoria({
      rendimientos: [rendimientoDePrueba({ umbralZonaId: 'umbral-rojo', monedas: -5 })],
      recompensas: [recompensaDePrueba({ tipo: 'CASTIGO', umbralZonaId: null })],
    });
    const { servicio } = crearServicio({ bd, resultado: resultadoDePrueba(true) });

    const resultado = await servicio.aplicar(
      randomUUID(),
      CONSUMIDOR,
      payloadDePrueba({ umbralZonaId: 'umbral-rojo' })
    );

    expect(resultado).toBeNull();
    expect(bd.monedas).toHaveLength(0);
    expect(bd.castigos).toHaveLength(0);
    expect(bd.procesados).toHaveLength(1);
  });

  it('sin ResultadoSeccion todavía, no acredita nada', async () => {
    const bd = crearBdEnMemoria({ rendimientos: [rendimientoDePrueba({ monedas: 12 })] });
    const { servicio } = crearServicio({ bd, resultado: null });

    await expect(
      servicio.aplicar(randomUUID(), CONSUMIDOR, payloadDePrueba())
    ).resolves.toBeNull();

    expect(bd.monedas).toHaveLength(0);
  });

  it('reentregar el mismo eventId no acredita dos veces ni sortea otro castigo', async () => {
    const bd = crearBdEnMemoria({
      rendimientos: [rendimientoDePrueba({ umbralZonaId: 'umbral-rojo', monedas: -5 })],
      recompensas: [recompensaDePrueba({ tipo: 'CASTIGO', umbralZonaId: null })],
    });
    const { servicio } = crearServicio({ bd });
    const eventId = randomUUID();
    const payload = payloadDePrueba({ umbralZonaId: 'umbral-rojo' });

    await servicio.aplicar(eventId, CONSUMIDOR, payload);
    const segunda = await servicio.aplicar(eventId, CONSUMIDOR, payload);

    expect(segunda).toBeNull();
    expect(bd.monedas).toHaveLength(2);
    expect(bd.castigos).toHaveLength(1);
    expect(bd.procesados).toHaveLength(1);
  });
});
