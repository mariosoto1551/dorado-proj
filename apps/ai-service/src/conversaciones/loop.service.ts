import { Injectable, Logger } from '@nestjs/common';

import { ContextoHerramienta } from '../comun/acceso-grupo.service';
import { HERRAMIENTAS_LECTURA } from '../herramientas/definiciones';
import { HerramientasService } from '../herramientas/herramientas.service';
import { OpenAiService } from '../proveedor/openai.service';
import { envolverDatos, systemPrompt } from '../proveedor/system-prompt';
import { costoMicroUsd } from '../proveedor/tarifas';
import { ItemEntrada } from '../proveedor/tipos';
import {
  HERRAMIENTAS_PROPUESTA,
  NOMBRES_HERRAMIENTAS_PROPUESTA,
} from '../propuestas/definiciones-propuesta';
import { PropuestasService } from '../propuestas/propuestas.service';

/**
 * Tope de vueltas del loop (Parte E, punto 5b). Cuenta TURNOS del modelo, no
 * llamadas a herramientas: un solo turno puede pedir varias herramientas a la
 * vez, y contar llamadas cortaría a la mitad un turno legítimo que pidió tres
 * listados juntos.
 *
 * Con 8 turnos alcanza de sobra para leer todo el estado del grupo y proponer;
 * un modelo que necesita más está en bucle, y un bucle acá se paga en dinero.
 */
const MAX_ITERACIONES = 8;

/**
 * Techo de salida por llamada (Parte E, punto 5b).
 *
 * No es tan alto como para que un turno desbocado se coma el mes, ni tan bajo
 * como para que el razonamiento consuma el presupuesto y no salga respuesta:
 * los tokens de razonamiento cuentan contra este número, así que un valor
 * chico produce `status: incomplete` con texto vacío, que se ve como si el
 * asistente no hubiera contestado.
 */
const MAX_TOKENS_SALIDA = 4_000;

/** Una fila a escribir en el ledger `Mensaje` (la escribe el llamador). */
export interface MensajeAPersistir {
  rol: 'ASISTENTE' | 'HERRAMIENTA';
  contenido: string;
  herramienta: string | null;
  tokensEntrada: number;
  tokensSalida: number;
  costoMicroUsd: number;
  modelo: string | null;
}

export interface ResultadoLoop {
  /** Lo que se le muestra al humano. */
  texto: string;
  /** Todo lo que hay que escribir en el ledger, en orden. */
  mensajes: MensajeAPersistir[];
  tokensTotales: number;
  /** Se agotaron las iteraciones sin que el modelo cerrara con texto. */
  cortadoPorTope: boolean;
  /** Ids de las propuestas que se armaron en este turno (tanda 5). */
  propuestasArmadas: string[];
}

/**
 * El loop de herramientas (fase-14-29 tanda 4).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA REGLA QUE GOBIERNA ESTE ARCHIVO (Parte E, punto 6):
 *
 *   **La contabilidad se acumula ANTES de que algo pueda fallar.**
 *
 * `ResultadoLoop.mensajes` se va llenando vuelta a vuelta y el llamador lo
 * persiste en un `finally`. Si esto se contabilizara "al terminar bien", un
 * tenant que corta la conexión a la mitad consumiría gratis — y los tokens de
 * entrada se pagan igual, haya respuesta o no.
 *
 * Por eso `ejecutar` devuelve el parcial incluso cuando lanza: ver el
 * `try/catch` de abajo, que rearma el error con lo consumido hasta ahí.
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Injectable()
export class LoopService {
  private readonly logger = new Logger(LoopService.name);

  constructor(
    private readonly proveedor: OpenAiService,
    private readonly herramientas: HerramientasService,
    private readonly propuestas: PropuestasService
  ) {}

  /**
   * Corre el loop hasta que el modelo conteste con texto, se acaben las
   * iteraciones o falle.
   *
   * Ante un fallo del proveedor lanza `ErrorConConsumo`, que lleva adentro lo
   * gastado hasta ese momento para que igual se escriba en el ledger.
   */
  async ejecutar(
    historial: ItemEntrada[],
    contexto: ContextoHerramienta,
    identificadores: { safetyIdentifier: string; promptCacheKey: string },
    conversacionId: string
  ): Promise<ResultadoLoop> {
    const entrada: ItemEntrada[] = [...historial];
    const mensajes: MensajeAPersistir[] = [];
    const propuestasArmadas: string[] = [];
    let tokensTotales = 0;

    for (let iteracion = 1; iteracion <= MAX_ITERACIONES; iteracion += 1) {
      let respuesta;

      try {
        respuesta = await this.proveedor.responder({
          modelo: this.proveedor.modelo,
          instrucciones: systemPrompt(),
          entrada,
          herramientas: [...HERRAMIENTAS_LECTURA, ...HERRAMIENTAS_PROPUESTA],
          maxTokensSalida: MAX_TOKENS_SALIDA,
          ...identificadores,
        });
      } catch (error) {
        // Lo consumido en las vueltas ANTERIORES ya está en `mensajes` y tiene
        // que persistirse igual: la llamada que falló puede no haber gastado
        // nada, pero las de antes sí gastaron.
        throw new ErrorConConsumo(error, {
          texto: '',
          mensajes,
          tokensTotales,
          cortadoPorTope: false,
          propuestasArmadas,
        });
      }

      const consumo = respuesta.tokensEntrada + respuesta.tokensSalida;

      tokensTotales += consumo;
      mensajes.push({
        rol: 'ASISTENTE',
        contenido: respuesta.texto,
        herramienta: null,
        tokensEntrada: respuesta.tokensEntrada,
        tokensSalida: respuesta.tokensSalida,
        costoMicroUsd: costoMicroUsd(this.proveedor.modelo, {
          entrada: respuesta.tokensEntrada,
          salida: respuesta.tokensSalida,
          entradaCacheada: respuesta.tokensEntradaCacheados,
        }),
        modelo: this.proveedor.modelo,
      });

      // Sin herramientas pedidas, el turno terminó: esto es la respuesta.
      if (respuesta.llamadas.length === 0) {
        return {
          texto: respuesta.texto || this.textoDeCortesia(respuesta.incompleta),
          mensajes,
          tokensTotales,
          cortadoPorTope: false,
          propuestasArmadas,
        };
      }

      // Los ítems de salida se reenvían TAL CUAL (incluidos los de
      // razonamiento) antes de las respuestas de las herramientas: es lo que
      // mantiene la continuidad entre turnos.
      entrada.push(...respuesta.itemsSalida);

      for (const llamada of respuesta.llamadas) {
        const salida = await this.ejecutarHerramienta(llamada, contexto, conversacionId);

        if (salida.propuestaId) {
          propuestasArmadas.push(salida.propuestaId);
        }

        entrada.push({
          type: 'function_call_output',
          call_id: llamada.callId,
          output: salida.paraElModelo,
        });
        mensajes.push({
          rol: 'HERRAMIENTA',
          contenido: salida.paraElLedger,
          herramienta: `${llamada.nombre}(${JSON.stringify(llamada.argumentos)})`,
          // Una herramienta no consume tokens propios: lo que cuesta es que su
          // salida entre como entrada en el turno siguiente, y eso ya se
          // contabiliza allá. Ponerlo en los dos lados contaría doble.
          tokensEntrada: 0,
          tokensSalida: 0,
          costoMicroUsd: 0,
          modelo: null,
        });
      }
    }

    this.logger.warn(
      `Loop cortado por el tope de ${MAX_ITERACIONES} iteraciones (grupo ${contexto.grupoId})`
    );

    return {
      texto:
        'Estuve dando vueltas más de la cuenta y prefiero frenar acá. Probá de nuevo con una ' +
        'pregunta más acotada.',
      mensajes,
      tokensTotales,
      cortadoPorTope: true,
      propuestasArmadas,
    };
  }

  /**
   * Ejecuta una herramienta y arma sus dos representaciones: la que va al
   * modelo (envuelta en `<datos_del_grupo>`, decisión 10) y la que queda en el
   * ledger (recortada, porque el ledger es para auditar qué se consultó, no
   * para volver a servir el catálogo).
   */
  private async ejecutarHerramienta(
    llamada: { nombre: string; argumentos: Record<string, unknown> },
    contexto: ContextoHerramienta,
    conversacionId: string
  ): Promise<{ paraElModelo: string; paraElLedger: string; propuestaId?: string }> {
    // Las de PROPUESTA no ejecutan nada contra otro servicio: validan, guardan
    // una fila en ai_db y le contestan al modelo. La asimetría con las de
    // lectura es el corazón del ítem, no un detalle de ruteo.
    if (NOMBRES_HERRAMIENTAS_PROPUESTA.includes(llamada.nombre)) {
      return await this.armarPropuesta(llamada, contexto, conversacionId);
    }

    const resultado = await this.herramientas.ejecutar(
      llamada.nombre,
      llamada.argumentos,
      contexto
    );

    if (!resultado.ok) {
      // El error vuelve al modelo como texto plano, no envuelto: es un mensaje
      // del sistema y no un dato del grupo.
      return { paraElModelo: resultado.error, paraElLedger: `error: ${resultado.error}` };
    }

    const serializado = JSON.stringify(resultado.datos);

    return {
      paraElModelo: envolverDatos(llamada.nombre, resultado.datos),
      paraElLedger: `ok (${serializado.length} bytes)`,
    };
  }

  /**
   * Arma una propuesta a partir de lo que pidió el modelo.
   *
   * **Una propuesta que no valida NO se guarda** (decisión 11): el error vuelve
   * con la ruta del campo y el modelo reintenta dentro del mismo turno,
   * gastando una vuelta del loop en vez de dejarle al Tutor una tarjeta que la
   * API iba a rechazar.
   */
  private async armarPropuesta(
    llamada: { nombre: string; argumentos: Record<string, unknown> },
    contexto: ContextoHerramienta,
    conversacionId: string
  ): Promise<{ paraElModelo: string; paraElLedger: string; propuestaId?: string }> {
    const armado = await this.propuestas.armar(
      llamada.nombre,
      llamada.argumentos,
      contexto,
      conversacionId
    );

    if (!armado.ok) {
      this.logger.debug(`Propuesta rechazada (${llamada.nombre}): ${armado.error}`);

      return {
        paraElModelo:
          `La propuesta no se guardó porque tiene un error: ${armado.error} ` +
          'Corregilo y volvé a llamar a la herramienta.',
        paraElLedger: `rechazada: ${armado.error}`,
      };
    }

    return {
      paraElModelo: armado.mensaje,
      paraElLedger: `propuesta ${armado.propuestaId} (${armado.cantidad} operaciones)`,
      propuestaId: armado.propuestaId,
    };
  }

  /** Un turno sin texto y sin herramientas no puede quedar en silencio. */
  private textoDeCortesia(incompleta: boolean): string {
    return incompleta
      ? 'Me quedé sin espacio para terminar la respuesta. Probá pidiéndome algo más puntual.'
      : 'No tengo nada para agregar sobre eso.';
  }
}

/**
 * Error del proveedor que arrastra lo ya consumido.
 *
 * Existe para que el `finally` del llamador tenga qué escribir: sin esto, un
 * fallo en la vuelta 3 borraría la contabilidad de las vueltas 1 y 2, que se
 * pagaron igual.
 */
export class ErrorConConsumo extends Error {
  constructor(
    readonly causa: unknown,
    readonly parcial: ResultadoLoop
  ) {
    super('El proveedor falló durante el loop');
    this.name = 'ErrorConConsumo';
  }
}
