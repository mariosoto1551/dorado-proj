import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { PrincipalType, Rol, TenantContext } from '@dorado/shared-types';

import type { ActivityClientService } from '../clientes/activity-client.service';
import type { IdentityClientService } from '../clientes/identity-client.service';
import type { RewardsClientService } from '../clientes/rewards-client.service';
import type { ContextoHerramienta } from '../comun/acceso-grupo.service';
import { PropuestaNoAplicableException, PropuestaVencidaException } from '../comun/excepciones';
import type { PrismaService } from '../prisma/prisma.service';
import { OperacionPropuesta, PropuestasService } from './propuestas.service';

const CONTEXTO: ContextoHerramienta = { organizacionId: 'org-1', grupoId: 'grupo-1' };

const TENANT: TenantContext = {
  organizacionId: 'org-1',
  grupoIds: ['grupo-1'],
  rol: Rol.TUTOR,
  principalId: 'tutor-1',
  principalType: PrincipalType.TUTOR,
};

const ROL_ID = '11111111-1111-4111-8111-111111111111';

const USUARIO_ID = '22222222-2222-4222-8222-222222222222';

const EQUIPO_ID = '33333333-3333-4333-8333-333333333333';

const ACTIVIDAD_ID = '44444444-4444-4444-8444-444444444444';

const PRODUCTO_ID = '55555555-5555-4555-8555-555555555555';

const CONDUCTA_MALA_ID = '66666666-6666-4666-8666-666666666666';

interface Opciones {
  propuesta?: Record<string, unknown> | null;
}

function crearMocks(opciones: Opciones = {}) {
  const fila = {
    id: 'prop-1',
    conversacionId: 'conv-1',
    grupoId: 'grupo-1',
    tipo: 'CREAR_ACTIVIDADES',
    operaciones: [] as OperacionPropuesta[],
    estado: 'BORRADOR',
    venceEn: new Date(Date.now() + 60_000),
    aplicadaEn: null,
    resultado: null,
    createdAt: new Date(),
    conversacion: { usuarioId: 'tutor-1' },
    ...opciones.propuesta,
  };
  const creadas: Array<Record<string, unknown>> = [];
  const prisma = {
    client: {
      propuesta: {
        create: vi.fn(async (args: { data: Record<string, unknown> }) => {
          creadas.push(args.data);

          return { ...fila, ...args.data, id: 'prop-nueva' };
        }),
        findFirst: vi.fn(async () => (opciones.propuesta === null ? null : fila)),
        findMany: vi.fn(async () => [fila]),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    },
  } as unknown as PrismaService;

  const activity = {
    actividades: vi.fn(async () => [
      { id: ACTIVIDAD_ID, nombre: 'Tender la cama' },
    ]),
    conductas: vi.fn(async () => [
      { id: CONDUCTA_MALA_ID, nombre: 'Gritar', tipo: 'MALA' },
    ]),
  } as unknown as ActivityClientService;

  const identity = {
    roles: vi.fn(async () => [{ id: ROL_ID, nombre: 'cocina', estado: 'ACTIVO' }]),
    participantes: vi.fn(async () => [{ id: USUARIO_ID, nombre: 'Luciana' }]),
    equipos: vi.fn(async () => [{ equipoId: EQUIPO_ID, nombre: 'Cocina', estado: 'ACTIVO' }]),
  } as unknown as IdentityClientService;

  const rewards = {} as unknown as RewardsClientService;

  return {
    prisma,
    activity,
    identity,
    creadas,
    servicio: new PropuestasService(prisma, activity, identity, rewards),
  };
}

function actividadValida(extra: Record<string, unknown> = {}) {
  return {
    nombre: 'Lavar los platos',
    tipoPuntaje: 'OPCIONAL',
    valorPuntos: 5,
    tipoLimiteTiempo: 'SIN_LIMITE',
    ...extra,
  };
}

describe('PropuestasService', () => {
  describe('una operación que no valida NO se guarda (decisión 11)', () => {
    it('rechaza un tipo equivocado y le devuelve al modelo la ruta del campo', async () => {
      const { servicio, prisma } = crearMocks();

      // El criterio de aceptación 6 usa exactamente este ejemplo.
      const resultado = await servicio.armar(
        'proponer_crear_actividades',
        { actividades: [actividadValida({ valorPuntos: 'diez' })] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
      expect((resultado as { error: string }).error).toContain('valorPuntos');
      // Lo importante: NO quedó ninguna fila. Una propuesta a medias es peor
      // que ninguna, porque el Tutor no tiene cómo saber qué falta.
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });

    it('rechaza un rol que no existe en el grupo, sin esperar a que falle al aplicar', async () => {
      const { servicio, prisma } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_crear_actividades',
        {
          actividades: [
            actividadValida({ rolesPermitidos: ['99999999-9999-4999-8999-999999999999'] }),
          ],
        },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
      expect((resultado as { error: string }).error).toContain('no es un rol activo');
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });

    it('rechaza un campo que nadie declaró en vez de ignorarlo en silencio', async () => {
      // Si se descartara callado, la propuesta que ve el Tutor no diría lo que
      // el modelo creyó estar proponiendo.
      const { servicio } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_crear_actividades',
        { actividades: [actividadValida({ prioridad: 'alta' })] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
    });

    it('rechaza combinar dos modos de destinatario (el endpoint destino los prohíbe)', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_crear_actividades',
        {
          actividades: [
            actividadValida({ rolesPermitidos: [ROL_ID], usuariosPermitidos: [USUARIO_ID] }),
          ],
        },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
      expect((resultado as { error: string }).error).toContain('un solo modo de destinatario');
    });

    it('una lista vacía no arma una propuesta sin operaciones', async () => {
      const { servicio, prisma } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_crear_actividades',
        { actividades: [] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });
  });

  describe('lo que se guarda es el request del endpoint destino', () => {
    it('guarda método, ruta y body con la forma exacta que espera activity', async () => {
      const { servicio, creadas } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_crear_actividades',
        { actividades: [actividadValida(), actividadValida({ nombre: 'Sacar la basura' })] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(true);

      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

      // Aplicar tiene que ser un `for` sobre esto, no una traducción.
      expect(operaciones).toHaveLength(2);
      expect(operaciones[0].metodo).toBe('POST');
      expect(operaciones[0].ruta).toBe('/activity/grupos/grupo-1/actividades');
      expect(operaciones[0].body).toEqual(actividadValida());
      // Cada una con su id local, para poder reportar por fila (decisión 13).
      expect(operaciones.map((operacion) => operacion.opId)).toEqual(['op-1', 'op-2']);
      // Y una etiqueta legible: la pantalla no muestra JSON crudo.
      expect(operaciones[0].etiqueta).toContain('Lavar los platos');
    });

    it('vence a las 24 horas (decisión 12)', async () => {
      const { servicio, creadas } = crearMocks();

      await servicio.armar(
        'proponer_crear_actividades',
        { actividades: [actividadValida()] },
        CONTEXTO,
        'conv-1'
      );

      const venceEn = creadas[0]['venceEn'] as Date;
      const horas = (venceEn.getTime() - Date.now()) / (60 * 60 * 1000);

      expect(horas).toBeGreaterThan(23.9);
      expect(horas).toBeLessThan(24.1);
    });

    /**
     * La decisión 6 en su forma más concreta: la propuesta NO se aplica sola.
     * Lo único que pasó acá es que se escribió una fila en `ai_db`.
     */
    it('armar no llama a ningún endpoint de escritura de otro servicio', async () => {
      const { servicio, activity, identity } = crearMocks();

      await servicio.armar(
        'proponer_crear_actividades',
        { actividades: [actividadValida()] },
        CONTEXTO,
        'conv-1'
      );

      // Solo lecturas, y solo para validar referencias.
      expect(activity.actividades).toHaveBeenCalled();
      expect(identity.roles).toHaveBeenCalled();
      expect(Object.keys(activity)).not.toContain('crear');
    });
  });

  describe('editar', () => {
    it('rechaza editar una actividad que no está en este grupo', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_editar_actividades',
        { ediciones: [{ actividadId: USUARIO_ID, valorPuntos: 7 }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
      expect((resultado as { error: string }).error).toContain('no hay ninguna actividad');
    });

    it('rechaza una edición sin ningún campo que cambiar', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_editar_actividades',
        { ediciones: [{ actividadId: ACTIVIDAD_ID }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
      expect((resultado as { error: string }).error).toContain('ningún campo');
    });

    it('arma un PATCH solo con lo que cambia', async () => {
      const { servicio, creadas } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_editar_actividades',
        { ediciones: [{ actividadId: ACTIVIDAD_ID, valorPuntos: 12 }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(true);

      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

      expect(operaciones[0].metodo).toBe('PATCH');
      expect(operaciones[0].ruta).toBe(`/activity/actividades/${ACTIVIDAD_ID}`);
      expect(operaciones[0].body).toEqual({ valorPuntos: 12 });
    });
  });

  describe('precios de tienda', () => {
    /**
     * Desviación registrada: la Parte D de la spec apunta a
     * `/rewards/recompensas/:id`, pero ahí NO hay ningún precio — vive en el
     * ProductoTienda. Con la ruta literal de la spec, aplicar habría fallado
     * siempre.
     */
    it('apunta al producto y no a la recompensa (ahí no hay precio)', async () => {
      const { servicio, creadas } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_precios_tienda',
        { precios: [{ productoId: PRODUCTO_ID, precio: 30 }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(true);

      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

      expect(operaciones[0].ruta).toBe(`/rewards/productos/${PRODUCTO_ID}`);
      expect(operaciones[0].body).toEqual({ precio: 30 });
    });

    it('rechaza un precio de 0 o negativo', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_precios_tienda',
        { precios: [{ productoId: PRODUCTO_ID, precio: 0 }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
    });
  });

  describe('rendimientos en monedas', () => {
    it('rechaza una conducta MALA: lo que se hace nunca debita', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_rendimientos_monedas',
        {
          rendimientos: [
            { tipoAccion: 'CONDUCTA', origenId: CONDUCTA_MALA_ID, monedas: 5 },
          ],
        },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
      expect((resultado as { error: string }).error).toContain('conducta mala');
    });

    it('arma UNA sola operación aunque toque varias acciones', async () => {
      // El PUT del fase-14-28 es un request con todo adentro: la granularidad
      // la define el endpoint destino, no este servicio.
      const { servicio, creadas } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_rendimientos_monedas',
        {
          rendimientos: [{ tipoAccion: 'ACTIVIDAD', origenId: ACTIVIDAD_ID, monedas: 3 }],
        },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(true);

      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

      expect(operaciones).toHaveLength(1);
      expect(operaciones[0].metodo).toBe('PUT');
      expect(operaciones[0].ruta).toBe('/rewards/grupos/grupo-1/rendimientos-acciones');
    });
  });

  describe('ciclo de vida', () => {
    it('una propuesta vencida se puede LEER pero no aplicar (criterio 8)', async () => {
      const { servicio } = crearMocks({
        propuesta: { venceEn: new Date(Date.now() - 60_000) },
      });

      // Legible: el estado se deriva de la fecha, sin ningún job que marque filas.
      const dto = await servicio.detalle(TENANT, 'prop-1');

      expect(dto.estado).toBe('VENCIDA');

      await expect(
        servicio.registrarAplicada(TENANT, 'prop-1', [{ opId: 'op-1', ok: true }])
      ).rejects.toBeInstanceOf(PropuestaVencidaException);
    });

    it('con una operación fallada queda APLICADA_PARCIAL y guarda las tres filas (criterio 7)', async () => {
      const { servicio, prisma } = crearMocks();

      await servicio.registrarAplicada(TENANT, 'prop-1', [
        { opId: 'op-1', ok: true, entidadId: ACTIVIDAD_ID },
        { opId: 'op-2', ok: false, error: 'El nombre ya existe' },
        { opId: 'op-3', ok: true, entidadId: USUARIO_ID },
      ]);

      const datos = vi.mocked(prisma.client.propuesta.updateMany).mock.calls[0][0]
        .data as Record<string, unknown>;

      expect(datos['estado']).toBe('APLICADA_PARCIAL');
      expect(datos['resultado']).toHaveLength(3);
      expect(datos['aplicadaPorUsuarioId']).toBe('tutor-1');
    });

    it('con todas bien queda APLICADA', async () => {
      const { servicio, prisma } = crearMocks();

      await servicio.registrarAplicada(TENANT, 'prop-1', [{ opId: 'op-1', ok: true }]);

      const datos = vi.mocked(prisma.client.propuesta.updateMany).mock.calls[0][0]
        .data as Record<string, unknown>;

      expect(datos['estado']).toBe('APLICADA');
    });

    it('una propuesta ya aplicada no se vuelve a aplicar ni se descarta', async () => {
      const { servicio } = crearMocks({ propuesta: { estado: 'APLICADA' } });

      await expect(
        servicio.registrarAplicada(TENANT, 'prop-1', [{ opId: 'op-1', ok: true }])
      ).rejects.toBeInstanceOf(PropuestaNoAplicableException);
      await expect(servicio.descartar(TENANT, 'prop-1')).rejects.toBeInstanceOf(
        PropuestaNoAplicableException
      );
    });

    it('la propuesta de otro usuario devuelve 404, no 403', async () => {
      const { servicio } = crearMocks({
        propuesta: { conversacion: { usuarioId: 'otro-tutor' } },
      });

      await expect(servicio.detalle(TENANT, 'prop-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
