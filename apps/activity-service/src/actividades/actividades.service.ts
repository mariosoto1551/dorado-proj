import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { ActividadDto, Rol, TenantContext } from '@dorado/shared-types';

import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { ContextoParticipanteService } from '../comun/contexto-participante.service';
import { esDestinatario } from '../comun/destinatario';
import {
  DestinatarioAmbiguoException,
  DestinatarioIncompatibleConAlcanceException,
  EquipoFueraDelGrupoException,
  RestriccionRolSoloIndividualException,
  RolGrupoInexistenteException,
  TareaEquipoDebeSerOpcionalException,
  UsuarioFueraDelGrupoException,
  VigenciaInvalidaException,
} from '../comun/excepciones';
import { asegurarLimiteActividadesDelGrupo } from '../comun/limite-plan-actividades';
import { validarCamposLimiteTiempo } from '../comun/limite-tiempo';
import { esFechaCivilValida, normalizarDiasSemana } from '../comun/programacion';
import { actividadADto } from '../comun/mapeadores';
import {
  esVisiblePara,
  filtroVisibilidadUsuario,
} from '../comun/visibilidad-actividad';
import { BillingClientService } from '../clientes/billing-client.service';
import { IdentityClientService } from '../clientes/identity-client.service';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Actividad } from '../generated/prisma/client';
import {
  AlcanceActividad,
  ComportamientoAlCierre,
  EstadoCatalogo,
  TipoPuntaje,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CrearActividadRequest,
  EditarActividadRequest,
  ListarActividadesQuery,
} from './dto/actividades.dto';

@Injectable()
export class ActividadesService {
  private readonly logger = new Logger(ActividadesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingClientService,
    private readonly acceso: AccesoGrupoService,
    private readonly eventos: EventosPublisherService,
    private readonly identity: IdentityClientService,
    private readonly contexto: ContextoParticipanteService
  ) {}

  async crear(
    tenant: TenantContext,
    grupoId: string,
    datos: CrearActividadRequest
  ): Promise<ActividadDto> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    // Campos condicionales ANTES del límite de plan: un request malformado
    // falla rápido (400) sin gastar la llamada REST a billing.
    const campos = validarCamposLimiteTiempo(
      datos.tipoLimiteTiempo,
      datos.deadlineHora ?? null,
      datos.duracionCronometroMinutos ?? null
    );

    const equipo = this.resolverAlcance(
      datos.tipoPuntaje,
      datos.alcance,
      datos.bonoJefePuntos
    );

    // fase-14-20: el premio depende del comportamiento al cierre, así que se
    // resuelve ese primero y se reusa (no se llama dos veces a resolverComportamiento).
    const comportamiento = this.resolverComportamiento(
      datos.tipoPuntaje,
      datos.comportamientoAlCierre
    );

    // fase-14-19 + fase-14-24: valida el destinatario contra identity (roles,
    // participantes o equipos del grupo). Va antes del límite de plan por el
    // mismo motivo que los campos condicionales: un request malformado no
    // debería gastar la llamada a billing.
    const destinatario = await this.resolverDestinatario(grupoId, equipo.alcance, {
      roles: datos.rolesPermitidos,
      usuarios: datos.usuariosPermitidos,
      equipos: datos.equiposPermitidos,
    });

    // fase-14-24: la vigencia se valida sin tocar la red (formato y orden).
    const vigencia = this.resolverVigencia({
      desde: datos.vigenteDesde,
      hasta: datos.vigenteHasta,
    });

    await this.asegurarLimiteActividades(tenant.organizacionId, grupoId);

    const actividad = await this.prisma.client.actividad.create({
      data: {
        // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
        organizacionId: tenant.organizacionId,
        grupoId,
        nombre: datos.nombre,
        descripcion: datos.descripcion ?? null,
        tipoPuntaje: datos.tipoPuntaje,
        valorPuntos: datos.valorPuntos,
        tipoLimiteTiempo: datos.tipoLimiteTiempo,
        deadlineHora: campos.deadlineHora,
        duracionCronometroMinutos: campos.duracionCronometroMinutos,
        ...(datos.repeticionesMaximasSesion !== undefined && {
          repeticionesMaximasSesion: datos.repeticionesMaximasSesion,
        }),
        repeticionesMaximasSeccion: datos.repeticionesMaximasSeccion ?? null,
        comportamientoAlCierre: comportamiento,
        // fase-14-20: el premio por cumplirla, 0 fuera de OBLIGATORIA confirmable.
        puntosPorCumplir: this.resolverPuntosPorCumplir(
          datos.tipoPuntaje,
          comportamiento,
          datos.puntosPorCumplir
        ),
        alcance: equipo.alcance,
        bonoJefePuntos: equipo.bonoJefePuntos,
        diasSemana: normalizarDiasSemana(datos.diasSemana),
        siempreVisible: this.resolverSiempreVisible(
          datos.tipoPuntaje,
          equipo.alcance,
          datos.siempreVisible
        ),
        rolesPermitidos: destinatario.roles,
        // fase-14-24: destinatario nominal y vigencia. Los tres arrays son
        // excluyentes — `resolverDestinatario` ya garantizó que a lo sumo uno
        // quedó no vacío.
        usuariosPermitidos: destinatario.usuarios,
        equiposPermitidos: destinatario.equipos,
        vigenteDesde: vigencia.desde,
        vigenteHasta: vigencia.hasta,
        creadaPorTutorId: tenant.principalId,
      },
    });

    // Retrofit fase-09: rastro de auditoría de toda escritura administrativa.
    await this.publicarAuditoria(tenant, 'ACTIVIDAD_CREADA', actividad.id, actividad.grupoId, {
      despues: actividadADto(actividad),
    });

    return actividadADto(actividad);
  }

  async listar(
    tenant: TenantContext,
    grupoId: string,
    query: ListarActividadesQuery
  ): Promise<ActividadDto[]> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    // USUARIO solo ve ACTIVA y su query param se ignora (spec fase-05).
    const esUsuario = tenant.rol === Rol.USUARIO;
    const estado = esUsuario ? EstadoCatalogo.ACTIVA : query.estado;

    const actividades = await this.prisma.client.actividad.findMany({
      // El filtro organizacionId (+ grupoId IN grupoIds) lo agrega la tenant
      // extension; grupoId acá acota al grupo pedido dentro de los accesibles.
      where: {
        grupoId,
        ...(estado && { estado }),
        // fase-14-10: el contenido de un integrante es personal — no aparece en
        // el catálogo de sus compañeros (el tutor sí ve todo, para moderar).
        ...(esUsuario && filtroVisibilidadUsuario(tenant.principalId)),
      },
      orderBy: { createdAt: 'asc' },
    });

    // fase-14-19 + fase-14-24: las restringidas a un rol, a personas o a equipos
    // ajenos se ocultan. El cruce REST se paga solo si el catálogo tiene alguna
    // restricción de esas (ver ContextoParticipanteService), y solo para un
    // USUARIO — el Tutor ve todo, que es lo que necesita para gestionar.
    if (!esUsuario) {
      return actividades.map(actividadADto);
    }

    const contexto = await this.contexto.resolver(grupoId, tenant.principalId, actividades);

    return actividades
      .filter((actividad) => esDestinatario(actividad, contexto))
      .map(actividadADto);
  }

  async detalle(tenant: TenantContext, id: string): Promise<ActividadDto> {
    const actividad = await this.buscarAccesible(tenant, id);

    return actividadADto(actividad);
  }

  async editar(
    tenant: TenantContext,
    id: string,
    datos: EditarActividadRequest
  ): Promise<ActividadDto> {
    const existente = await this.buscarAccesible(tenant, id);

    // Estado efectivo post-PATCH de los campos de límite de tiempo. Si el tipo
    // CAMBIA, los condicionales no provistos se resetean a null (no se
    // arrastra la config del tipo anterior); si no cambia, conservan su valor.
    const tipoEfectivo = datos.tipoLimiteTiempo ?? existente.tipoLimiteTiempo;
    const cambioTipo =
      datos.tipoLimiteTiempo !== undefined &&
      datos.tipoLimiteTiempo !== existente.tipoLimiteTiempo;
    const deadlineEfectiva =
      datos.deadlineHora !== undefined
        ? datos.deadlineHora
        : cambioTipo
          ? null
          : existente.deadlineHora;
    const duracionEfectiva =
      datos.duracionCronometroMinutos !== undefined
        ? datos.duracionCronometroMinutos
        : cambioTipo
          ? null
          : existente.duracionCronometroMinutos;

    const campos = validarCamposLimiteTiempo(tipoEfectivo, deadlineEfectiva, duracionEfectiva);

    // Estado efectivo del comportamiento al cierre (fase-14-08): si el tipo
    // pasa a OPCIONAL se fuerza ASUME_HECHA (aunque el cliente no lo mande); si
    // sigue OBLIGATORIA, conserva el existente salvo que se pida uno nuevo.
    const tipoPuntajeEfectivo = datos.tipoPuntaje ?? (existente.tipoPuntaje as TipoPuntaje);
    const comportamientoEfectivo = this.resolverComportamiento(
      tipoPuntajeEfectivo,
      datos.comportamientoAlCierre,
      existente.comportamientoAlCierre as ComportamientoAlCierre
    );

    // Alcance efectivo (fase-14-09): mismo criterio que el comportamiento — se
    // revalida contra el tipoPuntaje efectivo, tomando lo pedido o lo existente.
    const equipo = this.resolverAlcance(
      tipoPuntajeEfectivo,
      datos.alcance ?? (existente.alcance as AlcanceActividad),
      datos.bonoJefePuntos ?? existente.bonoJefePuntos
    );

    // fase-14-19: se revalida contra el alcance efectivo — pasar una actividad
    // restringida a alcance EQUIPO tiene que fallar, no restringir un equipo por
    // rol a escondidas. Un PATCH que no manda el campo conserva la restricción.
    const destinatario = await this.resolverDestinatario(
      existente.grupoId,
      equipo.alcance,
      {
        roles: datos.rolesPermitidos,
        usuarios: datos.usuariosPermitidos,
        equipos: datos.equiposPermitidos,
      },
      {
        roles: existente.rolesPermitidos,
        usuarios: existente.usuariosPermitidos,
        equipos: existente.equiposPermitidos,
      }
    );

    const vigencia = this.resolverVigencia(
      { desde: datos.vigenteDesde, hasta: datos.vigenteHasta },
      { desde: existente.vigenteDesde, hasta: existente.vigenteHasta }
    );

    // updateMany (no update): pasa por el filtro automático de tenant.
    await this.prisma.client.actividad.updateMany({
      where: { id },
      data: {
        ...(datos.nombre !== undefined && { nombre: datos.nombre }),
        ...(datos.descripcion !== undefined && { descripcion: datos.descripcion }),
        ...(datos.tipoPuntaje !== undefined && { tipoPuntaje: datos.tipoPuntaje }),
        ...(datos.valorPuntos !== undefined && { valorPuntos: datos.valorPuntos }),
        tipoLimiteTiempo: tipoEfectivo,
        deadlineHora: campos.deadlineHora,
        duracionCronometroMinutos: campos.duracionCronometroMinutos,
        ...(datos.repeticionesMaximasSesion !== undefined && {
          repeticionesMaximasSesion: datos.repeticionesMaximasSesion,
        }),
        ...(datos.repeticionesMaximasSeccion !== undefined && {
          repeticionesMaximasSeccion: datos.repeticionesMaximasSeccion,
        }),
        comportamientoAlCierre: comportamientoEfectivo,
        // fase-14-20: se recalcula siempre, igual que el comportamiento y el
        // alcance — pasar la obligatoria a ASUME_HECHA (o a OPCIONAL) tiene que
        // apagar el premio aunque el PATCH no mande el campo.
        puntosPorCumplir: this.resolverPuntosPorCumplir(
          tipoPuntajeEfectivo,
          comportamientoEfectivo,
          datos.puntosPorCumplir,
          existente.puntosPorCumplir
        ),
        alcance: equipo.alcance,
        bonoJefePuntos: equipo.bonoJefePuntos,
        // fase-14-11: solo se toca si el request lo trae (un PATCH parcial no
        // debe borrar la programación existente).
        ...(datos.diasSemana !== undefined && {
          diasSemana: normalizarDiasSemana(datos.diasSemana),
        }),
        // fase-14-17: se recalcula siempre (igual que alcance y comportamiento):
        // volver OBLIGATORIA o de EQUIPO una opcional fija tiene que apagar el
        // flag, aunque el PATCH no lo mande.
        siempreVisible: this.resolverSiempreVisible(
          tipoPuntajeEfectivo,
          equipo.alcance,
          datos.siempreVisible,
          existente.siempreVisible
        ),
        // fase-14-19 + fase-14-24: los tres se escriben SIEMPRE, no solo si el
        // request los trae. Es lo que hace que elegir un modo vacíe los otros
        // dos — pasar de "por rol" a "estas personas" no puede dejar el rol
        // viejo colgado, o la actividad quedaría con dos destinatarios.
        rolesPermitidos: destinatario.roles,
        usuariosPermitidos: destinatario.usuarios,
        equiposPermitidos: destinatario.equipos,
        vigenteDesde: vigencia.desde,
        vigenteHasta: vigencia.hasta,
      },
    });

    // fase-14-24: sacar a alguien del destinatario lo saca del pozo de turnos
    // (decisión 6, sentido inverso al que valida `TurnosService.configurar`).
    await this.podarTurnosFueraDelDestinatario(id, destinatario.usuarios);

    const actualizada = await this.prisma.client.actividad.findFirst({ where: { id } });

    if (!actualizada) {
      throw new NotFoundException('Actividad no encontrada');
    }

    await this.publicarAuditoria(tenant, 'ACTIVIDAD_EDITADA', id, actualizada.grupoId, {
      antes: actividadADto(existente),
      despues: actividadADto(actualizada),
    });

    return actividadADto(actualizada);
  }

  /** Soft delete (spec): ARCHIVADA. No hay reactivación por endpoint. */
  async archivar(tenant: TenantContext, id: string): Promise<ActividadDto> {
    const existente = await this.buscarAccesible(tenant, id);

    await this.prisma.client.actividad.updateMany({
      where: { id },
      data: { estado: EstadoCatalogo.ARCHIVADA },
    });

    await this.publicarAuditoria(tenant, 'ACTIVIDAD_ARCHIVADA', id, existente.grupoId, {
      antes: actividadADto(existente),
    });

    return actividadADto({ ...existente, estado: EstadoCatalogo.ARCHIVADA });
  }

  /**
   * Comportamiento al cierre efectivo (fase-14-08). `REQUIERE_CONFIRMACION`
   * solo tiene sentido con OBLIGATORIA: para OPCIONAL se fuerza ASUME_HECHA, y
   * si el cliente lo pide explícitamente para una opcional es un 400. Con
   * OBLIGATORIA usa lo pedido; si no se pidió, el fallback (default ASUME_HECHA
   * al crear, o el valor existente al editar).
   */
  private resolverComportamiento(
    tipoPuntaje: TipoPuntaje,
    pedido: ComportamientoAlCierre | undefined,
    fallback: ComportamientoAlCierre = ComportamientoAlCierre.ASUME_HECHA
  ): ComportamientoAlCierre {
    if (tipoPuntaje === TipoPuntaje.OPCIONAL) {
      if (pedido === ComportamientoAlCierre.REQUIERE_CONFIRMACION) {
        throw new BadRequestException(
          'comportamientoAlCierre=REQUIERE_CONFIRMACION solo aplica a actividades OBLIGATORIA'
        );
      }

      return ComportamientoAlCierre.ASUME_HECHA;
    }

    return pedido ?? fallback;
  }

  /**
   * Alcance + bono al jefe efectivos (fase-14-09). Una tarea de EQUIPO debe ser
   * OPCIONAL (decisión 11 de la spec — el castigo colectivo queda fuera de
   * alcance); el bono al jefe solo tiene sentido con alcance EQUIPO, para
   * INDIVIDUAL se fuerza a 0.
   */
  private resolverAlcance(
    tipoPuntaje: TipoPuntaje,
    alcance: AlcanceActividad | undefined,
    bonoJefePuntos: number | undefined
  ): { alcance: AlcanceActividad; bonoJefePuntos: number } {
    const alcanceEfectivo = alcance ?? AlcanceActividad.INDIVIDUAL;

    if (alcanceEfectivo === AlcanceActividad.EQUIPO && tipoPuntaje !== TipoPuntaje.OPCIONAL) {
      throw new TareaEquipoDebeSerOpcionalException();
    }

    if (alcanceEfectivo === AlcanceActividad.INDIVIDUAL) {
      return { alcance: alcanceEfectivo, bonoJefePuntos: 0 };
    }

    return { alcance: alcanceEfectivo, bonoJefePuntos: bonoJefePuntos ?? 0 };
  }

  /**
   * `siempreVisible` efectivo (fase-14-17). El flag solo significa algo en una
   * OPCIONAL INDIVIDUAL —que es lo único que el plan del día esconde—, así que
   * en cualquier otro caso se fuerza a false en vez de rechazar el request:
   * mismo criterio que `bonoJefePuntos` en una actividad INDIVIDUAL.
   */
  private resolverSiempreVisible(
    tipoPuntaje: TipoPuntaje,
    alcance: AlcanceActividad,
    pedido: boolean | undefined,
    fallback = false
  ): boolean {
    if (tipoPuntaje !== TipoPuntaje.OPCIONAL || alcance !== AlcanceActividad.INDIVIDUAL) {
      return false;
    }

    return pedido ?? fallback;
  }

  /**
   * `rolesPermitidos` efectivo (fase-14-19). A diferencia de `siempreVisible` o
   * `bonoJefePuntos` —que se fuerzan a su valor neutro cuando no aplican— acá se
   * RECHAZA el request: restringir por rol es una decisión explícita del Tutor y
   * silenciarla dejaría una actividad visible para todo el grupo creyendo lo
   * contrario. Vaciarla sí es válido (es "que la vean todos").
   *
   * La existencia de cada rol se valida contra identity por REST interno (regla
   * 2: sin FK entre bases). Es escritura del catálogo, camino frío — el camino
   * caliente no paga nada de esto.
   */
  private async resolverRolesPermitidos(
    grupoId: string,
    alcance: AlcanceActividad,
    pedido: string[] | undefined,
    fallback: string[] = []
  ): Promise<string[]> {
    const roles = [...new Set(pedido ?? fallback)];

    if (roles.length === 0) {
      return [];
    }

    if (alcance !== AlcanceActividad.INDIVIDUAL) {
      throw new RestriccionRolSoloIndividualException();
    }

    const catalogo = await this.identity.rolesDelGrupo(grupoId);
    const activos = new Set(
      catalogo.filter((rol) => rol.estado === 'ACTIVO').map((rol) => rol.id)
    );

    if (roles.some((rolId) => !activos.has(rolId))) {
      throw new RolGrupoInexistenteException();
    }

    return roles;
  }

  /**
   * Destinatario efectivo (fase-14-24): los tres arrays, con la invariante de
   * que **a lo sumo uno queda no vacío** (decisión 1 — los cuatro modos son
   * excluyentes).
   *
   * El chequeo de exclusividad va acá y no en el DTO porque en un PATCH parcial
   * la ambigüedad puede nacer del cruce entre lo que manda el request y lo que
   * ya tenía la fila: mandar `usuariosPermitidos` a una actividad que hoy está
   * restringida por rol la deja con dos modos activos, y el request por sí solo
   * se ve perfectamente válido. Por eso se evalúan los valores FINALES.
   *
   * Elegir un modo **vacía los otros dos**. Es lo que hace que el selector de la
   * UI se comporte como un selector: pasar de "por rol" a "estas personas" no
   * deja el rol viejo colgado.
   */
  private async resolverDestinatario(
    grupoId: string,
    alcance: AlcanceActividad,
    pedido: DestinatarioPedido,
    fallback: DestinatarioFallback = { roles: [], usuarios: [], equipos: [] }
  ): Promise<{ roles: string[]; usuarios: string[]; equipos: string[] }> {
    const modoPedido = this.modoPedido(pedido);
    const usuarios = [...new Set(pedido.usuarios ?? (modoPedido ? [] : fallback.usuarios))];
    const equipos = [...new Set(pedido.equipos ?? (modoPedido ? [] : fallback.equipos))];

    const llenos = [pedido.roles ?? (modoPedido ? [] : fallback.roles), usuarios, equipos].filter(
      (lista) => lista.length > 0
    );

    if (llenos.length > 1) {
      throw new DestinatarioAmbiguoException();
    }

    // El rol reusa su propia validación del ítem 19, intacta.
    const roles = await this.resolverRolesPermitidos(
      grupoId,
      alcance,
      pedido.roles ?? (modoPedido ? [] : undefined),
      fallback.roles
    );

    await this.validarUsuariosPermitidos(grupoId, alcance, usuarios);
    await this.validarEquiposPermitidos(grupoId, alcance, equipos);

    return { roles, usuarios, equipos };
  }

  /**
   * Saca del pozo de turnos a quien dejó de ser destinatario (fase-14-24,
   * decisión 6).
   *
   * **No toca las `VueltaTurno` selladas**: la decisión 15 del ítem 21 dice que
   * la permutación de la vuelta en curso se sella y no se reescribe, así que el
   * recorte aplica desde la vuelta SIGUIENTE. Editar el destinatario a mitad de
   * semana no le cambia el día a nadie que ya lo tenía asignado, que es
   * exactamente lo que aquella decisión vino a garantizar.
   *
   * Sin destinatario nominal no hace nada: el pozo vuelve a ser todo el grupo.
   */
  private async podarTurnosFueraDelDestinatario(
    actividadId: string,
    usuariosPermitidos: string[]
  ): Promise<void> {
    if (usuariosPermitidos.length === 0) {
      return;
    }

    const turno = await this.prisma.client.turnoActividad.findFirst({
      where: { actividadId },
      select: { id: true },
    });

    if (!turno) {
      return;
    }

    await this.prisma.client.posicionTurno.deleteMany({
      where: {
        turnoActividadId: turno.id,
        usuarioId: { notIn: usuariosPermitidos },
      },
    });
  }

  /** ¿El request eligió explícitamente un modo? Decide si el fallback aplica. */
  private modoPedido(pedido: DestinatarioPedido): boolean {
    return (
      pedido.roles !== undefined ||
      pedido.usuarios !== undefined ||
      pedido.equipos !== undefined
    );
  }

  private async validarUsuariosPermitidos(
    grupoId: string,
    alcance: AlcanceActividad,
    usuarios: string[]
  ): Promise<void> {
    if (usuarios.length === 0) {
      return;
    }

    if (alcance !== AlcanceActividad.INDIVIDUAL) {
      throw new DestinatarioIncompatibleConAlcanceException(
        'Una tarea de equipo se asigna a equipos, no a personas sueltas'
      );
    }

    // Membresía real del grupo por REST interno (regla 2). Se usa el mismo
    // interno que el ítem 19 dejó para el camino caliente: devuelve una fila por
    // participante del grupo, que es justo lo que hace falta para validar.
    const delGrupo = new Set(
      (await this.identity.usuariosDelGrupo(grupoId)).map((usuario) => usuario.id)
    );

    if (usuarios.some((usuarioId) => !delGrupo.has(usuarioId))) {
      throw new UsuarioFueraDelGrupoException();
    }
  }

  private async validarEquiposPermitidos(
    grupoId: string,
    alcance: AlcanceActividad,
    equipos: string[]
  ): Promise<void> {
    if (equipos.length === 0) {
      return;
    }

    if (alcance !== AlcanceActividad.EQUIPO) {
      throw new DestinatarioIncompatibleConAlcanceException(
        'Solo una tarea de equipo puede asignarse a equipos'
      );
    }

    const activos = new Set(
      (await this.identity.equiposDelGrupo(grupoId))
        .filter((equipo) => equipo.estado === 'ACTIVO')
        .map((equipo) => equipo.equipoId)
    );

    if (equipos.some((equipoId) => !activos.has(equipoId))) {
      throw new EquipoFueraDelGrupoException();
    }
  }

  /**
   * Vigencia efectiva (fase-14-24). Fechas civiles `"YYYY-MM-DD"`; `null`
   * explícito la borra, `undefined` la deja como está (PATCH parcial).
   *
   * Una fecha `hasta` **ya pasada se acepta**: no es un error cargar algo que
   * vence hoy, y el archivado automático se encarga en el cierre siguiente.
   */
  private resolverVigencia(
    pedido: { desde?: string | null; hasta?: string | null },
    fallback: { desde: string | null; hasta: string | null } = { desde: null, hasta: null }
  ): { desde: string | null; hasta: string | null } {
    const desde = pedido.desde !== undefined ? pedido.desde : fallback.desde;
    const hasta = pedido.hasta !== undefined ? pedido.hasta : fallback.hasta;

    for (const fecha of [desde, hasta]) {
      if (fecha && !esFechaCivilValida(fecha)) {
        throw new VigenciaInvalidaException(`"${fecha}" no es una fecha válida (YYYY-MM-DD)`);
      }
    }

    // Comparación de strings: `YYYY-MM-DD` es lexicográfico y cronológico a la
    // vez, que es el motivo de guardarlo así (decisión 9).
    if (desde && hasta && desde > hasta) {
      throw new VigenciaInvalidaException(
        'La fecha de inicio no puede ser posterior a la de fin'
      );
    }

    return { desde: desde ?? null, hasta: hasta ?? null };
  }

  /**
   * `puntosPorCumplir` efectivo (fase-14-20). Solo significa algo en una
   * OBLIGATORIA con `REQUIERE_CONFIRMACION`: es lo que gana el integrante al
   * confirmarla. Sin confirmación no hay acción que registrar, así que un valor
   * positivo sería un premio que nadie puede cobrar — se fuerza a 0 en vez de
   * rechazar el request (mismo criterio que `siempreVisible` y `bonoJefePuntos`).
   */
  private resolverPuntosPorCumplir(
    tipoPuntaje: TipoPuntaje,
    comportamiento: ComportamientoAlCierre,
    pedido: number | undefined,
    fallback = 0
  ): number {
    const premiable =
      tipoPuntaje === TipoPuntaje.OBLIGATORIA &&
      comportamiento === ComportamientoAlCierre.REQUIERE_CONFIRMACION;

    if (!premiable) {
      return 0;
    }

    return pedido ?? fallback;
  }

  /** Retrofit fase-09: evento genérico de auditoría (consumido por Audit). */
  private async publicarAuditoria(
    tenant: TenantContext,
    accion: string,
    actividadId: string,
    grupoId: string,
    detalle: Record<string, unknown>
  ): Promise<void> {
    await this.eventos.publicarAccionAdministrativa({
      organizacionId: tenant.organizacionId,
      grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion,
      entidadTipo: 'Actividad',
      entidadId: actividadId,
      detalle,
    });
  }

  /**
   * Fila accesible para el tenant (el filtro automático agrega organizacionId
   * y, para TUTOR/USUARIO, grupoId IN grupoIds) — 404 si no existe o no es
   * suya. Un USUARIO además no ve ARCHIVADA (misma regla que las listas) ni la
   * actividad personal de otro integrante (fase-14-10, Parte C).
   */
  private async buscarAccesible(tenant: TenantContext, id: string): Promise<Actividad> {
    const actividad = await this.prisma.client.actividad.findFirst({ where: { id } });
    const esUsuario = tenant.rol === Rol.USUARIO;

    if (
      !actividad ||
      (esUsuario && actividad.estado !== EstadoCatalogo.ACTIVA) ||
      (esUsuario && !esVisiblePara(actividad, tenant.principalId))
    ) {
      throw new NotFoundException('Actividad no encontrada');
    }

    // fase-14-19 + fase-14-24: para el integrante, una actividad que no es suya
    // —por rol, por persona o por equipo— no existe: 404 y no 403, igual que el
    // resto de este método (el detalle no revela nada que la lista no muestre).
    if (esUsuario) {
      const contexto = await this.contexto.resolver(actividad.grupoId, tenant.principalId, [
        actividad,
      ]);

      if (!esDestinatario(actividad, contexto)) {
        throw new NotFoundException('Actividad no encontrada');
      }
    }

    return actividad;
  }

  /**
   * Chequeo de entitlements previo a crear (spec fase-05). La regla vive en
   * `comun/limite-plan-actividades.ts` porque la comparten los flujos de
   * contenido creado por integrantes (fase-14-10).
   */
  private async asegurarLimiteActividades(
    organizacionId: string,
    grupoId: string
  ): Promise<void> {
    await asegurarLimiteActividadesDelGrupo(
      this.prisma,
      this.billing,
      this.logger,
      organizacionId,
      grupoId
    );
  }
}

/** Lo que el request pide para cada modo; `undefined` = "no lo mandó". */
interface DestinatarioPedido {
  roles?: string[];
  usuarios?: string[];
  equipos?: string[];
}

/** Lo que la fila ya tenía, para resolver un PATCH parcial. */
interface DestinatarioFallback {
  roles: string[];
  usuarios: string[];
  equipos: string[];
}
