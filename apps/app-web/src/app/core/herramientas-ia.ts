/**
 * Cómo se lee en pantalla cada herramienta del modelo (fase-14-29 tanda 6).
 *
 * El nombre técnico (`listar_umbrales_zona`) es del contrato con el proveedor y
 * no cambia; lo que ve el Tutor es qué está haciendo el asistente en ese
 * momento. Vive en `core/` y no en la plantilla porque es la única parte del
 * rastro de progreso que puede quedar desactualizada sola: si mañana se agrega
 * una herramienta al servicio y nadie toca este archivo, la pantalla la muestra
 * con su nombre crudo, que es feo pero honesto — nunca en blanco.
 */

const ACCIONES: Record<string, string> = {
  listar_actividades: 'las actividades del grupo',
  listar_conductas: 'las conductas',
  listar_participantes: 'quiénes están en el grupo',
  listar_umbrales_zona: 'las zonas y sus umbrales',
  resumen_puntajes: 'los puntajes de la semana',
  listar_recompensas: 'las recompensas',
  listar_rendimientos_monedas: 'lo que paga cada acción',
  resumen_cumplimiento: 'qué se cumple y qué no',
};

const PROPUESTAS: Record<string, string> = {
  proponer_crear_actividades: 'una propuesta de actividades nuevas',
  proponer_editar_actividades: 'una propuesta de cambios al catálogo',
  proponer_precios_tienda: 'una propuesta de precios',
  proponer_rendimientos_monedas: 'una propuesta de rendimientos',
};

export type EstadoHerramienta = 'corriendo' | 'ok' | 'error';

/**
 * La línea del rastro. En pasado o en gerundio según el estado, porque «leyendo
 * las actividades» y «leí las actividades» son la diferencia entre esperar y
 * saber que ya está.
 */
export function describirHerramienta(nombre: string, estado: EstadoHerramienta): string {
  const propuesta = PROPUESTAS[nombre];

  if (propuesta) {
    if (estado === 'corriendo') {
      return `armando ${propuesta}`;
    }

    return estado === 'ok' ? `armé ${propuesta}` : `no pude armar ${propuesta}`;
  }

  const accion = ACCIONES[nombre] ?? nombre;

  if (estado === 'corriendo') {
    return `leyendo ${accion}`;
  }

  return estado === 'ok' ? `leí ${accion}` : `no pude leer ${accion}`;
}
