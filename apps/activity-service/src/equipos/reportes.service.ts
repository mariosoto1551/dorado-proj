import { Injectable } from '@nestjs/common';

import { ReporteMiembroCreadoPayload, ROUTING_KEYS } from '@dorado/shared-events';
import {
  EquipoInternoDto,
  ReporteMiembroDto,
  Rol,
  RolEquipoMiembro,
  TenantContext,
} from '@dorado/shared-types';

import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { IdentityClientService } from '../clientes/identity-client.service';
import { SessionClientService } from '../clientes/session-client.service';
import {
  ConductaNoEsMalaException,
  EquipoNoEncontradoException,
  ReportadoNoEsMiembroException,
  ReporteNoEncontradoException,
  ReporteYaResueltoException,
  SoloJefeReportaException,
} from '../comun/excepciones';
import { reporteMiembroADto } from '../comun/mapeadores';
import { resolverSesionAbierta } from '../comun/sesion-abierta';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Conducta, ReporteMiembro } from '../generated/prisma/client';
import { EstadoCatalogo, EstadoReporte, TipoConducta } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { CrearReporteMiembroRequest, RechazarReporteRequest } from './dto/equipos.dto';

@Injectable()
export class ReportesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityClientService,
    private readonly session: SessionClientService,
    private readonly acceso: AccesoGrupoService,
    private readonly eventos: EventosPublisherService
  ) {}

  /**
   * POST /activity/equipos/:equipoId/reportes — el jefe reporta a un integrante
   * por una conducta MALA concreta (fase-14-09). Solo crea el reporte PENDIENTE
   * y notifica al Tutor; el descuento se aplica al aprobar.
   */
  async crear(
    tenant: TenantContext,
    equipoId: string,
    datos: CrearReporteMiembroRequest
  ): Promise<ReporteMiembroDto> {
    const equipo = await this.resolverEquipo(tenant, equipoId);

    if (!(tenant.rol === Rol.USUARIO && tenant.principalId === equipo.jefeUsuarioId)) {
      throw new SoloJefeReportaException();
    }

    const reportadoEsMiembro = equipo.miembros.some(
      (miembro) =>
        miembro.usuarioId === datos.reportadoUsuarioId &&
        miembro.rol === RolEquipoMiembro.MIEMBRO
    );

    if (!reportadoEsMiembro) {
      throw new ReportadoNoEsMiembroException();
    }

    await this.buscarConductaMala(datos.conductaId, equipo.grupoId);

    const reporte = await this.prisma.client.reporteMiembro.create({
      data: {
        organizacionId: tenant.organizacionId,
        grupoId: equipo.grupoId,
        equipoId,
        reportadoUsuarioId: datos.reportadoUsuarioId,
        jefeUsuarioId: tenant.principalId,
        conductaId: datos.conductaId,
        motivo: datos.motivo ?? null,
      },
    });

    await this.eventos.publicar<ReporteMiembroCreadoPayload>({
      eventType: 'ReporteMiembroCreado',
      routingKey: ROUTING_KEYS.REPORTE_MIEMBRO_CREADO,
      organizacionId: tenant.organizacionId,
      grupoId: equipo.grupoId,
      payload: {
        reporteId: reporte.id,
        organizacionId: tenant.organizacionId,
        grupoId: equipo.grupoId,
        equipoId,
        reportadoUsuarioId: datos.reportadoUsuarioId,
        jefeUsuarioId: tenant.principalId,
        conductaId: datos.conductaId,
      },
    });

    return reporteMiembroADto(reporte);
  }

  /** GET /activity/grupos/:grupoId/reportes?estado= — bandeja del Tutor. */
  async listar(
    tenant: TenantContext,
    grupoId: string,
    estado?: EstadoReporte
  ): Promise<ReporteMiembroDto[]> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    const reportes = await this.prisma.client.reporteMiembro.findMany({
      where: { grupoId, ...(estado && { estado }) },
      orderBy: { createdAt: 'desc' },
    });

    return reportes.map(reporteMiembroADto);
  }

  /**
   * POST /activity/reportes/:id/aprobar — el Tutor aplica la conducta reportada.
   * Registra un RegistroConducta (generado por el Tutor) y publica
   * ConductaRegistrada → scoring resta SOLO al reportado.
   */
  async aprobar(tenant: TenantContext, reporteId: string): Promise<ReporteMiembroDto> {
    const reporte = await this.buscarReportePendiente(tenant, reporteId);
    const conducta = await this.buscarConductaMala(reporte.conductaId, reporte.grupoId);

    const seccion = await this.session.obtenerSeccionActual(reporte.grupoId);
    const sesion = resolverSesionAbierta(seccion);
    const valorConSigno = -conducta.valorPuntos;

    const registro = await this.prisma.client.registroConducta.create({
      data: {
        organizacionId: tenant.organizacionId,
        grupoId: reporte.grupoId,
        usuarioId: reporte.reportadoUsuarioId,
        conductaId: reporte.conductaId,
        sesionId: sesion.sesionId,
        seccionId: sesion.seccionId,
        valorPuntosSnapshot: valorConSigno,
        registradoPorId: tenant.principalId,
        registradoPorTipo: tenant.principalType,
      },
    });

    await this.eventos.publicar({
      eventType: 'ConductaRegistrada',
      routingKey: ROUTING_KEYS.CONDUCTA_REGISTRADA,
      organizacionId: tenant.organizacionId,
      grupoId: reporte.grupoId,
      payload: {
        registroId: registro.id,
        usuarioId: reporte.reportadoUsuarioId,
        conductaId: reporte.conductaId,
        tipo: conducta.tipo,
        sesionId: sesion.sesionId,
        seccionId: sesion.seccionId,
        valorPuntosSnapshot: valorConSigno,
        registradoPorId: tenant.principalId,
        registradoPorTipo: tenant.principalType,
      },
    });

    const actualizado = await this.resolverReporte(reporteId, {
      estado: EstadoReporte.APROBADO,
      resueltoPorTutorId: tenant.principalId,
      registroConductaId: registro.id,
      resueltoEn: new Date(),
    });

    return reporteMiembroADto(actualizado);
  }

  /** POST /activity/reportes/:id/rechazar — sin efecto en puntos. */
  async rechazar(
    tenant: TenantContext,
    reporteId: string,
    datos: RechazarReporteRequest
  ): Promise<ReporteMiembroDto> {
    const reporte = await this.buscarReportePendiente(tenant, reporteId);

    const actualizado = await this.resolverReporte(reporte.id, {
      estado: EstadoReporte.RECHAZADO,
      resueltoPorTutorId: tenant.principalId,
      motivo: datos.motivo ?? reporte.motivo,
      resueltoEn: new Date(),
    });

    return reporteMiembroADto(actualizado);
  }

  // --- helpers ---

  private async resolverEquipo(
    tenant: TenantContext,
    equipoId: string
  ): Promise<EquipoInternoDto> {
    const equipo = await this.identity.obtenerEquipo(equipoId);

    if (!equipo || equipo.organizacionId !== tenant.organizacionId) {
      throw new EquipoNoEncontradoException();
    }

    return equipo;
  }

  private async buscarConductaMala(conductaId: string, grupoId: string): Promise<Conducta> {
    const conducta = await this.prisma.client.conducta.findFirst({ where: { id: conductaId } });

    if (
      !conducta ||
      conducta.estado !== EstadoCatalogo.ACTIVA ||
      conducta.grupoId !== grupoId ||
      conducta.tipo !== TipoConducta.MALA
    ) {
      throw new ConductaNoEsMalaException();
    }

    return conducta;
  }

  private async buscarReportePendiente(
    tenant: TenantContext,
    reporteId: string
  ): Promise<ReporteMiembro> {
    const reporte = await this.prisma.client.reporteMiembro.findFirst({
      where: { id: reporteId },
    });

    if (!reporte || reporte.organizacionId !== tenant.organizacionId) {
      throw new ReporteNoEncontradoException();
    }

    if (reporte.estado !== EstadoReporte.PENDIENTE) {
      throw new ReporteYaResueltoException();
    }

    return reporte;
  }

  private async resolverReporte(
    reporteId: string,
    data: {
      estado: EstadoReporte;
      resueltoPorTutorId: string;
      registroConductaId?: string;
      motivo?: string | null;
      resueltoEn: Date;
    }
  ): Promise<ReporteMiembro> {
    await this.prisma.client.reporteMiembro.updateMany({
      where: { id: reporteId },
      data,
    });

    const actualizado = await this.prisma.client.reporteMiembro.findFirst({
      where: { id: reporteId },
    });

    if (!actualizado) {
      throw new ReporteNoEncontradoException();
    }

    return actualizado;
  }
}
