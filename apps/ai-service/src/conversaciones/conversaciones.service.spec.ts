import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  AVISO_IA_VERSION_VIGENTE,
  ConfiguracionIaDto,
  EventoIaSse,
  PrincipalType,
  Rol,
  TenantContext,
} from '@dorado/shared-types';

import type { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  AvisoDesactualizadoException,
  CuotaIaAgotadaException,
  FeatureNoDisponibleException,
  IaNoHabilitadaException,
} from '../comun/excepciones';
import type { ConfiguracionService } from '../configuracion/configuracion.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ConversacionesService } from './conversaciones.service';
import type { PropuestasService } from '../propuestas/propuestas.service';
import { ErrorConConsumo, type LoopService } from './loop.service';

const TENANT: TenantContext = {
  organizacionId: 'org-1',
  grupoIds: ['grupo-1'],
  rol: Rol.TUTOR,
  principalId: 'tutor-1',
  principalType: PrincipalType.TUTOR,
};

function estado(parcial: Partial<ConfiguracionIaDto> = {}): ConfiguracionIaDto {
  return {
    disponibleEnPlan: true,
    habilitada: true,
    avisoAceptado: true,
    aceptoAvisoEn: '2026-08-04T00:00:00.000Z',
    avisoVersionAceptada: AVISO_IA_VERSION_VIGENTE,
    avisoVersionVigente: AVISO_IA_VERSION_VIGENTE,
    cuotaTokensMensuales: 2_000_000,
    tokensConsumidosMes: 0,
    puedeUsarse: true,
    ...parcial,
  };
}

interface Opciones {
  estado?: ConfiguracionIaDto;
  conversacion?: { id: string; grupoId: string } | null;
  loopLanza?: ErrorConConsumo;
}

function crearMocks(opciones: Opciones = {}) {
  const fila = {
    id: 'conv-1',
    grupoId: 'grupo-1',
    titulo: 'Hola',
    archivada: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...opciones.conversacion,
  };
  const prisma = {
    client: {
      conversacion: {
        create: vi.fn(async () => fila),
        findFirst: vi.fn(async () => (opciones.conversacion === null ? null : fila)),
        findMany: vi.fn(async () => [fila]),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      mensaje: {
        create: vi.fn(async () => ({
          id: 'msg-1',
          rol: 'USUARIO',
          contenido: 'Hola',
          herramienta: null,
          createdAt: new Date('2026-08-04T12:00:00.000Z'),
        })),
        createMany: vi.fn(async () => ({ count: 1 })),
        findMany: vi.fn(async () => []),
      },
    },
  } as unknown as PrismaService;

  const configuracion = {
    obtener: vi.fn(async () => opciones.estado ?? estado()),
    tokensConsumidosMes: vi.fn(async () => 1234),
  } as unknown as ConfiguracionService;

  const acceso = {
    contextoPara: vi.fn(async () => ({ organizacionId: 'org-1', grupoId: 'grupo-1' })),
  } as unknown as AccesoGrupoService;

  const propuestas = {
    deConversacion: vi.fn(async () => []),
  } as unknown as PropuestasService;

  const loop = {
    ejecutar: vi.fn(async () => {
      if (opciones.loopLanza) {
        throw opciones.loopLanza;
      }

      return {
        texto: 'respuesta',
        mensajes: [
          {
            rol: 'ASISTENTE' as const,
            contenido: 'respuesta',
            herramienta: null,
            tokensEntrada: 100,
            tokensSalida: 20,
            costoMicroUsd: 440,
            modelo: 'gpt-5.6-terra',
          },
        ],
        tokensTotales: 120,
        cortadoPorTope: false,
        propuestasArmadas: [],
      };
    }),
  } as unknown as LoopService;

  return {
    prisma,
    configuracion,
    acceso,
    loop,
    propuestas,
    servicio: new ConversacionesService(prisma, configuracion, acceso, loop, propuestas),
  };
}

describe('ConversacionesService', () => {
  describe('el gate, en su orden (plan → switch → aviso → cuota)', () => {
    it('una organización sin la feature recibe 402 y no se llama al proveedor', async () => {
      const { servicio, loop } = crearMocks({
        estado: estado({ disponibleEnPlan: false, puedeUsarse: false }),
      });

      await expect(
        servicio.crear(TENANT, { grupoId: 'grupo-1', primerMensaje: 'hola' })
      ).rejects.toBeInstanceOf(FeatureNoDisponibleException);
      expect(loop.ejecutar).not.toHaveBeenCalled();
    });

    it('con la feature pero el switch apagado recibe 403', async () => {
      const { servicio, loop } = crearMocks({
        estado: estado({ habilitada: false, puedeUsarse: false }),
      });

      await expect(
        servicio.crear(TENANT, { grupoId: 'grupo-1', primerMensaje: 'hola' })
      ).rejects.toBeInstanceOf(IaNoHabilitadaException);
      expect(loop.ejecutar).not.toHaveBeenCalled();
    });

    /**
     * fase-14-31 decisión 11, y el criterio de aceptación 14 del lado del uso:
     * el switch está PRENDIDO y el asistente igual no funciona, porque el aviso
     * cambió y el consentimiento que hay es de la versión anterior.
     *
     * El `code` es propio y no `IA_NO_HABILITADA` justamente por eso: mandar al
     * Tutor a pedir que prendan un interruptor que ya está en sí sería la peor
     * versión de este error.
     */
    it('con el aviso desactualizado recibe 403 aunque el switch esté prendido', async () => {
      const { servicio, loop } = crearMocks({
        estado: estado({
          habilitada: true,
          avisoAceptado: false,
          avisoVersionAceptada: 1,
          puedeUsarse: false,
        }),
      });

      await expect(
        servicio.crear(TENANT, { grupoId: 'grupo-1', primerMensaje: 'hola' })
      ).rejects.toBeInstanceOf(AvisoDesactualizadoException);
      expect(loop.ejecutar).not.toHaveBeenCalled();
    });

    /**
     * Criterio de aceptación 5: el pre-flight corta ANTES de gastar, no
     * después. Cortar después ya pagó lo que este chequeo existe para no pagar.
     */
    it('con la cuota agotada recibe 402 y el proveedor NO se llama', async () => {
      const { servicio, loop } = crearMocks({
        estado: estado({ tokensConsumidosMes: 2_000_000, puedeUsarse: false }),
      });

      await expect(
        servicio.crear(TENANT, { grupoId: 'grupo-1', primerMensaje: 'hola' })
      ).rejects.toBeInstanceOf(CuotaIaAgotadaException);
      expect(loop.ejecutar).not.toHaveBeenCalled();
    });

    /**
     * La trampa que dejó anotada la tanda 1: en este modelo `null` significa
     * SIN LÍMITE, o sea lo contrario de «sin cuota». Están a un carácter de
     * distancia y significan lo opuesto.
     */
    it('cuota null es SIN LÍMITE y deja conversar, no lo contrario', async () => {
      const { servicio, loop } = crearMocks({
        estado: estado({ cuotaTokensMensuales: null, tokensConsumidosMes: 99_000_000 }),
      });

      await servicio.crear(TENANT, { grupoId: 'grupo-1', primerMensaje: 'hola' });

      expect(loop.ejecutar).toHaveBeenCalled();
    });

    it('justo en el límite corta (>=, no >)', async () => {
      const { servicio, loop } = crearMocks({
        estado: estado({ cuotaTokensMensuales: 100, tokensConsumidosMes: 100 }),
      });

      await expect(
        servicio.crear(TENANT, { grupoId: 'grupo-1', primerMensaje: 'hola' })
      ).rejects.toBeInstanceOf(CuotaIaAgotadaException);
      expect(loop.ejecutar).not.toHaveBeenCalled();
    });
  });

  it('valida el acceso al grupo antes de crear la conversación', async () => {
    const { servicio, acceso } = crearMocks();

    await servicio.crear(TENANT, { grupoId: 'grupo-1', primerMensaje: 'hola' });

    expect(acceso.contextoPara).toHaveBeenCalledWith(TENANT, 'grupo-1');
  });

  it('deriva el título del primer mensaje y lo recorta', async () => {
    const { servicio, prisma } = crearMocks();
    const largo = 'a'.repeat(200);

    await servicio.crear(TENANT, { grupoId: 'grupo-1', primerMensaje: largo });

    const datos = vi.mocked(prisma.client.conversacion.create).mock.calls[0][0].data;

    expect(String(datos.titulo)).toHaveLength(60);
    expect(String(datos.titulo).endsWith('…')).toBe(true);
  });

  describe('contabilidad ante un fallo (Parte E, punto 6)', () => {
    it('persiste lo consumido aunque el proveedor falle a mitad de camino', async () => {
      const parcial = {
        texto: '',
        mensajes: [
          {
            rol: 'ASISTENTE' as const,
            contenido: '',
            herramienta: null,
            tokensEntrada: 900,
            tokensSalida: 10,
            costoMicroUsd: 1920,
            modelo: 'gpt-5.6-terra',
          },
        ],
        tokensTotales: 910,
        cortadoPorTope: false,
        propuestasArmadas: [],
      };
      const causa = new Error('el proveedor se cayó');
      const { servicio, prisma } = crearMocks({
        loopLanza: new ErrorConConsumo(causa, parcial),
      });

      // Hacia arriba viaja la causa real, no el envoltorio interno.
      await expect(
        servicio.crear(TENANT, { grupoId: 'grupo-1', primerMensaje: 'hola' })
      ).rejects.toBe(causa);

      // Y los 910 tokens quedaron escritos igual: se pagaron.
      const escritos = vi.mocked(prisma.client.mensaje.createMany).mock.calls[0][0]
        .data as Array<{ tokensEntrada: number }>;

      expect(escritos[0].tokensEntrada).toBe(900);
    });
  });

  describe('aislamiento', () => {
    it('una conversación de otro usuario devuelve 404, no 403', async () => {
      // No se confirma la existencia de algo que no le corresponde ver.
      const { servicio } = crearMocks({ conversacion: null });

      await expect(servicio.detalle(TENANT, 'conv-ajena')).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it('el listado filtra por el autor, no solo por el grupo', async () => {
      const { servicio, prisma } = crearMocks();

      await servicio.listar(TENANT, 'grupo-1');

      // `findMany` acepta el argumento opcional, de ahí el `?.`.
      expect(vi.mocked(prisma.client.conversacion.findMany).mock.calls[0][0]?.where).toEqual({
        grupoId: 'grupo-1',
        usuarioId: 'tutor-1',
      });
    });
  });

  it('el historial que se manda al modelo no incluye las filas de herramienta', async () => {
    // El ledger guarda un resumen («ok (1234 bytes)»), no los datos: replicarlo
    // sería mandarle al modelo un texto que no es el catálogo. Que vuelva a
    // leerlo es además la respuesta correcta — los datos pudieron cambiar.
    const { servicio, prisma, loop } = crearMocks();

    vi.mocked(prisma.client.mensaje.findMany).mockResolvedValueOnce([
      { id: '1', rol: 'USUARIO', contenido: 'hola', herramienta: null, createdAt: new Date() },
      { id: '2', rol: 'ASISTENTE', contenido: '', herramienta: null, createdAt: new Date() },
      { id: '3', rol: 'ASISTENTE', contenido: 'qué tal', herramienta: null, createdAt: new Date() },
    ] as never);

    await servicio.crear(TENANT, { grupoId: 'grupo-1', primerMensaje: 'hola' });

    const historial = vi.mocked(loop.ejecutar).mock.calls[0][0];

    // El turno del asistente que fue solo llamadas a herramientas (texto vacío)
    // tampoco viaja: sería mandar un mensaje en blanco.
    expect(historial).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'qué tal' },
    ]);
  });

  describe('lo que viaja al proveedor como identificador', () => {
    it('el safety_identifier es un hash, no el id del usuario', async () => {
      const { servicio, loop } = crearMocks();

      await servicio.crear(TENANT, { grupoId: 'grupo-1', primerMensaje: 'hola' });

      const identificadores = vi.mocked(loop.ejecutar).mock.calls[0][2];

      expect(identificadores.safetyIdentifier).toMatch(/^[a-f0-9]{64}$/);
      expect(identificadores.safetyIdentifier).not.toContain('tutor-1');
      expect(identificadores.safetyIdentifier).not.toContain('org-1');
    });

    /**
     * Los dos motivos por los que la fórmula literal de la spec no sirve, y
     * los dos se descubrieron llamando de verdad:
     *
     * 1. El proveedor rechaza `prompt_cache_key` de más de 64 caracteres, y
     *    `org:<uuid>:grupo:<uuid>` mide 83. Con la fórmula literal ninguna
     *    conversación funcionaba: todas terminaban en 503.
     * 2. Mandaba el id de organización EN CLARO, que es justo lo que la propia
     *    Parte E punto 7 de la spec dice que no sale hacia el proveedor.
     */
    it('el prompt_cache_key entra en 64 caracteres y no lleva ids en claro', async () => {
      const { servicio, loop } = crearMocks();

      await servicio.crear(TENANT, { grupoId: 'grupo-1', primerMensaje: 'hola' });

      const { promptCacheKey } = vi.mocked(loop.ejecutar).mock.calls[0][2];

      expect(promptCacheKey).toHaveLength(64);
      expect(promptCacheKey).not.toContain('org-1');
      expect(promptCacheKey).not.toContain('grupo-1');
    });

    it('mismo grupo ⇒ misma clave; otro grupo ⇒ otra clave', async () => {
      // Es lo único que la clave tiene que cumplir para que el caché sirva.
      const { servicio, loop, acceso } = crearMocks();

      await servicio.crear(TENANT, { grupoId: 'grupo-1', primerMensaje: 'a' });
      await servicio.crear(TENANT, { grupoId: 'grupo-1', primerMensaje: 'b' });
      vi.mocked(acceso.contextoPara).mockResolvedValueOnce({
        organizacionId: 'org-1',
        grupoId: 'grupo-2',
      });
      await servicio.crear(TENANT, { grupoId: 'grupo-2', primerMensaje: 'c' });

      const claves = vi.mocked(loop.ejecutar).mock.calls.map((llamada) => llamada[2].promptCacheKey);

      expect(claves[0]).toBe(claves[1]);
      expect(claves[2]).not.toBe(claves[0]);
    });
  });

  describe('progreso (tanda 6)', () => {
    it('al crear, el id de la conversación sale ANTES de que arranque el loop', async () => {
      const { servicio, loop } = crearMocks();
      const eventos: EventoIaSse[] = [];
      let habiaEventosAlEntrarAlLoop = 0;

      vi.mocked(loop.ejecutar).mockImplementationOnce(async () => {
        habiaEventosAlEntrarAlLoop = eventos.length;

        return {
          texto: 'ok',
          mensajes: [],
          tokensTotales: 0,
          cortadoPorTope: false,
          propuestasArmadas: [],
        };
      });

      await servicio.crear(TENANT, { grupoId: 'grupo-1', primerMensaje: 'hola' }, (evento) =>
        eventos.push(evento)
      );

      // Sin esto el navegador pasa el turno entero sin saber contra qué
      // conversación habla, y un corte a mitad le deja una conversación que
      // existe en la base y que su pantalla no conoce.
      expect(eventos[0]).toEqual({
        tipo: 'conversacion',
        conversacion: expect.objectContaining({ id: 'conv-1' }),
      });
      expect(habiaEventosAlEntrarAlLoop).toBe(2);
    });

    it('manda el mensaje del usuario con su id real y el texto al terminar', async () => {
      const { servicio } = crearMocks();
      const eventos: EventoIaSse[] = [];

      await servicio.enviarMensaje(TENANT, 'conv-1', 'hola', (evento) => eventos.push(evento));

      expect(eventos).toEqual([
        { tipo: 'mensaje', mensaje: expect.objectContaining({ id: 'msg-1', rol: 'USUARIO' }) },
        { tipo: 'texto', texto: 'respuesta' },
      ]);
    });

    it('sin emisor no cambia nada: el turno corre igual', async () => {
      const { servicio, loop } = crearMocks();

      const salida = await servicio.enviarMensaje(TENANT, 'conv-1', 'hola');

      // El request/response de siempre no tiene ninguna rama nueva por existir
      // el stream — es el mismo camino con el callback en undefined.
      expect(salida.tokensConsumidosMes).toBe(1234);
      expect(vi.mocked(loop.ejecutar).mock.calls[0][4]).toBeUndefined();
    });

    it('un fallo del proveedor NO manda el texto, pero escribe la contabilidad', async () => {
      const parcial = {
        texto: '',
        mensajes: [
          {
            rol: 'ASISTENTE' as const,
            contenido: '',
            herramienta: null,
            tokensEntrada: 100,
            tokensSalida: 0,
            costoMicroUsd: 100,
            modelo: 'gpt-5.6-terra',
          },
        ],
        tokensTotales: 100,
        cortadoPorTope: false,
        propuestasArmadas: [],
      };
      const { servicio, prisma } = crearMocks({
        loopLanza: new ErrorConConsumo(new Error('503'), parcial),
      });
      const eventos: EventoIaSse[] = [];

      await servicio
        .enviarMensaje(TENANT, 'conv-1', 'hola', (evento) => eventos.push(evento))
        .catch(() => undefined);

      expect(eventos.some((evento) => evento.tipo === 'texto')).toBe(false);
      expect(prisma.client.mensaje.createMany).toHaveBeenCalled();
    });
  });
});
