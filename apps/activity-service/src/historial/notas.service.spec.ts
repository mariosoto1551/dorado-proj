import { describe, expect, it, vi } from 'vitest';

import { EstadoSeccion, EstadoSesion, Rol, TipoRegistroHistorial } from '@dorado/shared-types';
import type { TenantContext, TutorDto } from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import type {
  SeccionActualInterna,
  SessionClientService,
} from '../clientes/session-client.service';
import {
  NoHaySesionAbiertaException,
  NotaDeOtroTutorException,
  RegistroDelHistorialNoEncontradoException,
} from '../comun/excepciones';
import {
  crearBdHistorialEnMemoria,
  type BdHistorialEnMemoria,
} from '../comun/testing/bd-historial-en-memoria';
import type { NotaRegistro, RegistroActividad } from '../generated/prisma/client';
import { NotasService } from './notas.service';

const TUTORA: TutorDto = {
  id: 'tutor-1',
  organizacionId: 'org-1',
  email: 'tutora@dorado.test',
  nombre: 'Marta',
  rol: 'TUTOR' as TutorDto['rol'],
  grupoIds: ['grupo-1'],
  estado: 'ACTIVO',
  createdAt: new Date().toISOString(),
};

function tenant(sobrescribir: Partial<TenantContext> = {}): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'TUTOR',
    principalId: 'tutor-1',
    principalType: 'TUTOR',
    ...sobrescribir,
  } as TenantContext;
}

function seccionConSesionAbierta(): SeccionActualInterna {
  return {
    id: 'seccion-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    numero: 1,
    estado: EstadoSeccion.ABIERTA,
    fechaInicio: '2026-07-13T04:00:00.000Z',
    fechaFin: null,
    sesiones: [
      {
        id: 'sesion-1',
        seccionId: 'seccion-1',
        organizacionId: 'org-1',
        grupoId: 'grupo-1',
        numero: 1,
        estado: EstadoSesion.ABIERTA,
        fechaInicio: '2026-07-13T04:00:00.000Z',
        fechaFin: null,
      },
    ],
  };
}

function registro(sobrescribir: Partial<RegistroActividad> = {}): RegistroActividad {
  return {
    id: 'reg-act-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    usuarioId: 'usuario-1',
    actividadId: 'actividad-1',
    sesionId: 'sesion-1',
    seccionId: 'seccion-1',
    tipo: 'COMPLETADA',
    valorPuntosSnapshot: 5,
    registradoPorId: 'usuario-1',
    registradoPorTipo: 'USUARIO',
    eliminado: false,
    eliminadoPorTutorId: null,
    eliminadoEn: null,
    motivoTutor: null,
    revertidoPorTutorId: null,
    revertidoEn: null,
    createdAt: new Date('2026-07-13T14:00:00.000Z'),
    ...sobrescribir,
  } as RegistroActividad;
}

function notaDePrueba(sobrescribir: Partial<NotaRegistro> = {}): NotaRegistro {
  return {
    id: 'nota-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    registroTipo: 'ACTIVIDAD',
    registroId: 'reg-act-1',
    texto: 'Lo hablamos en la reunión',
    autorTutorId: 'tutor-1',
    createdAt: new Date('2026-07-13T17:00:00.000Z'),
    ...sobrescribir,
  } as NotaRegistro;
}

function armar(
  bd: BdHistorialEnMemoria,
  seccion: SeccionActualInterna | null = seccionConSesionAbierta()
): NotasService {
  const session = {
    obtenerSeccionActual: vi.fn().mockResolvedValue(seccion),
  } as unknown as SessionClientService;

  const identity = {
    tutoresDelGrupo: vi.fn().mockResolvedValue([TUTORA]),
  } as unknown as IdentityClientService;

  return new NotasService(bd.prisma, session, identity);
}

describe('NotasService (fase-14-18)', () => {
  it('crea una nota sobre un registro de la sesión abierta', async () => {
    const bd = crearBdHistorialEnMemoria({ registrosActividad: [registro()] });
    const servicio = armar(bd);

    const nota = await servicio.crear(tenant(), TipoRegistroHistorial.ACTIVIDAD, 'reg-act-1', {
      texto: 'Insistió mucho, dejarlo pasar',
    });

    expect(nota).toMatchObject({
      texto: 'Insistió mucho, dejarlo pasar',
      autorNombre: 'Marta',
      esPropia: true,
    });
    expect(bd.notas).toHaveLength(1);
    // organizacionId SIEMPRE del JWT, nunca del cliente (regla 3).
    expect(bd.notas[0]).toMatchObject({ organizacionId: 'org-1', grupoId: 'grupo-1' });
  });

  it('404 si el registro es de otra organización (no revela existencia)', async () => {
    const bd = crearBdHistorialEnMemoria({
      registrosActividad: [registro({ organizacionId: 'org-ajena' })],
    });
    const servicio = armar(bd);

    await expect(
      servicio.crear(tenant(), TipoRegistroHistorial.ACTIVIDAD, 'reg-act-1', { texto: 'hola' })
    ).rejects.toBeInstanceOf(RegistroDelHistorialNoEncontradoException);
  });

  it('404 si el registro no existe', async () => {
    const bd = crearBdHistorialEnMemoria();
    const servicio = armar(bd);

    await expect(
      servicio.crear(tenant(), TipoRegistroHistorial.CONDUCTA, 'no-existe', { texto: 'hola' })
    ).rejects.toBeInstanceOf(RegistroDelHistorialNoEncontradoException);
  });

  it('409 si el registro es de una sesión anterior — no se anota lo ya cerrado', async () => {
    const bd = crearBdHistorialEnMemoria({
      registrosActividad: [registro({ sesionId: 'sesion-de-ayer' })],
    });
    const servicio = armar(bd);

    await expect(
      servicio.crear(tenant(), TipoRegistroHistorial.ACTIVIDAD, 'reg-act-1', { texto: 'hola' })
    ).rejects.toBeInstanceOf(NoHaySesionAbiertaException);
  });

  it('409 si no hay ninguna sesión abierta', async () => {
    const bd = crearBdHistorialEnMemoria({ registrosActividad: [registro()] });
    const servicio = armar(bd, null);

    await expect(
      servicio.crear(tenant(), TipoRegistroHistorial.ACTIVIDAD, 'reg-act-1', { texto: 'hola' })
    ).rejects.toBeInstanceOf(NoHaySesionAbiertaException);
  });

  it('borra la nota propia', async () => {
    const bd = crearBdHistorialEnMemoria({ notas: [notaDePrueba()] });
    const servicio = armar(bd);

    await servicio.borrar(tenant(), 'nota-1');

    expect(bd.notas).toHaveLength(0);
  });

  it('403 al borrar la nota de otro tutor — y un ORG_ADMIN tampoco puede', async () => {
    const bd = crearBdHistorialEnMemoria({ notas: [notaDePrueba({ autorTutorId: 'tutor-9' })] });
    const servicio = armar(bd);

    await expect(servicio.borrar(tenant(), 'nota-1')).rejects.toBeInstanceOf(
      NotaDeOtroTutorException
    );

    await expect(
      servicio.borrar(tenant({ rol: Rol.ORG_ADMIN, principalId: 'admin-1' }), 'nota-1')
    ).rejects.toBeInstanceOf(NotaDeOtroTutorException);

    expect(bd.notas).toHaveLength(1);
  });

  it('404 al borrar una nota inexistente', async () => {
    const bd = crearBdHistorialEnMemoria();
    const servicio = armar(bd);

    await expect(servicio.borrar(tenant(), 'nota-fantasma')).rejects.toBeInstanceOf(
      RegistroDelHistorialNoEncontradoException
    );
  });
});
