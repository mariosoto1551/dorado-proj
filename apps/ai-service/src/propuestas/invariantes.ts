import { CrearActividadRequest, EditarActividadRequest } from '@dorado/shared-types';

/**
 * Invariantes CRUZADOS de una actividad (fase-14-29 decisión 11).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE ESTE ARCHIVO, Y LO QUE LO ENCONTRÓ:
 *
 * La decisión 11 dice que una operación se valida contra el shape del DTO
 * **y contra las reglas que el endpoint destino va a exigir de todos modos**,
 * para que «el Tutor nunca vea una propuesta que la API rechazaría».
 *
 * La primera versión de la tanda 5 solo hacía lo primero. La verificación
 * contra OpenAI real lo destapó de la peor forma posible: el modelo armó
 * cuatro actividades impecables de shape, la propuesta se guardó, y **las
 * cuatro fallaron con 400 al aplicarlas** porque mandó `deadlineHora` y
 * `duracionCronometroMinutos` en actividades `SIN_LIMITE`. Zod dijo que sí
 * porque los campos existen y el formato era correcto; el endpoint dijo que no
 * porque en `SIN_LIMITE` tienen que ser null.
 *
 * Peor todavía: el modelo había mandado `""` primero, el error le dijo «debe
 * tener formato HH:mm», y entonces **inventó `"00:00"`** — o sea que un
 * mensaje de error que describe el formato en vez de decir «no lo mandes»
 * empuja al modelo hacia un estado inválido. Por eso los mensajes de acá dicen
 * qué HACER, no solo qué está mal.
 *
 * ⚠️ **Esto es un espejo deliberado de reglas que viven en otro servicio**
 * (`apps/activity-service/src/comun/limite-tiempo.ts` y las validaciones de
 * `actividades.service.ts`). Es duplicación, y puede derivar: si activity
 * agrega una regla nueva, acá no aparece sola y el síntoma será una propuesta
 * que falla al aplicar. Se aceptó a propósito, porque la alternativa —un
 * endpoint de «validá esto sin guardarlo» en activity— es superficie nueva en
 * el servicio que este ítem se propuso no tocar. La red de seguridad es que
 * fallar acá es visible y recuperable: el frontend reporta la fila en rojo.
 *
 * Solo se replican las reglas que **rechazan**. Las que el endpoint normaliza
 * en silencio (forzar `bonoJefePuntos` a 0 fuera de EQUIPO, `puntosPorCumplir`
 * a 0 fuera de obligatoria confirmable) no hacen falta: mandarlas no rompe
 * nada, el destino las acomoda.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type CamposActividad = CrearActividadRequest | EditarActividadRequest;

/**
 * Normaliza lo que el modelo manda de más, antes de validar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DESCUBRIMIENTO QUE OBLIGÓ A ESCRIBIR ESTO ASÍ:
 *
 * **El modelo no puede OMITIR una propiedad declarada en el esquema.** Emite
 * todas, siempre. La primera versión validaba pidiéndole que omitiera los
 * campos que no aplican, y la verificación real terminó con el modelo
 * quemando las ocho iteraciones del loop contra el mismo error, sin poder
 * cumplirlo nunca: se le estaba pidiendo algo imposible, y el bucle fue culpa
 * del diseño de la validación, no del modelo.
 *
 * La salida legítima que sí tiene es **mandar `null`**. Así que en un alta,
 * `null`, `""` y `[]` significan todos lo mismo —«no lo puse»— y se sacan
 * antes de validar.
 *
 * El `""` es además la misma trampa que se cobró media hora en la tanda 2 con
 * `OPENAI_API_KEY=` y `@IsOptional()`: el string vacío no es la ausencia, y
 * hay que convertirlo a mano cada vez que aparece.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @param tratarNullComoAusente `true` en un alta. En un PATCH va `false`,
 * porque ahí un `null` explícito **borra** el campo (fase-14-24: así se quita
 * una vigencia), y sacarlo perdería la única forma de expresar eso.
 */
export function limpiarVacios(
  fila: Record<string, unknown>,
  tratarNullComoAusente: boolean
): Record<string, unknown> {
  const limpia: Record<string, unknown> = {};

  for (const [clave, valor] of Object.entries(fila)) {
    if (valor === '' || valor === undefined) {
      continue;
    }

    if (valor === null && tratarNullComoAusente) {
      continue;
    }

    // `rolesPermitidos: []` significa «sin restricción», que es lo mismo que no
    // mandarlo — pero dejarlo hace que el chequeo de «un solo modo de
    // destinatario» cuente modos que nadie usó.
    if (Array.isArray(valor) && valor.length === 0) {
      continue;
    }

    limpia[clave] = valor;
  }

  return limpia;
}

/**
 * Devuelve el motivo del rechazo, o `null` si los invariantes se cumplen.
 *
 * `parcial` distingue crear de editar: en un PATCH los campos que no vienen
 * conservan su valor actual, así que solo se puede juzgar lo que el request
 * trae junto. Es la misma razón por la que el fase-14-24 valida el destinatario
 * sobre los valores FINALES y no sobre el request.
 */
export function violacionDeInvariantes(
  datos: CamposActividad,
  parcial: boolean
): string | null {
  return (
    limiteDeTiempo(datos, parcial) ??
    comportamiento(datos) ??
    alcance(datos) ??
    repeticiones(datos) ??
    destinatarioSegunAlcance(datos) ??
    vigencia(datos)
  );
}

/**
 * Solo reclama lo que está **subdeterminado**: un DEADLINE sin hora o un
 * CRONOMETRO sin minutos, que no se pueden inventar. Los campos que SOBRAN no
 * se reclaman — los saca `normalizarLimiteTiempo`.
 */
function limiteDeTiempo(datos: CamposActividad, parcial: boolean): string | null {
  const tipo = datos.tipoLimiteTiempo;

  // En un PATCH que no toca `tipoLimiteTiempo` no se puede juzgar: el tipo
  // efectivo lo define la fila que ya existe.
  if (tipo === undefined) {
    return parcial ? null : 'tipoLimiteTiempo: falta.';
  }

  if (tipo === 'DEADLINE' && !tieneValor(datos.deadlineHora)) {
    return 'con tipoLimiteTiempo DEADLINE tenés que mandar deadlineHora, en formato "HH:mm".';
  }

  if (tipo === 'CRONOMETRO' && !tieneValor(datos.duracionCronometroMinutos)) {
    return 'con tipoLimiteTiempo CRONOMETRO tenés que mandar duracionCronometroMinutos.';
  }

  return null;
}

function tieneValor(valor: unknown): boolean {
  return valor !== undefined && valor !== null;
}

/**
 * Fuerza a `null` los campos que el `tipoLimiteTiempo` no admite.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO NORMALIZA EN VEZ DE RECHAZAR, QUE ES LO QUE HACÍA ANTES:
 *
 * Dos corridas reales terminaron con el modelo quemando las ocho iteraciones
 * del loop contra este invariante, alternando entre poner un valor de relleno
 * y sacarlo, y la conversación terminó **sin ninguna propuesta** — que para el
 * Tutor es peor que una propuesta con un campo de más.
 *
 * El punto es que acá no hay nada que interpretar: con `SIN_LIMITE`, los dos
 * campos son null y no hay otra lectura posible. Pedirle al modelo que acierte
 * algo que el servidor puede derivar solo es hacerle hacer trabajo que además
 * hace mal, y pagarlo en tokens.
 *
 * La regla que queda, y que vale para todo este archivo: **se rechaza lo
 * ambiguo, se normaliza lo determinado.** Un DEADLINE sin hora se sigue
 * rechazando —esa hora no se puede inventar—; un `SIN_LIMITE` con hora se
 * limpia, porque el `tipoLimiteTiempo` ya dijo todo lo que hacía falta saber.
 *
 * Es además lo que hace el propio endpoint destino con otros campos
 * (`bonoJefePuntos` fuera de EQUIPO, `puntosPorCumplir` fuera de obligatoria
 * confirmable): los fuerza en silencio en vez de rechazar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function normalizarLimiteTiempo<T extends CamposActividad>(datos: T): T {
  const tipo = datos.tipoLimiteTiempo;

  if (tipo === undefined) {
    return datos;
  }

  const normalizado = { ...datos };

  if (tipo !== 'DEADLINE') {
    delete normalizado.deadlineHora;
  }

  if (tipo !== 'CRONOMETRO') {
    delete normalizado.duracionCronometroMinutos;
  }

  return normalizado;
}

function comportamiento(datos: CamposActividad): string | null {
  if (
    datos.comportamientoAlCierre === 'REQUIERE_CONFIRMACION' &&
    datos.tipoPuntaje === 'OPCIONAL'
  ) {
    return (
      'comportamientoAlCierre REQUIERE_CONFIRMACION solo va con tipoPuntaje OBLIGATORIA. ' +
      'En una OPCIONAL usá ASUME_HECHA.'
    );
  }

  return null;
}

function alcance(datos: CamposActividad): string | null {
  if (datos.alcance === 'EQUIPO' && datos.tipoPuntaje === 'OBLIGATORIA') {
    return 'una actividad de alcance EQUIPO tiene que ser OPCIONAL: no hay castigo colectivo.';
  }

  return null;
}

function repeticiones(datos: CamposActividad): string | null {
  const minimo = datos.repeticionesMinimasSesion;
  const maximo = datos.repeticionesMaximasSesion;

  if (minimo !== undefined && maximo !== undefined && minimo > maximo) {
    return `repeticionesMinimasSesion (${minimo}) no puede superar a repeticionesMaximasSesion (${maximo}).`;
  }

  return null;
}

function destinatarioSegunAlcance(datos: CamposActividad): string | null {
  const esEquipo = datos.alcance === 'EQUIPO';

  if ((datos.equiposPermitidos ?? []).length > 0 && !esEquipo) {
    return 'equiposPermitidos exige alcance EQUIPO.';
  }

  if (
    esEquipo &&
    ((datos.rolesPermitidos ?? []).length > 0 || (datos.usuariosPermitidos ?? []).length > 0)
  ) {
    return 'con alcance EQUIPO el destinatario se define con equiposPermitidos, no con roles ni personas.';
  }

  return null;
}

function vigencia(datos: CamposActividad): string | null {
  for (const [campo, valor] of [
    ['vigenteDesde', datos.vigenteDesde],
    ['vigenteHasta', datos.vigenteHasta],
  ] as const) {
    if (valor && !esFechaReal(valor)) {
      return `${campo}: "${valor}" no es una fecha real del calendario.`;
    }
  }

  if (datos.vigenteDesde && datos.vigenteHasta && datos.vigenteDesde > datos.vigenteHasta) {
    return 'vigenteDesde no puede ser posterior a vigenteHasta.';
  }

  return null;
}

/** El formato lo valida Zod; acá se comprueba que la fecha EXISTA (30/02 no). */
function esFechaReal(fecha: string): boolean {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const fechaUtc = new Date(Date.UTC(anio, mes - 1, dia));

  return (
    fechaUtc.getUTCFullYear() === anio &&
    fechaUtc.getUTCMonth() === mes - 1 &&
    fechaUtc.getUTCDate() === dia
  );
}
