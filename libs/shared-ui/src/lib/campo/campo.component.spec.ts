import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CampoComponent } from './campo.component';

@Component({
  imports: [CampoComponent],
  template: `
    <ui-campo
      etiqueta="Nombre"
      [ayuda]="ayuda()"
      [error]="error()"
      [opcional]="opcional()"
    >
      <input class="campo" name="nombre" />
    </ui-campo>
  `,
})
class AnfitrionCampo {
  readonly ayuda = signal('Máximo 30 caracteres');

  readonly error = signal('');

  readonly opcional = signal(false);
}

describe('CampoComponent', () => {
  let fixture: ComponentFixture<AnfitrionCampo>;
  let anfitrion: AnfitrionCampo;

  /** shared-ui corre sus tests con zone.js, no zoneless: el fixture no
   * auto-detecta y hay que pedir el render a mano tras cada cambio. */
  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AnfitrionCampo] }).compileComponents();

    fixture = TestBed.createComponent(AnfitrionCampo);
    anfitrion = fixture.componentInstance;
    await render();
  });

  it('envuelve el control en un <label> real, así el click en la etiqueta enfoca el campo', () => {
    const etiqueta: HTMLLabelElement = fixture.nativeElement.querySelector('label');

    expect(etiqueta.textContent).toContain('Nombre');
    expect(etiqueta.querySelector('input')).not.toBeNull();
  });

  it('muestra la ayuda cuando no hay error', () => {
    expect(fixture.nativeElement.textContent).toContain('Máximo 30 caracteres');
  });

  it('el error tapa a la ayuda y se anuncia como alerta', async () => {
    anfitrion.error.set('El nombre ya existe en este grupo.');
    await render();

    const alerta = fixture.nativeElement.querySelector('[role="alert"]');

    expect(alerta?.textContent?.trim()).toBe('El nombre ya existe en este grupo.');
    expect(fixture.nativeElement.textContent).not.toContain('Máximo 30 caracteres');
  });

  it('marca "(opcional)" solo cuando se pide', async () => {
    expect(fixture.nativeElement.textContent).not.toContain('(opcional)');

    anfitrion.opcional.set(true);
    await render();

    expect(fixture.nativeElement.textContent).toContain('(opcional)');
  });
});
