import type { OperacionPropuestaIaDto, ResultadoOperacionIa } from '@dorado/shared-types';

/**
 * El «Aplicar» de una propuesta (fase-14-29 tanda 6), sin Angular en el medio.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO ES UN `for`, NO UNA TRADUCCIÓN — y que lo sea es todo el ítem.
 *
 * `ai-service` **no tiene un solo camino de escritura hacia otro servicio**
 * (decisión 6): cada operación viaja con su `metodo`, su `ruta` y su `body`
 * exactos, y el que llama es el navegador con el JWT del Tutor, contra los
 * mismos endpoints públicos que usa el formulario. Cero superficie de escritura
 * nueva, ninguna autorización nueva que auditar, y el peor caso de un prompt
 * injection exitoso es una propuesta fea que un humano vio antes de aplicar.
 *
 * Si algún día acá aparece un `if (operacion.ruta === ...)` para arreglar un
 * body, eso no es un parche: es la señal de que el servidor dejó de guardar la
 * forma del endpoint destino, y hay que arreglarlo allá.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Ejecuta una operación contra la API. Lo inyecta el llamador (es HttpClient). */
export type EjecutarOperacion = (
  operacion: OperacionPropuestaIaDto
) => Promise<{ id?: string } | null>;

/** Se llama al terminar cada fila, para que la pantalla pinte el progreso. */
export type OnFila = (resultado: ResultadoOperacionIa) => void;

export interface OpcionesAplicar {
  /** Solo estas `opId`. Sin la lista, van todas («Aplicar todo»). */
  soloEstas?: readonly string[];
  onFila?: OnFila;
}

/**
 * Aplica las operaciones **una por una, y una que falla no aborta el resto**
 * (decisión 13).
 *
 * No hay transacción distribuida y no hace falta: crear cinco actividades y que
 * la tercera falle deja cuatro actividades buenas y una fila roja que se
 * reintenta, que es mejor que perder las cinco. Las que salieron bien ya
 * existen en el grupo — no hay nada que «deshacer» que el Tutor no pueda
 * borrar él mismo desde el catálogo.
 *
 * Son secuenciales y no en paralelo a propósito: el Tutor ve el avance fila por
 * fila, y varias escrituras simultáneas contra el mismo grupo pueden pelearse
 * por los límites del plan (`actividadesPorGrupo`) y fallar por una carrera en
 * vez de por lo que dice el body.
 */
export async function aplicarOperaciones(
  operaciones: readonly OperacionPropuestaIaDto[],
  ejecutar: EjecutarOperacion,
  opciones: OpcionesAplicar = {}
): Promise<ResultadoOperacionIa[]> {
  const elegidas = opciones.soloEstas
    ? operaciones.filter((operacion) => opciones.soloEstas?.includes(operacion.opId))
    : operaciones;
  const resultados: ResultadoOperacionIa[] = [];

  for (const operacion of elegidas) {
    let resultado: ResultadoOperacionIa;

    try {
      const creado = await ejecutar(operacion);

      resultado = { opId: operacion.opId, ok: true };

      // Un `PUT` de rendimientos no devuelve una entidad con id, y eso no es un
      // fallo: el campo es opcional justamente por eso.
      if (creado?.id) {
        resultado.entidadId = creado.id;
      }
    } catch (error) {
      resultado = { opId: operacion.opId, ok: false, error: mensajeDeFallo(error) };
    }

    resultados.push(resultado);
    opciones.onFila?.(resultado);
  }

  return resultados;
}

/**
 * El motivo que se muestra en la fila roja.
 *
 * Prioriza el `message` que manda la API (ADR-00 §7: todo error viaja en el
 * sobre `ApiErrorResponse`), porque es el que dice *qué* está mal —«El plan
 * permite hasta 20 actividades por grupo»— y no *que* algo salió mal. Un
 * «Error 400» no le sirve a nadie para decidir si reintentar.
 */
export function mensajeDeFallo(error: unknown): string {
  const cuerpo = (error as { error?: { message?: string; code?: string } } | null)?.error;

  if (typeof cuerpo?.message === 'string' && cuerpo.message !== '') {
    return cuerpo.message;
  }

  if (typeof cuerpo?.code === 'string' && cuerpo.code !== '') {
    return cuerpo.code;
  }

  const status = (error as { status?: number } | null)?.status;

  if (typeof status === 'number' && status > 0) {
    return `La API respondió ${status}`;
  }

  return 'No se pudo aplicar';
}

/** Cómo queda la propuesta según cómo fue el aplicado (decisión 13). */
export function resumirAplicado(resultados: readonly ResultadoOperacionIa[]): {
  ok: number;
  fallaron: number;
  todoBien: boolean;
} {
  const ok = resultados.filter((resultado) => resultado.ok).length;

  return { ok, fallaron: resultados.length - ok, todoBien: ok === resultados.length };
}
