import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi, type Mock } from 'vitest';

import {
  esPropuestaDestructiva,
  PrincipalType,
  Rol,
  TenantContext,
  TIPOS_PROPUESTA_CON_BORRADO,
  type OperacionPropuestaIaDto,
  type TipoPropuestaIa,
} from '@dorado/shared-types';

import type { ActivityClientService } from '../clientes/activity-client.service';
import type { IdentityClientService } from '../clientes/identity-client.service';
import type { RewardsClientService } from '../clientes/rewards-client.service';
import type { ScoringClientService } from '../clientes/scoring-client.service';
import type { ContextoHerramienta } from '../comun/acceso-grupo.service';
import { PropuestaNoAplicableException, PropuestaVencidaException } from '../comun/excepciones';
import type { PrismaService } from '../prisma/prisma.service';
import { NOMBRES_HERRAMIENTAS_PROPUESTA } from './definiciones-propuesta';
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

const ACTIVIDAD_OPCIONAL_ID = '77777777-7777-4777-8777-777777777777';

const OTRO_USUARIO_ID = '88888888-8888-4888-8888-888888888888';

/** fase-14-31: las marcas de hoy, que solo salen de `estado_de_hoy`. */
const REGISTRO_COMPLETADA_ID = '99999999-9999-4999-8999-999999999999';

const REGISTRO_NO_HIZO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/** El único participante que no está en ningún equipo (fase-14-30 tanda 7). */
const SIN_EQUIPO_ID = '77777777-8888-4999-8aaa-bbbbbbbbbbbb';

const ROL_ARCHIVADO_ID = '66666666-7777-4888-8999-aaaaaaaaaaaa';

const RECOMPENSA_ID = '99999999-9999-4999-8999-999999999999';

const CASTIGO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const BOLSA_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const ETIQUETA_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/** La zona más alta de la escala de prueba, la que no tiene techo. */
const UMBRAL_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const UMBRAL_VERDE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

/**
 * La escala del seed: cuatro zonas contiguas y la más alta sin techo. Es una
 * escala REAL y no dos filas de mentira porque la familia escala se valida como
 * conjunto — con dos zonas sueltas, la mitad de las reglas no se ejercería.
 */
const ESCALA = [
  {
    id: '11111111-aaaa-4aaa-8aaa-111111111111',
    nombreZona: 'Rojo',
    orden: 1,
    puntosMin: 0,
    puntosMax: 20,
    colorHex: '#EF4444',
  },
  {
    id: '22222222-aaaa-4aaa-8aaa-222222222222',
    nombreZona: 'Amarillo',
    orden: 2,
    puntosMin: 21,
    puntosMax: 40,
    colorHex: '#F59E0B',
  },
  {
    id: UMBRAL_VERDE_ID,
    nombreZona: 'Verde',
    orden: 3,
    puntosMin: 41,
    puntosMax: 60,
    colorHex: '#22C55E',
  },
  {
    id: UMBRAL_ID,
    nombreZona: 'Dorado',
    orden: 4,
    puntosMin: 61,
    puntosMax: null as number | null,
    colorHex: '#EAB308',
  },
];

/** Una zona de la escala de prueba, entera, como la manda el modelo. */
function zona(id: string, cambios: Record<string, unknown> = {}) {
  const actual = ESCALA.find((fila) => fila.id === id);

  if (!actual) {
    throw new Error(`No existe la zona "${id}" en la escala de prueba.`);
  }

  return {
    umbralZonaId: actual.id,
    nombreZona: actual.nombreZona,
    orden: actual.orden,
    puntosMin: actual.puntosMin,
    puntosMax: actual.puntosMax,
    colorHex: actual.colorHex,
    ...cambios,
  };
}

interface Opciones {
  propuesta?: Record<string, unknown> | null;
  /** Pisa los campos de la actividad rotable, para los casos de turnos. */
  actividad?: Record<string, unknown>;
  /** Pisa el modo de recompensas del grupo (TIENDA por defecto). */
  configuracion?: Record<string, unknown>;
  /** `null` = scoring no contestó el resumen de puntajes (para el aviso). */
  resumenPuntajes?: Record<string, unknown> | null;
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
      {
        id: ACTIVIDAD_ID,
        nombre: 'Tender la cama',
        tipoPuntaje: 'OBLIGATORIA',
        alcance: 'INDIVIDUAL',
        usuariosPermitidos: [] as string[],
        ...opciones.actividad,
      },
      {
        id: ACTIVIDAD_OPCIONAL_ID,
        nombre: 'Leer un rato',
        tipoPuntaje: 'OPCIONAL',
        alcance: 'INDIVIDUAL',
        usuariosPermitidos: [] as string[],
      },
    ]),
    conductas: vi.fn(async () => [
      {
        id: CONDUCTA_MALA_ID,
        nombre: 'Gritar',
        tipo: 'MALA',
        valorPuntos: 5,
        permiteAutoreporte: false,
        estado: 'ACTIVA',
      },
    ]),
    turnos: vi.fn(async () => [] as Array<{ actividadId: string }>),
    // fase-14-31: la sesión de hoy, con una marca viva de cada clase — es la
    // única fuente posible de un `registroId` (decisión 1 del #30).
    estadoDeHoy: vi.fn(async () => ({
      sesionAbierta: true,
      participantes: [
        {
          usuarioId: USUARIO_ID,
          nombre: 'Luciana',
          actividades: [
            {
              actividadId: ACTIVIDAD_OPCIONAL_ID,
              nombre: 'Leer un rato',
              tipoPuntaje: 'OPCIONAL',
              valorPuntos: 5,
              vecesHechas: 0,
              vecesQueAdmite: 1,
              puedeMarcarHizo: true,
              puedeMarcarNoHizo: false,
              motivoNoDisponible: null,
            },
            {
              actividadId: ACTIVIDAD_ID,
              nombre: 'Tender la cama',
              tipoPuntaje: 'OBLIGATORIA',
              valorPuntos: 10,
              vecesHechas: 0,
              vecesQueAdmite: 0,
              puedeMarcarHizo: false,
              puedeMarcarNoHizo: true,
              motivoNoDisponible: 'hoy no es uno de sus días',
            },
          ],
          marcas: [
            {
              registroId: REGISTRO_COMPLETADA_ID,
              tipo: 'COMPLETADA',
              descripcion: '«Leer un rato» hecha',
              puntos: 5,
            },
            {
              registroId: REGISTRO_NO_HIZO_ID,
              tipo: 'NO_HIZO',
              descripcion: '«Tender la cama» marcada como no hecha',
              puntos: -10,
            },
          ],
        },
      ],
    })),
  } as unknown as ActivityClientService;

  const identity = {
    roles: vi.fn(async () => [
      { id: ROL_ID, nombre: 'cocina', colorHex: '#22C55E', estado: 'ACTIVO' },
      { id: ROL_ARCHIVADO_ID, nombre: 'mudanza', colorHex: '#EF4444', estado: 'INACTIVO' },
    ]),
    // Dos ya están en el equipo que existe y el tercero está libre: la regla
    // que más rechaza en esta familia es «una persona, un solo equipo».
    participantes: vi.fn(async () => [
      { id: USUARIO_ID, nombre: 'Luciana', rolGrupo: { id: ROL_ID, nombre: 'cocina' } },
      { id: OTRO_USUARIO_ID, nombre: 'Alejandra', rolGrupo: null },
      { id: SIN_EQUIPO_ID, nombre: 'Martín', rolGrupo: null },
    ]),
    equipos: vi.fn(async () => [
      {
        equipoId: EQUIPO_ID,
        nombre: 'Cocina',
        estado: 'ACTIVO',
        jefeUsuarioId: USUARIO_ID,
        miembros: [
          { usuarioId: USUARIO_ID, rol: 'JEFE' },
          { usuarioId: OTRO_USUARIO_ID, rol: 'MIEMBRO' },
        ],
      },
    ]),
  } as unknown as IdentityClientService;

  const rewards = {
    tienda: vi.fn(async () => ({
      productos: [
        {
          id: PRODUCTO_ID,
          nombre: 'Helado',
          descripcion: null,
          precio: 20,
          fuente: 'ITEM',
          mecanica: 'ELECCION',
          recompensaId: RECOMPENSA_ID,
          bolsaId: null,
          estado: 'ACTIVA',
        },
      ],
      bolsas: [
        {
          id: BOLSA_ID,
          nombre: 'Bolsa de golosinas',
          recompensaIds: [RECOMPENSA_ID],
          estado: 'ACTIVA',
        },
      ],
    })),
    recompensas: vi.fn(async () => [
      { id: RECOMPENSA_ID, nombre: 'Una hora de tele', tipo: 'PREMIO', estado: 'ACTIVA' },
      { id: CASTIGO_ID, nombre: 'Sin postre', tipo: 'CASTIGO', estado: 'ACTIVA' },
    ]),
    etiquetas: vi.fn(async () => [
      { id: ETIQUETA_ID, nombre: 'Dulces', colorHex: '#EF4444', estado: 'ACTIVA' },
    ]),
    // El modo por defecto es TIENDA: en DIRECTO la zona es obligatoria y eso
    // se prueba aparte, pisándolo.
    configuracion: vi.fn(async () => ({ modo: 'TIENDA', ...opciones.configuracion })),
    // fase-14-31: los saldos, que son lo único que puede rechazar un ajuste de
    // monedas. Luciana tiene 30 y Alejandra 0 — la de saldo 0 es la que hace
    // que el chequeo del descuento se ejercite con un caso real.
    billeteras: vi.fn(async () => ({
      nombreMoneda: 'estrellas',
      iconoMoneda: '⭐',
      participantes: [
        {
          usuarioId: USUARIO_ID,
          nombre: 'Luciana',
          saldo: 30,
          objetivoNombre: null,
          objetivoFaltan: null,
        },
        {
          usuarioId: OTRO_USUARIO_ID,
          nombre: 'Alejandra',
          saldo: 0,
          objetivoNombre: null,
          objetivoFaltan: null,
        },
      ],
    })),
  } as unknown as RewardsClientService;

  const scoring = {
    umbrales: vi.fn(async () => ESCALA),
    configuracion: vi.fn(async () => ({ puntosIniciales: 100 })),
    // Tres participantes en tres zonas distintas: el que está arriba de todo es
    // el que se mueve cuando la escala se parte en dos.
    resumenPuntajes: vi.fn(async () =>
      opciones.resumenPuntajes === null
        ? null
        : {
            grupoId: 'grupo-1',
            seccionId: 'sec-1',
            origen: 'EN_VIVO',
            puntajes: [
              { usuarioId: USUARIO_ID, puntajeTotal: 15, nombreZona: 'Rojo', descalificado: false },
              {
                usuarioId: OTRO_USUARIO_ID,
                puntajeTotal: 55,
                nombreZona: 'Verde',
                descalificado: false,
              },
              {
                usuarioId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
                puntajeTotal: 90,
                nombreZona: 'Dorado',
                descalificado: false,
              },
            ],
            ...opciones.resumenPuntajes,
          }
    ),
  } as unknown as ScoringClientService;

  return {
    prisma,
    activity,
    identity,
    rewards,
    scoring,
    creadas,
    servicio: new PropuestasService(prisma, activity, identity, rewards, scoring),
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

  describe('conductas (fase-14-30 tanda 4)', () => {
    it('arma el POST con la forma exacta del request de activity', async () => {
      const { servicio, creadas } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_crear_conductas',
        { conductas: [{ nombre: 'Ayudar sin que se lo pidan', tipo: 'BUENA', valorPuntos: 4 }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(true);

      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

      expect(operaciones[0].metodo).toBe('POST');
      expect(operaciones[0].ruta).toBe('/activity/grupos/grupo-1/conductas');
      expect(operaciones[0].body).toEqual({
        nombre: 'Ayudar sin que se lo pidan',
        tipo: 'BUENA',
        valorPuntos: 4,
      });
      expect(operaciones[0].etiqueta).toContain('Ayudar sin que se lo pidan');
    });

    /**
     * El caso que decide cómo se limpia el request de una conducta, y que sin
     * este test se descubriría con el modelo quemando el loop contra un error
     * que no puede resolver.
     *
     * **El modelo no puede omitir una propiedad declarada**: en una edición de
     * un solo campo manda los otros tres en `null`. En una actividad ese `null`
     * significa «borrá el campo» (fase-14-24) y se conserva; en una conducta no
     * hay ni un campo anulable, así que solo puede significar «no lo puse».
     */
    it('una edición con los campos que no cambian en null no falla', async () => {
      const { servicio, creadas } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_editar_conductas',
        {
          ediciones: [
            {
              conductaId: CONDUCTA_MALA_ID,
              nombre: null,
              tipo: null,
              valorPuntos: 8,
              permiteAutoreporte: null,
            },
          ],
        },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(true);

      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

      expect(operaciones[0].metodo).toBe('PATCH');
      expect(operaciones[0].ruta).toBe(`/activity/conductas/${CONDUCTA_MALA_ID}`);
      // Solo lo que de verdad cambia: un PATCH con tres nulls habría borrado el
      // nombre de la conducta al aplicarse.
      expect(operaciones[0].body).toEqual({ valorPuntos: 8 });
    });

    /** Criterio 2 del fase-14-30, sobre `conductaId`. */
    it('un conductaId que no es de este grupo NO crea propuesta', async () => {
      const { servicio, prisma } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_editar_conductas',
        { ediciones: [{ conductaId: ACTIVIDAD_ID, valorPuntos: 8 }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
      expect((resultado as { error: string }).error).toContain('conductaId');
      // Le dice qué llamar, no solo que se equivocó.
      expect((resultado as { error: string }).error).toContain('listar_conductas');
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });

    it('rechaza un valorPuntos negativo: el signo lo aplica el registro', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_crear_conductas',
        { conductas: [{ nombre: 'Gritar', tipo: 'MALA', valorPuntos: -5 }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
      expect((resultado as { error: string }).error).toContain('valorPuntos');
    });
  });

  describe('turnos (fase-14-30 tanda 4)', () => {
    it('convierte la lista plana del modelo en el request destino, con repetidos y en orden', async () => {
      const { servicio, creadas } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_configurar_turnos',
        {
          turnos: [
            {
              actividadId: ACTIVIDAD_ID,
              modo: 'ORDEN_FIJO',
              frecuencia: 'SESION',
              // El repetido es deliberado (fase-14-21): así se le dan más
              // turnos a uno que a otro. Un armador que "limpie" duplicados
              // rompería ese ítem sin que nada más se queje.
              posiciones: [USUARIO_ID, OTRO_USUARIO_ID, USUARIO_ID],
            },
          ],
        },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(true);

      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

      expect(operaciones[0].metodo).toBe('PUT');
      expect(operaciones[0].ruta).toBe(`/activity/actividades/${ACTIVIDAD_ID}/turno`);
      expect(operaciones[0].body).toEqual({
        modo: 'ORDEN_FIJO',
        frecuencia: 'SESION',
        posiciones: [
          { usuarioId: USUARIO_ID },
          { usuarioId: OTRO_USUARIO_ID },
          { usuarioId: USUARIO_ID },
        ],
      });
      expect(operaciones[0].etiqueta).toContain('Tender la cama');
    });

    it('rechaza rotar una actividad OPCIONAL, como haría el endpoint destino', async () => {
      const { servicio, prisma } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_configurar_turnos',
        {
          turnos: [
            {
              actividadId: ACTIVIDAD_OPCIONAL_ID,
              modo: 'AZAR',
              frecuencia: 'SECCION',
              posiciones: [USUARIO_ID],
            },
          ],
        },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
      expect((resultado as { error: string }).error).toContain('OBLIGATORIA');
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });

    it('rechaza una posición que no es participante del grupo', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_configurar_turnos',
        {
          turnos: [
            {
              actividadId: ACTIVIDAD_ID,
              modo: 'ORDEN_FIJO',
              frecuencia: 'SESION',
              posiciones: [USUARIO_ID, ROL_ID],
            },
          ],
        },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
      expect((resultado as { error: string }).error).toContain('no es un participante');
    });

    /**
     * fase-14-24 decisión 6: si la actividad está dirigida a personas concretas,
     * el pozo de la rotación sale de ahí. Cargar a alguien que no la ve le daría
     * un turno que su pantalla nunca le muestra —y el castigo caería igual.
     */
    it('rechaza una posición que está fuera del destinatario nominal', async () => {
      const { servicio } = crearMocks({ actividad: { usuariosPermitidos: [USUARIO_ID] } });

      const resultado = await servicio.armar(
        'proponer_configurar_turnos',
        {
          turnos: [
            {
              actividadId: ACTIVIDAD_ID,
              modo: 'ORDEN_FIJO',
              frecuencia: 'SESION',
              posiciones: [USUARIO_ID, OTRO_USUARIO_ID],
            },
          ],
        },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
      expect((resultado as { error: string }).error).toContain('dirigida');
    });

    it('una secuencia vacía no se guarda', async () => {
      const { servicio, prisma } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_configurar_turnos',
        {
          turnos: [
            {
              actividadId: ACTIVIDAD_ID,
              modo: 'ORDEN_FIJO',
              frecuencia: 'SESION',
              posiciones: [],
            },
          ],
        },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });
  });

  /**
   * CRITERIO DE ACEPTACIÓN 4 del fase-14-31 (decisión 1): **`DELETE` solo
   * aparece en los tipos de `TIPOS_PROPUESTA_CON_BORRADO`.**
   *
   * Era el criterio 3 del #30 —*ninguna operación de ninguna propuesta usa
   * `DELETE`*— y **no se borró: se invirtió**. Aquella decisión era correcta
   * cuando se escribió (el #30 era sobre configurar un grupo, y archivar no es
   * configurar); lo que la volvió chica no fue un error suyo sino que el
   * asistente pasó de armar grupos a acompañarlos.
   *
   * Que quede como lista blanca y no como nada es el punto: un `DELETE` en la
   * familia de crear actividades sigue poniendo esto en rojo. Y la tabla se
   * compara contra el catálogo, así que agregar una herramienta y olvidarse de
   * pasarla por acá también.
   */
  describe('DELETE solo donde está declarado (fase-14-31 decisión 1)', () => {
    const ARGUMENTOS: Record<string, Record<string, unknown>> = {
      proponer_crear_actividades: { actividades: [actividadValida()] },
      proponer_editar_actividades: { ediciones: [{ actividadId: ACTIVIDAD_ID, valorPuntos: 12 }] },
      proponer_crear_conductas: {
        conductas: [{ nombre: 'Gritar', tipo: 'MALA', valorPuntos: 5 }],
      },
      proponer_editar_conductas: { ediciones: [{ conductaId: CONDUCTA_MALA_ID, valorPuntos: 8 }] },
      proponer_configurar_turnos: {
        turnos: [
          {
            actividadId: ACTIVIDAD_ID,
            modo: 'ORDEN_FIJO',
            frecuencia: 'SESION',
            posiciones: [USUARIO_ID],
          },
        ],
      },
      proponer_crear_recompensas: {
        recompensas: [{ tipo: 'PREMIO', nombre: 'Una hora de tele' }],
      },
      proponer_editar_recompensas: {
        ediciones: [{ recompensaId: RECOMPENSA_ID, nombre: 'Dos horas de tele' }],
      },
      proponer_crear_productos: {
        productos: [
          { nombre: 'Helado', precio: 30, fuente: 'ITEM', recompensaId: RECOMPENSA_ID },
        ],
      },
      proponer_editar_productos: { ediciones: [{ productoId: PRODUCTO_ID, precio: 30 }] },
      proponer_etiquetas: { crear: [{ nombre: 'Dulces', colorHex: '#22C55E' }] },
      proponer_rendimientos_monedas: {
        rendimientos: [{ tipoAccion: 'ACTIVIDAD', origenId: ACTIVIDAD_ID, monedas: 3 }],
      },
      proponer_umbrales_zona: { puntosIniciales: 50 },
      proponer_roles_grupo: { crear: [{ nombre: 'mascotas', colorHex: '#22C55E' }] },
      proponer_equipos: {
        crear: [
          { nombre: 'Cocina', jefeParticipanteId: SIN_EQUIPO_ID, participantesIds: [] },
        ],
      },
      // fase-14-31: las dos que SÍ pueden llevar DELETE. Entran a la misma
      // tabla que el resto justamente para que la lista blanca se verifique
      // sobre ellas y no solo sobre las que nunca borran.
      proponer_archivar: { items: [{ tipo: 'ACTIVIDAD', id: ACTIVIDAD_ID }] },
      proponer_quitar_marcas: {
        marcas: [{ registroId: REGISTRO_COMPLETADA_ID, tipo: 'COMPLETADA' }],
      },
      proponer_ajustes_manuales: {
        ajustes: [{ participanteId: USUARIO_ID, puntos: 10, motivo: 'ayudó con la mudanza' }],
      },
      proponer_anotar: {
        anotaciones: [{ participanteId: USUARIO_ID, tipo: 'HIZO', id: ACTIVIDAD_OPCIONAL_ID }],
      },
    };

    it('la tabla cubre TODAS las herramientas de propuesta del catálogo', () => {
      expect(Object.keys(ARGUMENTOS).sort()).toEqual([...NOMBRES_HERRAMIENTAS_PROPUESTA].sort());
    });

    it.each(Object.keys(ARGUMENTOS))('%s no arma un DELETE fuera de su tipo', async (nombre) => {
      const { servicio, creadas } = crearMocks();

      const resultado = await servicio.armar(nombre, ARGUMENTOS[nombre], CONTEXTO, 'conv-1');

      expect(resultado, `"${nombre}" tendría que armar una propuesta válida`).toMatchObject({
        ok: true,
      });

      const tipo = creadas[0]['tipo'] as TipoPropuestaIa;
      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];
      const permitidos = TIPOS_PROPUESTA_CON_BORRADO.includes(tipo)
        ? ['POST', 'PATCH', 'PUT', 'DELETE']
        : ['POST', 'PATCH', 'PUT'];

      expect(operaciones.length).toBeGreaterThan(0);

      for (const operacion of operaciones) {
        expect(permitidos, `${nombre} → ${operacion.ruta}`).toContain(operacion.metodo);
      }
    });

    /**
     * El otro extremo de la lista blanca: que no se le pueda agregar un tipo
     * «por las dudas». Cada uno de los tres está por un motivo escrito en la
     * spec, y sumar un cuarto tiene que costar tocar este test.
     */
    it('la lista blanca tiene exactamente los tres tipos que la spec declara', () => {
      expect([...TIPOS_PROPUESTA_CON_BORRADO].sort()).toEqual([
        'ARCHIVAR_CATALOGO',
        'QUITAR_MARCAS',
        'UMBRALES_ZONA',
      ]);
    });
  });

  /**
   * FAMILIA DESTRUCTIVA (fase-14-31 tanda 4).
   *
   * Lo que estos tests cuidan no es que el `DELETE` salga —eso es una línea—
   * sino las dos cosas que hacen que un borrado propuesto por un modelo sea
   * aprobable: que el id **sea de la entidad que dice ser** (decisión 2 del
   * #30, y acá el error se descubre cuando la cosa ya no está) y que la
   * etiqueta **diga qué se pierde y qué no** (decisión 2 de este ítem).
   */
  describe('archivar del catálogo', () => {
    it('arma un DELETE contra la ruta de la entidad, con lo que NO se pierde en la etiqueta', async () => {
      const { servicio, creadas } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_archivar',
        { items: [{ tipo: 'ACTIVIDAD', id: ACTIVIDAD_ID }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: true });

      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

      expect(operaciones[0]).toMatchObject({
        metodo: 'DELETE',
        ruta: `/activity/actividades/${ACTIVIDAD_ID}`,
        body: null,
      });
      // Un Tutor que cree que archivar borra los puntos no aprieta nunca.
      expect(operaciones[0].etiqueta).toContain('los puntos que dio quedan');
    });

    it('un id real de OTRA entidad no crea propuesta', async () => {
      const { servicio, prisma } = crearMocks();

      // El id existe —es una actividad— pero se declara como conducta. Sin esta
      // validación, el DELETE saldría contra `/activity/conductas/:id` y el 404
      // aparecería recién con el Tutor mirando.
      const resultado = await servicio.armar(
        'proponer_archivar',
        { items: [{ tipo: 'CONDUCTA', id: ACTIVIDAD_ID }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: false });
      expect((resultado as { error: string }).error).toContain('listar_conductas');
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });

    it('sacarle la rotación a una actividad que no rota no crea propuesta', async () => {
      const { servicio } = crearMocks();

      // `turnos` viene vacío en los mocks: no hay rotación que sacar, y el
      // DELETE no haría nada. Proponer un no-op es peor que rechazarlo.
      const resultado = await servicio.armar(
        'proponer_archivar',
        { items: [{ tipo: 'TURNO', id: ACTIVIDAD_ID }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: false });
    });
  });

  describe('quitar marcas de hoy', () => {
    it('quitar una completada es DELETE con el motivo en la query, no en el body', async () => {
      const { servicio, creadas } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_quitar_marcas',
        {
          marcas: [
            { registroId: REGISTRO_COMPLETADA_ID, tipo: 'COMPLETADA', motivo: 'no la hizo' },
          ],
        },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: true });

      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

      // fase-14-12: un DELETE con cuerpo pasa por intermediarios que tienen
      // derecho a descartarlo, y el Gateway es uno.
      expect(operaciones[0].metodo).toBe('DELETE');
      expect(operaciones[0].ruta).toContain('motivo=no%20la%20hizo');
      expect(operaciones[0].body).toBeNull();
      expect(operaciones[0].etiqueta).toContain('pierde');
    });

    it('deshacer un «no hizo» es POST a revertir, y la etiqueta dice que RECUPERA', async () => {
      const { servicio, creadas } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_quitar_marcas',
        { marcas: [{ registroId: REGISTRO_NO_HIZO_ID, tipo: 'NO_HIZO' }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: true });

      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

      // Las dos correcciones tienen sentidos OPUESTOS y la etiqueta es lo único
      // que lo dice: aprobar una creyendo que es la otra es el error a evitar.
      expect(operaciones[0].metodo).toBe('POST');
      expect(operaciones[0].ruta).toBe(`/activity/registros-actividad/${REGISTRO_NO_HIZO_ID}/revertir`);
      expect(operaciones[0].etiqueta).toContain('recupera los puntos');
    });

    it('el tipo equivocado sobre un registroId real no crea propuesta', async () => {
      const { servicio, prisma } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_quitar_marcas',
        { marcas: [{ registroId: REGISTRO_COMPLETADA_ID, tipo: 'NO_HIZO' }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: false });
      expect((resultado as { error: string }).error).toContain('COMPLETADA');
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });

    it('sin sesión abierta no se arma nada, y el error lo explica', async () => {
      const { servicio, activity, prisma } = crearMocks();

      (activity.estadoDeHoy as unknown as Mock).mockResolvedValue({
        sesionAbierta: false,
        participantes: [],
      });

      const resultado = await servicio.armar(
        'proponer_quitar_marcas',
        { marcas: [{ registroId: REGISTRO_COMPLETADA_ID, tipo: 'COMPLETADA' }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: false });
      expect((resultado as { error: string }).error).toContain('sesión abierta');
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });
  });

  /**
   * FAMILIA DE AJUSTES (fase-14-31 tanda 5).
   *
   * Lo que estos tests cuidan es que **una fila del modelo se parta en los dos
   * requests correctos y en ninguno más**: puntos a scoring, monedas a rewards,
   * el mismo motivo en los dos, y ningún número derivado del otro (decisión 1
   * del #28). Más las dos reglas del destino que si no se replican acá aparecen
   * recién cuando el Tutor aprieta «Aplicar».
   */
  describe('ajustes manuales de puntos y monedas', () => {
    it('una fila con los dos números arma dos operaciones, una por servicio', async () => {
      const { servicio, creadas } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_ajustes_manuales',
        {
          ajustes: [
            {
              participanteId: USUARIO_ID,
              puntos: 10,
              monedas: 5,
              motivo: 'ayudó con la mudanza',
            },
          ],
        },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: true });

      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

      expect(creadas[0]['tipo']).toBe('AJUSTES_MANUALES');
      expect(operaciones).toHaveLength(2);
      // El body de cada uno es el request LITERAL de su endpoint, con el nombre
      // del número que usa ese contrato: `puntos` en scoring, `monto` en
      // rewards. Aplicar es un `for`, no una traducción.
      expect(operaciones[0]).toMatchObject({
        metodo: 'POST',
        ruta: `/scoring/grupos/grupo-1/usuarios/${USUARIO_ID}/ajuste`,
        body: { puntos: 10, motivo: 'ayudó con la mudanza' },
      });
      expect(operaciones[1]).toMatchObject({
        metodo: 'POST',
        ruta: `/rewards/grupos/grupo-1/usuarios/${USUARIO_ID}/ajuste`,
        body: { monto: 5, motivo: 'ayudó con la mudanza' },
      });
      // El signo explícito y el saldo resultante: «+5 estrellas» sin saber con
      // cuántas queda no alcanza para aprobar un movimiento manual.
      expect(operaciones[0].etiqueta).toContain('+10 puntos');
      expect(operaciones[1].etiqueta).toContain('+5 estrellas');
      expect(operaciones[1].etiqueta).toContain('queda con 35');
    });

    it('solo monedas no consulta la sesión: ese ledger no vive en una sección', async () => {
      const { servicio, activity, creadas } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_ajustes_manuales',
        { ajustes: [{ participanteId: USUARIO_ID, monedas: -10, motivo: 'rompió el vidrio' }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: true });
      expect(activity.estadoDeHoy).not.toHaveBeenCalled();

      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

      expect(operaciones).toHaveLength(1);
      expect(operaciones[0].etiqueta).toContain('-10 estrellas');
      expect(operaciones[0].etiqueta).toContain('queda con 20');
    });

    /** Criterio de aceptación 10 de la spec. */
    it('un descuento que deja el saldo bajo 0 NO crea propuesta', async () => {
      const { servicio, prisma } = crearMocks();

      // Alejandra tiene 0: cualquier descuento la deja en negativo, que es lo
      // único que el endpoint destino rechaza (#22 decisión 4).
      const resultado = await servicio.armar(
        'proponer_ajustes_manuales',
        { ajustes: [{ participanteId: OTRO_USUARIO_ID, monedas: -5, motivo: 'llegó tarde' }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: false });
      // El error le dice al modelo cuánto se puede sacar, no solo que no se puede.
      expect((resultado as { error: string }).error).toContain('lo máximo');
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });

    it('sin saldos leídos tampoco se propone un descuento, pero sí una acreditación', async () => {
      const { servicio, rewards } = crearMocks();

      (rewards.billeteras as unknown as Mock).mockResolvedValue(null);

      const descuento = await servicio.armar(
        'proponer_ajustes_manuales',
        { ajustes: [{ participanteId: USUARIO_ID, monedas: -5, motivo: 'llegó tarde' }] },
        CONTEXTO,
        'conv-1'
      );

      // Suponer que hay de sobra es justo el error que la lectura vino a evitar.
      expect(descuento).toMatchObject({ ok: false });

      const acreditacion = await servicio.armar(
        'proponer_ajustes_manuales',
        { ajustes: [{ participanteId: USUARIO_ID, monedas: 5, motivo: 'ayudó' }] },
        CONTEXTO,
        'conv-1'
      );

      // Sumar no puede dejar a nadie en negativo: no hay nada que validar.
      expect(acreditacion).toMatchObject({ ok: true });
    });

    it('un ajuste de puntos sin sesión abierta no se propone (409 asegurado)', async () => {
      const { servicio, activity, prisma } = crearMocks();

      (activity.estadoDeHoy as unknown as Mock).mockResolvedValue({
        sesionAbierta: false,
        participantes: [],
      });

      const resultado = await servicio.armar(
        'proponer_ajustes_manuales',
        { ajustes: [{ participanteId: USUARIO_ID, puntos: 10, motivo: 'ayudó' }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: false });
      // El error ofrece la salida que sí funciona hoy.
      expect((resultado as { error: string }).error).toContain('monedas');
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });

    /**
     * EL DEFECTO DEL PILOTO (2026-08-06), y el más caro de los que encontró el
     * ítem: con la sesión abierta y todo bien, *«ajustá el puntaje de todos a
     * 100»* no armaba ninguna propuesta.
     *
     * El modelo mandó `monedas: 0` —su forma de decir «acá no hay monedas»,
     * porque **no puede omitir una propiedad del esquema**— y el armador lo leyó
     * como «un ajuste de 0 monedas», que el esquema de rewards rechaza. Peor: el
     * error (*«monto no puede ser 0»*) no le decía cuál era la salida, así que
     * reintentó **seis veces lo mismo** hasta agotar el loop.
     *
     * Estos tres tests fijan que `0` es «no lo puse», igual que `null`.
     */
    it('`monedas: 0` es «sin monedas»: arma solo el ajuste de puntos', async () => {
      const { servicio, creadas } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_ajustes_manuales',
        {
          ajustes: [
            { participanteId: USUARIO_ID, puntos: 120, monedas: 0, motivo: 'lo dejamos en 100' },
          ],
        },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: true });

      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

      // Una sola operación, y contra scoring: el 0 no llegó a ser un request.
      expect(operaciones).toHaveLength(1);
      expect(operaciones[0]).toMatchObject({
        ruta: `/scoring/grupos/grupo-1/usuarios/${USUARIO_ID}/ajuste`,
        body: { puntos: 120, motivo: 'lo dejamos en 100' },
      });
    });

    it('`puntos: 0` es «sin puntos»: arma solo el ajuste de monedas', async () => {
      const { servicio, creadas, activity } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_ajustes_manuales',
        { ajustes: [{ participanteId: USUARIO_ID, puntos: 0, monedas: 5, motivo: 'ayudó' }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: true });

      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

      expect(operaciones).toHaveLength(1);
      expect(operaciones[0].ruta).toBe(`/rewards/grupos/grupo-1/usuarios/${USUARIO_ID}/ajuste`);
      // Y sin ajuste de puntos no se consulta la sesión, igual que cuando el
      // campo no viene: el 0 se normaliza ANTES de decidir eso.
      expect(activity.estadoDeHoy).not.toHaveBeenCalled();
    });

    it('los dos números en 0 no crean propuesta, y el error dice qué falta', async () => {
      const { servicio, prisma } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_ajustes_manuales',
        { ajustes: [{ participanteId: USUARIO_ID, puntos: 0, monedas: 0, motivo: 'nada' }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: false });
      // El error accionable —«mandá al menos uno»— y no el del esquema del
      // endpoint destino, que le hablaría al modelo de un campo (`monto`) que
      // él nunca nombró.
      expect((resultado as { error: string }).error).toContain('sin ningún número');
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });

    it('una fila sin ningún número no crea propuesta', async () => {
      const { servicio } = crearMocks();

      // El modelo no puede omitir una propiedad del esquema y manda `null`: es
      // lo mismo que no mandarla, y lo que queda es una fila que no ajusta nada.
      const resultado = await servicio.armar(
        'proponer_ajustes_manuales',
        { ajustes: [{ participanteId: USUARIO_ID, puntos: null, monedas: null, motivo: 'algo' }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: false });
      expect((resultado as { error: string }).error).toContain('monedas');
    });

    it('el motivo es obligatorio: un movimiento manual sin explicación es inauditable', async () => {
      const { servicio, prisma } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_ajustes_manuales',
        { ajustes: [{ participanteId: USUARIO_ID, puntos: 10 }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: false });
      expect((resultado as { error: string }).error).toContain('motivo');
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });

    it('dos filas para la misma persona no se guardan: el chequeo de saldo dejaría de cerrar', async () => {
      const { servicio, prisma } = crearMocks();

      // Cada una sola pasa el chequeo (30 - 20 = 10); las dos juntas dejan el
      // saldo en -10 y ninguna se habría dado cuenta.
      const resultado = await servicio.armar(
        'proponer_ajustes_manuales',
        {
          ajustes: [
            { participanteId: USUARIO_ID, monedas: -20, motivo: 'rompió el vidrio' },
            { participanteId: USUARIO_ID, monedas: -20, motivo: 'y la ventana' },
          ],
        },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: false });
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });

    it('un participante de otro grupo no crea propuesta', async () => {
      const { servicio, prisma } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_ajustes_manuales',
        {
          ajustes: [
            {
              participanteId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
              puntos: 10,
              motivo: 'ayudó',
            },
          ],
        },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: false });
      expect((resultado as { error: string }).error).toContain('listar_participantes');
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });
  });

  /**
   * FAMILIA DE ANOTACIONES (fase-14-31 tanda 6).
   *
   * Es la familia que MENOS reglas tiene escritas en el armador, y eso es lo
   * que hay que cuidar: las reglas viven en `estado_de_hoy` y acá solo se leen.
   * Estos tests verifican las dos mitades de esa decisión — que el armador
   * OBEDECE lo que la lectura resolvió (y le devuelve al modelo el motivo con
   * esas palabras), y que se ocupa de lo único que la lectura no podía saber:
   * que la propuesta no se contradiga a sí misma.
   */
  describe('anotar lo del día', () => {
    it('marcar una hecha traduce participanteId → usuarioId en el body', async () => {
      const { servicio, creadas } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_anotar',
        { anotaciones: [{ participanteId: USUARIO_ID, tipo: 'HIZO', id: ACTIVIDAD_OPCIONAL_ID }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: true });

      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

      expect(creadas[0]['tipo']).toBe('ANOTAR_REGISTROS');
      expect(operaciones[0]).toMatchObject({
        metodo: 'POST',
        ruta: `/activity/actividades/${ACTIVIDAD_OPCIONAL_ID}/completar`,
        // El catálogo le habla al modelo de `participanteId`; el contrato de
        // activity espera `usuarioId`. La traducción es trabajo del armador.
        body: { usuarioId: USUARIO_ID },
      });
      expect(operaciones[0].etiqueta).toContain('le suma 5 puntos');
    });

    it('marcar una NO hecha lleva el motivo en el body y dice que resta', async () => {
      const { servicio, creadas } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_anotar',
        {
          anotaciones: [
            {
              participanteId: USUARIO_ID,
              tipo: 'NO_HIZO',
              id: ACTIVIDAD_ID,
              motivo: 'se fue a jugar',
            },
          ],
        },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: true });

      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

      expect(operaciones[0]).toMatchObject({
        ruta: `/activity/actividades/${ACTIVIDAD_ID}/no-hizo`,
        body: { usuarioId: USUARIO_ID, motivo: 'se fue a jugar' },
      });
      // Agregar y quitar tienen sentidos opuestos y la etiqueta es lo que lo
      // dice, igual que en la familia destructiva.
      expect(operaciones[0].etiqueta).toContain('NO hecha');
      expect(operaciones[0].etiqueta).toContain('le resta 10 puntos');
    });

    it('una conducta mala dice que resta, aunque su valor esté guardado en positivo', async () => {
      const { servicio, creadas } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_anotar',
        { anotaciones: [{ participanteId: USUARIO_ID, tipo: 'CONDUCTA', id: CONDUCTA_MALA_ID }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: true });

      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

      expect(operaciones[0]).toMatchObject({
        ruta: `/activity/conductas/${CONDUCTA_MALA_ID}/registrar`,
        body: { usuarioId: USUARIO_ID },
      });
      expect(operaciones[0].etiqueta).toContain('le resta 5 puntos');
    });

    /** Criterio de aceptación 9 de la spec. */
    it('lo que la lectura dice que hoy no se puede NO crea propuesta, con su motivo', async () => {
      const { servicio, prisma } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_anotar',
        { anotaciones: [{ participanteId: USUARIO_ID, tipo: 'HIZO', id: ACTIVIDAD_ID }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: false });
      // El motivo vuelve al modelo con las palabras de la lectura: es más útil
      // que cualquier cosa que el armador pueda escribir sin conocer la regla.
      expect((resultado as { error: string }).error).toContain('hoy no es uno de sus días');
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });

    it('una opcional no se marca como NO hecha', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_anotar',
        {
          anotaciones: [
            { participanteId: USUARIO_ID, tipo: 'NO_HIZO', id: ACTIVIDAD_OPCIONAL_ID },
          ],
        },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: false });
      expect((resultado as { error: string }).error).toContain('obligatorias');
    });

    it('dos filas que juntas se pasan del cupo del día no se guardan', async () => {
      const { servicio, prisma } = crearMocks();

      // «Leer un rato» admite una vez hoy. Cada fila sola es válida contra el
      // estado leído: lo que las hace inválidas es la otra, y eso solo lo puede
      // ver el armador.
      const resultado = await servicio.armar(
        'proponer_anotar',
        {
          anotaciones: [
            { participanteId: USUARIO_ID, tipo: 'HIZO', id: ACTIVIDAD_OPCIONAL_ID },
            { participanteId: USUARIO_ID, tipo: 'HIZO', id: ACTIVIDAD_OPCIONAL_ID },
          ],
        },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: false });
      expect((resultado as { error: string }).error).toContain('admite');
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });

    it('una actividad que no está en la lista de HOY de esa persona se rechaza', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_anotar',
        { anotaciones: [{ participanteId: USUARIO_ID, tipo: 'HIZO', id: RECOMPENSA_ID }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: false });
      // El error dice que la lista es por persona: es el malentendido probable.
      expect((resultado as { error: string }).error).toContain('por persona');
    });

    it('una conducta que no existe se rechaza citando de dónde sale el id', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_anotar',
        {
          anotaciones: [
            {
              participanteId: USUARIO_ID,
              tipo: 'CONDUCTA',
              id: '12345678-1234-4234-8234-123456789012',
            },
          ],
        },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: false });
      expect((resultado as { error: string }).error).toContain('listar_conductas');
    });

    it('sin sesión abierta no se anota nada', async () => {
      const { servicio, activity, prisma } = crearMocks();

      (activity.estadoDeHoy as unknown as Mock).mockResolvedValue({
        sesionAbierta: false,
        participantes: [],
      });

      const resultado = await servicio.armar(
        'proponer_anotar',
        { anotaciones: [{ participanteId: USUARIO_ID, tipo: 'HIZO', id: ACTIVIDAD_OPCIONAL_ID }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado).toMatchObject({ ok: false });
      expect((resultado as { error: string }).error).toContain('sesión abierta');
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
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
        'proponer_editar_productos',
        { ediciones: [{ productoId: PRODUCTO_ID, precio: 30 }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(true);

      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

      expect(operaciones[0].ruta).toBe(`/rewards/productos/${PRODUCTO_ID}`);
      expect(operaciones[0].body).toEqual({ precio: 30 });
      // Con la tienda leída, la etiqueta ya puede decir el «antes»: el Tutor
      // decide sobre 20 → 30, no sobre un número suelto.
      expect(operaciones[0].etiqueta).toBe('«Helado»: 20 → 30 monedas');
    });

    /**
     * Criterio 2 del fase-14-30, y la otra mitad de la decisión 1: aquella hace
     * que el modelo TENGA de dónde sacar el id; esta, que no pueda mandar el de
     * otra entidad —o el de otro grupo— y que la propuesta se guarde igual para
     * morir recién cuando el Tutor aprieta «Aplicar».
     */
    it('un productoId que no es de la tienda de este grupo NO crea propuesta', async () => {
      const { servicio, prisma } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_editar_productos',
        // Un uuid válido y ajeno: es exactamente lo que devolvería una lectura
        // de otra entidad, que es el error probable ahora que el id existe.
        { ediciones: [{ productoId: ACTIVIDAD_ID, precio: 30 }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
      expect((resultado as { error: string }).error).toContain('productoId');
      // El error le dice al modelo qué llamar, no solo que se equivocó.
      expect((resultado as { error: string }).error).toContain('listar_tienda');
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });

    it('rechaza un precio de 0 o negativo', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_editar_productos',
        { ediciones: [{ productoId: PRODUCTO_ID, precio: 0 }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
    });
  });

  describe('economía (fase-14-30 tanda 5)', () => {
    describe('premios y castigos', () => {
      it('en modo DIRECTO la zona es obligatoria y el error dice de dónde sacarla', async () => {
        const { servicio, prisma } = crearMocks({ configuracion: { modo: 'DIRECTO' } });

        const resultado = await servicio.armar(
          'proponer_crear_recompensas',
          { recompensas: [{ tipo: 'PREMIO', nombre: 'Una hora de tele' }] },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(false);
        expect((resultado as { error: string }).error).toContain('umbralZonaId');
        expect((resultado as { error: string }).error).toContain('listar_umbrales_zona');
        expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
      });

      it('en modo TIENDA no la pide: ahí un ítem no está atado a una zona', async () => {
        const { servicio } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_crear_recompensas',
          { recompensas: [{ tipo: 'PREMIO', nombre: 'Una hora de tele' }] },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(true);
      });

      /**
       * Si no se pudo leer el modo NO se inventa: suponer DIRECTO haría fallar
       * propuestas correctas de un grupo con tienda, y suponer TIENDA dejaría
       * pasar propuestas que mueren al aplicar. Se valida lo que sí se sabe.
       */
      it('con el servicio caído no exige la zona ni la inventa', async () => {
        const { servicio } = crearMocks();

        vi.mocked(
          (servicio as unknown as { rewards: { configuracion: () => Promise<null> } }).rewards
            .configuracion
        ).mockResolvedValue(null);

        const resultado = await servicio.armar(
          'proponer_crear_recompensas',
          { recompensas: [{ tipo: 'PREMIO', nombre: 'Una hora de tele' }] },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(true);
      });

      it('una zona que no es de este grupo no se guarda', async () => {
        const { servicio } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_crear_recompensas',
          { recompensas: [{ tipo: 'PREMIO', nombre: 'Tele', umbralZonaId: ACTIVIDAD_ID }] },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(false);
        expect((resultado as { error: string }).error).toContain('umbralZonaId');
      });

      /**
       * Al revés que en una conducta: acá `descripcion` SÍ es anulable en el
       * contrato, así que un `null` explícito borra el campo y se conserva.
       */
      it('en una edición el null se conserva, porque acá borra de verdad', async () => {
        const { servicio, creadas } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_editar_recompensas',
          { ediciones: [{ recompensaId: RECOMPENSA_ID, descripcion: null }] },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(true);

        const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

        expect(operaciones[0].metodo).toBe('PATCH');
        expect(operaciones[0].ruta).toBe(`/rewards/recompensas/${RECOMPENSA_ID}`);
        expect(operaciones[0].body).toEqual({ descripcion: null });
      });
    });

    describe('bolsas y productos', () => {
      it('las bolsas se aplican antes que los productos', async () => {
        const { servicio, creadas } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_crear_productos',
          {
            productos: [
              { nombre: 'Helado', precio: 30, fuente: 'ITEM', recompensaId: RECOMPENSA_ID },
            ],
            bolsas: [{ nombre: 'Sorpresas', recompensaIds: [RECOMPENSA_ID] }],
          },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(true);

        const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

        expect(operaciones.map((operacion) => operacion.ruta)).toEqual([
          '/rewards/grupos/grupo-1/bolsas',
          '/rewards/grupos/grupo-1/productos',
        ]);
        expect(operaciones.map((operacion) => operacion.opId)).toEqual(['op-1', 'op-2']);
      });

      /**
       * CRITERIO DE ACEPTACIÓN 6. El error no dice solo «no existe»: dice qué
       * hacer, que es la lección de `invariantes.ts` — un mensaje que solo
       * describe el problema empuja al modelo a inventar un valor.
       */
      it('un producto que apunta a una bolsa de la misma propuesta explica el orden', async () => {
        const { servicio, prisma } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_crear_productos',
          {
            bolsas: [{ nombre: 'Sorpresas', recompensaIds: [RECOMPENSA_ID] }],
            productos: [
              // Un id inventado: la bolsa recién existe cuando el Tutor aplica.
              { nombre: 'Sorpresa', precio: 20, fuente: 'BOLSA', bolsaId: ACTIVIDAD_ID },
            ],
          },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(false);
        expect((resultado as { error: string }).error).toContain('dos tandas');
        expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
      });

      it('un castigo no se puede vender ni meter en una bolsa', async () => {
        const { servicio } = crearMocks();

        const producto = await servicio.armar(
          'proponer_crear_productos',
          {
            productos: [
              { nombre: 'Sin postre', precio: 5, fuente: 'ITEM', recompensaId: CASTIGO_ID },
            ],
          },
          CONTEXTO,
          'conv-1'
        );

        expect(producto.ok).toBe(false);
        expect((producto as { error: string }).error).toContain('castigo');

        const bolsa = await servicio.armar(
          'proponer_crear_productos',
          { bolsas: [{ nombre: 'Sorpresas', recompensaIds: [CASTIGO_ID] }] },
          CONTEXTO,
          'conv-1'
        );

        expect(bolsa.ok).toBe(false);
        expect((bolsa as { error: string }).error).toContain('castigo');
      });

      it('rechaza mandar los dos ids juntos', async () => {
        const { servicio } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_crear_productos',
          {
            productos: [
              {
                nombre: 'Helado',
                precio: 30,
                fuente: 'ITEM',
                recompensaId: RECOMPENSA_ID,
                bolsaId: BOLSA_ID,
              },
            ],
          },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(false);
        expect((resultado as { error: string }).error).toContain('fuente ITEM');
      });

      /**
       * La edición valida el estado FUSIONADO, igual que el endpoint destino:
       * subirle el precio a un producto de fuente BOLSA no puede exigir que el
       * request repita el `bolsaId` que ya tiene.
       */
      it('una edición de solo precio no exige repetir las referencias', async () => {
        const { servicio, creadas } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_editar_productos',
          { ediciones: [{ productoId: PRODUCTO_ID, precio: 45 }] },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(true);

        const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

        expect(operaciones[0].body).toEqual({ precio: 45 });
        expect(operaciones[0].etiqueta).toBe('«Helado»: 20 → 45 monedas');
      });

      it('una edición que cambia la fuente a BOLSA sin bolsaId se rechaza', async () => {
        const { servicio } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_editar_productos',
          { ediciones: [{ productoId: PRODUCTO_ID, fuente: 'BOLSA' }] },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(false);
        expect((resultado as { error: string }).error).toContain('fuente BOLSA');
      });
    });

    describe('etiquetas', () => {
      it('crear y asignar salen como POST y PUT, en ese orden', async () => {
        const { servicio, creadas } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_etiquetas',
          {
            crear: [{ nombre: 'Dulces', colorHex: '#22C55E' }],
            asignar: [{ recompensaId: RECOMPENSA_ID, etiquetaIds: [ETIQUETA_ID] }],
          },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(true);

        const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

        expect(operaciones[0].metodo).toBe('POST');
        expect(operaciones[0].ruta).toBe('/rewards/grupos/grupo-1/etiquetas');
        expect(operaciones[1].metodo).toBe('PUT');
        expect(operaciones[1].ruta).toBe(`/rewards/recompensas/${RECOMPENSA_ID}/etiquetas`);
        expect(operaciones[1].body).toEqual({ etiquetaIds: [ETIQUETA_ID] });
      });

      it('asignar una etiqueta de la misma propuesta explica el orden en dos pasos', async () => {
        const { servicio } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_etiquetas',
          {
            crear: [{ nombre: 'Dulces', colorHex: '#22C55E' }],
            asignar: [{ recompensaId: RECOMPENSA_ID, etiquetaIds: [ACTIVIDAD_ID] }],
          },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(false);
        expect((resultado as { error: string }).error).toContain('todavía no existe');
      });

      /**
       * El PUT reemplaza la lista completa (fase-14-26), así que la lista vacía
       * es una operación legítima —«sacale todas»— y no un «no lo puse». Es la
       * única del ítem donde un array vacío significa algo.
       */
      it('una lista vacía saca todas las etiquetas y NO se descarta como vacío', async () => {
        const { servicio, creadas } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_etiquetas',
          { asignar: [{ recompensaId: RECOMPENSA_ID, etiquetaIds: [] }] },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(true);

        const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

        expect(operaciones[0].body).toEqual({ etiquetaIds: [] });
        expect(operaciones[0].etiqueta).toContain('Sacarle todas');
      });

      it('rechaza un color que no es #RRGGBB', async () => {
        const { servicio } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_etiquetas',
          { crear: [{ nombre: 'Dulces', colorHex: 'verde' }] },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(false);
        expect((resultado as { error: string }).error).toContain('colorHex');
      });
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

  /**
   * La familia escala (fase-14-30 tanda 6). Es la única del ítem que se valida
   * como CONJUNTO y la única que necesita encontrarle un orden de aplicado,
   * porque scoring valida la escala completa en cada escritura.
   */
  describe('la escala de zonas (fase-14-30 tanda 6)', () => {
    /** Partir la zona más alta en dos: el caso que sí tiene orden posible. */
    const PARTIR_LA_CIMA = {
      crear: [
        {
          nombreZona: 'Platino',
          orden: 5,
          puntosMin: 81,
          puntosMax: null,
          colorHex: '#A78BFA',
        },
      ],
      editar: [zona(UMBRAL_ID, { puntosMax: 80 })],
    };

    it('pone el PATCH que baja el techo ANTES del alta, o el primer paso fallaría', async () => {
      const { servicio, creadas } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_umbrales_zona',
        PARTIR_LA_CIMA,
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(true);

      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

      expect(operaciones.map((operacion) => operacion.metodo)).toEqual(['PATCH', 'POST']);
      expect(operaciones[0].ruta).toBe(`/scoring/umbrales/${UMBRAL_ID}`);
      expect(operaciones[1].ruta).toBe('/scoring/grupos/grupo-1/umbrales');
      // El body del PATCH lleva la zona ENTERA, con `puntosMax` explícito:
      // scoring conserva el techo viejo si el campo no viene.
      expect(operaciones[0].body).toEqual({
        nombreZona: 'Dorado',
        orden: 4,
        puntosMin: 61,
        puntosMax: 80,
        colorHex: '#EAB308',
      });
    });

    /**
     * El corazón de la decisión de esta familia: la edición de arriba, mirada
     * sola, deja la escala con techo en la cima —o sea inválida—. Junto al alta
     * de «Platino» cierra. Por eso se valida el estado RESULTANTE.
     */
    it('una edición que sola parece rota se acepta junto a las otras', async () => {
      const { servicio, prisma } = crearMocks();

      const sola = await servicio.armar(
        'proponer_umbrales_zona',
        { editar: PARTIR_LA_CIMA.editar },
        CONTEXTO,
        'conv-1'
      );

      expect(sola.ok).toBe(false);
      expect((sola as { error: string }).error).toContain('sin zona');
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();

      const acompanada = await servicio.armar(
        'proponer_umbrales_zona',
        PARTIR_LA_CIMA,
        CONTEXTO,
        'conv-1'
      );

      expect(acompanada.ok).toBe(true);
    });

    /** Criterio de aceptación 5: hueco, solape, sin cima o con dos cimas. */
    it('una escala con un hueco NO se guarda y el error nombra el rango', async () => {
      const { servicio, prisma } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_umbrales_zona',
        { editar: [zona(UMBRAL_VERDE_ID, { puntosMax: 55 })] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
      expect((resultado as { error: string }).error).toContain('«Dorado»');
      expect((resultado as { error: string }).error).toContain('56');
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });

    it('correr dos límites a la vez se rechaza explicando que no hay orden posible', async () => {
      const { servicio, prisma } = crearMocks();

      // El estado final cierra; lo que no existe es un camino de a un paso, y
      // scoring valida el conjunto en cada guardado.
      const resultado = await servicio.armar(
        'proponer_umbrales_zona',
        {
          editar: [
            zona('22222222-aaaa-4aaa-8aaa-222222222222', { puntosMax: 50 }),
            zona(UMBRAL_VERDE_ID, { puntosMin: 51 }),
          ],
        },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
      expect((resultado as { error: string }).error).toContain('de a uno');
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });

    /** Criterio 2: la referencia se valida contra el estado real del grupo. */
    it('un umbralZonaId que no es de este grupo NO crea propuesta', async () => {
      const { servicio, prisma } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_umbrales_zona',
        { editar: [{ ...zona(UMBRAL_ID), umbralZonaId: ACTIVIDAD_ID }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
      expect((resultado as { error: string }).error).toContain('umbralZonaId');
      expect((resultado as { error: string }).error).toContain('listar_umbrales_zona');
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });

    it('una zona a medias se rechaza pidiéndola entera, sin adivinar el techo', async () => {
      const { servicio } = crearMocks();

      // El caso real: el modelo cambia solo el color. Sin los otros campos no
      // se puede saber si `puntosMax` ausente significa «dejalo» o «sacalo».
      const resultado = await servicio.armar(
        'proponer_umbrales_zona',
        { editar: [{ umbralZonaId: UMBRAL_ID, colorHex: '#FACC15' }] },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(false);
      expect((resultado as { error: string }).error).toContain('entera');
    });

    it('puntosMax null es «sin techo» y no un campo vacío', async () => {
      const { servicio, creadas } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_umbrales_zona',
        // Le pone techo a la cima y crea la nueva sin techo: si el null se
        // tratara como ausencia, la escala quedaría sin cima y se rechazaría.
        PARTIR_LA_CIMA,
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(true);
      expect((creadas[0]['operaciones'] as OperacionPropuesta[])[1].body).toMatchObject({
        nombreZona: 'Platino',
        puntosMax: null,
      });
    });

    it('la base de puntos sola es un PUT y no toca ninguna zona', async () => {
      const { servicio, creadas } = crearMocks();

      const resultado = await servicio.armar(
        'proponer_umbrales_zona',
        { puntosIniciales: 0 },
        CONTEXTO,
        'conv-1'
      );

      expect(resultado.ok).toBe(true);

      const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

      expect(operaciones).toHaveLength(1);
      expect(operaciones[0].metodo).toBe('PUT');
      expect(operaciones[0].ruta).toBe('/scoring/grupos/grupo-1/configuracion');
      expect(operaciones[0].body).toEqual({ puntosIniciales: 0 });
      expect(operaciones[0].etiqueta).toContain('antes 100');
    });

    it('sin zonas ni base no hay nada que proponer', async () => {
      const { servicio, prisma } = crearMocks();

      const resultado = await servicio.armar('proponer_umbrales_zona', {}, CONTEXTO, 'conv-1');

      expect(resultado.ok).toBe(false);
      expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
    });

    /**
     * BORRAR UNA ZONA (fase-14-31 tanda 7, decisión 8).
     *
     * Vive acá dentro y no en `proponer_archivar` porque sacar una zona casi
     * siempre exige tocar a la vecina en el mismo movimiento, y separarlas
     * daría propuestas correctas e inaplicables. La consecuencia —una propuesta
     * de umbrales con un borrado adentro es DESTRUCTIVA— la resuelve la tarjeta
     * mirando las operaciones, no el tipo.
     */
    describe('borrar zonas', () => {
      /** Sacar «Dorado» y abrirle el techo a «Verde»: el caso que sí se puede. */
      const SACAR_LA_CIMA = {
        borrar: [UMBRAL_ID],
        editar: [zona(UMBRAL_VERDE_ID, { nombreZona: 'Dorado', puntosMax: null })],
      };

      it('arma el DELETE primero y la etiqueta dice que se borra de verdad', async () => {
        const { servicio, creadas } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_umbrales_zona',
          SACAR_LA_CIMA,
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(true);

        const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

        // El orden lo decide `ordenAplicable`: con «Dorado» todavía vivo,
        // abrirle el techo a «Verde» dejaría dos cimas y scoring lo rechaza.
        expect(operaciones.map((operacion) => operacion.metodo)).toEqual(['DELETE', 'PATCH']);
        expect(operaciones[0]).toMatchObject({
          ruta: `/scoring/umbrales/${UMBRAL_ID}`,
          body: null,
        });
        // La distinción que ningún rojo de tarjeta puede hacer solo: este es
        // uno de los dos únicos DELETE del monorepo que no archiva.
        expect(operaciones[0].etiqueta).toContain('se borra de verdad');
        expect(operaciones[0].etiqueta).toContain('Dorado');
      });

      it('la propuesta queda marcada como destructiva por su operación', async () => {
        const { servicio, creadas } = crearMocks();

        await servicio.armar('proponer_umbrales_zona', SACAR_LA_CIMA, CONTEXTO, 'conv-1');

        const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

        // Criterio de aceptación 6: se pinta destructiva aunque las otras filas
        // sean ediciones, y `UMBRALES_ZONA` está en la lista blanca del DELETE.
        expect(esPropuestaDestructiva(operaciones as OperacionPropuestaIaDto[])).toBe(true);
        expect(TIPOS_PROPUESTA_CON_BORRADO).toContain(creadas[0]['tipo'] as TipoPropuestaIa);
      });

      it('borrar sin abrirle el techo a la que queda no cierra la escala', async () => {
        const { servicio, prisma } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_umbrales_zona',
          { borrar: [UMBRAL_ID] },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(false);
        expect((resultado as { error: string }).error).toContain('sin zona');
        expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
      });

      /**
       * El límite que esta tanda descubrió: solo se puede borrar la de orden
       * más alto, y el error tiene que decirlo — es la clase de cosa que un
       * modelo reintenta diez veces sin entender.
       */
      it('borrar una del medio se rechaza explicando que solo se va la más alta', async () => {
        const { servicio, prisma } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_umbrales_zona',
          {
            borrar: [UMBRAL_VERDE_ID],
            editar: [zona('22222222-aaaa-4aaa-8aaa-222222222222', { puntosMax: 60 })],
          },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(false);
        expect((resultado as { error: string }).error).toContain('orden más alto');
        expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
      });

      it('editar y borrar la misma zona es una contradicción y no se guarda', async () => {
        const { servicio, prisma } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_umbrales_zona',
          { borrar: [UMBRAL_ID], editar: [zona(UMBRAL_ID, { puntosMax: 80 })] },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(false);
        expect((resultado as { error: string }).error).toContain('"editar"');
        expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
      });

      it('un id que no es de este grupo NO crea propuesta', async () => {
        const { servicio, prisma } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_umbrales_zona',
          { borrar: [ACTIVIDAD_ID] },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(false);
        expect((resultado as { error: string }).error).toContain('listar_umbrales_zona');
        expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
      });
    });

    /**
     * Criterio de aceptación 10, y la decisión 6: es la única propuesta del
     * ítem cuyo efecto no se limita a lo que pase de acá en adelante.
     */
    describe('el aviso de que esto cambia el pasado', () => {
      it('dice a cuántos les cambia la zona', async () => {
        const { servicio, creadas } = crearMocks();

        await servicio.armar('proponer_umbrales_zona', PARTIR_LA_CIMA, CONTEXTO, 'conv-1');

        const snapshot = creadas[0]['snapshot'] as { aviso: string };

        // De los tres, solo el de 90 puntos cruza: pasa de Dorado a Platino.
        expect(snapshot.aviso).toContain('1 de 3');
        expect(snapshot.aviso).toContain('cambia el pasado');
      });

      it('mover la base mueve a todos sobre la misma escala', async () => {
        const { servicio, creadas } = crearMocks();

        // De 100 a 0: los tres quedan debajo de la zona más baja.
        await servicio.armar(
          'proponer_umbrales_zona',
          { puntosIniciales: 0 },
          CONTEXTO,
          'conv-1'
        );

        expect((creadas[0]['snapshot'] as { aviso: string }).aviso).toContain('3 de 3');
      });

      it('sin los puntajes lo dice, en vez de inventar un cero', async () => {
        const { servicio, creadas } = crearMocks({ resumenPuntajes: null });

        await servicio.armar('proponer_umbrales_zona', PARTIR_LA_CIMA, CONTEXTO, 'conv-1');

        const aviso = (creadas[0]['snapshot'] as { aviso: string }).aviso;

        expect(aviso).toContain('no sé a cuántos');
        expect(aviso).not.toContain('0 de');
      });

      it('viaja en el DTO, así que la tarjeta lo tiene sin otra llamada', async () => {
        const { servicio } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_umbrales_zona',
          PARTIR_LA_CIMA,
          CONTEXTO,
          'conv-1'
        );

        expect((resultado as { propuesta: { aviso: string | null } }).propuesta.aviso).toContain(
          'cambia el pasado'
        );
      });
    });
  });

  /**
   * La familia personas (fase-14-30 tanda 7). Dos cosas propias: es la primera
   * que necesita ids de PERSONA —y los nombres del contrato no pasan el test
   * estructural del tenant, así que el armador traduce— y la que más reglas del
   * destino tiene que respetar sobre el estado que la propia propuesta deja.
   */
  describe('personas (fase-14-30 tanda 7)', () => {
    describe('roles del grupo', () => {
      it('traduce participanteId y rolId a los nombres del contrato de identity', async () => {
        const { servicio, creadas } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_roles_grupo',
          { asignar: [{ participanteId: OTRO_USUARIO_ID, rolId: ROL_ID }] },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(true);

        const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

        // El id de la persona va en la RUTA y el del rol en el body, con el
        // nombre que espera identity — no con el que vio el modelo.
        expect(operaciones[0].metodo).toBe('PUT');
        expect(operaciones[0].ruta).toBe(
          `/identity/grupos/grupo-1/usuarios/${OTRO_USUARIO_ID}/rol`
        );
        expect(operaciones[0].body).toEqual({ rolGrupoId: ROL_ID });
        expect(operaciones[0].etiqueta).toBe('Alejandra: sin rol → «cocina»');
      });

      it('rolId null saca el rol, y no es un campo que faltó', async () => {
        const { servicio, creadas } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_roles_grupo',
          { asignar: [{ participanteId: USUARIO_ID, rolId: null }] },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(true);
        expect((creadas[0]['operaciones'] as OperacionPropuesta[])[0].body).toEqual({
          rolGrupoId: null,
        });
        expect((creadas[0]['operaciones'] as OperacionPropuesta[])[0].etiqueta).toBe(
          'Luciana: «cocina» → sin rol'
        );
      });

      it('un nombre repetido se rechaza sin distinguir mayúsculas, como identity', async () => {
        const { servicio, prisma } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_roles_grupo',
          { crear: [{ nombre: '  Cocina ', colorHex: '#22C55E' }] },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(false);
        expect((resultado as { error: string }).error).toContain('«cocina»');
        expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
      });

      it('dos roles nuevos con el mismo nombre chocan entre sí', async () => {
        const { servicio } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_roles_grupo',
          {
            crear: [
              { nombre: 'mascotas', colorHex: '#22C55E' },
              { nombre: 'Mascotas', colorHex: '#EF4444' },
            ],
          },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(false);
      });

      it('asignar un rol creado en la misma propuesta explica el orden en dos pasos', async () => {
        const { servicio, prisma } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_roles_grupo',
          {
            crear: [{ nombre: 'mascotas', colorHex: '#22C55E' }],
            asignar: [{ participanteId: USUARIO_ID, rolId: ACTIVIDAD_ID }],
          },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(false);
        expect((resultado as { error: string }).error).toContain('dos pasos');
        expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
      });

      it('un rol archivado no se asigna', async () => {
        const { servicio } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_roles_grupo',
          { asignar: [{ participanteId: USUARIO_ID, rolId: ROL_ARCHIVADO_ID }] },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(false);
        expect((resultado as { error: string }).error).toContain('archivado');
      });

      it('un participante que no es del grupo NO crea propuesta', async () => {
        const { servicio, prisma } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_roles_grupo',
          { asignar: [{ participanteId: ACTIVIDAD_ID, rolId: ROL_ID }] },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(false);
        expect((resultado as { error: string }).error).toContain('listar_participantes');
        expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
      });
    });

    describe('equipos', () => {
      it('arma el POST con la forma exacta del request de identity', async () => {
        const { servicio, creadas } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_equipos',
          {
            crear: [
              { nombre: 'Mascotas', jefeParticipanteId: SIN_EQUIPO_ID, participantesIds: [] },
            ],
          },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(true);

        const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

        expect(operaciones[0].ruta).toBe('/identity/grupos/grupo-1/equipos');
        // La lista vacía viaja igual: un equipo de una sola persona es legítimo
        // y `limpiarVacios` habría descartado el array.
        expect(operaciones[0].body).toEqual({
          nombre: 'Mascotas',
          jefeUsuarioId: SIN_EQUIPO_ID,
          miembrosIds: [],
        });
      });

      /** La regla que más va a rechazar: una persona, un solo equipo. */
      it('no se puede armar un equipo con alguien que ya está en otro', async () => {
        const { servicio, prisma } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_equipos',
          {
            crear: [
              {
                nombre: 'Mascotas',
                jefeParticipanteId: SIN_EQUIPO_ID,
                participantesIds: [OTRO_USUARIO_ID],
              },
            ],
          },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(false);
        expect((resultado as { error: string }).error).toContain('«Cocina»');
        expect((resultado as { error: string }).error).toContain('Alejandra');
        expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
      });

      it('tampoco se puede repetir a alguien entre dos equipos de la misma propuesta', async () => {
        const { servicio } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_equipos',
          {
            crear: [
              { nombre: 'Mascotas', jefeParticipanteId: SIN_EQUIPO_ID, participantesIds: [] },
              { nombre: 'Plantas', jefeParticipanteId: SIN_EQUIPO_ID, participantesIds: [] },
            ],
          },
          CONTEXTO,
          'conv-1'
        );

        // El estado que la propuesta va dejando cuenta igual que el que hay.
        expect(resultado.ok).toBe(false);
        expect((resultado as { error: string }).error).toContain('«Mascotas»');
      });

      it('el jefe repetido en la lista de integrantes no es un error: identity deduplica', async () => {
        const { servicio, creadas } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_equipos',
          {
            crear: [
              {
                nombre: 'Mascotas',
                jefeParticipanteId: SIN_EQUIPO_ID,
                participantesIds: [SIN_EQUIPO_ID],
              },
            ],
          },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(true);
        expect((creadas[0]['operaciones'] as OperacionPropuesta[])[0].etiqueta).toContain(
          '1 integrante'
        );
      });

      it('sumar a alguien y ascenderlo a jefe en el mismo cambio sale en ese orden', async () => {
        const { servicio, creadas } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_equipos',
          {
            editar: [
              {
                equipoId: EQUIPO_ID,
                sumarParticipantesIds: [SIN_EQUIPO_ID],
                nuevoJefeParticipanteId: SIN_EQUIPO_ID,
              },
            ],
          },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(true);

        const operaciones = creadas[0]['operaciones'] as OperacionPropuesta[];

        // El POST del miembro va ANTES que el del jefe: al revés, identity
        // rechazaría el ascenso de alguien que todavía no es miembro.
        expect(operaciones.map((operacion) => operacion.ruta)).toEqual([
          `/identity/equipos/${EQUIPO_ID}/miembros`,
          `/identity/equipos/${EQUIPO_ID}/jefe`,
        ]);
        expect(operaciones[0].body).toEqual({ usuarioId: SIN_EQUIPO_ID });
        expect(operaciones[1].body).toEqual({ nuevoJefeUsuarioId: SIN_EQUIPO_ID });
      });

      it('un jefe que no es ni va a ser miembro se rechaza diciendo qué hacer', async () => {
        const { servicio, prisma } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_equipos',
          { editar: [{ equipoId: EQUIPO_ID, nuevoJefeParticipanteId: SIN_EQUIPO_ID }] },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(false);
        expect((resultado as { error: string }).error).toContain('Sumalo al equipo');
        expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
      });

      it('un equipoId que no es de este grupo NO crea propuesta', async () => {
        const { servicio, prisma } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_equipos',
          { editar: [{ equipoId: ACTIVIDAD_ID, nombre: 'Otro' }] },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(false);
        expect((resultado as { error: string }).error).toContain('listar_participantes');
        expect(prisma.client.propuesta.create).not.toHaveBeenCalled();
      });

      it('un cambio sin nada adentro se rechaza', async () => {
        const { servicio } = crearMocks();

        const resultado = await servicio.armar(
          'proponer_equipos',
          { editar: [{ equipoId: EQUIPO_ID }] },
          CONTEXTO,
          'conv-1'
        );

        expect(resultado.ok).toBe(false);
        expect((resultado as { error: string }).error).toContain('ningún cambio');
      });
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
