import { Injectable } from '@nestjs/common';

import {
  AccionRendibleDto,
  AlcanceActividad,
  CatalogoRendibleDto,
  ComportamientoAlCierre,
  ModoRecompensas,
  RendimientoAccionDto,
  RendimientosAccionesDto,
  TenantContext,
  TipoAccionRendimiento,
  TipoConducta,
  TipoPuntaje,
  ValorEnMonedasDto,
} from '@dorado/shared-types';

import { ActivityClientService } from '../clientes/activity-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  AccionInexistenteException,
  ConductaMalaNoRindeException,
  MonedasInvalidasException,
} from '../comun/excepciones';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ConfigurarRendimientosAccionesRequest,
  RendimientoAccionItem,
} from './dto/rendimientos-acciones.dto';

/** Decisión 15, escrita una sola vez y resuelta en el backend. */
const MOTIVO_ASUME_HECHA =
  'Esta obligatoria no se confirma, así que nunca se completa — no puede pagar monedas.';

/**
 * Cuántas monedas paga cada acción del catálogo (spec fase-14-28, Parte C) —
 * la segunda fuente de la economía, al lado de `RendimientosService`, que es la
 * primera (el cierre por zona).
 *
 * La lista SIEMPRE sale del catálogo real de activity, no de las filas
 * guardadas: una actividad sin rendimiento tiene que aparecer igual (con
 * `monedas: 0`), porque si no el Tutor no tiene dónde cargarla. Es el mismo
 * criterio que `RendimientosService.listar` con las zonas.
 */
@Injectable()
export class RendimientosAccionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityClientService,
    private readonly acceso: AccesoGrupoService,
    private readonly configuracion: ConfiguracionService,
    private readonly eventos: EventosPublisherService
  ) {}

  async listar(tenant: TenantContext, grupoId: string): Promise<RendimientosAccionesDto> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    const [catalogo, configurados] = await Promise.all([
      this.activity.catalogoRendible(grupoId),
      this.prisma.client.rendimientoAccion.findMany({ where: { grupoId } }),
    ]);

    const porClave = new Map(
      configurados.map((fila) => [`${fila.tipoAccion}:${fila.origenId}`, fila])
    );

    const aDto = (
      accion: AccionRendibleDto,
      tipoAccion: TipoAccionRendimiento
    ): RendimientoAccionDto => {
      const fila = porClave.get(`${tipoAccion}:${accion.id}`);
      const puedeRendir = accionPuedeRendir(accion);

      return {
        tipoAccion,
        origenId: accion.id,
        nombre: accion.nombre,
        valorPuntos: accion.valorPuntos,
        tipoPuntaje: accion.tipoPuntaje,
        alcance: accion.alcance,
        comportamientoAlCierre: accion.comportamientoAlCierre,
        bonoJefePuntos: accion.bonoJefePuntos,
        repeticionesMaximasSesion: accion.repeticionesMaximasSesion,
        monedas: fila?.monedas ?? 0,
        monedasBonoJefe: fila?.monedasBonoJefe ?? 0,
        puedeRendir,
        motivoNoRinde: puedeRendir ? null : MOTIVO_ASUME_HECHA,
      };
    };

    return {
      actividades: catalogo.actividades.map((accion) =>
        aDto(accion, TipoAccionRendimiento.ACTIVIDAD)
      ),
      conductas: catalogo.conductas.map((accion) =>
        aDto(accion, TipoAccionRendimiento.CONDUCTA)
      ),
    };
  }

  /**
   * Parte F: lo que el PARTICIPANTE ve antes de completar. Es el mínimo —
   * `origenId` y monedas— porque el resto ya lo trae `mi-estado-hoy` y el cruce
   * lo hace la pantalla.
   *
   * En modo `DIRECTO` devuelve `[]`: «no se muestra en DIRECTO» queda resuelto
   * acá y no como un `if` más en la plantilla del integrante.
   *
   * NO llama a activity: solo lee las filas guardadas. Una actividad archivada
   * deja de aparecer en la lista del integrante por su propio camino, así que
   * su fila sobrante acá no puede mostrarse.
   */
  async valoresParaElParticipante(
    tenant: TenantContext,
    grupoId: string
  ): Promise<ValorEnMonedasDto[]> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    if ((await this.configuracion.obtenerModo(grupoId)) !== ModoRecompensas.TIENDA) {
      return [];
    }

    const filas = await this.prisma.client.rendimientoAccion.findMany({
      where: { grupoId, tipoAccion: TipoAccionRendimiento.ACTIVIDAD },
    });

    return filas
      .filter((fila) => fila.monedas > 0)
      .map((fila) => ({
        origenId: fila.origenId,
        monedas: fila.monedas,
        monedasBonoJefe: fila.monedasBonoJefe,
      }));
  }

  /**
   * Idempotente: reemplaza el rendimiento de cada acción que venga en el body,
   * y no toca las que no vengan. Se guarda en una sola llamada a propósito
   * (decisión 10): calibrar una economía es mirar todos los números juntos, y
   * un formulario por actividad tendría guardado parcial entre dos servicios.
   *
   * Se carga IGUAL en modo `DIRECTO` (decisión 14): la configuración no se
   * pierde al cambiar de modo, simplemente no tiene efecto hasta que haya
   * tienda. Por eso acá no se chequea el modo.
   */
  async configurar(
    tenant: TenantContext,
    grupoId: string,
    datos: ConfigurarRendimientosAccionesRequest
  ): Promise<RendimientosAccionesDto> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    const catalogo = await this.activity.catalogoRendible(grupoId);

    for (const rendimiento of datos.rendimientos) {
      const accion = await this.resolverAccion(catalogo, rendimiento);

      // Decisión 4: lo que se hace nunca debita. El DTO ya lo valida, pero el
      // code de negocio tiene que existir igual — un 400 genérico no dice cuál
      // de los N números del body estaba mal.
      if (rendimiento.monedas < 0 || (rendimiento.monedasBonoJefe ?? 0) < 0) {
        throw new MonedasInvalidasException();
      }

      await this.prisma.client.rendimientoAccion.upsert({
        where: {
          tipoAccion_origenId: {
            tipoAccion: rendimiento.tipoAccion,
            origenId: rendimiento.origenId,
          },
        },
        create: {
          // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
          organizacionId: tenant.organizacionId,
          grupoId,
          tipoAccion: rendimiento.tipoAccion,
          origenId: rendimiento.origenId,
          nombreSnapshot: accion.nombre,
          monedas: rendimiento.monedas,
          monedasBonoJefe: bonoJefeEfectivo(accion, rendimiento),
        },
        update: {
          nombreSnapshot: accion.nombre,
          monedas: rendimiento.monedas,
          monedasBonoJefe: bonoJefeEfectivo(accion, rendimiento),
        },
      });
    }

    // Retrofit fase-09: rastro de auditoría de toda escritura administrativa.
    await this.eventos.publicarAccionAdministrativa({
      organizacionId: tenant.organizacionId,
      grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion: 'RENDIMIENTOS_ACCIONES_CONFIGURADOS',
      entidadTipo: 'RendimientoAccion',
      entidadId: grupoId,
      detalle: { despues: datos.rendimientos },
    });

    return await this.listar(tenant, grupoId);
  }

  /**
   * El `origenId` tiene que existir, estar activo Y ser de ESTE grupo (regla 2:
   * se cruza por ID vía REST, nunca por join). El catálogo rendible ya viene
   * filtrado por grupo, así que "no está en la lista" cubre los tres casos.
   *
   * La consulta extra a activity es SOLO para distinguir una conducta MALA de
   * una inexistente (decisión 17 quiere su propio code): se paga únicamente
   * cuando el request ya venía mal.
   */
  private async resolverAccion(
    catalogo: CatalogoRendibleDto,
    rendimiento: RendimientoAccionItem
  ): Promise<AccionRendibleDto> {
    const lista =
      rendimiento.tipoAccion === TipoAccionRendimiento.ACTIVIDAD
        ? catalogo.actividades
        : catalogo.conductas;

    const accion = lista.find((fila) => fila.id === rendimiento.origenId);

    if (accion) {
      return accion;
    }

    if (rendimiento.tipoAccion === TipoAccionRendimiento.CONDUCTA) {
      const conducta = await this.activity.conducta(rendimiento.origenId);

      if (conducta?.tipo === TipoConducta.MALA) {
        throw new ConductaMalaNoRindeException();
      }
    }

    throw new AccionInexistenteException();
  }
}

/**
 * Decisión 15: una obligatoria `ASUME_HECHA` nunca genera un registro positivo
 * (fase-14-08), así que nunca puede pagar. NO se bloquea la carga —la pantalla
 * la muestra deshabilitada y dice por qué, misma línea que el aviso de
 * inflación de fase-14-22, que informa sin impedir—, pero se marca acá para
 * que la plantilla no tenga que re-derivar la regla.
 */
function accionPuedeRendir(accion: AccionRendibleDto): boolean {
  return !(
    accion.tipoPuntaje === TipoPuntaje.OBLIGATORIA &&
    accion.comportamientoAlCierre === ComportamientoAlCierre.ASUME_HECHA
  );
}

/**
 * Decisión 8: el bono del jefe solo existe en una actividad de equipo. Fuera de
 * ese caso se fuerza a 0 SIN error, mismo criterio que fase-14-20 con
 * `puntosPorCumplir` — un número que no aplica no es un request inválido, es un
 * campo que sobra.
 */
function bonoJefeEfectivo(
  accion: AccionRendibleDto,
  rendimiento: RendimientoAccionItem
): number {
  if (accion.alcance !== AlcanceActividad.EQUIPO) {
    return 0;
  }

  return rendimiento.monedasBonoJefe ?? 0;
}
