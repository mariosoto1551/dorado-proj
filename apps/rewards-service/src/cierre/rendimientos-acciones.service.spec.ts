import { describe, expect, it, vi } from 'vitest';

import type {
  AccionRendibleDto,
  CatalogoRendibleDto,
  ConductaDto,
  TenantContext,
} from '@dorado/shared-types';
import {
  AlcanceActividad,
  ComportamientoAlCierre,
  TipoAccionRendimiento,
  TipoPuntaje,
} from '@dorado/shared-types';

import type { ActivityClientService } from '../clientes/activity-client.service';
import type { IdentityClientService } from '../clientes/identity-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  configuracionDePrueba,
  crearBdEnMemoria,
  rendimientoAccionDePrueba,
  type BdEnMemoria,
} from '../comun/testing/bd-en-memoria';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { RendimientosAccionesService } from './rendimientos-acciones.service';

function actividad(sobrescribir: Partial<AccionRendibleDto> = {}): AccionRendibleDto {
  return {
    id: 'actividad-1',
    nombre: 'Tender la cama',
    valorPuntos: 10,
    tipoPuntaje: TipoPuntaje.OPCIONAL,
    alcance: AlcanceActividad.INDIVIDUAL,
    comportamientoAlCierre: ComportamientoAlCierre.ASUME_HECHA,
    bonoJefePuntos: 0,
    repeticionesMaximasSesion: 1,
    ...sobrescribir,
  } as AccionRendibleDto;
}

function conductaBuena(sobrescribir: Partial<AccionRendibleDto> = {}): AccionRendibleDto {
  return {
    id: 'conducta-1',
    nombre: 'Ayudó sin que se lo pidan',
    valorPuntos: 5,
    tipoPuntaje: null,
    alcance: null,
    comportamientoAlCierre: null,
    bonoJefePuntos: null,
    repeticionesMaximasSesion: null,
    ...sobrescribir,
  } as AccionRendibleDto;
}

const CATALOGO: CatalogoRendibleDto = {
  actividades: [
    actividad(),
    actividad({
      id: 'actividad-obligatoria',
      nombre: 'Lavar los platos',
      tipoPuntaje: TipoPuntaje.OBLIGATORIA,
      comportamientoAlCierre: ComportamientoAlCierre.REQUIERE_CONFIRMACION,
    }),
    actividad({
      id: 'actividad-asume',
      nombre: 'Rezar',
      tipoPuntaje: TipoPuntaje.OBLIGATORIA,
      comportamientoAlCierre: ComportamientoAlCierre.ASUME_HECHA,
    }),
    actividad({
      id: 'actividad-equipo',
      nombre: 'Ordenar el living',
      alcance: AlcanceActividad.EQUIPO,
      bonoJefePuntos: 3,
    }),
  ],
  conductas: [conductaBuena()],
};

function tenantTutor(): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'TUTOR',
    principalId: 'tutor-1',
    principalType: 'TUTOR',
  } as TenantContext;
}

function crearServicio(
  opciones: {
    bd?: BdEnMemoria;
    catalogo?: CatalogoRendibleDto;
    conducta?: ConductaDto | null;
  } = {}
) {
  const bd = opciones.bd ?? crearBdEnMemoria();

  const activity = {
    catalogoRendible: vi.fn().mockResolvedValue(opciones.catalogo ?? CATALOGO),
    conducta: vi.fn().mockResolvedValue(opciones.conducta ?? null),
  } as unknown as ActivityClientService;

  const identity = {
    obtenerGrupo: vi.fn(),
    obtenerUsuario: vi.fn(),
  } as unknown as IdentityClientService;

  const eventos = {
    publicar: vi.fn(),
    publicarAccionAdministrativa: vi.fn(),
  } as unknown as EventosPublisherService;

  return {
    servicio: new RendimientosAccionesService(
      bd.prisma,
      activity,
      new AccesoGrupoService(identity),
      new ConfiguracionService(bd.prisma, new AccesoGrupoService(identity), eventos),
      eventos
    ),
    bd,
    eventos,
    activity,
  };
}

describe('RendimientosAccionesService — listar', () => {
  it('trae el catálogo COMPLETO, también lo que no tiene fila cargada', async () => {
    // Si solo devolviera lo guardado, el Tutor no tendría dónde cargar el resto
    // — mismo criterio que el listado de zonas de fase-14-22.
    const { servicio } = crearServicio();

    const listado = await servicio.listar(tenantTutor(), 'grupo-1');

    expect(listado.actividades).toHaveLength(4);
    expect(listado.conductas).toHaveLength(1);
    expect(listado.actividades[0]).toMatchObject({
      origenId: 'actividad-1',
      monedas: 0,
      monedasBonoJefe: 0,
      valorPuntos: 10,
    });
  });

  it('cruza las filas guardadas por (tipoAccion, origenId), no solo por origenId', async () => {
    // La clave es COMPUESTA: una actividad y una conducta pueden compartir id
    // sin pisarse (son de tablas distintas de otra base).
    const bd = crearBdEnMemoria({
      rendimientosAccion: [
        rendimientoAccionDePrueba({ origenId: 'actividad-1', monedas: 3 }),
        rendimientoAccionDePrueba({
          tipoAccion: 'CONDUCTA',
          origenId: 'conducta-1',
          monedas: 7,
        }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    const listado = await servicio.listar(tenantTutor(), 'grupo-1');

    expect(listado.actividades[0].monedas).toBe(3);
    expect(listado.conductas[0].monedas).toBe(7);
  });

  it('una obligatoria ASUME_HECHA viene marcada como que NO rinde, con el motivo escrito', async () => {
    // Decisión 15 resuelta en el backend y no en la plantilla: nunca genera un
    // registro positivo, así que nunca puede pagar. No se oculta ni se bloquea.
    const { servicio } = crearServicio();

    const listado = await servicio.listar(tenantTutor(), 'grupo-1');
    const asume = listado.actividades.find((fila) => fila.origenId === 'actividad-asume');

    expect(asume?.puedeRendir).toBe(false);
    expect(asume?.motivoNoRinde).toContain('nunca se completa');
  });

  it('una OPCIONAL con ASUME_HECHA sí rinde: el motivo es la obligatoria, no el cierre', async () => {
    const { servicio } = crearServicio();

    const listado = await servicio.listar(tenantTutor(), 'grupo-1');

    expect(listado.actividades[0]).toMatchObject({
      origenId: 'actividad-1',
      puedeRendir: true,
      motivoNoRinde: null,
    });
  });
});

describe('RendimientosAccionesService — lo que ve el participante (Parte F)', () => {
  function tenantUsuario(): TenantContext {
    return {
      organizacionId: 'org-1',
      grupoIds: ['grupo-1'],
      rol: 'USUARIO',
      principalId: 'usuario-1',
      principalType: 'USUARIO',
    } as TenantContext;
  }

  function bdConValores(modo: 'TIENDA' | 'DIRECTO'): BdEnMemoria {
    return crearBdEnMemoria({
      configuraciones: [configuracionDePrueba({ modo })],
      rendimientosAccion: [
        rendimientoAccionDePrueba({ origenId: 'actividad-1', monedas: 3 }),
        rendimientoAccionDePrueba({
          origenId: 'actividad-equipo',
          monedas: 5,
          monedasBonoJefe: 2,
        }),
        // Sin precio: no tiene nada que mostrar al lado de los puntos.
        rendimientoAccionDePrueba({ origenId: 'actividad-sin-precio', monedas: 0 }),
        // Las conductas las registra el Tutor, no aparecen en su lista.
        rendimientoAccionDePrueba({
          tipoAccion: 'CONDUCTA',
          origenId: 'conducta-1',
          monedas: 4,
        }),
      ],
    });
  }

  it('en TIENDA trae solo las actividades que pagan, con su bono', async () => {
    const { servicio } = crearServicio({ bd: bdConValores('TIENDA') });

    const valores = await servicio.valoresParaElParticipante(tenantUsuario(), 'grupo-1');

    expect(valores).toEqual([
      { origenId: 'actividad-1', monedas: 3, monedasBonoJefe: 0 },
      { origenId: 'actividad-equipo', monedas: 5, monedasBonoJefe: 2 },
    ]);
  });

  it('en DIRECTO viene vacío: «no se muestra en DIRECTO» cae por construcción', async () => {
    const { servicio } = crearServicio({ bd: bdConValores('DIRECTO') });

    const valores = await servicio.valoresParaElParticipante(tenantUsuario(), 'grupo-1');

    expect(valores).toEqual([]);
  });

  it('no llama a activity: es una lectura local del ledger de configuración', async () => {
    // Es el camino del integrante y corre en cada carga de su lista: un cruce
    // REST acá sería el mismo costo que fase-14-19 se cuidó de no pagar.
    const { servicio, activity } = crearServicio({ bd: bdConValores('TIENDA') });

    await servicio.valoresParaElParticipante(tenantUsuario(), 'grupo-1');

    expect(activity.catalogoRendible).not.toHaveBeenCalled();
  });
});

describe('RendimientosAccionesService — configurar', () => {
  it('guarda con snapshot del nombre y es idempotente sobre la misma clave', async () => {
    const { servicio, bd } = crearServicio();

    await servicio.configurar(tenantTutor(), 'grupo-1', {
      rendimientos: [
        {
          tipoAccion: TipoAccionRendimiento.ACTIVIDAD,
          origenId: 'actividad-1',
          monedas: 3,
        },
      ],
    });
    await servicio.configurar(tenantTutor(), 'grupo-1', {
      rendimientos: [
        {
          tipoAccion: TipoAccionRendimiento.ACTIVIDAD,
          origenId: 'actividad-1',
          monedas: 8,
        },
      ],
    });

    expect(bd.rendimientosAccion).toHaveLength(1);
    expect(bd.rendimientosAccion[0]).toMatchObject({
      monedas: 8,
      nombreSnapshot: 'Tender la cama',
      // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
      organizacionId: 'org-1',
    });
  });

  it('el bono del jefe se conserva en una actividad de EQUIPO', async () => {
    const { servicio, bd } = crearServicio();

    await servicio.configurar(tenantTutor(), 'grupo-1', {
      rendimientos: [
        {
          tipoAccion: TipoAccionRendimiento.ACTIVIDAD,
          origenId: 'actividad-equipo',
          monedas: 5,
          monedasBonoJefe: 2,
        },
      ],
    });

    expect(bd.rendimientosAccion[0]).toMatchObject({ monedas: 5, monedasBonoJefe: 2 });
  });

  it('el bono del jefe se FUERZA a 0 fuera de una actividad de equipo, sin error', async () => {
    // Mismo criterio que fase-14-20 con `puntosPorCumplir`: un número que no
    // aplica no es un request inválido, es un campo que sobra.
    const { servicio, bd } = crearServicio();

    await servicio.configurar(tenantTutor(), 'grupo-1', {
      rendimientos: [
        {
          tipoAccion: TipoAccionRendimiento.ACTIVIDAD,
          origenId: 'actividad-1',
          monedas: 5,
          monedasBonoJefe: 9,
        },
      ],
    });

    expect(bd.rendimientosAccion[0].monedasBonoJefe).toBe(0);
  });

  it('AISLAMIENTO: un origenId que no es del catálogo del grupo da 400 y no escribe nada', async () => {
    const { servicio, bd } = crearServicio();

    await expect(
      servicio.configurar(tenantTutor(), 'grupo-1', {
        rendimientos: [
          {
            tipoAccion: TipoAccionRendimiento.ACTIVIDAD,
            origenId: 'actividad-de-otra-organizacion',
            monedas: 5,
          },
        ],
      })
    ).rejects.toMatchObject({ code: 'ACCION_INEXISTENTE' });

    expect(bd.rendimientosAccion).toHaveLength(0);
  });

  it('una conducta MALA da 400 con su propio code (decisión 17)', async () => {
    const { servicio, bd } = crearServicio({
      conducta: { id: 'conducta-mala', tipo: 'MALA' } as ConductaDto,
    });

    await expect(
      servicio.configurar(tenantTutor(), 'grupo-1', {
        rendimientos: [
          {
            tipoAccion: TipoAccionRendimiento.CONDUCTA,
            origenId: 'conducta-mala',
            monedas: 5,
          },
        ],
      })
    ).rejects.toMatchObject({ code: 'CONDUCTA_MALA_NO_RINDE' });

    expect(bd.rendimientosAccion).toHaveLength(0);
  });

  it('monedas negativas dan 400: lo que se hace nunca debita (decisión 4)', async () => {
    const { servicio, bd } = crearServicio();

    await expect(
      servicio.configurar(tenantTutor(), 'grupo-1', {
        rendimientos: [
          {
            tipoAccion: TipoAccionRendimiento.ACTIVIDAD,
            origenId: 'actividad-1',
            monedas: -5,
          },
        ],
      })
    ).rejects.toMatchObject({ code: 'MONEDAS_INVALIDAS' });

    expect(bd.rendimientosAccion).toHaveLength(0);
  });

  it('deja rastro de auditoría (retrofit fase-09)', async () => {
    const { servicio, eventos } = crearServicio();

    await servicio.configurar(tenantTutor(), 'grupo-1', {
      rendimientos: [
        {
          tipoAccion: TipoAccionRendimiento.ACTIVIDAD,
          origenId: 'actividad-1',
          monedas: 3,
        },
      ],
    });

    expect(eventos.publicarAccionAdministrativa).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'RENDIMIENTOS_ACCIONES_CONFIGURADOS' })
    );
  });

  it('se puede cargar en modo DIRECTO: la configuración no se pierde al cambiar de modo', async () => {
    // Decisión 14 + decisión 10 de fase-14-22. Por eso `configurar` no consulta
    // el modo: cargar es siempre válido, aplicar es lo que depende del modo.
    const { servicio, bd } = crearServicio();

    await servicio.configurar(tenantTutor(), 'grupo-1', {
      rendimientos: [
        {
          tipoAccion: TipoAccionRendimiento.ACTIVIDAD,
          origenId: 'actividad-1',
          monedas: 3,
        },
      ],
    });

    expect(bd.configuraciones).toHaveLength(0);
    expect(bd.rendimientosAccion[0].monedas).toBe(3);
  });
});
