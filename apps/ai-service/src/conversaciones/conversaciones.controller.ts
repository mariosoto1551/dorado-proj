import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';

import {
  CurrentTenant,
  DomainException,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import {
  ConversacionIaDetalleDto,
  ConversacionIaDto,
  Rol,
  TenantContext,
} from '@dorado/shared-types';

import { ConfiguracionService } from '../configuracion/configuracion.service';
import { ConversacionesService } from './conversaciones.service';
import { CrearConversacionBody, EnviarMensajeBody } from './dto/conversaciones.dto';
import { EmisorProgreso } from './loop.service';
import { CanalSse, RespuestaStream } from './sse';

/** La respuesta HTTP, con la superficie mínima que el canal SSE necesita. */
type RespuestaHttp = RespuestaStream & {
  status(codigo: number): { json(cuerpo: unknown): void };
  on(evento: 'close', escucha: () => void): unknown;
};

/**
 * Prefijo `/ai` (el `/api` público lo agrega el Gateway, fase-03).
 *
 * `Rol.USUARIO` no aparece en ningún endpoint y no va a aparecer: el
 * participante no habla con el asistente (decisión 3). A diferencia del `PUT`
 * de configuración —que es del dueño porque prende el envío de datos a un
 * tercero—, conversar sí es de cualquier Tutor: la decisión de exponer los
 * datos ya la tomó el ORG_ADMIN al habilitar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LOS DOS ENDPOINTS QUE CORREN EL LOOP NEGOCIAN POR `Accept` (tanda 6):
 *
 * con `text/event-stream` transmiten el progreso; sin él contestan el JSON de
 * siempre. No es una concesión ni una etapa de transición: un turno tarda
 * decenas de segundos y **hay dos clientes legítimos con necesidades opuestas**
 * — el navegador, que necesita mostrar algo mientras tanto, y los scripts de
 * verificación y la suite E2E, que quieren un cuerpo entero que se pueda
 * afirmar de una. La lógica es una sola: `ConversacionesService` recibe un
 * emisor opcional y no sabe cuál de los dos lo está llamando.
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Controller('ai/conversaciones')
@UseGuards(TenantContextGuard, RolesGuard)
@Roles(Rol.TUTOR, Rol.ORG_ADMIN)
export class ConversacionesController {
  constructor(
    private readonly conversaciones: ConversacionesService,
    private readonly configuracion: ConfiguracionService
  ) {}

  @Get()
  async listar(
    @CurrentTenant() tenant: TenantContext,
    @Query('grupoId', ParseUUIDPipe) grupoId: string
  ): Promise<ConversacionIaDto[]> {
    return await this.conversaciones.listar(tenant, grupoId);
  }

  /**
   * Crea la conversación y contesta el primer mensaje.
   *
   * También transmite, y no por simetría: el primer mensaje corre exactamente
   * el mismo loop de veinte a cincuenta segundos que los siguientes, así que
   * dejarlo como request/response haría que **toda conversación nueva arranque
   * con la pantalla congelada** — justo el momento en que el Tutor todavía no
   * sabe si esto funciona.
   */
  @Post()
  async crear(
    @CurrentTenant() tenant: TenantContext,
    @Body() datos: CrearConversacionBody,
    @Headers('accept') accept: string | undefined,
    @Res() res: RespuestaHttp
  ): Promise<void> {
    if (!this.pideStream(accept)) {
      res.status(201).json(await this.conversaciones.crear(tenant, datos));

      return;
    }

    await this.transmitir(tenant, res, (emitir) =>
      this.conversaciones.crear(tenant, datos, emitir)
    );
  }

  @Get(':id')
  async detalle(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ConversacionIaDetalleDto> {
    return await this.conversaciones.detalle(tenant, id);
  }

  /** Manda un mensaje y transmite la respuesta (Parte C). */
  @Post(':id/mensajes')
  async enviarMensaje(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: EnviarMensajeBody,
    @Headers('accept') accept: string | undefined,
    @Res() res: RespuestaHttp
  ): Promise<void> {
    if (!this.pideStream(accept)) {
      res.status(201).json(await this.conversaciones.enviarMensaje(tenant, id, datos.texto));

      return;
    }

    await this.transmitir(tenant, res, (emitir) =>
      this.conversaciones.enviarMensaje(tenant, id, datos.texto, emitir)
    );
  }

  @Post(':id/archivar')
  async archivar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ConversacionIaDto> {
    return await this.conversaciones.archivar(tenant, id);
  }

  private pideStream(accept: string | undefined): boolean {
    return (accept ?? '').includes('text/event-stream');
  }

  /**
   * Corre un turno mandando su progreso por SSE.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * EL ORDEN DE ESTE MÉTODO ES LO ÚNICO QUE IMPORTA DE ÉL:
   *
   * el canal **no se abre hasta que el turno emite su primer evento**. Todo lo
   * que puede rebotar antes de gastar un token —el plan, el switch del dueño,
   * la cuota, que la conversación sea de otro— sale como status HTTP de
   * verdad: 402, 403, 404. Abrir el stream primero convertiría a esos cuatro
   * rechazos en un `200 OK` con la mala noticia adentro, y el cliente tendría
   * que aprender a leer errores en dos lugares distintos para saber por qué no
   * puede hablar.
   *
   * Después del primer evento ya hay un 200 escrito y no hay marcha atrás: de
   * ahí en más un fallo viaja como evento `error` con el mismo `code` de
   * negocio que habría llevado el body.
   * ─────────────────────────────────────────────────────────────────────────
   */
  private async transmitir(
    tenant: TenantContext,
    res: RespuestaHttp,
    turno: (emitir: EmisorProgreso) => Promise<unknown>
  ): Promise<void> {
    const canal = new CanalSse(res);

    // El Tutor cerró la pestaña. El turno NO se cancela —los tokens ya se
    // están pagando y la contabilidad tiene que llegar al ledger igual— pero
    // sus eventos dejan de escribirse contra un socket que no existe.
    res.on('close', () => canal.descartar());

    const emitir: EmisorProgreso = (evento) => {
      canal.abrir();
      canal.enviar(evento);
    };

    try {
      await turno(emitir);
      emitir({
        tipo: 'fin',
        tokensConsumidosMes: await this.configuracion.tokensConsumidosMes(tenant.organizacionId),
      });
    } catch (error) {
      if (!canal.abierto) {
        // Nada salió todavía. **Se relanza sin cerrar el canal**: cerrarlo
        // terminaría la respuesta y el HttpExceptionFilter se quedaría sin
        // dónde escribir el 402/403/404 que corresponde. Por eso este método
        // no tiene `finally` — el cierre solo pasa cuando hubo algo que
        // cerrar.
        throw error;
      }

      const dominio = error instanceof DomainException ? error : null;

      emitir({
        tipo: 'error',
        code: dominio?.code ?? 'ERROR_INTERNO',
        mensaje: dominio?.message ?? 'El asistente no pudo terminar la respuesta',
      });
    }

    canal.cerrar();
  }
}
