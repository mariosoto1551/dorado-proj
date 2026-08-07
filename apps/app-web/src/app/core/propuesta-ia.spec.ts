import { describe, expect, it } from 'vitest';

import type {
  ActividadDto,
  ConductaDto,
  OperacionPropuestaIaDto,
  ProductoTiendaDto,
  PropuestaIaDto,
  RecompensaDto,
  RendimientoAccionDto,
  RolGrupoDto,
  TipoPropuestaIa,
  UmbralZonaDto,
  UsuarioDto,
} from '@dorado/shared-types';
import { esPropuestaDestructiva } from '@dorado/shared-types';

import { armarFilas, estaCerrada, horasHastaVencer } from './propuesta-ia';

function propuesta(
  tipo: TipoPropuestaIa,
  operaciones: Array<Partial<OperacionPropuestaIaDto>>
): PropuestaIaDto {
  return {
    id: 'prop-1',
    conversacionId: 'conv-1',
    grupoId: 'grupo-1',
    tipo,
    estado: 'BORRADOR',
    venceEn: '2026-08-05T12:00:00.000Z',
    aplicadaEn: null,
    resultado: null,
    aviso: null,
    createdAt: '2026-08-04T12:00:00.000Z',
    operaciones: operaciones.map((operacion, i) => ({
      opId: `op-${i + 1}`,
      metodo: 'POST',
      ruta: '/activity/grupos/grupo-1/actividades',
      body: {},
      etiqueta: '',
      ...operacion,
    })),
  };
}

function actividad(parcial: Partial<ActividadDto>): ActividadDto {
  return {
    id: 'act-1',
    nombre: 'Tender la cama',
    valorPuntos: 5,
    diasSemana: [],
    rolesPermitidos: [],
    ...parcial,
  } as ActividadDto;
}

describe('armarFilas', () => {
  describe('alta de actividades', () => {
    it('pone el nombre en el título y no lo repite abajo', () => {
      const filas = armarFilas(
        propuesta('CREAR_ACTIVIDADES', [
          { body: { nombre: 'Lavar los platos', valorPuntos: 8, tipoPuntaje: 'OPCIONAL' } },
        ])
      );

      expect(filas[0].titulo).toBe('Crear «Lavar los platos»');
      expect(filas[0].cambios.map((c) => c.campo)).toEqual(['Tipo', 'Puntos']);
    });

    it('el orden de los campos no depende del orden en que los emitió el modelo', () => {
      const alDerecho = armarFilas(
        propuesta('CREAR_ACTIVIDADES', [
          { body: { nombre: 'X', tipoPuntaje: 'OPCIONAL', valorPuntos: 8, alcance: 'EQUIPO' } },
        ])
      );
      const alReves = armarFilas(
        propuesta('CREAR_ACTIVIDADES', [
          { body: { alcance: 'EQUIPO', valorPuntos: 8, tipoPuntaje: 'OPCIONAL', nombre: 'X' } },
        ])
      );

      // Dos propuestas del mismo tipo tienen que leerse igual: el orden de las
      // claves que emite el modelo es cosa suya y cambia entre respuestas.
      expect(alReves[0].cambios).toEqual(alDerecho[0].cambios);
      expect(alDerecho[0].cambios.map((c) => c.campo)).toEqual(['Tipo', 'Puntos', 'Alcance']);
    });

    it('un alta no tiene valor anterior', () => {
      const filas = armarFilas(
        propuesta('CREAR_ACTIVIDADES', [{ body: { nombre: 'X', valorPuntos: 8 } }])
      );

      expect(filas[0].cambios[0].antes).toBeNull();
    });

    it('traduce los enums y los días a castellano', () => {
      const filas = armarFilas(
        propuesta('CREAR_ACTIVIDADES', [
          {
            body: {
              nombre: 'X',
              tipoPuntaje: 'OBLIGATORIA',
              tipoLimiteTiempo: 'DEADLINE',
              comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
              diasSemana: [1, 2, 3, 4, 5],
              siempreVisible: true,
            },
          },
        ])
      );
      const porCampo = new Map(filas[0].cambios.map((c) => [c.campo, c.despues]));

      expect(porCampo.get('Tipo')).toBe('Obligatoria');
      expect(porCampo.get('Límite de tiempo')).toBe('Con hora tope');
      expect(porCampo.get('Al cerrar la sesión')).toBe('Hay que confirmarla');
      expect(porCampo.get('Días')).toBe('de lunes a viernes');
      expect(porCampo.get('Siempre visible')).toBe('Sí');
    });

    it('un campo en null se lee como «—» y no como «null»', () => {
      const filas = armarFilas(
        propuesta('CREAR_ACTIVIDADES', [{ body: { nombre: 'X', deadlineHora: null } }])
      );

      expect(filas[0].cambios[0].despues).toBe('—');
    });
  });

  describe('edición de actividades', () => {
    const contexto = {
      actividades: [actividad({ id: 'act-1', nombre: 'Tender la cama', valorPuntos: 5 })],
    };

    it('muestra el valor viejo y el nuevo', () => {
      const filas = armarFilas(
        propuesta('EDITAR_ACTIVIDADES', [
          { metodo: 'PATCH', ruta: '/activity/actividades/act-1', body: { valorPuntos: 12 } },
        ]),
        contexto
      );

      expect(filas[0].titulo).toBe('Editar «Tender la cama»');
      expect(filas[0].cambios).toEqual([{ campo: 'Puntos', antes: '5', despues: '12' }]);
    });

    /**
     * El filtro que hace usable la tarjeta. El modelo **no puede omitir una
     * propiedad declarada** (lo aprendió la tanda 5), así que una edición que
     * solo sube los puntos igual llega con veinte campos. Sin este filtro, el
     * único campo que cambia queda escondido entre diecinueve que no.
     */
    it('saltea los campos que llegan con el valor que ya tenían', () => {
      const filas = armarFilas(
        propuesta('EDITAR_ACTIVIDADES', [
          {
            metodo: 'PATCH',
            ruta: '/activity/actividades/act-1',
            body: { nombre: 'Tender la cama', valorPuntos: 12, diasSemana: [] },
          },
        ]),
        contexto
      );

      expect(filas[0].cambios).toHaveLength(1);
      expect(filas[0].cambios[0].campo).toBe('Puntos');
    });

    it('sin contexto se dibuja igual, pero sin inventar un valor anterior', () => {
      const filas = armarFilas(
        propuesta('EDITAR_ACTIVIDADES', [
          { metodo: 'PATCH', ruta: '/activity/actividades/act-1', body: { valorPuntos: 12 } },
        ])
      );

      expect(filas[0].titulo).toBe('Editar «una actividad»');
      expect(filas[0].cambios[0].antes).toBeNull();
    });

    it('traduce ids de roles a nombres', () => {
      const filas = armarFilas(
        propuesta('EDITAR_ACTIVIDADES', [
          {
            metodo: 'PATCH',
            ruta: '/activity/actividades/act-1',
            body: { rolesPermitidos: ['rol-1', 'rol-2'] },
          },
        ]),
        { ...contexto, roles: [{ id: 'rol-1', nombre: 'Cocina' }] as RolGrupoDto[] }
      );

      // El id que no está en el mapa se muestra recortado en vez de
      // ocultarse: algo ilegible es una señal de que hay que mirar; ocultarlo
      // haría que la tarjeta mienta por omisión.
      expect(filas[0].cambios[0].despues).toBe('Cocina, rol-2…');
    });

    it('una lista vacía se lee «todos», que es lo que significa', () => {
      const filas = armarFilas(
        propuesta('EDITAR_ACTIVIDADES', [
          {
            metodo: 'PATCH',
            ruta: '/activity/actividades/act-1',
            body: { rolesPermitidos: [] },
          },
        ]),
        { actividades: [actividad({ id: 'act-1', rolesPermitidos: ['rol-1'] })] }
      );

      expect(filas[0].cambios[0]).toEqual({ campo: 'Roles', antes: 'rol-1…', despues: 'todos' });
    });
  });

  it('precio de tienda: nombre del producto y monedas viejas contra nuevas', () => {
    const producto = { id: 'prod-1', nombre: 'Una hora de tele', precio: 40 } as ProductoTiendaDto;
    const filas = armarFilas(
      propuesta('PRECIOS_TIENDA', [
        { metodo: 'PATCH', ruta: '/rewards/productos/prod-1', body: { precio: 60 } },
      ]),
      { productos: [producto] }
    );

    expect(filas[0].titulo).toBe('Una hora de tele');
    expect(filas[0].cambios).toEqual([{ campo: 'Precio', antes: '40 🪙', despues: '60 🪙' }]);
  });

  describe('familia catálogo (fase-14-30 tanda 4)', () => {
    it('conducta editada: dice el «antes» y saltea lo que no cambia', () => {
      const gritar = { id: 'con-1', nombre: 'Gritar', tipo: 'MALA', valorPuntos: 5 } as ConductaDto;
      const filas = armarFilas(
        propuesta('EDITAR_CONDUCTAS', [
          {
            metodo: 'PATCH',
            ruta: '/activity/conductas/con-1',
            body: { tipo: 'MALA', valorPuntos: 8 },
          },
        ]),
        { conductas: [gritar] }
      );

      expect(filas[0].titulo).toBe('Editar «Gritar»');
      expect(filas[0].cambios).toEqual([{ campo: 'Puntos', antes: '5', despues: '8' }]);
    });

    /**
     * El repetido es el punto: aparecer dos veces en la secuencia es cómo se le
     * dan más turnos a alguien (fase-14-21). Una tarjeta que deduplicara
     * «para limpiar» le escondería al Tutor justo lo que tiene que aprobar.
     */
    it('turnos: numera la secuencia en orden y conserva los repetidos', () => {
      const filas = armarFilas(
        propuesta('TURNOS', [
          {
            metodo: 'PUT',
            ruta: '/activity/actividades/act-1/turno',
            body: {
              modo: 'ORDEN_FIJO',
              frecuencia: 'SESION',
              posiciones: [{ usuarioId: 'u-1' }, { usuarioId: 'u-2' }, { usuarioId: 'u-1' }],
            },
          },
        ]),
        {
          actividades: [actividad({ id: 'act-1', nombre: 'Poner la mesa' })],
          personas: [
            { id: 'u-1', nombre: 'Luciana' },
            { id: 'u-2', nombre: 'Alejandra' },
          ] as UsuarioDto[],
        }
      );

      expect(filas[0].titulo).toBe('Rotar «Poner la mesa»');
      expect(filas[0].cambios).toEqual([
        { campo: 'Orden', antes: null, despues: 'El que escribiste' },
        { campo: 'Cambia', antes: null, despues: 'Todos los días' },
        { campo: 'Turno 1', antes: null, despues: 'Luciana' },
        { campo: 'Turno 2', antes: null, despues: 'Alejandra' },
        { campo: 'Turno 3', antes: null, despues: 'Luciana' },
      ]);
    });
  });

  describe('familia economía (fase-14-30 tanda 5)', () => {
    /**
     * Una propuesta de tienda mezcla dos altas distintas en un solo array. Se
     * distinguen por la ruta, que es el dato que ya viaja — sin agregarle al
     * DTO un campo que diga lo que la ruta ya dice.
     */
    it('tienda: la bolsa y el producto se leen distinto según la ruta', () => {
      const filas = armarFilas(
        propuesta('PRODUCTOS_TIENDA', [
          {
            ruta: '/rewards/grupos/grupo-1/bolsas',
            body: { nombre: 'Sorpresas', recompensaIds: ['rec-1'] },
          },
          {
            ruta: '/rewards/grupos/grupo-1/productos',
            body: { nombre: 'Helado', precio: 30, fuente: 'ITEM', recompensaId: 'rec-1' },
          },
        ]),
        { recompensas: [{ id: 'rec-1', nombre: 'Una hora de tele' } as RecompensaDto] }
      );

      expect(filas[0].titulo).toBe('Crear bolsa «Sorpresas»');
      expect(filas[0].cambios).toEqual([
        { campo: 'Premios', antes: null, despues: 'Una hora de tele' },
      ]);
      expect(filas[1].titulo).toBe('Publicar «Helado»');
      expect(filas[1].cambios).toEqual([
        { campo: 'Precio', antes: null, despues: '30 🪙' },
        { campo: 'Entrega', antes: null, despues: 'Un premio concreto' },
        { campo: 'Premio', antes: null, despues: 'Una hora de tele' },
      ]);
    });

    /**
     * El PUT reemplaza la lista completa (fase-14-26), así que la tarjeta tiene
     * que mostrar las dos listas: si solo dijera «se le ponen estas», el Tutor
     * no vería que además se le sacan las otras.
     */
    it('etiquetas: la asignación muestra las que tenía contra las que le quedan', () => {
      const filas = armarFilas(
        propuesta('ETIQUETAS', [
          {
            metodo: 'PUT',
            ruta: '/rewards/recompensas/rec-1/etiquetas',
            body: { etiquetaIds: ['eti-2'] },
          },
        ]),
        {
          recompensas: [
            {
              id: 'rec-1',
              nombre: 'Una hora de tele',
              etiquetas: [{ id: 'eti-1', nombre: 'Pantallas' }],
            } as RecompensaDto,
          ],
          etiquetas: new Map([
            ['eti-1', 'Pantallas'],
            ['eti-2', 'Fin de semana'],
          ]),
        }
      );

      expect(filas[0].titulo).toBe('Etiquetas de «Una hora de tele»');
      expect(filas[0].cambios).toEqual([
        { campo: 'Etiquetas', antes: 'Pantallas', despues: 'Fin de semana' },
      ]);
    });

    it('etiquetas: una lista vacía dice «ninguna», que es lo que va a pasar', () => {
      const filas = armarFilas(
        propuesta('ETIQUETAS', [
          {
            metodo: 'PUT',
            ruta: '/rewards/recompensas/rec-1/etiquetas',
            body: { etiquetaIds: [] },
          },
        ]),
        {
          recompensas: [
            {
              id: 'rec-1',
              nombre: 'Una hora de tele',
              etiquetas: [{ id: 'eti-1', nombre: 'Pantallas' }],
            } as RecompensaDto,
          ],
          etiquetas: new Map([['eti-1', 'Pantallas']]),
        }
      );

      expect(filas[0].cambios[0]).toEqual({
        campo: 'Etiquetas',
        antes: 'Pantallas',
        despues: 'ninguna',
      });
    });
  });

  describe('la escala de zonas (fase-14-30 tanda 6)', () => {
    const ZONAS = [
      {
        id: 'zona-verde',
        nombreZona: 'Verde',
        orden: 3,
        puntosMin: 41,
        puntosMax: 60,
        colorHex: '#22C55E',
      },
      {
        id: 'zona-dorado',
        nombreZona: 'Dorado',
        orden: 4,
        puntosMin: 61,
        puntosMax: null,
        colorHex: '#EAB308',
      },
    ] as UmbralZonaDto[];

    it('el alta de una zona se lee sin repetir el nombre', () => {
      const filas = armarFilas(
        propuesta('UMBRALES_ZONA', [
          {
            metodo: 'POST',
            ruta: '/scoring/grupos/grupo-1/umbrales',
            body: {
              nombreZona: 'Platino',
              orden: 5,
              puntosMin: 81,
              puntosMax: null,
              colorHex: '#A78BFA',
            },
          },
        ]),
        { umbrales: ZONAS }
      );

      expect(filas[0].titulo).toBe('Crear zona «Platino»');

      const porCampo = new Map(filas[0].cambios.map((c) => [c.campo, c.despues]));

      expect(porCampo.get('Desde')).toBe('81');
      // «sin techo» y no «—»: en una zona, el null es la zona más alta, no un
      // campo vacío.
      expect(porCampo.get('Hasta')).toBe('sin techo');
    });

    it('la edición muestra solo el límite que se movió, con el valor viejo al lado', () => {
      const filas = armarFilas(
        propuesta('UMBRALES_ZONA', [
          {
            metodo: 'PATCH',
            ruta: '/scoring/umbrales/zona-dorado',
            // La zona viaja entera aunque cambie un solo campo: el diff es el
            // que se encarga de no mostrar los otros cuatro.
            body: {
              nombreZona: 'Dorado',
              orden: 4,
              puntosMin: 61,
              puntosMax: 80,
              colorHex: '#EAB308',
            },
          },
        ]),
        { umbrales: ZONAS }
      );

      expect(filas[0].titulo).toBe('Cambiar «Dorado»');
      expect(filas[0].cambios).toEqual([
        { campo: 'Hasta', antes: 'sin techo', despues: '80' },
      ]);
    });

    /**
     * fase-14-31 tanda 7. La única fila de esta familia que no es un diff: no
     * hay «después», hay una zona que deja de existir. Y es uno de los dos
     * únicos `DELETE` del monorepo que borra de verdad, así que la fila tiene
     * que decirlo — el rojo de la tarjeta no distingue archivar de borrar.
     */
    it('el borrado de una zona dice que no se archiva ni se deshace', () => {
      const filas = armarFilas(
        propuesta('UMBRALES_ZONA', [
          { metodo: 'DELETE', ruta: '/scoring/umbrales/zona-dorado', body: null },
        ]),
        { umbrales: ZONAS }
      );

      expect(filas[0].titulo).toBe('Borrar la zona «Dorado»');
      expect(filas[0].cambios[0].antes).toBe('de 61 puntos para arriba');
      expect(filas[0].cambios[0].despues).toContain('no se archiva ni se deshace');
    });

    it('una propuesta de umbrales con un borrado adentro es destructiva', () => {
      const conBorrado = propuesta('UMBRALES_ZONA', [
        {
          metodo: 'PATCH',
          ruta: '/scoring/umbrales/zona-verde',
          body: { nombreZona: 'Verde', orden: 3, puntosMin: 41, puntosMax: null, colorHex: '#22C55E' },
        },
        { metodo: 'DELETE', ruta: '/scoring/umbrales/zona-dorado', body: null },
      ]);
      const soloEdiciones = propuesta('UMBRALES_ZONA', [
        {
          metodo: 'PATCH',
          ruta: '/scoring/umbrales/zona-dorado',
          body: { nombreZona: 'Dorado', orden: 4, puntosMin: 61, puntosMax: 80, colorHex: '#EAB308' },
        },
      ]);

      // Criterio de aceptación 6: se pinta por su fila más peligrosa, no por su
      // tipo — la misma familia produce las dos cosas.
      expect(esPropuestaDestructiva(conBorrado.operaciones)).toBe(true);
      expect(esPropuestaDestructiva(soloEdiciones.operaciones)).toBe(false);
    });

    it('la base de puntos va en su propia fila y dice con cuántos se arrancaba', () => {
      const filas = armarFilas(
        propuesta('UMBRALES_ZONA', [
          {
            metodo: 'PUT',
            ruta: '/scoring/grupos/grupo-1/configuracion',
            body: { puntosIniciales: 0 },
          },
        ]),
        { umbrales: ZONAS, puntosIniciales: 100 }
      );

      expect(filas[0].titulo).toBe('Puntos con los que arranca cada sección');
      expect(filas[0].cambios).toEqual([
        { campo: 'Arranca con', antes: '100 puntos', despues: '0 puntos' },
      ]);
    });
  });

  describe('familia personas (fase-14-30 tanda 7)', () => {
    const GENTE = [
      { id: 'u-1', nombre: 'Luciana', rolGrupo: { id: 'rol-1', nombre: 'cocina' } },
      { id: 'u-2', nombre: 'Alejandra', rolGrupo: null },
    ] as UsuarioDto[];

    const ROLES = [
      { id: 'rol-1', nombre: 'cocina', colorHex: '#22C55E' },
      { id: 'rol-2', nombre: 'mascotas', colorHex: '#EAB308' },
    ] as RolGrupoDto[];

    it('el rol de una persona muestra el que tenía al lado del nuevo', () => {
      const filas = armarFilas(
        propuesta('ROLES_GRUPO', [
          {
            metodo: 'PUT',
            ruta: '/identity/grupos/grupo-1/usuarios/u-1/rol',
            body: { rolGrupoId: 'rol-2' },
          },
        ]),
        { personas: GENTE, roles: ROLES }
      );

      expect(filas[0].titulo).toBe('Rol de Luciana');
      expect(filas[0].cambios).toEqual([
        { campo: 'Rol', antes: 'cocina', despues: 'mascotas' },
      ]);
    });

    it('quitarle el rol a alguien se lee «sin rol», no «—»', () => {
      const filas = armarFilas(
        propuesta('ROLES_GRUPO', [
          {
            metodo: 'PUT',
            ruta: '/identity/grupos/grupo-1/usuarios/u-1/rol',
            body: { rolGrupoId: null },
          },
        ]),
        { personas: GENTE, roles: ROLES }
      );

      expect(filas[0].cambios).toEqual([
        { campo: 'Rol', antes: 'cocina', despues: 'sin rol' },
      ]);
    });

    it('el alta de un equipo traduce los ids a nombres', () => {
      const filas = armarFilas(
        propuesta('EQUIPOS', [
          {
            metodo: 'POST',
            ruta: '/identity/grupos/grupo-1/equipos',
            body: { nombre: 'Mascotas', jefeUsuarioId: 'u-1', miembrosIds: ['u-2'] },
          },
        ]),
        { personas: GENTE }
      );

      expect(filas[0].titulo).toBe('Crear equipo «Mascotas»');
      expect(filas[0].cambios).toEqual([
        { campo: 'Jefe', antes: null, despues: 'Luciana' },
        { campo: 'Integrantes', antes: null, despues: 'Alejandra' },
      ]);
    });

    it('sumar un integrante dice a quién y a qué equipo, en el título', () => {
      const filas = armarFilas(
        propuesta('EQUIPOS', [
          {
            metodo: 'POST',
            ruta: '/identity/equipos/eq-1/miembros',
            body: { usuarioId: 'u-2' },
          },
        ]),
        { personas: GENTE, equipos: new Map([['eq-1', 'Cocina']]) }
      );

      expect(filas[0].titulo).toBe('Sumar a Alejandra al equipo «Cocina»');
      expect(filas[0].cambios).toEqual([]);
    });

    it('el cambio de jefe nombra al equipo y a la persona', () => {
      const filas = armarFilas(
        propuesta('EQUIPOS', [
          {
            metodo: 'POST',
            ruta: '/identity/equipos/eq-1/jefe',
            body: { nuevoJefeUsuarioId: 'u-2' },
          },
        ]),
        { personas: GENTE, equipos: new Map([['eq-1', 'Cocina']]) }
      );

      expect(filas[0].titulo).toBe('Nuevo jefe del equipo «Cocina»');
      expect(filas[0].cambios).toEqual([
        { campo: 'Nuevo jefe', antes: null, despues: 'Alejandra' },
      ]);
    });
  });

  it('rendimientos: una sola operación se abre en una línea por acción', () => {
    const actuales = [
      { origenId: 'act-1', nombre: 'Tender la cama', monedas: 2 },
      { origenId: 'act-2', nombre: 'Lavar los platos', monedas: 3 },
    ] as RendimientoAccionDto[];
    const filas = armarFilas(
      propuesta('RENDIMIENTOS_MONEDAS', [
        {
          metodo: 'PUT',
          ruta: '/rewards/grupos/grupo-1/rendimientos-acciones',
          body: {
            rendimientos: [
              { origenId: 'act-1', monedas: 5 },
              { origenId: 'act-2', monedas: 3 },
            ],
          },
        },
      ]),
      { rendimientos: actuales }
    );

    // El PUT del #28 manda todo junto, así que la propuesta tiene UNA
    // operación aunque toque veinte acciones. Aprobar «actualizar 20 acciones»
    // sin ver cuáles sería aprobar a ciegas.
    expect(filas).toHaveLength(1);
    expect(filas[0].titulo).toBe('Lo que paga cada acción (2)');
    expect(filas[0].cambios).toEqual([
      { campo: 'Tender la cama', antes: '2 🪙', despues: '5 🪙' },
      { campo: 'Lavar los platos', antes: '3 🪙', despues: '3 🪙' },
    ]);
  });
});

describe('estado de la propuesta', () => {
  it('solo BORRADOR se puede aplicar', () => {
    expect(estaCerrada(propuesta('CREAR_ACTIVIDADES', []))).toBe(false);
    expect(estaCerrada({ ...propuesta('CREAR_ACTIVIDADES', []), estado: 'VENCIDA' })).toBe(true);
    expect(estaCerrada({ ...propuesta('CREAR_ACTIVIDADES', []), estado: 'APLICADA' })).toBe(true);
  });

  it('cuenta las horas que le quedan, sin bajar de cero', () => {
    const p = propuesta('CREAR_ACTIVIDADES', []);

    expect(horasHastaVencer(p, new Date('2026-08-05T02:30:00.000Z'))).toBe(9);
    expect(horasHastaVencer(p, new Date('2026-08-06T00:00:00.000Z'))).toBe(0);
  });
});
