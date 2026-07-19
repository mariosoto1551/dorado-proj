import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { TenantContext, UmbralZonaDto } from '@dorado/shared-types';

import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { umbralADto } from '../comun/mapeadores';
import { validarConjuntoUmbrales, type RangoUmbral } from '../comun/zonas';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { UmbralZona } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CrearUmbralRequest, EditarUmbralRequest } from './dto/umbrales.dto';

/**
 * CRUD de UmbralZona (spec fase-07): toda escritura valida el CONJUNTO
 * resultante del grupo — órdenes consecutivos desde 1 y rangos contiguos sin
 * solapamientos (ver comun/zonas.ts). Editar un umbral no toca los
 * `ResultadoSeccion` ya escritos (snapshot inmutable).
 */
@Injectable()
export class UmbralesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoGrupoService,
    private readonly eventos: EventosPublisherService
  ) {}

  /** POST /scoring/grupos/:grupoId/umbrales */
  async crear(
    tenant: TenantContext,
    grupoId: string,
    datos: CrearUmbralRequest
  ): Promise<UmbralZonaDto> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    const existentes = await this.umbralesDelGrupo(grupoId);

    validarConjuntoUmbrales([
      ...existentes.map(aRango),
      { orden: datos.orden, puntosMin: datos.puntosMin, puntosMax: datos.puntosMax ?? null },
    ]);

    let umbral: UmbralZona;

    try {
      umbral = await this.prisma.client.umbralZona.create({
        data: {
          // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
          organizacionId: tenant.organizacionId,
          grupoId,
          nombreZona: datos.nombreZona,
          orden: datos.orden,
          puntosMin: datos.puntosMin,
          puntosMax: datos.puntosMax ?? null,
          colorHex: datos.colorHex,
        },
      });
    } catch (error) {
      throw traducirCarreraDeOrden(error);
    }

    // Retrofit fase-09: rastro de auditoría de toda escritura administrativa.
    await this.publicarAuditoria(tenant, 'UMBRAL_CREADO', umbral, {
      despues: umbralADto(umbral),
    });

    return umbralADto(umbral);
  }

  /** GET /scoring/grupos/:grupoId/umbrales — cualquier rol del grupo. */
  async listar(tenant: TenantContext, grupoId: string): Promise<UmbralZonaDto[]> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    const umbrales = await this.umbralesDelGrupo(grupoId);

    return umbrales.map(umbralADto);
  }

  /** PATCH /scoring/umbrales/:id — mismo chequeo de conjunto que crear. */
  async editar(
    tenant: TenantContext,
    id: string,
    datos: EditarUmbralRequest
  ): Promise<UmbralZonaDto> {
    const existente = await this.buscarAccesible(id);

    const efectivo = {
      orden: datos.orden ?? existente.orden,
      puntosMin: datos.puntosMin ?? existente.puntosMin,
      puntosMax: datos.puntosMax !== undefined ? datos.puntosMax : existente.puntosMax,
    };

    const hermanos = (await this.umbralesDelGrupo(existente.grupoId)).filter(
      (umbral) => umbral.id !== id
    );

    validarConjuntoUmbrales([...hermanos.map(aRango), efectivo]);

    try {
      // updateMany (no update): pasa por el filtro automático de tenant.
      await this.prisma.client.umbralZona.updateMany({
        where: { id },
        data: {
          ...(datos.nombreZona !== undefined && { nombreZona: datos.nombreZona }),
          ...(datos.colorHex !== undefined && { colorHex: datos.colorHex }),
          orden: efectivo.orden,
          puntosMin: efectivo.puntosMin,
          puntosMax: efectivo.puntosMax,
        },
      });
    } catch (error) {
      throw traducirCarreraDeOrden(error);
    }

    const actualizado: UmbralZona = {
      ...existente,
      nombreZona: datos.nombreZona ?? existente.nombreZona,
      colorHex: datos.colorHex ?? existente.colorHex,
      ...efectivo,
    };

    await this.publicarAuditoria(tenant, 'UMBRAL_EDITADO', actualizado, {
      antes: umbralADto(existente),
      despues: umbralADto(actualizado),
    });

    return umbralADto(actualizado);
  }

  /**
   * DELETE /scoring/umbrales/:id — solo si el conjunto restante sigue siendo
   * válido (spec); si no, 409: borrar y re-crear todos es decisión de UI.
   */
  async eliminar(tenant: TenantContext, id: string): Promise<UmbralZonaDto> {
    const existente = await this.buscarAccesible(id);

    const restantes = (await this.umbralesDelGrupo(existente.grupoId)).filter(
      (umbral) => umbral.id !== id
    );

    try {
      validarConjuntoUmbrales(restantes.map(aRango));
    } catch {
      throw new ConflictException(
        'Eliminar este umbral rompería la contigüidad de los restantes — editalos primero o recreá el conjunto'
      );
    }

    await this.prisma.client.umbralZona.deleteMany({ where: { id } });

    await this.publicarAuditoria(tenant, 'UMBRAL_ELIMINADO', existente, {
      antes: umbralADto(existente),
    });

    return umbralADto(existente);
  }

  /** Retrofit fase-09: evento genérico de auditoría (consumido por Audit). */
  private async publicarAuditoria(
    tenant: TenantContext,
    accion: string,
    umbral: UmbralZona,
    detalle: Record<string, unknown>
  ): Promise<void> {
    await this.eventos.publicarAccionAdministrativa({
      organizacionId: tenant.organizacionId,
      grupoId: umbral.grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion,
      entidadTipo: 'UmbralZona',
      entidadId: umbral.id,
      detalle,
    });
  }

  private async umbralesDelGrupo(grupoId: string): Promise<UmbralZona[]> {
    return await this.prisma.client.umbralZona.findMany({
      where: { grupoId },
      orderBy: { orden: 'asc' },
    });
  }

  /**
   * Fila accesible para el tenant (el filtro automático agrega organizacionId
   * y, para TUTOR/USUARIO, grupoId IN grupoIds) — 404 si no existe o no es suya.
   */
  private async buscarAccesible(id: string): Promise<UmbralZona> {
    const umbral = await this.prisma.client.umbralZona.findFirst({ where: { id } });

    if (!umbral) {
      throw new NotFoundException('Umbral no encontrado');
    }

    return umbral;
  }
}

function aRango(umbral: UmbralZona): RangoUmbral {
  return { orden: umbral.orden, puntosMin: umbral.puntosMin, puntosMax: umbral.puntosMax };
}

/** Violación de @@unique([grupoId, orden]) en una carrera concurrente → 409. */
function traducirCarreraDeOrden(error: unknown): Error {
  if ((error as { code?: string })?.code === 'P2002') {
    return new ConflictException('Otra operación modificó los umbrales en simultáneo — reintentá');
  }

  return error as Error;
}
