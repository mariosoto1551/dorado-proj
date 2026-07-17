import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { TenantContext } from '@dorado/shared-types';

import type { AccesoGrupoService } from '../comun/acceso-grupo.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ConfiguracionService } from './configuracion.service';
import type { GuardarConfiguracionRequest } from './dto/configuracion.dto';

function tenantDePrueba(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'TUTOR',
    principalId: 'tutor-1',
    principalType: 'TUTOR',
  } as TenantContext;
}

function crearServicio(filaExistente: unknown = null) {
  const upsert = vi.fn().mockImplementation(({ where, create }) =>
    Promise.resolve({
      ...create,
      grupoId: where.grupoId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );
  const findFirst = vi.fn().mockResolvedValue(filaExistente);
  const prisma = {
    client: { configuracionSesion: { upsert, findFirst } },
  } as unknown as PrismaService;
  const acceso = {
    asegurarAccesoEscritura: vi.fn().mockResolvedValue(undefined),
    asegurarAccesoLectura: vi.fn(),
  } as unknown as AccesoGrupoService;

  return { servicio: new ConfiguracionService(prisma, acceso), upsert, findFirst };
}

// Configuración exacta del ejemplo Destino:Dorado (spec fase-06, regla de
// negocio: "debe poder configurarse exactamente así").
const DESTINO_DORADO: GuardarConfiguracionRequest = {
  modo: 'AUTOMATICO',
  cronSesion: '0 0 * * 1-6',
  sesionesPorSeccion: 6,
  cronCierreSeccion: '0 0 * * 1',
  evaluarUmbralesEn: 'SOLO_AL_CIERRE_SECCION',
} as GuardarConfiguracionRequest;

describe('ConfiguracionService — guardar (PUT)', () => {
  it('acepta el caso Destino:Dorado tal cual y mapea a las columnas de la spec fase-06', async () => {
    const { servicio, upsert } = crearServicio();

    const dto = await servicio.guardar(tenantDePrueba(), 'grupo-1', DESTINO_DORADO);

    expect(upsert).toHaveBeenCalledWith({
      where: { grupoId: 'grupo-1' },
      create: expect.objectContaining({
        grupoId: 'grupo-1',
        organizacionId: 'org-1',
        modo: 'AUTOMATICO',
        cronAperturaSesion: '0 0 * * 1-6',
        sesionesPorSeccion: 6,
        cronAperturaSeccion: '0 0 * * 1',
        evaluarUmbralesEn: 'SOLO_AL_CIERRE_SECCION',
      }),
      update: expect.any(Object),
    });
    // El DTO público habla el contrato de shared-types.md.
    expect(dto).toEqual({
      grupoId: 'grupo-1',
      modo: 'AUTOMATICO',
      cronSesion: '0 0 * * 1-6',
      sesionesPorSeccion: 6,
      cronCierreSeccion: '0 0 * * 1',
      evaluarUmbralesEn: 'SOLO_AL_CIERRE_SECCION',
    });
  });

  it('modo AUTOMATICO sin ambos crons es 400 (spec: obligatorios y válidos)', async () => {
    const { servicio, upsert } = crearServicio();

    await expect(
      servicio.guardar(tenantDePrueba(), 'grupo-1', {
        modo: 'AUTOMATICO',
        cronSesion: '0 0 * * 1-6',
      } as GuardarConfiguracionRequest)
    ).rejects.toThrow(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('un cron inválido es 400 aunque el modo sea MANUAL', async () => {
    const { servicio } = crearServicio();

    await expect(
      servicio.guardar(tenantDePrueba(), 'grupo-1', {
        modo: 'MANUAL',
        cronSesion: 'todos los días',
      } as GuardarConfiguracionRequest)
    ).rejects.toThrow(BadRequestException);
  });

  it('PUT es reemplazo completo: los campos no enviados vuelven al default de modelo', async () => {
    const { servicio, upsert } = crearServicio();

    await servicio.guardar(tenantDePrueba(), 'grupo-1', {
      modo: 'MANUAL',
    } as GuardarConfiguracionRequest);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          organizacionId: 'org-1',
          modo: 'MANUAL',
          cronAperturaSesion: null,
          sesionesPorSeccion: 1,
          cronAperturaSeccion: null,
          evaluarUmbralesEn: 'SOLO_AL_CIERRE_SECCION',
        },
      })
    );
  });
});

describe('ConfiguracionService — obtener (GET)', () => {
  it('sin fila guardada devuelve los defaults de modelo (modo MANUAL, 1 sesión por sección)', async () => {
    const { servicio } = crearServicio(null);

    const dto = await servicio.obtener(tenantDePrueba(), 'grupo-1');

    expect(dto).toEqual({
      grupoId: 'grupo-1',
      modo: 'MANUAL',
      cronSesion: null,
      sesionesPorSeccion: 1,
      cronCierreSeccion: null,
      evaluarUmbralesEn: 'SOLO_AL_CIERRE_SECCION',
    });
  });

  it('con fila guardada la devuelve mapeada al contrato público', async () => {
    const { servicio } = crearServicio({
      grupoId: 'grupo-1',
      organizacionId: 'org-1',
      modo: 'AUTOMATICO',
      cronAperturaSesion: '*/2 * * * *',
      sesionesPorSeccion: 3,
      cronAperturaSeccion: '*/10 * * * *',
      evaluarUmbralesEn: 'CADA_SESION',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const dto = await servicio.obtener(tenantDePrueba(), 'grupo-1');

    expect(dto).toEqual({
      grupoId: 'grupo-1',
      modo: 'AUTOMATICO',
      cronSesion: '*/2 * * * *',
      sesionesPorSeccion: 3,
      cronCierreSeccion: '*/10 * * * *',
      evaluarUmbralesEn: 'CADA_SESION',
    });
  });
});
