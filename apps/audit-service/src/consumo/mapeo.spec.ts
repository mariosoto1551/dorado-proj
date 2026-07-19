import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import type { EventEnvelope } from '@dorado/shared-events';

import { mapearARegistro } from './mapeo';

function envelope<T>(eventType: string, payload: T, grupoId: string | undefined = 'grupo-1'): EventEnvelope<T> {
  return {
    eventId: randomUUID(),
    eventType,
    producedBy: 'test',
    organizacionId: 'org-1',
    grupoId,
    occurredAt: new Date().toISOString(),
    correlationId: randomUUID(),
    payload,
  };
}

describe('mapearARegistro — evento → fila de auditoría', () => {
  it('AccionAdministrativaRegistrada toma actor/accion/entidad del payload y detalle interno', () => {
    const fila = mapearARegistro(
      envelope('AccionAdministrativaRegistrada', {
        actorId: 'tutor-1',
        actorTipo: 'TUTOR',
        accion: 'UMBRAL_CREADO',
        entidadTipo: 'UmbralZona',
        entidadId: 'u-1',
        detalle: { despues: { orden: 1 } },
      })
    );

    expect(fila).toMatchObject({
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
      actorId: 'tutor-1',
      actorTipo: 'TUTOR',
      accion: 'UMBRAL_CREADO',
      entidadTipo: 'UmbralZona',
      entidadId: 'u-1',
      detalle: { despues: { orden: 1 } },
    });
  });

  it('OrganizacionCreada queda a nivel organización (grupoId null)', () => {
    const fila = mapearARegistro(
      envelope(
        'OrganizacionCreada',
        {
          organizacionId: 'org-1',
          nombre: 'Familia',
          emailContacto: 'a@b.com',
          creadaPorTutorId: 'tutor-1',
        },
        undefined
      )
    );

    expect(fila.grupoId).toBeNull();
    expect(fila).toMatchObject({
      actorId: 'tutor-1',
      actorTipo: 'TUTOR',
      accion: 'ORGANIZACION_CREADA',
      entidadTipo: 'Organizacion',
      entidadId: 'org-1',
    });
  });

  it('UsuarioDescalificado se atribuye al tutor y su entidad es el Usuario (timeline del criterio 4)', () => {
    const fila = mapearARegistro(
      envelope('UsuarioDescalificado', {
        usuarioId: 'usuario-1',
        seccionId: 'sec-1',
        organizacionId: 'org-1',
        grupoId: 'grupo-1',
        motivo: 'trampa',
        registradaPorTutorId: 'tutor-9',
      })
    );

    expect(fila).toMatchObject({
      actorId: 'tutor-9',
      actorTipo: 'TUTOR',
      accion: 'USUARIO_DESCALIFICADO',
      entidadTipo: 'Usuario',
      entidadId: 'usuario-1',
    });
    // El motivo queda en el detalle (payload completo) — responde "¿por qué?".
    expect((fila.detalle as { motivo: string }).motivo).toBe('trampa');
  });

  it('los eventos de ciclo de vida de Sección se atribuyen a SYSTEM', () => {
    const fila = mapearARegistro(
      envelope('SeccionEntroEvaluacion', {
        seccionId: 'sec-1',
        organizacionId: 'org-1',
        grupoId: 'grupo-1',
        numero: 1,
      })
    );

    expect(fila).toMatchObject({
      actorTipo: 'SYSTEM',
      accion: 'SECCION_ENTRO_EVALUACION',
      entidadTipo: 'Seccion',
      entidadId: 'sec-1',
    });
  });

  it('SesionCerrada mapea a la entidad Sesion, SYSTEM', () => {
    const fila = mapearARegistro(
      envelope('SesionCerrada', {
        sesionId: 'ses-1',
        seccionId: 'sec-1',
        organizacionId: 'org-1',
        grupoId: 'grupo-1',
        numero: 1,
      })
    );

    expect(fila).toMatchObject({
      actorTipo: 'SYSTEM',
      accion: 'SESION_CERRADA',
      entidadTipo: 'Sesion',
      entidadId: 'ses-1',
    });
  });

  it('RecompensaCanjeada se atribuye al usuario que canjeó', () => {
    const fila = mapearARegistro(
      envelope('RecompensaCanjeada', {
        canjeId: 'c-1',
        usuarioId: 'usuario-1',
        seccionId: 'sec-1',
        recompensaId: 'r-1',
        mecanica: 'AZAR',
        organizacionId: 'org-1',
        grupoId: 'grupo-1',
      })
    );

    expect(fila).toMatchObject({
      actorId: 'usuario-1',
      actorTipo: 'USUARIO',
      accion: 'RECOMPENSA_CANJEADA',
      entidadTipo: 'CanjeRecompensa',
      entidadId: 'c-1',
    });
  });

  it('un eventType no esperado lanza (→ reintento/DLQ, nunca fila silenciosa)', () => {
    expect(() => mapearARegistro(envelope('EventoFantasma', {}))).toThrow(/inesperado/);
  });
});
