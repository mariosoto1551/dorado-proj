import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EstadoVacioComponent } from './estado-vacio.component';

@Component({
  imports: [EstadoVacioComponent],
  template: `
    <ui-estado-vacio [icono]="icono()" [titulo]="titulo()">
      Sin roles, todas las actividades las ven todos.
    </ui-estado-vacio>
  `,
})
class AnfitrionEstadoVacio {
  readonly icono = signal('🏷');

  readonly titulo = signal('Todavía no hay roles');
}

describe('EstadoVacioComponent', () => {
  let fixture: ComponentFixture<AnfitrionEstadoVacio>;
  let anfitrion: AnfitrionEstadoVacio;

  /** shared-ui corre sus tests con zone.js, no zoneless: el fixture no
   * auto-detecta y hay que pedir el render a mano tras cada cambio. */
  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AnfitrionEstadoVacio] }).compileComponents();

    fixture = TestBed.createComponent(AnfitrionEstadoVacio);
    anfitrion = fixture.componentInstance;
    await render();
  });

  it('muestra icono, título y el detalle proyectado', () => {
    const texto = fixture.nativeElement.textContent;

    expect(texto).toContain('🏷');
    expect(texto).toContain('Todavía no hay roles');
    expect(texto).toContain('Sin roles, todas las actividades las ven todos.');
  });

  it('esconde el icono de los lectores de pantalla: no aporta información', () => {
    const icono = fixture.nativeElement.querySelector('[aria-hidden="true"]');

    expect(icono?.textContent?.trim()).toBe('🏷');
  });

  it('sin icono ni título sigue mostrando el detalle — varias pantallas solo redactan una frase', async () => {
    anfitrion.icono.set('');
    anfitrion.titulo.set('');
    await render();

    expect(fixture.nativeElement.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Sin roles');
  });

  it('mantiene el recuadro punteado, que es lo que lo distingue de una tarjeta', () => {
    const caja: HTMLElement = fixture.nativeElement.querySelector('ui-estado-vacio > div');

    expect(caja.className).toContain('border-dashed');
  });
});
