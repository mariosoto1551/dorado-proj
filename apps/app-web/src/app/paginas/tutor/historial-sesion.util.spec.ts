import { describe, expect, it } from 'vitest';

import {
  type EventoHistorialDto,
  TipoEventoHistorial,
  TipoRegistroHistorial,
} from '@dorado/shared-types';

import {
  acentoDeEvento,
  admiteAcciones,
  etiquetaDeEvento,
  formatearHora,
  iconoDeEvento,
  tipoDeRegistro,
} from './historial-sesion.util';

function evento(sobrescribir: Partial<EventoHistorialDto> = {}): EventoHistorialDto {
  return {
    id: 'reg-1',
    tipo: TipoEventoHistorial.ACTIVIDAD_COMPLETADA,
    ocurridoEn: '2026-07-13T18:32:00.000Z',
    usuarioId: 'usuario-1',
    usuarioNombre: 'Ana',
    equipoId: null,
    equipoNombre: null,
    itemId: 'actividad-1',
    itemNombre: 'Tender la cama',
    puntos: 5,
    bonoJefe: null,
    cantidadMiembros: null,
    registradoPorId: 'usuario-1',
    registradoPorTipo: 'USUARIO',
    registradoPorNombre: 'Ana',
    anulado: false,
    anuladoPorNombre: null,
    anuladoEn: null,
    motivoTutor: null,
    revertidoEn: null,
    revertidoPorNombre: null,
    // fase-14-33: null = se registró en su día, que es el caso por default.
    cargadoRetroactivamenteEn: null,
    motivoRetroactivo: null,
    motivoReversion: null,
    notas: [],
    ...sobrescribir,
  };
}

describe('historial-sesion.util (fase-14-18)', () => {
  it('mapea cada tipo de evento a la tabla donde va su nota', () => {
    expect(tipoDeRegistro(evento())).toBe(TipoRegistroHistorial.ACTIVIDAD);
    expect(tipoDeRegistro(evento({ tipo: TipoEventoHistorial.ACTIVIDAD_NO_HIZO }))).toBe(
      TipoRegistroHistorial.ACTIVIDAD
    );
    expect(tipoDeRegistro(evento({ tipo: TipoEventoHistorial.CONDUCTA }))).toBe(
      TipoRegistroHistorial.CONDUCTA
    );
    expect(tipoDeRegistro(evento({ tipo: TipoEventoHistorial.TAREA_EQUIPO }))).toBe(
      TipoRegistroHistorial.TAREA_EQUIPO
    );
  });

  it('distingue una confirmación de obligatoria (0 pts) de una completada', () => {
    expect(etiquetaDeEvento(evento())).toBe('Completada');
    expect(etiquetaDeEvento(evento({ puntos: 0 }))).toBe('Confirmada');
  });

  it('nombra las conductas por su signo', () => {
    const buena = evento({ tipo: TipoEventoHistorial.CONDUCTA, puntos: 3 });
    const mala = evento({ tipo: TipoEventoHistorial.CONDUCTA, puntos: -5 });

    expect(etiquetaDeEvento(buena)).toBe('Conducta buena');
    expect(etiquetaDeEvento(mala)).toBe('Conducta mala');
  });

  it('cada fila lleva icono además del color (no solo color, WCAG)', () => {
    expect(iconoDeEvento(evento())).not.toBe('');
    expect(iconoDeEvento(evento({ tipo: TipoEventoHistorial.ACTIVIDAD_NO_HIZO }))).toBe('✕');
    expect(iconoDeEvento(evento({ tipo: TipoEventoHistorial.TAREA_EQUIPO }))).toBe('👥');
  });

  it('atenúa lo anulado y da acento teal a las tareas de equipo', () => {
    expect(acentoDeEvento(evento({ anulado: true }))).toContain('slate');
    expect(acentoDeEvento(evento({ tipo: TipoEventoHistorial.TAREA_EQUIPO }))).toContain('teal');
    expect(acentoDeEvento(evento({ puntos: -10 }))).toContain('red');
  });

  it('formatea la hora en la timezone del GRUPO, no en la del navegador', () => {
    // 18:32 UTC son las 14:32 en La Paz (UTC−4).
    expect(formatearHora('2026-07-13T18:32:00.000Z', 'America/La_Paz')).toBe('14:32');
    expect(formatearHora('2026-07-13T18:32:00.000Z', 'UTC')).toBe('18:32');
  });

  it('no rompe la pantalla con una fecha o una timezone inválida', () => {
    expect(formatearHora('', 'UTC')).toBe('');
    expect(formatearHora('no-es-una-fecha', 'UTC')).toBe('');
    expect(formatearHora('2026-07-13T18:32:00.000Z', 'Zona/Inventada')).not.toBe('');
  });

  // ── Ajuste manual (fase-14-34) ───────────────────────────────────────────

  it('el ajuste manual se nombra y se pinta como lo que es, no por su signo', () => {
    const suma = evento({ tipo: TipoEventoHistorial.AJUSTE_MANUAL, puntos: 10 });
    const resta = evento({ tipo: TipoEventoHistorial.AJUSTE_MANUAL, puntos: -10 });

    expect(etiquetaDeEvento(suma)).toBe('Puntos a mano');
    expect(etiquetaDeEvento(resta)).toBe('Puntos a mano');
    expect(iconoDeEvento(suma)).toBe('✋');
    // El signo ya está en el número de la derecha: la etiqueta dice el origen.
    expect(acentoDeEvento(resta)).toContain('amber');
  });

  it('el ajuste no ofrece anular, deshacer ni notas: no es una fila de activity', () => {
    expect(admiteAcciones(evento({ tipo: TipoEventoHistorial.AJUSTE_MANUAL }))).toBe(false);
    expect(admiteAcciones(evento())).toBe(true);
    expect(admiteAcciones(evento({ tipo: TipoEventoHistorial.CONDUCTA }))).toBe(true);
  });
});
