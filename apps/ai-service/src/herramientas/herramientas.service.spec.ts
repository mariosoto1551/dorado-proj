import { describe, expect, it, vi } from 'vitest';

import type { ActivityClientService } from '../clientes/activity-client.service';
import type { IdentityClientService } from '../clientes/identity-client.service';
import type { RewardsClientService } from '../clientes/rewards-client.service';
import type { ScoringClientService } from '../clientes/scoring-client.service';
import type { ContextoHerramienta } from '../comun/acceso-grupo.service';
import { NOMBRES_HERRAMIENTAS_LECTURA } from './definiciones';
import { HerramientasService } from './herramientas.service';

const CONTEXTO: ContextoHerramienta = { organizacionId: 'org-1', grupoId: 'grupo-1' };

/** Todas las claves de una respuesta, hasta el fondo de arrays y objetos. */
function clavesDe(valor: unknown): string[] {
  if (Array.isArray(valor)) {
    return valor.flatMap((elemento) => clavesDe(elemento));
  }

  if (valor && typeof valor === 'object') {
    return Object.entries(valor).flatMap(([clave, anidado]) => [clave, ...clavesDe(anidado)]);
  }

  return [];
}

/**
 * Los mocks devuelven los DTOs **con sus campos de tenant adentro**, que es
 * como vienen de los endpoints internos de verdad.
 *
 * No es un detalle del fixture: si acá se devolviera ya limpio, el test de la
 * decisión 9 del fase-14-30 pasaría sin verificar nada. El defecto que ese test
 * existe para que no vuelva era justamente que cuatro lecturas pasaban el DTO
 * entero, `organizacionId` incluido, hacia el proveedor.
 */
const TENANT = { organizacionId: 'org-1', grupoId: 'grupo-1' };

function crearMocks() {
  const activity = {
    actividades: vi.fn(async () => [
      {
        ...TENANT,
        id: 'act-1',
        nombre: 'Tender la cama',
        descripcion: null,
        tipoPuntaje: 'OBLIGATORIA',
        valorPuntos: 10,
        puntosPorCumplir: 2,
        tipoLimiteTiempo: 'SIN_LIMITE',
        deadlineHora: null,
        duracionCronometroMinutos: null,
        repeticionesMaximasSesion: 1,
        repeticionesMinimasSesion: 1,
        repeticionesMaximasSeccion: null,
        comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
        alcance: 'INDIVIDUAL',
        bonoJefePuntos: 0,
        origen: 'TUTOR',
        creadaPorUsuarioId: null,
        diasSemana: [],
        siempreVisible: false,
        rolesPermitidos: [],
        usuariosPermitidos: [],
        equiposPermitidos: [],
        vigenteDesde: null,
        vigenteHasta: null,
        estado: 'ACTIVA',
      },
    ]),
    conductas: vi.fn(async () => [
      {
        ...TENANT,
        id: 'con-1',
        nombre: 'Gritar',
        tipo: 'MALA',
        valorPuntos: 5,
        permiteAutoreporte: false,
        estado: 'ACTIVA',
      },
    ]),
    configuracion: vi.fn(async () => ({
      planDelDiaActivo: true,
      modoCreacionUsuario: 'BAJO_APROBACION',
      maxPuntosActividadUsuario: 5,
      maxActividadesActivasPorUsuario: 5,
    })),
    turnos: vi.fn(async () => [
      {
        actividadId: 'act-1',
        modo: 'ORDEN_FIJO',
        frecuencia: 'SESION',
        activo: true,
        // José dos veces de cuatro posiciones: la repetición es el punto.
        posiciones: [
          { orden: 1, usuarioId: 'u-1' },
          { orden: 2, usuarioId: 'u-2' },
          { orden: 3, usuarioId: 'u-1' },
        ],
      },
    ]),
    resumenCumplimiento: vi.fn(async (grupoId: string, dias: number) => ({
      grupoId,
      dias,
      actividades: [
        {
          actividadId: 'act-1',
          nombre: 'Tender la cama',
          estado: 'ACTIVA',
          tipoPuntaje: 'OBLIGATORIA',
          valorPuntos: 10,
          vecesCompletada: 4,
          vecesNoHizo: 1,
          participantesDistintos: 2,
          ultimaVezCompletada: '2026-08-04T12:00:00.000Z',
        },
      ],
    })),
    // fase-14-31: el estado del día ya viene moldeado del interno — sin claves
    // de tenant y con los `registroId` que ninguna otra lectura devuelve.
    estadoDeHoy: vi.fn(async () => ({
      sesionAbierta: true,
      participantes: [
        {
          usuarioId: 'u-1',
          nombre: 'Luciana',
          actividades: [
            {
              actividadId: 'act-1',
              nombre: 'Tender la cama',
              tipoPuntaje: 'OBLIGATORIA',
              valorPuntos: 10,
              vecesHechas: 0,
              vecesQueAdmite: 1,
              puedeMarcarHizo: true,
              puedeMarcarNoHizo: true,
              motivoNoDisponible: null,
            },
          ],
          marcas: [
            {
              registroId: 'reg-1',
              tipo: 'COMPLETADA',
              descripcion: '«Lavar los platos» hecha',
              puntos: 5,
            },
          ],
        },
      ],
    })),
    // fase-14-33: los días de la sección vigente. Sin claves de tenant, igual
    // que el resto — es lo que hace resoluble «el lunes» sin inventar un uuid.
    sesionesDeLaSeccion: vi.fn(async () => [
      {
        id: 'ses-1',
        numero: 1,
        estado: 'CERRADA',
        fechaInicio: '2026-08-10T03:00:00.000Z',
        fechaFin: '2026-08-11T03:00:00.000Z',
        esLaAbierta: false,
      },
      {
        id: 'ses-2',
        numero: 2,
        estado: 'ABIERTA',
        fechaInicio: '2026-08-11T03:00:00.000Z',
        fechaFin: null,
        esLaAbierta: true,
      },
    ]),
  } as unknown as ActivityClientService;

  const identity = {
    participantes: vi.fn(async () => [
      {
        id: 'u-1',
        nombre: 'Luciana',
        username: 'luciana',
        rolGrupo: { id: 'rol-1', nombre: 'cocina', colorHex: '#fff' },
      },
      { id: 'u-2', nombre: 'José', username: 'jose', rolGrupo: null },
    ]),
    roles: vi.fn(async () => [
      { id: 'rol-1', nombre: 'cocina', estado: 'ACTIVO' },
      { id: 'rol-2', nombre: 'viejo', estado: 'INACTIVO' },
    ]),
    equipos: vi.fn(async () => [
      {
        equipoId: 'eq-1',
        nombre: 'Cocina',
        estado: 'ACTIVO',
        jefeUsuarioId: 'u-1',
        miembros: [
          { usuarioId: 'u-1', rol: 'JEFE' },
          { usuarioId: 'u-2', rol: 'MIEMBRO' },
        ],
      },
      { equipoId: 'eq-2', nombre: 'Disuelto', estado: 'INACTIVO', jefeUsuarioId: 'u-2', miembros: [] },
    ]),
  } as unknown as IdentityClientService;

  const scoring = {
    umbrales: vi.fn(async () => [
      {
        ...TENANT,
        id: 'z-1',
        nombreZona: 'Verde',
        orden: 3,
        puntosMin: 20,
        puntosMax: 45,
        colorHex: '#22C55E',
      },
    ]),
    configuracion: vi.fn(async () => ({ puntosIniciales: 10 })),
    resumenPuntajes: vi.fn(async () => ({
      grupoId: 'grupo-1',
      seccionId: 'sec-1',
      origen: 'EN_VIVO' as const,
      puntajes: [
        { usuarioId: 'u-1', puntajeTotal: 27, nombreZona: 'Verde', descalificado: false },
        { usuarioId: 'fantasma', puntajeTotal: 3, nombreZona: null, descalificado: true },
      ],
    })),
  } as unknown as ScoringClientService;

  const rewards = {
    recompensas: vi.fn(async () => [
      {
        ...TENANT,
        id: 'r-1',
        nombre: 'Helado',
        descripcion: null,
        imagenUrl: null,
        tipo: 'PREMIO',
        umbralZonaId: 'z-1',
        nombreZonaSnapshot: 'Verde',
        permiteSeleccion: true,
        permiteAzar: false,
        estado: 'ACTIVA',
        etiquetas: [{ ...TENANT, id: 'et-1', nombre: 'Golosinas', colorHex: '#fff', estado: 'ACTIVA' }],
      },
    ]),
    rendimientos: vi.fn(async () => [
      {
        tipoAccion: 'ACTIVIDAD',
        origenId: 'act-1',
        nombreSnapshot: 'Tender la cama',
        monedas: 5,
        monedasBonoJefe: 0,
      },
    ]),
    etiquetas: vi.fn(async () => [
      { id: 'et-1', nombre: 'Golosinas', colorHex: '#EAB308', estado: 'ACTIVA' },
      { id: 'et-2', nombre: 'Viejas', colorHex: '#111111', estado: 'ARCHIVADA' },
    ]),
    configuracion: vi.fn(async () => ({
      modo: 'TIENDA',
      modoPendiente: null,
      nombreMoneda: 'doradas',
      iconoMoneda: '🪙',
    })),
    tienda: vi.fn(async () => ({
      productos: [
        {
          id: 'prod-1',
          nombre: 'Helado',
          descripcion: null,
          precio: 30,
          fuente: 'ITEM',
          mecanica: 'ELECCION',
          recompensaId: 'r-1',
          bolsaId: null,
          estado: 'ACTIVA',
        },
        {
          id: 'prod-2',
          nombre: 'Sorpresa',
          descripcion: null,
          precio: 50,
          fuente: 'BOLSA',
          mecanica: 'AZAR',
          recompensaId: null,
          bolsaId: 'bol-1',
          estado: 'ARCHIVADA',
        },
      ],
      bolsas: [
        { id: 'bol-1', nombre: 'Premios chicos', estado: 'ACTIVA', recompensaIds: ['r-1'] },
      ],
    })),
    // fase-14-31: los saldos, sin `grupoId` por fila y con la moneda una vez.
    billeteras: vi.fn(async () => ({
      nombreMoneda: 'estrellas',
      iconoMoneda: '⭐',
      participantes: [
        {
          usuarioId: 'u-1',
          nombre: 'Luciana',
          saldo: 12,
          objetivoNombre: 'Helado',
          objetivoFaltan: 8,
        },
        { usuarioId: 'u-2', nombre: 'José', saldo: 0, objetivoNombre: null, objetivoFaltan: null },
      ],
    })),
  } as unknown as RewardsClientService;

  return {
    activity,
    identity,
    scoring,
    rewards,
    servicio: new HerramientasService(activity, identity, scoring, rewards),
  };
}

describe('HerramientasService', () => {
  describe('el tenant nunca sale de los argumentos (decisión 9)', () => {
    it('ignora un grupoId inyectado por el modelo y usa el del contexto', async () => {
      const { servicio, activity } = crearMocks();

      // Esto es exactamente lo que haría un prompt injection exitoso: pedir el
      // catálogo de otro grupo. El argumento no se lee en ninguna línea.
      await servicio.ejecutar(
        'listar_actividades',
        { grupoId: 'grupo-de-otra-organizacion', organizacionId: 'org-hostil' },
        CONTEXTO
      );

      expect(activity.actividades).toHaveBeenCalledWith('grupo-1', undefined);
    });

    it('todas las herramientas leen del grupo del contexto', async () => {
      const { servicio, activity, identity, scoring, rewards } = crearMocks();
      const inyectado = { grupoId: 'grupo-ajeno' };

      await servicio.ejecutar('listar_conductas', inyectado, CONTEXTO);
      await servicio.ejecutar('listar_participantes', inyectado, CONTEXTO);
      await servicio.ejecutar('listar_umbrales_zona', inyectado, CONTEXTO);
      await servicio.ejecutar('resumen_puntajes', inyectado, CONTEXTO);
      await servicio.ejecutar('listar_recompensas', inyectado, CONTEXTO);
      await servicio.ejecutar('listar_rendimientos_monedas', inyectado, CONTEXTO);
      await servicio.ejecutar('listar_tienda', inyectado, CONTEXTO);
      await servicio.ejecutar('listar_etiquetas', inyectado, CONTEXTO);
      await servicio.ejecutar('listar_turnos', inyectado, CONTEXTO);
      await servicio.ejecutar('configuracion_del_grupo', inyectado, CONTEXTO);
      await servicio.ejecutar('resumen_cumplimiento', inyectado, CONTEXTO);

      const llamadas = [
        ...vi.mocked(rewards.tienda).mock.calls,
        ...vi.mocked(rewards.etiquetas).mock.calls,
        ...vi.mocked(rewards.configuracion).mock.calls,
        ...vi.mocked(activity.configuracion).mock.calls,
        ...vi.mocked(activity.turnos).mock.calls,
        ...vi.mocked(scoring.configuracion).mock.calls,
        ...vi.mocked(activity.conductas).mock.calls,
        ...vi.mocked(activity.resumenCumplimiento).mock.calls,
        ...vi.mocked(identity.participantes).mock.calls,
        ...vi.mocked(identity.roles).mock.calls,
        ...vi.mocked(identity.equipos).mock.calls,
        ...vi.mocked(scoring.umbrales).mock.calls,
        ...vi.mocked(scoring.resumenPuntajes).mock.calls,
        ...vi.mocked(rewards.recompensas).mock.calls,
        ...vi.mocked(rewards.rendimientos).mock.calls,
      ];

      expect(llamadas.length).toBeGreaterThan(0);

      for (const llamada of llamadas) {
        expect(llamada[0]).toBe('grupo-1');
      }
    });
  });

  it('una herramienta inexistente devuelve error, no lanza', async () => {
    const { servicio } = crearMocks();

    // El modelo se equivoca de nombre a veces; con el error de vuelta se
    // corrige solo. Una excepción acá mataría el turno entero.
    const resultado = await servicio.ejecutar('borrar_todo', {}, CONTEXTO);

    expect(resultado).toEqual({
      ok: false,
      error: 'No existe una herramienta llamada "borrar_todo".',
    });
  });

  describe('listar_participantes', () => {
    it('compone gente, roles activos y equipos activos en una sola respuesta', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.ejecutar('listar_participantes', {}, CONTEXTO);

      expect(resultado.ok).toBe(true);
      expect((resultado as { datos: unknown }).datos).toEqual({
        participantes: [
          { usuarioId: 'u-1', nombre: 'Luciana', rol: 'cocina', rolId: 'rol-1' },
          { usuarioId: 'u-2', nombre: 'José', rol: null, rolId: null },
        ],
        roles: [{ rolId: 'rol-1', nombre: 'cocina' }],
        equipos: [
          {
            equipoId: 'eq-1',
            nombre: 'Cocina',
            jefeUsuarioId: 'u-1',
            miembros: ['u-1', 'u-2'],
          },
        ],
      });
    });

    it('no manda ningún dato de contacto hacia el proveedor (Parte E, punto 7)', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.ejecutar('listar_participantes', {}, CONTEXTO);
      const serializado = JSON.stringify((resultado as { datos: unknown }).datos);

      // `username` es credencial de acceso del participante: tampoco viaja,
      // aunque no sea un email.
      expect(serializado).not.toContain('username');
      expect(serializado).not.toContain('email');
      expect(serializado).not.toContain('@');
    });
  });

  /**
   * TEST DE SALIDA (fase-14-30 decisión 9 y criterio 11). El hermano exacto del
   * test estructural de la decisión 9 del fase-14-29, pero sobre lo que la
   * herramienta DEVUELVE en vez de sobre lo que acepta.
   *
   * La Parte E de aquel ítem prometía que el id de organización no sale hacia
   * el proveedor, y salía en cuatro de las ocho lecturas: las que pasaban el
   * DTO entero. La medida estaba escrita y era correcta; lo que faltaba era que
   * algo la ejecutara. Esto es ese algo, y corre sobre la respuesta real de
   * cada herramienta, no sobre su tipo.
   */
  describe('ninguna lectura manda el tenant hacia el proveedor (decisión 9 del fase-14-30)', () => {
    const PROHIBIDO = /organizacionId|grupoId|tenant/i;

    it('las quince lecturas devuelven respuestas sin ninguna clave de tenant', async () => {
      const { servicio } = crearMocks();
      const infractoras: string[] = [];

      for (const nombre of NOMBRES_HERRAMIENTAS_LECTURA) {
        const resultado = await servicio.ejecutar(nombre, {}, CONTEXTO);

        expect(resultado.ok, nombre).toBe(true);

        for (const clave of clavesDe((resultado as { datos: unknown }).datos)) {
          if (PROHIBIDO.test(clave)) {
            infractoras.push(`${nombre}.${clave}`);
          }
        }
      }

      expect(
        infractoras,
        'Ninguna herramienta de lectura devuelve un DTO crudo: todas moldean su respuesta ' +
          'campo por campo (fase-14-30 decisión 9). Un `delete` sobre el DTO arregla el caso ' +
          'y deja el camino corto abierto para la lectura siguiente.'
      ).toEqual([]);
    });

    it('tampoco viaja ningún dato de contacto en ninguna de las quince', async () => {
      const { servicio } = crearMocks();

      for (const nombre of NOMBRES_HERRAMIENTAS_LECTURA) {
        const resultado = await servicio.ejecutar(nombre, {}, CONTEXTO);
        const serializado = JSON.stringify((resultado as { datos: unknown }).datos);

        expect(serializado, nombre).not.toContain('@');
        expect(serializado, nombre).not.toContain('username');
      }
    });

    it('el moldeado conserva lo que el modelo necesita', async () => {
      // El contrapeso del test de arriba: un molde que devuelva `{}` también
      // pasaría aquel, y dejaría al asistente sin nada que leer.
      const { servicio } = crearMocks();

      const actividades = await servicio.ejecutar('listar_actividades', {}, CONTEXTO);
      const umbrales = await servicio.ejecutar('listar_umbrales_zona', {}, CONTEXTO);

      expect((actividades as { datos: Array<Record<string, unknown>> }).datos[0]).toMatchObject({
        actividadId: 'act-1',
        nombre: 'Tender la cama',
        tipoPuntaje: 'OBLIGATORIA',
        valorPuntos: 10,
        estado: 'ACTIVA',
      });
      expect((umbrales as { datos: Array<Record<string, unknown>> }).datos[0]).toEqual({
        umbralZonaId: 'z-1',
        nombreZona: 'Verde',
        orden: 3,
        puntosMin: 20,
        puntosMax: 45,
        colorHex: '#22C55E',
      });
    });
  });

  /**
   * fase-14-31: `estado_de_hoy` es a la familia de marcas lo que `listar_tienda`
   * fue al `productoId` — la lectura que hace que una propuesta pueda existir
   * sin que el modelo invente un id (decisión 1 del #30).
   */
  describe('estado_de_hoy y listar_billeteras (fase-14-31)', () => {
    it('el estado del día devuelve los registroId, que ninguna otra lectura devuelve', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.ejecutar('estado_de_hoy', {}, CONTEXTO);
      const datos = (resultado as { datos: { participantes: Array<Record<string, unknown>> } })
        .datos;
      const marcas = datos.participantes[0]['marcas'] as Array<Record<string, unknown>>;

      expect(marcas[0]).toMatchObject({ registroId: 'reg-1', tipo: 'COMPLETADA' });
    });

    it('el estado del día trae resuelto si se puede marcar y por qué no', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.ejecutar('estado_de_hoy', {}, CONTEXTO);
      const datos = (resultado as { datos: { participantes: Array<Record<string, unknown>> } })
        .datos;
      const actividades = datos.participantes[0]['actividades'] as Array<Record<string, unknown>>;

      // Las reglas se calculan donde vive el endpoint que las hace cumplir: acá
      // viajan resueltas para que el armador no las replique por tercera vez.
      expect(actividades[0]).toMatchObject({
        puedeMarcarHizo: true,
        puedeMarcarNoHizo: true,
        motivoNoDisponible: null,
      });
    });

    it('los saldos vienen con la moneda una vez y el objetivo de cada uno', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.ejecutar('listar_billeteras', {}, CONTEXTO);

      expect(resultado).toEqual({
        ok: true,
        datos: {
          nombreMoneda: 'estrellas',
          iconoMoneda: '⭐',
          participantes: [
            {
              usuarioId: 'u-1',
              nombre: 'Luciana',
              saldo: 12,
              objetivoNombre: 'Helado',
              objetivoFaltan: 8,
            },
            {
              usuarioId: 'u-2',
              nombre: 'José',
              saldo: 0,
              objetivoNombre: null,
              objetivoFaltan: null,
            },
          ],
        },
      });
    });
  });

  describe('listar_tienda', () => {
    it('devuelve el productoId, que es lo que ninguna lectura devolvía', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.ejecutar('listar_tienda', {}, CONTEXTO);

      expect(resultado).toEqual({
        ok: true,
        datos: {
          productos: [
            {
              productoId: 'prod-1',
              nombre: 'Helado',
              descripcion: null,
              precio: 30,
              fuente: 'ITEM',
              mecanica: 'ELECCION',
              recompensaId: 'r-1',
              bolsaId: null,
              estado: 'ACTIVA',
            },
            {
              productoId: 'prod-2',
              nombre: 'Sorpresa',
              descripcion: null,
              precio: 50,
              fuente: 'BOLSA',
              mecanica: 'AZAR',
              recompensaId: null,
              bolsaId: 'bol-1',
              estado: 'ARCHIVADA',
            },
          ],
          bolsas: [
            {
              bolsaId: 'bol-1',
              nombre: 'Premios chicos',
              recompensaIds: ['r-1'],
              estado: 'ACTIVA',
            },
          ],
        },
      });
    });

    it('filtra por estado las dos listas', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.ejecutar('listar_tienda', { estado: 'ACTIVA' }, CONTEXTO);
      const datos = (resultado as { datos: { productos: unknown[]; bolsas: unknown[] } }).datos;

      expect(datos.productos).toHaveLength(1);
      expect(datos.bolsas).toHaveLength(1);
    });

    it('una tienda que no se pudo leer no rompe la conversación', async () => {
      const { servicio, rewards } = crearMocks();

      vi.mocked(rewards.tienda).mockResolvedValueOnce({ productos: [], bolsas: [] });

      const resultado = await servicio.ejecutar('listar_tienda', {}, CONTEXTO);

      expect(resultado).toEqual({ ok: true, datos: { productos: [], bolsas: [] } });
    });
  });

  describe('listar_etiquetas y listar_turnos', () => {
    it('las etiquetas salen con su id, que es lo que hace falta para asignarlas', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.ejecutar('listar_etiquetas', {}, CONTEXTO);

      expect(resultado).toEqual({
        ok: true,
        datos: [
          { etiquetaId: 'et-1', nombre: 'Golosinas', colorHex: '#EAB308', estado: 'ACTIVA' },
          { etiquetaId: 'et-2', nombre: 'Viejas', colorHex: '#111111', estado: 'ARCHIVADA' },
        ],
      });
    });

    it('el turno conserva el orden y las repeticiones de una persona', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.ejecutar('listar_turnos', {}, CONTEXTO);

      // Que `u-1` aparezca dos veces NO es un error de datos: es cómo se le da
      // más turnos que a los demás (fase-14-21). Un molde que deduplicara
      // rompería el ítem entero sin que nada más se quejara.
      expect(resultado).toEqual({
        ok: true,
        datos: [
          {
            actividadId: 'act-1',
            modo: 'ORDEN_FIJO',
            frecuencia: 'SESION',
            activo: true,
            posiciones: [
              { orden: 1, usuarioId: 'u-1' },
              { orden: 2, usuarioId: 'u-2' },
              { orden: 3, usuarioId: 'u-1' },
            ],
          },
        ],
      });
    });
  });

  describe('configuracion_del_grupo', () => {
    it('compone los tres servicios en una sola respuesta', async () => {
      const { servicio, activity, scoring, rewards } = crearMocks();

      const resultado = await servicio.ejecutar('configuracion_del_grupo', {}, CONTEXTO);

      expect(resultado).toEqual({
        ok: true,
        datos: {
          planDelDiaActivo: true,
          contenidoCreadoPorIntegrantes: {
            modo: 'BAJO_APROBACION',
            maxPuntosPorActividad: 5,
            maxActividadesActivasPorPersona: 5,
          },
          puntosIniciales: 10,
          recompensas: {
            modo: 'TIENDA',
            modoPendiente: null,
            nombreMoneda: 'doradas',
            iconoMoneda: '🪙',
          },
        },
      });

      // Una sola vuelta del loop y tres llamadas en paralelo, no tres
      // herramientas: partirla costaría dos llamadas más al proveedor.
      expect(activity.configuracion).toHaveBeenCalledTimes(1);
      expect(scoring.configuracion).toHaveBeenCalledTimes(1);
      expect(rewards.configuracion).toHaveBeenCalledTimes(1);
    });

    it('un servicio caído deja su parte en null y no inventa un default', async () => {
      const { servicio, rewards } = crearMocks();

      vi.mocked(rewards.configuracion).mockResolvedValueOnce(null);

      const resultado = await servicio.ejecutar('configuracion_del_grupo', {}, CONTEXTO);
      const datos = (resultado as { datos: Record<string, unknown> }).datos;

      // Decir «DIRECTO» sin saberlo haría que el asistente descarte la tienda
      // de un grupo que sí la usa: es peor que no contestar esa parte.
      expect(datos['recompensas']).toBeNull();
      expect(datos['puntosIniciales']).toBe(10);
    });

    it('si no contesta ninguno, es un error legible y no un objeto de nulls', async () => {
      const { servicio, activity, scoring, rewards } = crearMocks();

      vi.mocked(activity.configuracion).mockResolvedValueOnce(null);
      vi.mocked(scoring.configuracion).mockResolvedValueOnce(null);
      vi.mocked(rewards.configuracion).mockResolvedValueOnce(null);

      const resultado = await servicio.ejecutar('configuracion_del_grupo', {}, CONTEXTO);

      expect(resultado.ok).toBe(false);
    });
  });

  describe('resumen_puntajes', () => {
    it('cruza los nombres por ID y marca si el resultado es definitivo', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.ejecutar('resumen_puntajes', {}, CONTEXTO);

      expect(resultado).toEqual({
        ok: true,
        datos: {
          seccionId: 'sec-1',
          // origen EN_VIVO: la sección sigue abierta, los números pueden cambiar.
          definitivo: false,
          puntajes: [
            {
              nombre: 'Luciana',
              usuarioId: 'u-1',
              puntajeTotal: 27,
              zona: 'Verde',
              descalificado: false,
            },
            // Un usuarioId del ledger que ya no está en el grupo (se dio de
            // baja) no rompe nada: queda sin nombre, no desaparece la fila.
            {
              nombre: null,
              usuarioId: 'fantasma',
              puntajeTotal: 3,
              zona: null,
              descalificado: true,
            },
          ],
        },
      });
    });

    it('devuelve error legible si scoring no responde', async () => {
      const { servicio, scoring } = crearMocks();

      vi.mocked(scoring.resumenPuntajes).mockResolvedValueOnce(null);

      const resultado = await servicio.ejecutar('resumen_puntajes', {}, CONTEXTO);

      expect(resultado.ok).toBe(false);
    });
  });

  describe('saneamiento de los argumentos del modelo', () => {
    it('acepta estado ACTIVA/ARCHIVADA y descarta cualquier otra cosa', async () => {
      const { servicio, activity } = crearMocks();

      await servicio.ejecutar('listar_actividades', { estado: 'ACTIVA' }, CONTEXTO);
      await servicio.ejecutar('listar_actividades', { estado: "' OR 1=1 --" }, CONTEXTO);

      expect(vi.mocked(activity.actividades).mock.calls).toEqual([
        ['grupo-1', 'ACTIVA'],
        ['grupo-1', undefined],
      ]);
    });

    it('acota los días en vez de fallar cuando el modelo pide un absurdo', async () => {
      const { servicio, activity } = crearMocks();

      await servicio.ejecutar('resumen_cumplimiento', { dias: 100000 }, CONTEXTO);
      await servicio.ejecutar('resumen_cumplimiento', { dias: 0 }, CONTEXTO);
      await servicio.ejecutar('resumen_cumplimiento', { dias: '7' }, CONTEXTO);
      await servicio.ejecutar('resumen_cumplimiento', {}, CONTEXTO);
      await servicio.ejecutar('resumen_cumplimiento', { dias: 'muchos' }, CONTEXTO);

      expect(vi.mocked(activity.resumenCumplimiento).mock.calls.map((llamada) => llamada[1])).toEqual(
        [365, 1, 7, 30, 30]
      );
    });

    it('un servicio caído devuelve una lista vacía, no rompe la conversación', async () => {
      const { servicio, activity } = crearMocks();

      vi.mocked(activity.resumenCumplimiento).mockResolvedValueOnce(null);

      const resultado = await servicio.ejecutar('resumen_cumplimiento', {}, CONTEXTO);

      // Y sin `grupoId` ni siquiera en este camino: el fallback lo devolvía
      // igual que el DTO real, así que era el mismo agujero por otra puerta.
      expect(resultado).toEqual({ ok: true, datos: { dias: 30, actividades: [] } });
    });
  });
});
