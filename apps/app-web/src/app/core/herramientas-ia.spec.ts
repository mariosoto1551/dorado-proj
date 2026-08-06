import { describe, expect, it } from 'vitest';

import { describirHerramienta } from './herramientas-ia';

describe('describirHerramienta', () => {
  it('cambia de gerundio a pasado según el estado', () => {
    expect(describirHerramienta('listar_actividades', 'corriendo')).toBe(
      'leyendo las actividades del grupo'
    );
    expect(describirHerramienta('listar_actividades', 'ok')).toBe('leí las actividades del grupo');
  });

  it('distingue leer de proponer', () => {
    expect(describirHerramienta('proponer_editar_productos', 'corriendo')).toBe(
      'armando una propuesta de cambios en la tienda'
    );
  });

  it('un fallo se dice, no se disfraza de éxito', () => {
    expect(describirHerramienta('listar_recompensas', 'error')).toBe(
      'no pude leer las recompensas'
    );
  });

  it('una herramienta que este archivo no conoce sale con su nombre, nunca en blanco', () => {
    // El caso real: se agrega una herramienta al servicio y nadie toca este
    // archivo. Feo pero honesto es mejor que una línea vacía en el rastro.
    expect(describirHerramienta('listar_lo_que_sea', 'ok')).toBe('leí listar_lo_que_sea');
  });
});
