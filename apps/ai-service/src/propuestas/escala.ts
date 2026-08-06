/**
 * La escala de zonas de un Grupo (fase-14-30 tanda 6).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTA FAMILIA TIENE UN ARCHIVO PROPIO Y LAS OTRAS NO:
 *
 * Es la única propuesta del ítem que **no se valida fila por fila**. Un umbral
 * suelto no es correcto ni incorrecto: lo es el conjunto. Los rangos tienen que
 * cubrir la recta sin huecos ni solapes, con los órdenes corridos desde 1 y
 * exactamente una zona sin techo — y eso se juzga sobre el estado que queda
 * DESPUÉS de aplicar la propuesta entera, porque una edición que sola parece
 * rota puede ser correcta junto a las otras.
 *
 * Y hay una segunda cosa, que la tanda descubrió al escribirla y que ninguna
 * otra familia tiene: **scoring valida el conjunto en CADA escritura**, así que
 * no alcanza con que el estado final cierre. Aplicar es un `for` (decisión 6 del
 * fase-14-29) y cada paso de ese `for` pasa por el mismo validador, de modo que
 * una propuesta cuyo estado final es impecable puede fallar en la operación 1
 * porque el estado intermedio tiene un hueco. Por eso `ordenAplicable` busca un
 * orden donde **todos los pasos intermedios también cierran**, y si no existe la
 * propuesta no se guarda: es la decisión 11 del fase-14-29 —el Tutor nunca ve
 * una propuesta que la API iba a rechazar— aplicada al orden y no al shape.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Una zona tal como participa del cálculo. `id` vacío = la crea la propuesta. */
export interface ZonaDeLaEscala {
  id: string;
  nombreZona: string;
  orden: number;
  puntosMin: number;
  /** `null` = sin techo, y es la zona más alta. */
  puntosMax: number | null;
}

export interface PasoDeEscala {
  tipo: 'crear' | 'editar';
  zona: ZonaDeLaEscala;
}

/**
 * Tope de estados explorados al buscar un orden de aplicado.
 *
 * La búsqueda es completa (prueba todos los órdenes) y con 25 zonas eso sería
 * factorial, así que lleva presupuesto. Agotarlo se trata igual que no
 * encontrar orden: el modelo recibe el error que le explica cómo partirlo.
 */
const TOPE_DE_BUSQUEDA = 5_000;

/**
 * La misma regla de zona que `scoring-service/src/comun/zonas.ts`.
 *
 * ⚠️ Es un espejo deliberado, igual que `invariantes.ts`: si scoring cambia
 * cómo resuelve la zona de un puntaje, esto no se entera solo y el síntoma
 * sería un aviso que cuenta mal. Se acepta por la misma razón que allá —la
 * alternativa es superficie nueva en un servicio que este ítem no toca— y el
 * costo del error es un número en un aviso, no una escritura.
 */
export function zonaDe(zonas: readonly ZonaDeLaEscala[], puntaje: number): ZonaDeLaEscala | null {
  return (
    zonas.find(
      (zona) =>
        zona.puntosMin <= puntaje && (zona.puntosMax === null || puntaje <= zona.puntosMax)
    ) ?? null
  );
}

/**
 * El motivo por el que un conjunto de zonas no sirve, o `null` si cierra.
 *
 * `exigirCima` distingue los dos usos y la diferencia importa:
 *
 * - En el estado **final** va en `true`: el criterio de aceptación 5 pide que
 *   ninguna zona sin techo (o más de una) se rechace. Sin cima, un puntaje alto
 *   se queda literalmente sin zona, que es un grupo mal configurado aunque
 *   scoring lo acepte.
 * - En los estados **intermedios** va en `false`, porque ahí se está imitando lo
 *   que el endpoint destino rechaza, ni más ni menos: scoring admite que la más
 *   alta tenga techo, y exigirlo acá haría imposible el caso más común de todos
 *   —ponerle techo a la cima para agregar una zona arriba—.
 */
export function violacionDeLaEscala(
  zonas: readonly ZonaDeLaEscala[],
  opciones: { exigirCima: boolean }
): string | null {
  if (zonas.length === 0) {
    return 'la escala quedaría sin ninguna zona, y sin zonas el puntaje no significa nada.';
  }

  const ordenadas = [...zonas].sort((a, b) => a.orden - b.orden);

  // El orden se chequea entero y primero: es lo estructural, y un mensaje sobre
  // el rango de una zona que además está mal numerada manda al modelo a mirar
  // el lugar equivocado.
  const desordenada = ordenadas.findIndex((zona, indice) => zona.orden !== indice + 1);

  if (desordenada !== -1) {
    return (
      `los órdenes tienen que ser 1, 2, 3… sin huecos ni repetidos, y quedaron ` +
      `${ordenadas.map((fila) => fila.orden).join(', ')}. Mandá también las zonas que hay ` +
      'que correr de lugar.'
    );
  }

  for (const [indice, zona] of ordenadas.entries()) {
    if (zona.puntosMax !== null && zona.puntosMax < zona.puntosMin) {
      return `«${zona.nombreZona}» termina (${zona.puntosMax}) antes de donde empieza (${zona.puntosMin}).`;
    }

    if (zona.puntosMax === null && indice < ordenadas.length - 1) {
      return (
        `«${zona.nombreZona}» quedó sin techo y no es la más alta. Solo la última zona puede ` +
        'ir con puntosMax null.'
      );
    }

    if (indice > 0) {
      const anterior = ordenadas[indice - 1];

      if (anterior.puntosMax !== null && zona.puntosMin !== anterior.puntosMax + 1) {
        return (
          `«${zona.nombreZona}» tiene que arrancar en ${anterior.puntosMax + 1}, justo donde ` +
          `termina «${anterior.nombreZona}» (${anterior.puntosMax}), y arranca en ` +
          `${zona.puntosMin}: la escala no puede tener huecos ni solapes.`
        );
      }
    }
  }

  if (opciones.exigirCima && ordenadas[ordenadas.length - 1].puntosMax !== null) {
    return (
      `«${ordenadas[ordenadas.length - 1].nombreZona}» es la zona más alta y tiene techo, así ` +
      'que un puntaje por encima se quedaría sin zona. La última va con puntosMax null.'
    );
  }

  return null;
}

/** El estado que queda después de aplicar un paso: alta al final, edición por id. */
export function aplicarPaso(
  zonas: readonly ZonaDeLaEscala[],
  paso: PasoDeEscala
): ZonaDeLaEscala[] {
  if (paso.tipo === 'crear') {
    return [...zonas, paso.zona];
  }

  return zonas.map((zona) => (zona.id === paso.zona.id ? paso.zona : zona));
}

/** El estado resultante de aplicar todos los pasos, sin mirar el orden. */
export function estadoResultante(
  actuales: readonly ZonaDeLaEscala[],
  pasos: readonly PasoDeEscala[]
): ZonaDeLaEscala[] {
  return pasos.reduce<ZonaDeLaEscala[]>(
    (estado, paso) => aplicarPaso(estado, paso),
    [...actuales]
  );
}

/**
 * Un orden en el que aplicar los pasos **de a uno** deja el conjunto válido
 * después de cada uno, o `null` si no existe ninguno.
 *
 * El caso que la motiva y el que no tiene salida, los dos reales:
 *
 * - «agregá una zona arriba» sí tiene orden: primero el PATCH que le pone techo
 *   a la cima, después el POST de la zona nueva. Al revés, el paso 1 dejaría dos
 *   zonas sin techo y scoring lo rechazaría.
 * - «corré todos los rangos hacia arriba» no tiene ninguno: mover un solo límite
 *   rompe la contigüidad con el vecino, se empiece por donde se empiece. Esa
 *   propuesta no se guarda, y el error se lo explica al modelo.
 */
export function ordenAplicable<T extends PasoDeEscala>(
  actuales: readonly ZonaDeLaEscala[],
  pasos: readonly T[]
): T[] | null {
  let presupuesto = TOPE_DE_BUSQUEDA;

  const buscar = (
    estado: readonly ZonaDeLaEscala[],
    pendientes: readonly T[]
  ): T[] | null => {
    if (pendientes.length === 0) {
      return [];
    }

    for (const [indice, paso] of pendientes.entries()) {
      if (presupuesto <= 0) {
        return null;
      }

      presupuesto -= 1;

      const siguiente = aplicarPaso(estado, paso);

      // Los intermedios se juzgan con la regla del ENDPOINT (sin exigir cima),
      // que es lo único que puede hacer fallar el `for` del frontend.
      if (violacionDeLaEscala(siguiente, { exigirCima: false })) {
        continue;
      }

      const resto = buscar(
        siguiente,
        pendientes.filter((_, posicion) => posicion !== indice)
      );

      if (resto) {
        return [paso, ...resto];
      }
    }

    return null;
  };

  return buscar(actuales, pasos);
}

/**
 * A cuánta gente le cambia la zona (decisión 6, criterio de aceptación 10).
 *
 * Es el número del aviso de la tarjeta, y existe porque **esta es la única
 * propuesta del ítem cuyo efecto no se limita a lo que pase de acá en
 * adelante**: por la regla 1 del proyecto el puntaje se deriva al leer, así que
 * mover un rango recalcula la zona de todos en el acto.
 *
 * Los descalificados no cuentan: no tienen zona ni antes ni después, así que
 * sumarlos sería inflar el aviso con gente a la que no le cambia nada.
 */
export function cuantosCambianDeZona(
  puntajes: ReadonlyArray<{ puntajeTotal: number; descalificado: boolean }>,
  antes: readonly ZonaDeLaEscala[],
  despues: readonly ZonaDeLaEscala[],
  ajusteDePuntos = 0
): number {
  return puntajes.filter((puntaje) => {
    if (puntaje.descalificado) {
      return false;
    }

    const zonaAntes = zonaDe(antes, puntaje.puntajeTotal);
    const zonaDespues = zonaDe(despues, puntaje.puntajeTotal + ajusteDePuntos);

    return (zonaAntes?.nombreZona ?? null) !== (zonaDespues?.nombreZona ?? null);
  }).length;
}
