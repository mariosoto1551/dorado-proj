import { Injectable } from '@nestjs/common';

import { NotaRegistroDto, TenantContext, TipoRegistroHistorial } from '@dorado/shared-types';

import { IdentityClientService } from '../clientes/identity-client.service';
import { SessionClientService } from '../clientes/session-client.service';
import {
  NotaDeOtroTutorException,
  RegistroDelHistorialNoEncontradoException,
  SesionNoEditableException,
} from '../comun/excepciones';
import { PrismaService } from '../prisma/prisma.service';
import type { CrearNotaRegistroRequest } from './dto/historial.dto';
import { notaADto } from './historial.service';

/** Lo mínimo que necesita una nota de su registro de origen. */
interface RegistroAnotable {
  organizacionId: string;
  grupoId: string;
  sesionId: string;
}

/**
 * Notas internas del Tutor sobre un registro del historial (spec fase-14-18,
 * decisión 7). Hilo que se agrega: nadie edita ni pisa la nota de otro, y cada
 * tutor borra solo las suyas.
 *
 * **No son ledger** —no sostienen puntaje, no viajan a scoring, no publican
 * evento— y por eso el borrado es físico, mismo criterio que `SeleccionPlanDia`.
 * Y **nunca** llegan a la app del integrante: son lo contrario del `motivoTutor`.
 */
@Injectable()
export class NotasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly session: SessionClientService,
    private readonly identity: IdentityClientService
  ) {}

  /** POST /activity/historial/:registroTipo/:registroId/notas — TUTOR / ORG_ADMIN. */
  async crear(
    tenant: TenantContext,
    registroTipo: TipoRegistroHistorial,
    registroId: string,
    datos: CrearNotaRegistroRequest
  ): Promise<NotaRegistroDto> {
    const registro = await this.buscarRegistro(tenant, registroTipo, registroId);

    // fase-14-18 decía «las notas son parte del trabajo del día, no anotaciones
    // retroactivas sobre lo ya cerrado». fase-14-33 mueve el borde una unidad
    // arriba, igual que en todo el resto: el trabajo en curso es la **Sección**
    // vigente, y anotar por qué se corrigió el lunes es exactamente para lo que
    // sirve una nota interna. Lo ya cerrado sigue sin admitir notas.
    const seccion = await this.session.obtenerSeccionActual(registro.grupoId);

    if (!seccion?.sesiones.some((sesion) => sesion.id === registro.sesionId)) {
      throw new SesionNoEditableException();
    }

    const nota = await this.prisma.client.notaRegistro.create({
      data: {
        // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
        organizacionId: tenant.organizacionId,
        grupoId: registro.grupoId,
        registroTipo,
        registroId,
        texto: datos.texto,
        autorTutorId: tenant.principalId,
      },
    });

    const tutores = await this.identity.tutoresDelGrupo(registro.grupoId);

    return notaADto(nota, tenant, {
      tutores: new Map(tutores.map((tutor) => [tutor.id, tutor.nombre])),
    });
  }

  /** DELETE /activity/notas/:id — TUTOR / ORG_ADMIN, solo las propias. */
  async borrar(tenant: TenantContext, notaId: string): Promise<void> {
    // findFirst (no findUnique): pasa por el filtro automático de tenant.
    const nota = await this.prisma.client.notaRegistro.findFirst({ where: { id: notaId } });

    if (!nota) {
      throw new RegistroDelHistorialNoEncontradoException();
    }

    // Regla de AUTORÍA, no de jerarquía: un ORG_ADMIN tampoco borra nota ajena.
    if (nota.autorTutorId !== tenant.principalId) {
      throw new NotaDeOtroTutorException();
    }

    await this.prisma.client.notaRegistro.deleteMany({ where: { id: notaId } });
  }

  /**
   * El registro anotado, ya validado contra el tenant. Mismo 404 para
   * inexistente y para "de otra organización": no revela nada.
   */
  private async buscarRegistro(
    tenant: TenantContext,
    registroTipo: TipoRegistroHistorial,
    registroId: string
  ): Promise<RegistroAnotable> {
    const registro = await this.leerSegunTipo(registroTipo, registroId);

    if (!registro || registro.organizacionId !== tenant.organizacionId) {
      throw new RegistroDelHistorialNoEncontradoException();
    }

    return registro;
  }

  private async leerSegunTipo(
    registroTipo: TipoRegistroHistorial,
    registroId: string
  ): Promise<RegistroAnotable | null> {
    const where = { id: registroId };

    if (registroTipo === TipoRegistroHistorial.ACTIVIDAD) {
      return await this.prisma.client.registroActividad.findFirst({ where });
    }

    if (registroTipo === TipoRegistroHistorial.CONDUCTA) {
      return await this.prisma.client.registroConducta.findFirst({ where });
    }

    // RegistroTareaEquipo NO es un modelo tenant-scoped declarado: el chequeo
    // de organización de `buscarRegistro` es el que aísla acá.
    return await this.prisma.client.registroTareaEquipo.findFirst({ where });
  }
}
