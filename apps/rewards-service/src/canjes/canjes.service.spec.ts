import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { TenantContext, UsuarioDto } from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import type {
  ResultadoSeccionInterno,
  ScoringClientService,
} from '../clientes/scoring-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  crearBdEnMemoria,
  recompensaDePrueba,
  type BdEnMemoria,
} from '../comun/testing/bd-en-memoria';
import type {
  EventoAPublicar,
  EventosPublisherService,
} from '../eventos/eventos-publisher.service';
import { CanjesService } from './canjes.service';

const USUARIO: UsuarioDto = {
  id: 'usuario-1',
  organizacionId: 'org-1',
  grupoId: 'grupo-1',
  username: 'usuario1',
  nombre: 'Usuario Uno',
  avatarId: 'a1',
  estado: 'ACTIVO',
  createdAt: new Date().toISOString(),
};

function resultadoDePrueba(
  sobrescribir: Partial<ResultadoSeccionInterno> = {}
): ResultadoSeccionInterno {
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
    ...sobrescribir,
  };
}

function tenantUsuario(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'USUARIO',
    principalId: 'usuario-1',
    principalType: 'USUARIO',
  } as TenantContext;
}

function tenantTutor(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'TUTOR',
    principalId: 'tutor-1',
    principalType: 'TUTOR',
  } as TenantContext;
}

function crearServicio(opciones: {
  bd?: BdEnMemoria;
  resultado?: ResultadoSeccionInterno | null;
  usuario?: UsuarioDto | null;
} = {}) {
  const bd = opciones.bd ?? crearBdEnMemoria();
  const publicados: EventoAPublicar<unknown>[] = [];

  const identity = {
    obtenerUsuario: vi
      .fn()
      .mockResolvedValue(opciones.usuario === undefined ? USUARIO : opciones.usuario),
    obtenerGrupo: vi.fn().mockResolvedValue({
      id: 'grupo-1',
      organizacionId: 'org-1',
      nombre: 'Grupo',
      timezone: 'America/La_Paz',
      createdAt: new Date().toISOString(),
    }),
  } as unknown as IdentityClientService;

  const scoring = {
    obtenerResultado: vi
      .fn()
      .mockResolvedValue(opciones.resultado === undefined ? resultadoDePrueba() : opciones.resultado),
    obtenerUmbral: vi.fn(),
  } as unknown as ScoringClientService;

  const eventos = {
    publicar: vi.fn(async (evento: EventoAPublicar<unknown>) => {
      publicados.push(evento);
    }),
  } as unknown as EventosPublisherService;

  const servicio = new CanjesService(
    bd.prisma,
    identity,
    scoring,
    new AccesoGrupoService(identity),
    eventos
  );

  return { servicio, bd, publicados };
}

describe('CanjesService — elegibles', () => {
  it('sección sin evaluar → listas vacías con motivo SECCION_NO_EVALUADA (nunca error genérico)', async () => {
    const { servicio } = crearServicio({ resultado: null });

    const respuesta = await servicio.elegibles(tenantUsuario(), 'usuario-1', 'seccion-1');

    expect(respuesta).toEqual({
      motivo: 'SECCION_NO_EVALUADA',
      disponiblesSeleccion: [],
      disponiblesAzar: [],
    });
  });

  it('descalificado → vacío con motivo DESCALIFICADO aunque tenga zona (chequeo explícito, spec)', async () => {
    const bd = crearBdEnMemoria({
      recompensas: [recompensaDePrueba({ permiteSeleccion: true })],
    });
    const { servicio } = crearServicio({
      bd,
      resultado: resultadoDePrueba({ descalificado: true }),
    });

    const respuesta = await servicio.elegibles(tenantTutor(), 'usuario-1', 'seccion-1');

    expect(respuesta.motivo).toBe('DESCALIFICADO');
    expect(respuesta.disponiblesSeleccion).toHaveLength(0);
    expect(respuesta.disponiblesAzar).toHaveLength(0);
  });

  it('sin zona alcanzada (umbralZonaId null) → vacío con motivo SIN_ZONA', async () => {
    const { servicio } = crearServicio({
      resultado: resultadoDePrueba({ umbralZonaId: null, nombreZona: null }),
    });

    const respuesta = await servicio.elegibles(tenantUsuario(), 'usuario-1', 'seccion-1');

    expect(respuesta.motivo).toBe('SIN_ZONA');
  });

  it('con zona Dorado ve SOLO las recompensas ACTIVA de esa zona, separadas por mecánica (criterio 1)', async () => {
    const bd = crearBdEnMemoria({
      recompensas: [
        recompensaDePrueba({ id: 'r-sel', nombre: 'Cine', permiteSeleccion: true }),
        recompensaDePrueba({ id: 'r-azar', nombre: 'Sorpresa', permiteAzar: true }),
        recompensaDePrueba({ id: 'r-ambas', nombre: 'Mixta', permiteSeleccion: true, permiteAzar: true }),
        recompensaDePrueba({ id: 'r-rojo', umbralZonaId: 'umbral-rojo', permiteSeleccion: true }),
        recompensaDePrueba({ id: 'r-arch', estado: 'ARCHIVADA', permiteSeleccion: true }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    const respuesta = await servicio.elegibles(tenantUsuario(), 'usuario-1', 'seccion-1');

    expect(respuesta.motivo).toBeNull();
    expect(respuesta.disponiblesSeleccion.map((r) => r.id)).toEqual(['r-sel', 'r-ambas']);
    expect(respuesta.disponiblesAzar.map((r) => r.id)).toEqual(['r-azar', 'r-ambas']);
  });

  it('un USUARIO no puede consultar elegibles ajenos (403)', async () => {
    const { servicio } = crearServicio();

    await expect(
      servicio.elegibles(tenantUsuario(), 'usuario-ajeno', 'seccion-1')
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('CanjesService — seleccionar', () => {
  it('crea el canje SELECCION y publica RecompensaCanjeada', async () => {
    const bd = crearBdEnMemoria({
      recompensas: [recompensaDePrueba({ id: 'r-sel', permiteSeleccion: true })],
    });
    const { servicio, publicados } = crearServicio({ bd });

    const canje = await servicio.seleccionar(tenantUsuario(), 'usuario-1', 'seccion-1', 'r-sel');

    expect(canje).toMatchObject({
      usuarioId: 'usuario-1',
      seccionId: 'seccion-1',
      recompensaId: 'r-sel',
      mecanica: 'SELECCION',
      estado: 'PENDIENTE_ENTREGA',
    });
    expect(publicados).toHaveLength(1);
    expect(publicados[0]).toMatchObject({ eventType: 'RecompensaCanjeada' });
    expect(publicados[0].payload).toMatchObject({
      canjeId: canje.id,
      mecanica: 'SELECCION',
    });
  });

  it('seleccionar dos veces en la misma sección → 409 (criterio 2)', async () => {
    const bd = crearBdEnMemoria({
      recompensas: [recompensaDePrueba({ id: 'r-sel', permiteSeleccion: true })],
    });
    const { servicio } = crearServicio({ bd });

    await servicio.seleccionar(tenantUsuario(), 'usuario-1', 'seccion-1', 'r-sel');

    await expect(
      servicio.seleccionar(tenantUsuario(), 'usuario-1', 'seccion-1', 'r-sel')
    ).rejects.toThrow(ConflictException);
  });

  it('un descalificado no puede seleccionar (403, criterio 3)', async () => {
    const bd = crearBdEnMemoria({
      recompensas: [recompensaDePrueba({ id: 'r-sel', permiteSeleccion: true })],
    });
    const { servicio } = crearServicio({
      bd,
      resultado: resultadoDePrueba({ descalificado: true }),
    });

    await expect(
      servicio.seleccionar(tenantUsuario(), 'usuario-1', 'seccion-1', 'r-sel')
    ).rejects.toThrow(ForbiddenException);
  });

  it('sección sin evaluar → 409 (todavía no hay canje disponible)', async () => {
    const { servicio } = crearServicio({ resultado: null });

    await expect(
      servicio.seleccionar(tenantUsuario(), 'usuario-1', 'seccion-1', 'r-x')
    ).rejects.toThrow(ConflictException);
  });

  it('una recompensa de OTRA zona no es elegible (400)', async () => {
    const bd = crearBdEnMemoria({
      recompensas: [
        recompensaDePrueba({ id: 'r-rojo', umbralZonaId: 'umbral-rojo', permiteSeleccion: true }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    await expect(
      servicio.seleccionar(tenantUsuario(), 'usuario-1', 'seccion-1', 'r-rojo')
    ).rejects.toThrow(BadRequestException);
  });

  it('una recompensa solo-azar no se puede seleccionar (400)', async () => {
    const bd = crearBdEnMemoria({
      recompensas: [recompensaDePrueba({ id: 'r-azar', permiteAzar: true })],
    });
    const { servicio } = crearServicio({ bd });

    await expect(
      servicio.seleccionar(tenantUsuario(), 'usuario-1', 'seccion-1', 'r-azar')
    ).rejects.toThrow(BadRequestException);
  });
});

describe('CanjesService — sortear', () => {
  it('sin recompensas con permiteAzar → 409, sin crear canje', async () => {
    const bd = crearBdEnMemoria({
      recompensas: [recompensaDePrueba({ id: 'r-sel', permiteSeleccion: true })],
    });
    const { servicio } = crearServicio({ bd });

    await expect(
      servicio.sortear(tenantUsuario(), 'usuario-1', 'seccion-1')
    ).rejects.toThrow(ConflictException);
    expect(bd.canjes).toHaveLength(0);
  });

  it('NUNCA devuelve una recompensa sin permiteAzar (criterio 4, 100 sorteos)', async () => {
    const bd = crearBdEnMemoria({
      recompensas: [
        recompensaDePrueba({ id: 'r-solo-sel', permiteSeleccion: true }),
        recompensaDePrueba({ id: 'r-azar-1', permiteAzar: true }),
        recompensaDePrueba({ id: 'r-azar-2', permiteAzar: true }),
        recompensaDePrueba({ id: 'r-arch-azar', permiteAzar: true, estado: 'ARCHIVADA' }),
      ],
    });
    const { servicio } = crearServicio({ bd });
    const elegidas = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const canje = await servicio.sortear(tenantUsuario(), 'usuario-1', 'seccion-1');

      elegidas.add(canje.recompensaId);
      expect(canje.mecanica).toBe('AZAR');
      expect(['r-azar-1', 'r-azar-2']).toContain(canje.recompensaId);

      // Liberar el @@unique para el próximo sorteo del loop.
      bd.canjes.length = 0;
    }

    // Sanidad del azar: con 100 tiradas salieron ambas candidatas.
    expect(elegidas.size).toBe(2);
  });

  it('un descalificado tampoco puede sortear (403, criterio 3)', async () => {
    const bd = crearBdEnMemoria({
      recompensas: [recompensaDePrueba({ id: 'r-azar', permiteAzar: true })],
    });
    const { servicio } = crearServicio({
      bd,
      resultado: resultadoDePrueba({ descalificado: true }),
    });

    await expect(servicio.sortear(tenantUsuario(), 'usuario-1', 'seccion-1')).rejects.toThrow(
      ForbiddenException
    );
  });
});

describe('CanjesService — entregar', () => {
  it('marca ENTREGADA con tutor y fecha; repetir da 409', async () => {
    const bd = crearBdEnMemoria({
      recompensas: [recompensaDePrueba({ id: 'r-sel', permiteSeleccion: true })],
    });
    const { servicio } = crearServicio({ bd });

    const canje = await servicio.seleccionar(tenantUsuario(), 'usuario-1', 'seccion-1', 'r-sel');
    const entregado = await servicio.entregar(tenantTutor(), canje.id);

    expect(entregado.estado).toBe('ENTREGADA');
    expect(entregado.entregadaPorTutorId).toBe('tutor-1');
    expect(entregado.entregadaEn).not.toBeNull();

    await expect(servicio.entregar(tenantTutor(), canje.id)).rejects.toThrow(ConflictException);
  });
});
