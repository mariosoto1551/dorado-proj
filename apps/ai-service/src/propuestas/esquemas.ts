import { z } from 'zod';

import {
  AgregarMiembroEquipoRequest,
  AlcanceActividad,
  AsignarEtiquetasRequest,
  AsignarRolGrupoRequest,
  ActualizarRolGrupoRequest,
  ComportamientoAlCierre,
  CrearEquipoRequest,
  CrearRolGrupoRequest,
  EditarEquipoRequest,
  ConfigurarRendimientosAccionesRequest,
  ConfigurarTurnoRequest,
  CrearActividadRequest,
  CrearConductaRequest,
  CrearEtiquetaRequest,
  CrearProductoRequest,
  CrearRecompensaRequest,
  CrearUmbralRequest,
  EditarActividadRequest,
  EditarConductaRequest,
  EditarProductoRequest,
  EditarRecompensaRequest,
  EditarUmbralRequest,
  FrecuenciaTurno,
  FuenteProducto,
  GuardarBolsaRequest,
  GuardarConfiguracionScoringRequest,
  MecanicaProducto,
  ModoTurno,
  SustituirJefeEquipoRequest,
  TipoAccionRendimiento,
  TipoConducta,
  TipoItemCatalogo,
  TipoLimiteTiempo,
  TipoPuntaje,
} from '@dorado/shared-types';

/**
 * Validación de lo que propone el modelo (fase-14-29 decisión 11).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO ES ESTRICTO Y NO INDULGENTE:
 *
 * Una operación que no valida **no se guarda**: el error vuelve al modelo con
 * el detalle del campo para que reintente. Así el Tutor nunca ve una propuesta
 * que la API iba a rechazar, y el «Aplicar» no falla a mitad de camino por
 * algo que se podía saber antes.
 *
 * Es lo contrario del criterio del ejecutor de herramientas de lectura, que
 * sanea y sigue: allá un `dias: 100000` se acota al máximo porque se entiende
 * qué quiso decir; acá un `valorPuntos: "diez"` no se convierte a 10 — el
 * modelo tiene que corregirlo, porque adivinar sobre algo que va a escribirse
 * en la base del Tutor es exactamente lo que este ítem no hace.
 *
 * Cada esquema está tipado como `z.ZodType<Contrato>`, donde el contrato vive
 * en `shared-types` y las clases con decoradores de activity/rewards lo
 * `implements`. Es lo que hace que un cambio de DTO **rompa el build acá** en
 * vez de descubrirse en producción.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** `HH:mm` 24 h, igual que el DTO destino. */
const HORA_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Fecha civil `YYYY-MM-DD` del calendario del Grupo. */
const FECHA_CIVIL = /^\d{4}-\d{2}-\d{2}$/;

const uuid = z.string().uuid();

const enteroPositivo = z.number().int().positive();

/**
 * Campos comunes a crear y editar. Se declaran una vez porque son literalmente
 * el mismo request: editar es el mismo shape con todo opcional.
 */
const camposActividad = {
  nombre: z.string().trim().min(1).max(120),
  descripcion: z.string().max(1000).nullish(),
  tipoPuntaje: z.enum(TipoPuntaje),
  valorPuntos: enteroPositivo,
  puntosPorCumplir: z.number().int().min(0).optional(),
  tipoLimiteTiempo: z.enum(TipoLimiteTiempo),
  deadlineHora: z
    .string()
    .regex(HORA_HHMM, 'deadlineHora debe tener formato HH:mm (24 h)')
    .nullish(),
  duracionCronometroMinutos: enteroPositivo.nullish(),
  repeticionesMaximasSesion: enteroPositivo.optional(),
  repeticionesMinimasSesion: enteroPositivo.optional(),
  repeticionesMaximasSeccion: enteroPositivo.nullish(),
  comportamientoAlCierre: z.enum(ComportamientoAlCierre).optional(),
  alcance: z.enum(AlcanceActividad).optional(),
  bonoJefePuntos: z.number().int().min(0).optional(),
  diasSemana: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  siempreVisible: z.boolean().optional(),
  rolesPermitidos: z.array(uuid).optional(),
  usuariosPermitidos: z.array(uuid).optional(),
  equiposPermitidos: z.array(uuid).optional(),
  vigenteDesde: z
    .string()
    .regex(FECHA_CIVIL, 'vigenteDesde debe tener formato YYYY-MM-DD')
    .nullish(),
  vigenteHasta: z
    .string()
    .regex(FECHA_CIVIL, 'vigenteHasta debe tener formato YYYY-MM-DD')
    .nullish(),
};

/**
 * `strict()` en todos: una propiedad que nadie declaró es un error, no algo que
 * se ignora. Un modelo que inventa `prioridad: "alta"` tiene que enterarse —
 * si se descartara en silencio, la propuesta que ve el Tutor no diría lo que el
 * modelo creyó estar proponiendo.
 */
const crearActividad = z.object(camposActividad).strict();

const editarActividad = z.object(camposActividad).partial().strict();

/**
 * Economía (fase-14-30 tanda 5).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ `imagenUrl` ESTÁ ACÁ Y NO EN LA DEFINICIÓN QUE LEE EL MODELO:
 *
 * La spec lo deja **fuera de lo que se le expone al modelo** —no tiene de dónde
 * sacar una URL válida y la inventaría—, pero sí es parte del contrato del
 * endpoint. Declararlo acá es lo que hace que `Exhaustivo` siga sirviendo:
 * renombrarlo en rewards tiene que romper este build igual, aunque hoy ninguna
 * propuesta lo mande. Sacarlo del esquema para "que coincida con la
 * herramienta" apagaría la única alarma que avisa de ese cambio.
 *
 * El modelo no puede mandarlo de todos modos: la definición no lo declara y
 * todas llevan `additionalProperties: false`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const camposProducto = {
  nombre: z.string().trim().min(1).max(120),
  descripcion: z.string().max(500).nullish(),
  imagenUrl: z.string().nullish(),
  precio: enteroPositivo,
  fuente: z.enum(FuenteProducto),
  mecanica: z.enum(MecanicaProducto).optional(),
  recompensaId: uuid.nullish(),
  bolsaId: uuid.nullish(),
};

const crearProducto = z.object(camposProducto).strict();

/**
 * Todos opcionales. Dejó de ser solo el precio en el fase-14-30 (decisión 7):
 * el mismo PATCH acepta el resto, y el subconjunto anterior era arbitrario.
 */
const editarProducto = z.object(camposProducto).partial().strict();

const camposRecompensa = {
  tipo: z.enum(TipoItemCatalogo),
  umbralZonaId: uuid.optional(),
  nombre: z.string().trim().min(1).max(120),
  permiteSeleccion: z.boolean().optional(),
  permiteAzar: z.boolean().optional(),
};

/**
 * `descripcion` e `imagenUrl` **no se comparten entre crear y editar**, que es
 * lo contrario de lo que hacen la actividad, la conducta y el producto.
 *
 * No es una inconsistencia: en `CrearRecompensaRequest` los dos son
 * `string | undefined` y en `EditarRecompensaRequest` son `string | null`,
 * porque en un alta no hay nada que borrar y en un PATCH `null` borra. Compartir
 * el campo compiló hasta que el `z.ZodType<Contrato>` lo rechazó — o sea que el
 * cable de la decisión 11 encontró acá una propuesta que el endpoint habría
 * contestado con 400.
 */
const crearRecompensa = z
  .object({
    ...camposRecompensa,
    descripcion: z.string().max(1000).optional(),
    imagenUrl: z.string().optional(),
  })
  .strict();

const editarRecompensa = z
  .object({
    ...camposRecompensa,
    descripcion: z.string().max(1000).nullish(),
    imagenUrl: z.string().nullish(),
  })
  .partial()
  .strict();

/** `#RRGGBB`, igual que `UmbralZona.colorHex`. */
const COLOR_HEX = /^#[0-9a-fA-F]{6}$/;

const colorHex = z.string().regex(COLOR_HEX, 'colorHex debe ser "#RRGGBB" (ej. "#22C55E")');

const crearEtiqueta = z.object({ nombre: z.string().trim().min(1).max(40), colorHex }).strict();

/**
 * El PUT reemplaza la lista COMPLETA, no agrega (fase-14-26). El tope de 5 lo
 * pone el endpoint destino: se replica acá porque rechaza.
 */
const asignarEtiquetas = z.object({ etiquetaIds: z.array(uuid).max(5) }).strict();

/**
 * Sin ítems no hay bolsa: una bolsa vacía falla recién al comprar, que es el
 * peor momento para enterarse.
 */
const guardarBolsa = z
  .object({ nombre: z.string().trim().min(1).max(120), recompensaIds: z.array(uuid).min(1) })
  .strict();

/**
 * Conductas (fase-14-30 tanda 4). El mismo criterio que las actividades: crear
 * y editar son literalmente el mismo shape, uno con todo obligatorio y el otro
 * con todo opcional.
 *
 * Sin campos anulables a propósito, porque el contrato destino no tiene
 * ninguno: acá `null` no borra nada, así que las dos ramas del armador tratan
 * el `null` del modelo como «no lo puse» (ver `limpiarVacios`).
 */
const camposConducta = {
  nombre: z.string().trim().min(1).max(120),
  tipo: z.enum(TipoConducta),
  valorPuntos: enteroPositivo,
  permiteAutoreporte: z.boolean().optional(),
};

const crearConducta = z.object(camposConducta).strict();

const editarConducta = z.object(camposConducta).partial().strict();

/**
 * Turnos (fase-14-30 tanda 4).
 *
 * `posiciones` es una lista de objetos porque **así es el request destino**, no
 * porque sea lo más cómodo: el modelo manda una lista plana de ids y el armador
 * la convierte. La conversión vive de este lado justamente para que el esquema
 * pueda seguir siendo el contrato exacto, que es lo que hace que renombrar el
 * campo en activity rompa este build.
 *
 * **Sin `ArrayUnique`**: que la misma persona aparezca dos veces no es un error
 * de datos, es cómo se le dan más turnos que a los demás (fase-14-21).
 */
const configurarTurno = z
  .object({
    modo: z.enum(ModoTurno),
    frecuencia: z.enum(FrecuenciaTurno),
    activo: z.boolean().optional(),
    posiciones: z.array(z.object({ usuarioId: uuid }).strict()).min(1),
  })
  .strict();

/**
 * La escala de zonas (fase-14-30 tanda 6).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `puntosMax` ES EL ÚNICO CAMPO DEL ÍTEM DONDE `null` ES UN VALOR Y NO UNA
 * AUSENCIA, Y POR ESO LA ZONA SE PROPONE COMPLETA:
 *
 * `null` significa «sin techo», o sea *la zona más alta*. Y el modelo no puede
 * omitir una propiedad declarada (lo aprendió la tanda 5 del fase-14-29), así
 * que un `puntosMax: null` de una edición que solo cambia el color llega
 * exactamente igual que uno que quiere sacarle el techo a la cima: el mismo
 * token, dos significados opuestos.
 *
 * La salida no es adivinar cuál de los dos era, es sacarle la ambigüedad al
 * pedido: **cada zona se manda entera**, en el alta y en la edición. Cuesta
 * cero (el modelo iba a emitir los cinco campos igual), hace que el estado
 * resultante se pueda calcular exacto, y hace que el body del PATCH lleve
 * `puntosMax` explícito — que es lo que scoring necesita para no conservar el
 * techo viejo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const camposUmbral = {
  nombreZona: z.string().trim().min(1).max(50),
  orden: enteroPositivo,
  puntosMin: z.number().int(),
  puntosMax: z.number().int().nullish(),
  colorHex,
};

const crearUmbral = z.object(camposUmbral).strict();

const editarUmbral = z.object(camposUmbral).partial().strict();

/** PUT de la base con la que arranca cada Sección. 0 = arrancar en cero. */
const configuracionScoring = z
  .object({ puntosIniciales: z.number().int().min(0) })
  .strict();

/**
 * Personas (fase-14-30 tanda 7).
 *
 * Los cuatro esquemas de identity llevan el `estado` que **no se le expone al
 * modelo** (decisión 3: poner algo en INACTIVO es archivarlo por otro camino),
 * por el mismo motivo que `imagenUrl` en la economía: sacarlo del esquema para
 * «que coincida con la herramienta» apagaría la única alarma que avisa si
 * identity lo renombra. El modelo no puede mandarlo igual — la definición no lo
 * declara y todas llevan `additionalProperties: false`.
 *
 * Los nombres de los campos son **los del contrato** (`usuarioId`,
 * `jefeUsuarioId`, `rolGrupoId`) y no los que ve el modelo: el armador traduce.
 * Ver la nota de `definiciones-propuesta.ts`.
 */
const crearRol = z
  .object({ nombre: z.string().trim().min(1).max(40), colorHex })
  .strict();

const editarRol = z
  .object({
    nombre: z.string().trim().min(1).max(40),
    colorHex,
    estado: z.enum(['ACTIVO', 'INACTIVO']),
  })
  .partial()
  .strict();

/** `null` quita el rol, y es la única forma de decirlo: el PUT fija el valor. */
const asignarRol = z.object({ rolGrupoId: uuid.nullable() }).strict();

const crearEquipo = z
  .object({
    nombre: z.string().trim().min(1).max(120),
    jefeUsuarioId: uuid,
    miembrosIds: z.array(uuid),
  })
  .strict();

const editarEquipo = z
  .object({
    nombre: z.string().trim().min(1).max(120),
    estado: z.enum(['ACTIVO', 'INACTIVO']),
  })
  .partial()
  .strict();

const agregarMiembro = z.object({ usuarioId: uuid }).strict();

const sustituirJefe = z.object({ nuevoJefeUsuarioId: uuid }).strict();

const rendimientos = z
  .object({
    rendimientos: z
      .array(
        z
          .object({
            tipoAccion: z.enum(TipoAccionRendimiento),
            origenId: uuid,
            // Nunca negativo (fase-14-28 decisión 4): lo que se hace no debita.
            monedas: z.number().int().min(0),
            monedasBonoJefe: z.number().int().min(0).optional(),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

// ─────────────────────────────────────────────────────────────────────────────
// Dos chequeos EN TIEMPO DE COMPILACIÓN, y hacen falta los dos.
//
// La anotación `z.ZodType<Contrato>` sola no alcanza: por tipado estructural,
// un esquema al que le falta un campo OPCIONAL del contrato sigue siendo
// asignable. O sea que renombrar `siempreVisible` en activity no rompería
// nada acá, y la propuesta simplemente dejaría de poder configurarlo — un
// deterioro silencioso, que es peor que un build roto.
//
// `SinFaltantes` cierra ese agujero: falla si el contrato tiene una clave que
// el esquema no declara.
// ─────────────────────────────────────────────────────────────────────────────

/** Falla a compilar si `T` no es `never`, mostrando qué claves faltan. */
type Exhaustivo<T extends never> = T;

type ClavesNoCubiertas<TContrato, TEsquema> = Exclude<keyof TContrato, keyof TEsquema>;

type _CrearActividadCompleto = Exhaustivo<
  ClavesNoCubiertas<CrearActividadRequest, z.infer<typeof crearActividad>>
>;

type _EditarActividadCompleto = Exhaustivo<
  ClavesNoCubiertas<EditarActividadRequest, z.infer<typeof editarActividad>>
>;

type _RendimientosCompleto = Exhaustivo<
  ClavesNoCubiertas<ConfigurarRendimientosAccionesRequest, z.infer<typeof rendimientos>>
>;

type _CrearConductaCompleto = Exhaustivo<
  ClavesNoCubiertas<CrearConductaRequest, z.infer<typeof crearConducta>>
>;

type _EditarConductaCompleto = Exhaustivo<
  ClavesNoCubiertas<EditarConductaRequest, z.infer<typeof editarConducta>>
>;

type _ConfigurarTurnoCompleto = Exhaustivo<
  ClavesNoCubiertas<ConfigurarTurnoRequest, z.infer<typeof configurarTurno>>
>;

type _CrearProductoCompleto = Exhaustivo<
  ClavesNoCubiertas<CrearProductoRequest, z.infer<typeof crearProducto>>
>;

type _EditarProductoCompleto = Exhaustivo<
  ClavesNoCubiertas<EditarProductoRequest, z.infer<typeof editarProducto>>
>;

type _CrearRecompensaCompleto = Exhaustivo<
  ClavesNoCubiertas<CrearRecompensaRequest, z.infer<typeof crearRecompensa>>
>;

type _EditarRecompensaCompleto = Exhaustivo<
  ClavesNoCubiertas<EditarRecompensaRequest, z.infer<typeof editarRecompensa>>
>;

type _CrearEtiquetaCompleto = Exhaustivo<
  ClavesNoCubiertas<CrearEtiquetaRequest, z.infer<typeof crearEtiqueta>>
>;

type _AsignarEtiquetasCompleto = Exhaustivo<
  ClavesNoCubiertas<AsignarEtiquetasRequest, z.infer<typeof asignarEtiquetas>>
>;

type _GuardarBolsaCompleto = Exhaustivo<
  ClavesNoCubiertas<GuardarBolsaRequest, z.infer<typeof guardarBolsa>>
>;

type _CrearUmbralCompleto = Exhaustivo<
  ClavesNoCubiertas<CrearUmbralRequest, z.infer<typeof crearUmbral>>
>;

type _EditarUmbralCompleto = Exhaustivo<
  ClavesNoCubiertas<EditarUmbralRequest, z.infer<typeof editarUmbral>>
>;

type _ConfiguracionScoringCompleta = Exhaustivo<
  ClavesNoCubiertas<GuardarConfiguracionScoringRequest, z.infer<typeof configuracionScoring>>
>;

type _CrearRolCompleto = Exhaustivo<
  ClavesNoCubiertas<CrearRolGrupoRequest, z.infer<typeof crearRol>>
>;

type _EditarRolCompleto = Exhaustivo<
  ClavesNoCubiertas<ActualizarRolGrupoRequest, z.infer<typeof editarRol>>
>;

type _AsignarRolCompleto = Exhaustivo<
  ClavesNoCubiertas<AsignarRolGrupoRequest, z.infer<typeof asignarRol>>
>;

type _CrearEquipoCompleto = Exhaustivo<
  ClavesNoCubiertas<CrearEquipoRequest, z.infer<typeof crearEquipo>>
>;

type _EditarEquipoCompleto = Exhaustivo<
  ClavesNoCubiertas<EditarEquipoRequest, z.infer<typeof editarEquipo>>
>;

type _AgregarMiembroCompleto = Exhaustivo<
  ClavesNoCubiertas<AgregarMiembroEquipoRequest, z.infer<typeof agregarMiembro>>
>;

type _SustituirJefeCompleto = Exhaustivo<
  ClavesNoCubiertas<SustituirJefeEquipoRequest, z.infer<typeof sustituirJefe>>
>;

export const esquemaCrearActividad: z.ZodType<CrearActividadRequest> = crearActividad;

export const esquemaEditarActividad: z.ZodType<EditarActividadRequest> = editarActividad;

export const esquemaCrearConducta: z.ZodType<CrearConductaRequest> = crearConducta;

export const esquemaEditarConducta: z.ZodType<EditarConductaRequest> = editarConducta;

export const esquemaConfigurarTurno: z.ZodType<ConfigurarTurnoRequest> = configurarTurno;

export const esquemaCrearProducto: z.ZodType<CrearProductoRequest> = crearProducto;

/**
 * Cubría solo el precio hasta el fase-14-30 (decisión 7). El subconjunto era
 * arbitrario —el mismo PATCH acepta el resto— y ahora está entero, con su
 * chequeo `Exhaustivo` como todos los demás.
 */
export const esquemaEditarProducto: z.ZodType<EditarProductoRequest> = editarProducto;

export const esquemaCrearRecompensa: z.ZodType<CrearRecompensaRequest> = crearRecompensa;

export const esquemaEditarRecompensa: z.ZodType<EditarRecompensaRequest> = editarRecompensa;

export const esquemaCrearEtiqueta: z.ZodType<CrearEtiquetaRequest> = crearEtiqueta;

export const esquemaAsignarEtiquetas: z.ZodType<AsignarEtiquetasRequest> = asignarEtiquetas;

export const esquemaGuardarBolsa: z.ZodType<GuardarBolsaRequest> = guardarBolsa;

export const esquemaCrearUmbral: z.ZodType<CrearUmbralRequest> = crearUmbral;

export const esquemaEditarUmbral: z.ZodType<EditarUmbralRequest> = editarUmbral;

export const esquemaConfiguracionScoring: z.ZodType<GuardarConfiguracionScoringRequest> =
  configuracionScoring;

export const esquemaCrearRol: z.ZodType<CrearRolGrupoRequest> = crearRol;

export const esquemaEditarRol: z.ZodType<ActualizarRolGrupoRequest> = editarRol;

export const esquemaAsignarRol: z.ZodType<AsignarRolGrupoRequest> = asignarRol;

export const esquemaCrearEquipo: z.ZodType<CrearEquipoRequest> = crearEquipo;

export const esquemaEditarEquipo: z.ZodType<EditarEquipoRequest> = editarEquipo;

export const esquemaAgregarMiembro: z.ZodType<AgregarMiembroEquipoRequest> = agregarMiembro;

export const esquemaSustituirJefe: z.ZodType<SustituirJefeEquipoRequest> = sustituirJefe;

export const esquemaRendimientos: z.ZodType<ConfigurarRendimientosAccionesRequest> =
  rendimientos;

/**
 * Los dos únicos esquemas del archivo **sin `z.ZodType<Contrato>`**, y no es un
 * descuido (fase-14-31).
 *
 * El resto está tipado contra el request del endpoint destino porque tiene un
 * body que ese endpoint valida. Estos dos no tienen body: un `DELETE` de
 * catálogo no manda nada, y el motivo de quitar una completada viaja como query
 * param (fase-14-12: un `DELETE` con cuerpo pasa por intermediarios que tienen
 * derecho a descartarlo). O sea que **no hay contrato contra el cual tipar** —
 * lo que se valida acá es la forma de lo que dijo el modelo, no la de un
 * request. Si algún día uno de estos endpoints acepta body, este comentario se
 * borra y el esquema se tipa como todos los demás.
 */
export const esquemaArchivar = z.object({
  tipo: z.enum(['ACTIVIDAD', 'CONDUCTA', 'RECOMPENSA', 'PRODUCTO', 'BOLSA', 'ETIQUETA', 'TURNO']),
  id: z.string().uuid(),
});

export const esquemaQuitarMarca = z.object({
  registroId: z.string().uuid(),
  tipo: z.enum(['COMPLETADA', 'NO_HIZO', 'REPETICION_QUITADA', 'CONDUCTA']),
  motivo: z.string().min(1).max(200).optional(),
});

/**
 * Un error de validación con la ruta del campo, para devolvérselo al modelo.
 *
 * El formato importa: `rendimientos.0.monedas: expected number` le dice al
 * modelo exactamente qué arreglar. Un «datos inválidos» genérico lo deja
 * adivinando, y adivinar cuesta otra vuelta del loop, o sea dinero.
 */
export function explicarError(error: z.ZodError): string {
  return error.issues
    .map((incidencia) => {
      const ruta = incidencia.path.join('.');

      return ruta ? `${ruta}: ${incidencia.message}` : incidencia.message;
    })
    .join(' · ');
}
