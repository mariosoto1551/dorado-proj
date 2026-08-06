import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { PropuestaIaDto, ResultadoOperacionIa } from '@dorado/shared-types';

import type { ContextoPropuesta } from '../../../core/propuesta-ia';
import { TarjetaPropuestaComponent } from './tarjeta-propuesta.component';

function propuestaDe(parcial: Partial<PropuestaIaDto> = {}): PropuestaIaDto {
  return {
    id: 'prop-1',
    conversacionId: 'conv-1',
    grupoId: 'grupo-1',
    tipo: 'CREAR_ACTIVIDADES',
    estado: 'BORRADOR',
    // Bien en el futuro: el aviso de vencimiento no es lo que se prueba acá.
    venceEn: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString(),
    aplicadaEn: null,
    resultado: null,
    aviso: null,
    createdAt: new Date().toISOString(),
    operaciones: [
      {
        opId: 'op-1',
        metodo: 'POST',
        ruta: '/activity/grupos/grupo-1/actividades',
        body: { nombre: 'Tender la cama', valorPuntos: 5 },
        etiqueta: '',
      },
      {
        opId: 'op-2',
        metodo: 'POST',
        ruta: '/activity/grupos/grupo-1/actividades',
        body: { nombre: 'Lavar los platos', valorPuntos: 8 },
        etiqueta: '',
      },
    ],
    ...parcial,
  };
}

@Component({
  imports: [TarjetaPropuestaComponent],
  template: `
    <app-tarjeta-propuesta
      [propuesta]="propuesta()"
      [contexto]="contexto()"
      [resultados]="resultados()"
      (aplicar)="aplicado.set($event ?? 'todas')"
      (descartar)="descartado.set(descartado() + 1)"
    />
  `,
})
class Anfitrion {
  readonly propuesta = signal<PropuestaIaDto>(propuestaDe());

  readonly contexto = signal<ContextoPropuesta>({});

  readonly resultados = signal<readonly ResultadoOperacionIa[]>([]);

  readonly aplicado = signal<string[] | 'todas' | null>(null);

  readonly descartado = signal(0);
}

describe('TarjetaPropuestaComponent', () => {
  let fixture: ComponentFixture<Anfitrion>;
  let anfitrion: Anfitrion;

  const texto = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';

  const botonQueDice = (fragmento: string): HTMLButtonElement | undefined =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((boton) =>
      (boton.textContent ?? '').includes(fragmento)
    ) as HTMLButtonElement | undefined;

  /** El botón de confirmar del diálogo, acotado a él: los de la tarjeta dicen
   * cosas que empiezan igual («Aplicar todo») y matchearían primero. */
  const confirmarEnDialogo = (): void =>
    [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '[role="dialog"] button'
      ),
    ]
      .find((boton) => (boton.textContent ?? '').trim() === 'Aplicar')
      ?.click();

  const casillas = (): HTMLInputElement[] => [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]'
    ),
  ];

  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Anfitrion] }).compileComponents();
    fixture = TestBed.createComponent(Anfitrion);
    anfitrion = fixture.componentInstance;
    await render();
  });

  it('muestra los cambios legibles, sin nada de JSON crudo', async () => {
    // Si el Tutor no entiende lo que aprueba, la revisión humana es un botón y
    // no un control — que es la decisión 2 vaciada de contenido.
    expect(texto()).toContain('Crear «Tender la cama»');
    expect(texto()).toContain('Puntos');
    expect(texto()).not.toContain('valorPuntos');
    expect(texto()).not.toContain('{');
  });

  it('«Aplicar todo» pide confirmación antes de escribir', async () => {
    botonQueDice('Aplicar todo')?.click();
    await render();

    expect(anfitrion.aplicado()).toBeNull();
    expect(texto()).toContain('Esto sí se escribe');

    confirmarEnDialogo();
    await render();

    expect(anfitrion.aplicado()).toBe('todas');
  });

  it('«Descartar» NO pide confirmación', async () => {
    // Regla del #23 T4: se confirma lo que no tiene vuelta atrás. Descartar no
    // borra nada que exista en el grupo — la propuesta nunca tocó una base.
    botonQueDice('Descartar')?.click();
    await render();

    expect(anfitrion.descartado()).toBe(1);
  });

  it('arranca con todo tildado y destildar saca esa fila', async () => {
    expect(botonQueDice('Aplicar 2 seleccionadas')).toBeDefined();

    casillas()[0].click();
    await render();

    expect(botonQueDice('Aplicar 1 seleccionada')).toBeDefined();

    botonQueDice('Aplicar 1 seleccionada')?.click();
    await render();
    confirmarEnDialogo();
    await render();

    expect(anfitrion.aplicado()).toEqual(['op-2']);
  });

  it('sin nada tildado no se puede aplicar la selección', async () => {
    casillas().forEach((casilla) => casilla.click());
    await render();

    expect(botonQueDice('Aplicar 0 seleccionadas')?.disabled).toBe(true);
  });

  it('pinta el resultado por fila, con el motivo del fallo', async () => {
    anfitrion.resultados.set([
      { opId: 'op-1', ok: true, entidadId: 'act-1' },
      { opId: 'op-2', ok: false, error: 'El plan permite hasta 20 actividades' },
    ]);
    await render();

    expect(texto()).toContain('✓ Listo');
    expect(texto()).toContain('El plan permite hasta 20 actividades');
  });

  it('una propuesta vencida se lee pero no se aplica', async () => {
    anfitrion.propuesta.set(propuestaDe({ estado: 'VENCIDA' }));
    await render();

    expect(texto()).toContain('Vencida');
    expect(texto()).toContain('Crear «Tender la cama»');
    expect(botonQueDice('Aplicar todo')).toBeUndefined();
    expect(casillas()).toHaveLength(0);
  });

  it('una ya aplicada muestra su estado y su resultado guardado', async () => {
    anfitrion.propuesta.set(
      propuestaDe({
        estado: 'APLICADA_PARCIAL',
        resultado: [
          { opId: 'op-1', ok: true },
          { opId: 'op-2', ok: false, error: 'Ya existe una actividad con ese nombre' },
        ],
      })
    );
    await render();

    expect(texto()).toContain('Aplicada en parte');
    expect(texto()).toContain('Ya existe una actividad con ese nombre');
    expect(botonQueDice('Aplicar todo')).toBeUndefined();
  });

  it('con el catálogo a la vista muestra el valor viejo al lado del nuevo', async () => {
    anfitrion.propuesta.set(
      propuestaDe({
        tipo: 'EDITAR_ACTIVIDADES',
        operaciones: [
          {
            opId: 'op-1',
            metodo: 'PATCH',
            ruta: '/activity/actividades/act-1',
            body: { valorPuntos: 12 },
            etiqueta: '',
          },
        ],
      })
    );
    anfitrion.contexto.set({
      actividades: [{ id: 'act-1', nombre: 'Tender la cama', valorPuntos: 5 }] as never,
    });
    await render();

    expect(texto()).toContain('Editar «Tender la cama»');
    expect(texto()).toContain('5');
    expect(texto()).toContain('12');
  });

  /**
   * El aviso de la decisión 6 del fase-14-30: la escala es la única propuesta
   * cuyo efecto no se limita a lo que pase de acá en adelante, y el Tutor tiene
   * que leerlo ANTES de aprobar.
   */
  it('muestra el aviso de la propuesta cuando lo trae', async () => {
    anfitrion.propuesta.set(
      propuestaDe({
        tipo: 'UMBRALES_ZONA',
        aviso: 'Esto cambia el pasado: 2 de 4 participantes cambian de zona.',
      })
    );
    await render();

    expect(texto()).toContain('La escala de zonas');
    expect(texto()).toContain('2 de 4 participantes cambian de zona');
  });

  it('sin aviso no dibuja el cartel', async () => {
    expect(texto()).not.toContain('cambia el pasado');
  });

  /**
   * CRITERIO DE ACEPTACIÓN 5 del fase-14-31 (decisión 2): **no existe camino
   * de un clic que borre algo.**
   *
   * La fricción va donde está el daño. En una tarjeta normal el default es
   * «esto está bien, dale» porque el peor caso es una actividad de más; en una
   * que borra, el mismo botón significaría «borrá las cinco» y no puede ser el
   * default de nada.
   */
  describe('propuesta destructiva (fase-14-31)', () => {
    const archivar = (): PropuestaIaDto =>
      propuestaDe({
        tipo: 'ARCHIVAR_CATALOGO',
        operaciones: [
          {
            opId: 'op-1',
            metodo: 'DELETE',
            ruta: '/activity/actividades/act-1',
            body: null,
            etiqueta: 'Archivar «Tender la cama» — sus 14 marcas quedan en el historial',
          },
          {
            opId: 'op-2',
            metodo: 'DELETE',
            ruta: '/activity/conductas/con-1',
            body: null,
            etiqueta: 'Archivar la conducta «Gritar»',
          },
        ],
      });

    it('no ofrece «Aplicar todo»', async () => {
      anfitrion.propuesta.set(archivar());
      await render();

      expect(botonQueDice('Aplicar todo')).toBeUndefined();
    });

    it('arranca con NADA tildado y el botón deshabilitado', async () => {
      anfitrion.propuesta.set(archivar());
      await render();

      expect(casillas().every((casilla) => !casilla.checked)).toBe(true);
      expect(botonQueDice('Aplicar 0 seleccionadas')?.disabled).toBe(true);
    });

    it('tildar una fila habilita el botón y aplica solo esa', async () => {
      anfitrion.propuesta.set(archivar());
      await render();

      casillas()[0].click();
      await render();

      botonQueDice('Aplicar 1 seleccionada')?.click();
      await render();

      // El diálogo dice «Borrar», no «Aplicar»: el verbo también es la señal.
      [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
          '[role="dialog"] button'
        ),
      ]
        .find((boton) => (boton.textContent ?? '').trim() === 'Borrar')
        ?.click();
      await render();

      expect(anfitrion.aplicado()).toEqual(['op-1']);
    });

    it('dice qué se pierde y qué no, que es de lo que depende la decisión', async () => {
      anfitrion.propuesta.set(archivar());
      await render();

      expect(texto()).toContain('Archivar del catálogo');
      expect(texto()).toContain('2 filas que borran');
      // La etiqueta del servidor es la que carga el detalle: acá no se inventa.
      expect(texto()).toContain('sus 14 marcas quedan en el historial');
    });

    /**
     * La regla se decide por las OPERACIONES y no por el tipo: una propuesta de
     * umbrales que solo edita rangos es una edición normal, y la misma con una
     * zona borrada adentro no lo es (decisión 8).
     */
    it('una propuesta de umbrales con un borrado adentro también es destructiva', async () => {
      anfitrion.propuesta.set(
        propuestaDe({
          tipo: 'UMBRALES_ZONA',
          operaciones: [
            {
              opId: 'op-1',
              metodo: 'PATCH',
              ruta: '/scoring/umbrales/z-1',
              body: { puntosMax: null },
              etiqueta: '«Verde»: 50–99 → 50 o más',
            },
            {
              opId: 'op-2',
              metodo: 'DELETE',
              ruta: '/scoring/umbrales/z-2',
              body: null,
              etiqueta: 'Borrar la zona «Dorado»',
            },
          ],
        })
      );
      await render();

      expect(botonQueDice('Aplicar todo')).toBeUndefined();
      expect(texto()).toContain('1 fila que borra');
    });
  });
});
