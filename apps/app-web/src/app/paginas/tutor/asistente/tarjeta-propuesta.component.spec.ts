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
});
