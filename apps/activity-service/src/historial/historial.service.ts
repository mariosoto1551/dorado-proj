import { Injectable } from '@nestjs/common';

import {
  EquipoInternoDto,
  EstadoSesion,
  EventoHistorialDto,
  HistorialSesionDto,
  NotaRegistroDto,
  TenantContext,
  TipoEventoHistorial,
  TipoRegistroHistorial,
  TutorDto,
  UsuarioDto,
} from '@dorado/shared-types';

import { IdentityClientService } from '../clientes/identity-client.service';
import type { SeccionActualInterna } from '../clientes/session-client.service';
import { SessionClientService } from '../clientes/session-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import type {
  NotaRegistro,
  RegistroActividad,
  RegistroConducta,
  RegistroTareaEquipo,
} from '../generated/prisma/client';
import { TipoRegistroActividad } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { codificarCursor, decodificarCursor, filtroDesdeCursor } from './cursor';
import type { HistorialQuery } from './dto/historial.dto';

/** Nombre que ve el tutor cuando el castigo lo generó el cierre automático. */
const AUTOR_SISTEMA = 'Automático al cerrar el día';

/**
 * Fallbacks legibles (spec, decisión 12): el historial es la pantalla que MÁS
 * tiene que aguantar datos viejos — un tutor que se fue, un integrante dado de
 * baja. Nunca se devuelve un uuid crudo ni se rompe la respuesta.
 */
const NOMBRE_USUARIO_AUSENTE = 'Participante (ya no está en el grupo)';
const NOMBRE_TUTOR_AUSENTE = 'Tutor (ya no está en el grupo)';
const NOMBRE_ITEM_AUSENTE = 'Ya no está en el catálogo';
const NOMBRE_EQUIPO_AUSENTE = 'Equipo';

/** Fila cruda de cualquiera de las tres tablas, con su clave de orden. */
interface FilaDelTimeline {
  createdAt: Date;
  id: string;
  aEvento: (nombres: Nombres) => EventoHistorialDto;
}

/** Los mapas de nombres resueltos una sola vez por request. */
interface Nombres {
  usuarios: Map<string, string>;
  tutores: Map<string, string>;
  items: Map<string, string>;
  equipos: Map<string, string>;
}

/** Sesión sobre la que se arma el timeline (spec, decisión 14). */
interface SesionDelHistorial {
  id: string;
  estado: EstadoSesion;
}

/**
 * Historial de la sesión (spec fase-14-18): la línea de tiempo del grupo.
 *
 * **No hay tabla de eventos.** El timeline se arma leyendo y uniendo las tres
 * tablas que ya existen (`RegistroActividad`, `RegistroConducta`,
 * `RegistroTareaEquipo`, decisión 10): materializar una copia sería duplicar el
 * ledger en algo que puede desincronizarse — la misma prohibición que la regla
 * 1 de CLAUDE.md le impone al puntaje, aplicada a la trazabilidad.
 *
 * Costo por request, **independiente de la cantidad de filas** (decisión 12):
 * 3 consultas de registros + 2 de catálogo + 1 de notas, y 4 llamadas REST
 * internas (grupo, usuarios, tutores, equipos).
 */
@Injectable()
export class HistorialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly session: SessionClientService,
    private readonly identity: IdentityClientService,
    private readonly acceso: AccesoGrupoService
  ) {}

  /** GET /activity/grupos/:grupoId/historial — TUTOR / ORG_ADMIN. */
  async historialDeLaSesion(
    tenant: TenantContext,
    grupoId: string,
    filtros: HistorialQuery
  ): Promise<HistorialSesionDto> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    const [seccion, grupo] = await Promise.all([
      this.session.obtenerSeccionActual(grupoId),
      this.identity.obtenerGrupo(grupoId),
    ]);

    const timezoneGrupo = grupo?.timezone ?? 'UTC';
    const sesion = resolverSesionDelHistorial(seccion);

    // Sin Sección vigente no es un error: es un grupo que todavía no arrancó
    // (mismo criterio que `completadas` y `marcas` del ítem 12).
    if (!sesion) {
      return {
        sesionId: null,
        sesionEstado: null,
        timezoneGrupo,
        eventos: [],
        cursorSiguiente: null,
      };
    }

    const limite = filtros.limite ?? 50;
    const cursor = filtros.cursor ? decodificarCursor(filtros.cursor) : undefined;
    const filas = await this.leerFilas(tenant, grupoId, sesion.id, filtros, cursor, limite);

    // k-way merge: cada tabla trajo sus `limite + 1` más nuevos posteriores al
    // cursor, así que el tope global de la página ya está contenido acá.
    filas.sort(compararDescendente);

    const pagina = filas.slice(0, limite);
    const hayMas = filas.length > limite;
    const nombres = await this.resolverNombres(grupoId, pagina);
    const eventos = pagina.map((fila) => fila.aEvento(nombres));

    await this.adjuntarNotas(eventos, tenant, nombres);

    const ultima = pagina.at(-1);

    return {
      sesionId: sesion.id,
      sesionEstado: sesion.estado,
      timezoneGrupo,
      eventos,
      cursorSiguiente: hayMas && ultima ? codificarCursor(ultima) : null,
    };
  }

  /** Las tres consultas de registros, en paralelo, ya mapeadas a filas. */
  private async leerFilas(
    tenant: TenantContext,
    grupoId: string,
    sesionId: string,
    filtros: HistorialQuery,
    cursor: ReturnType<typeof decodificarCursor> | undefined,
    limite: number
  ): Promise<FilaDelTimeline[]> {
    // organizacionId y grupoId explícitos aunque la extensión de tenant ya
    // filtre: `RegistroTareaEquipo` NO es un modelo tenant-scoped declarado, y
    // el filtro automático acota por `grupoId IN grupoIds` (todos los grupos
    // del tutor), no por ESTE grupo.
    const base = {
      organizacionId: tenant.organizacionId,
      grupoId,
      sesionId,
      ...filtroDesdeCursor(cursor),
      ...(filtros.incluirAnulados === false && { eliminado: false }),
    };

    const orden = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
    const take = limite + 1;
    const quiere = (tipo: TipoRegistroHistorial): boolean =>
      filtros.tipo === undefined || filtros.tipo === tipo;

    const [actividades, conductas, tareasEquipo] = await Promise.all([
      quiere(TipoRegistroHistorial.ACTIVIDAD)
        ? this.prisma.client.registroActividad.findMany({
            where: { ...base, ...(filtros.usuarioId && { usuarioId: filtros.usuarioId }) },
            orderBy: orden,
            take,
          })
        : Promise.resolve([]),
      quiere(TipoRegistroHistorial.CONDUCTA)
        ? this.prisma.client.registroConducta.findMany({
            where: { ...base, ...(filtros.usuarioId && { usuarioId: filtros.usuarioId }) },
            orderBy: orden,
            take,
          })
        : Promise.resolve([]),
      quiere(TipoRegistroHistorial.TAREA_EQUIPO)
        ? this.prisma.client.registroTareaEquipo.findMany({
            where: {
              ...base,
              // El snapshot manda: filtra por quién RECIBIÓ puntos ese día, no
              // por quién es miembro hoy (mismo criterio que el ítem 13).
              ...(filtros.usuarioId && {
                miembrosSnapshot: { array_contains: [{ usuarioId: filtros.usuarioId }] },
              }),
            },
            orderBy: orden,
            take,
          })
        : Promise.resolve([]),
    ]);

    return [
      ...actividades.map((fila) => filaDeActividad(fila)),
      ...conductas.map((fila) => filaDeConducta(fila)),
      ...tareasEquipo.map((fila) => filaDeTareaEquipo(fila)),
    ];
  }

  /** Cuatro llamadas internas + dos consultas de catálogo, siempre las mismas. */
  private async resolverNombres(grupoId: string, pagina: FilaDelTimeline[]): Promise<Nombres> {
    const vacio: Nombres = {
      usuarios: new Map(),
      tutores: new Map(),
      items: new Map(),
      equipos: new Map(),
    };

    if (pagina.length === 0) {
      return vacio;
    }

    // El id de la actividad/conducta y el del equipo se sacan del DTO provisorio
    // (armado con los mapas vacíos): evita duplicar acá la lógica de cada tabla.
    const provisorios = pagina.map((fila) => fila.aEvento(vacio));
    const itemIds = [...new Set(provisorios.map((evento) => evento.itemId))];
    const hayEquipos = provisorios.some((evento) => evento.equipoId !== null);

    const [usuarios, tutores, equipos, actividades, conductas] = await Promise.all([
      this.identity.usuariosDelGrupo(grupoId),
      this.identity.tutoresDelGrupo(grupoId),
      hayEquipos
        ? this.identity.equiposDelGrupo(grupoId)
        : Promise.resolve([] as EquipoInternoDto[]),
      // Cruce por ID dentro del MISMO servicio: no rompe la regla 2.
      this.prisma.client.actividad.findMany({
        where: { grupoId, id: { in: itemIds } },
        select: { id: true, nombre: true },
      }),
      this.prisma.client.conducta.findMany({
        where: { grupoId, id: { in: itemIds } },
        select: { id: true, nombre: true },
      }),
    ]);

    return {
      usuarios: new Map(usuarios.map((usuario: UsuarioDto) => [usuario.id, usuario.nombre])),
      tutores: new Map(tutores.map((tutor: TutorDto) => [tutor.id, tutor.nombre])),
      items: new Map(
        [...actividades, ...conductas].map((item) => [item.id, item.nombre] as const)
      ),
      equipos: new Map(equipos.map((equipo) => [equipo.equipoId, equipo.nombre])),
    };
  }

  /** Una sola consulta de notas para toda la página. */
  private async adjuntarNotas(
    eventos: EventoHistorialDto[],
    tenant: TenantContext,
    nombres: Nombres
  ): Promise<void> {
    if (eventos.length === 0) {
      return;
    }

    const notas = await this.prisma.client.notaRegistro.findMany({
      where: { registroId: { in: eventos.map((evento) => evento.id) } },
      orderBy: { createdAt: 'asc' },
    });

    if (notas.length === 0) {
      return;
    }

    const porRegistro = new Map<string, NotaRegistroDto[]>();

    for (const nota of notas) {
      const lista = porRegistro.get(nota.registroId) ?? [];
      lista.push(notaADto(nota, tenant, nombres));
      porRegistro.set(nota.registroId, lista);
    }

    for (const evento of eventos) {
      evento.notas = porRegistro.get(evento.id) ?? [];
    }
  }
}

/** DTO público de una nota, con el nombre del autor ya resuelto. */
export function notaADto(
  nota: NotaRegistro,
  tenant: TenantContext,
  nombres: Pick<Nombres, 'tutores'>
): NotaRegistroDto {
  return {
    id: nota.id,
    texto: nota.texto,
    autorTutorId: nota.autorTutorId,
    autorNombre: nombres.tutores.get(nota.autorTutorId) ?? NOMBRE_TUTOR_AUSENTE,
    createdAt: nota.createdAt.toISOString(),
    esPropia: nota.autorTutorId === tenant.principalId,
  };
}

/**
 * Sesión del historial (spec, decisión 14): la ABIERTA; si no hay, la última ya
 * empezada de la Sección vigente, que el frontend muestra en solo lectura. Así
 * el tutor que entra a las 22:05 ve su día en vez de una pantalla vacía.
 */
function resolverSesionDelHistorial(
  seccion: SeccionActualInterna | null
): SesionDelHistorial | null {
  if (!seccion || seccion.sesiones.length === 0) {
    return null;
  }

  const abierta = seccion.sesiones.find((sesion) => sesion.estado === EstadoSesion.ABIERTA);

  if (abierta) {
    return { id: abierta.id, estado: EstadoSesion.ABIERTA };
  }

  const ahora = Date.now();
  const empezadas = seccion.sesiones
    .filter((sesion) => new Date(sesion.fechaInicio).getTime() <= ahora)
    .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));

  const ultima = empezadas[0];

  return ultima ? { id: ultima.id, estado: ultima.estado } : null;
}

/** Orden del timeline: más reciente primero, con el id como desempate estable. */
function compararDescendente(a: FilaDelTimeline, b: FilaDelTimeline): number {
  const porFecha = b.createdAt.getTime() - a.createdAt.getTime();

  return porFecha !== 0 ? porFecha : b.id.localeCompare(a.id);
}

function filaDeActividad(registro: RegistroActividad): FilaDelTimeline {
  return {
    createdAt: registro.createdAt,
    id: registro.id,
    aEvento: (nombres) => ({
      id: registro.id,
      tipo:
        registro.tipo === TipoRegistroActividad.NO_HIZO
          ? TipoEventoHistorial.ACTIVIDAD_NO_HIZO
          : TipoEventoHistorial.ACTIVIDAD_COMPLETADA,
      ocurridoEn: registro.createdAt.toISOString(),
      usuarioId: registro.usuarioId,
      usuarioNombre: nombres.usuarios.get(registro.usuarioId) ?? NOMBRE_USUARIO_AUSENTE,
      equipoId: null,
      equipoNombre: null,
      itemId: registro.actividadId,
      itemNombre: nombres.items.get(registro.actividadId) ?? NOMBRE_ITEM_AUSENTE,
      puntos: registro.valorPuntosSnapshot,
      bonoJefe: null,
      cantidadMiembros: null,
      registradoPorId: registro.registradoPorId,
      registradoPorTipo: registro.registradoPorTipo as EventoHistorialDto['registradoPorTipo'],
      registradoPorNombre: nombreDeAutor(
        registro.registradoPorId,
        registro.registradoPorTipo,
        nombres
      ),
      anulado: registro.eliminado,
      anuladoPorNombre: nombreDeTutor(registro.eliminadoPorTutorId, nombres),
      anuladoEn: registro.eliminadoEn?.toISOString() ?? null,
      motivoTutor: registro.motivoTutor,
      revertidoEn: registro.revertidoEn?.toISOString() ?? null,
      revertidoPorNombre: nombreDeTutor(registro.revertidoPorTutorId, nombres),
      notas: [],
    }),
  };
}

function filaDeConducta(registro: RegistroConducta): FilaDelTimeline {
  return {
    createdAt: registro.createdAt,
    id: registro.id,
    aEvento: (nombres) => ({
      id: registro.id,
      tipo: TipoEventoHistorial.CONDUCTA,
      ocurridoEn: registro.createdAt.toISOString(),
      usuarioId: registro.usuarioId,
      usuarioNombre: nombres.usuarios.get(registro.usuarioId) ?? NOMBRE_USUARIO_AUSENTE,
      equipoId: null,
      equipoNombre: null,
      itemId: registro.conductaId,
      itemNombre: nombres.items.get(registro.conductaId) ?? NOMBRE_ITEM_AUSENTE,
      puntos: registro.valorPuntosSnapshot,
      bonoJefe: null,
      cantidadMiembros: null,
      registradoPorId: registro.registradoPorId,
      registradoPorTipo: registro.registradoPorTipo as EventoHistorialDto['registradoPorTipo'],
      registradoPorNombre: nombreDeAutor(
        registro.registradoPorId,
        registro.registradoPorTipo,
        nombres
      ),
      anulado: registro.eliminado,
      anuladoPorNombre: nombreDeTutor(registro.eliminadoPorTutorId, nombres),
      anuladoEn: registro.eliminadoEn?.toISOString() ?? null,
      // RegistroConducta no tiene motivo ni reversión: la asimetría con
      // actividades está declarada fuera de alcance en la spec, no es un olvido.
      motivoTutor: null,
      revertidoEn: null,
      revertidoPorNombre: null,
      notas: [],
    }),
  };
}

function filaDeTareaEquipo(registro: RegistroTareaEquipo): FilaDelTimeline {
  const miembros = Array.isArray(registro.miembrosSnapshot) ? registro.miembrosSnapshot : [];

  return {
    createdAt: registro.createdAt,
    id: registro.id,
    aEvento: (nombres) => ({
      id: registro.id,
      tipo: TipoEventoHistorial.TAREA_EQUIPO,
      ocurridoEn: registro.createdAt.toISOString(),
      usuarioId: null,
      usuarioNombre: null,
      equipoId: registro.equipoId,
      equipoNombre: nombres.equipos.get(registro.equipoId) ?? NOMBRE_EQUIPO_AUSENTE,
      itemId: registro.actividadId,
      itemNombre: nombres.items.get(registro.actividadId) ?? NOMBRE_ITEM_AUSENTE,
      // Lo que recibió CADA miembro; el bono del jefe viaja aparte.
      puntos: registro.valorPuntosSnapshot,
      bonoJefe: registro.bonoJefeSnapshot,
      cantidadMiembros: miembros.length,
      registradoPorId: registro.completadaPorId,
      registradoPorTipo: registro.completadaPorTipo as EventoHistorialDto['registradoPorTipo'],
      registradoPorNombre: nombreDeAutor(
        registro.completadaPorId,
        registro.completadaPorTipo,
        nombres
      ),
      anulado: registro.eliminado,
      anuladoPorNombre: nombreDeTutor(registro.eliminadoPorTutorId, nombres),
      anuladoEn: registro.eliminadoEn?.toISOString() ?? null,
      motivoTutor: registro.motivoTutor,
      revertidoEn: registro.revertidoEn?.toISOString() ?? null,
      revertidoPorNombre: nombreDeTutor(registro.revertidoPorTutorId, nombres),
      notas: [],
    }),
  };
}

function nombreDeAutor(id: string, tipo: string, nombres: Nombres): string {
  if (tipo === 'SYSTEM') {
    return AUTOR_SISTEMA;
  }

  if (tipo === 'USUARIO') {
    return nombres.usuarios.get(id) ?? NOMBRE_USUARIO_AUSENTE;
  }

  return nombres.tutores.get(id) ?? NOMBRE_TUTOR_AUSENTE;
}

function nombreDeTutor(id: string | null, nombres: Nombres): string | null {
  if (!id) {
    return null;
  }

  return nombres.tutores.get(id) ?? NOMBRE_TUTOR_AUSENTE;
}
