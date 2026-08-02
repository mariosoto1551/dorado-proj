import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModalComponent } from './modal.component';

/**
 * Anfitrión de prueba: el modal es controlado (el padre maneja `abierto`), así
 * que probarlo aislado no ejercita lo que importa.
 */
@Component({
  imports: [ModalComponent],
  template: `
    <ui-modal
      [abierto]="abierto()"
      [titulo]="titulo()"
      [ancho]="ancho()"
      (cerrar)="cerrado.set(cerrado() + 1)"
    >
      <form>
        <input class="campo" name="nombre" />
      </form>
    </ui-modal>
  `,
})
class AnfitrionModal {
  readonly abierto = signal(false);

  readonly titulo = signal('Nuevo rol');

  readonly ancho = signal<'sm' | 'md' | 'lg'>('md');

  readonly cerrado = signal(0);
}

describe('ModalComponent', () => {
  let fixture: ComponentFixture<AnfitrionModal>;
  let anfitrion: AnfitrionModal;

  const panel = (): HTMLElement | null =>
    fixture.nativeElement.querySelector('[role="dialog"]');

  /** shared-ui corre sus tests con zone.js, no zoneless: el fixture no
   * auto-detecta y hay que pedir el render a mano tras cada cambio. */
  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AnfitrionModal] }).compileComponents();

    fixture = TestBed.createComponent(AnfitrionModal);
    anfitrion = fixture.componentInstance;
    await render();
  });

  it('no renderiza nada mientras está cerrado', () => {
    expect(panel()).toBeNull();
  });

  it('al abrir declara role="dialog" y aria-modal, que ninguna de las 15 copias a mano tenía', async () => {
    anfitrion.abierto.set(true);
    await render();

    expect(panel()?.getAttribute('aria-modal')).toBe('true');
  });

  it('apunta aria-labelledby al id del título', async () => {
    anfitrion.abierto.set(true);
    await render();

    const id = panel()?.getAttribute('aria-labelledby');
    const titulo = fixture.nativeElement.querySelector(`#${id}`);

    expect(titulo?.textContent?.trim()).toBe('Nuevo rol');
  });

  it('Escape emite (cerrar) — la página decide qué hacer, el modal no se cierra solo', async () => {
    anfitrion.abierto.set(true);
    await render();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await render();

    expect(anfitrion.cerrado()).toBe(1);
    // Sigue abierto: quien controla `abierto` es el padre.
    expect(panel()).not.toBeNull();
  });

  it('Escape con el modal cerrado no emite nada', async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await render();

    expect(anfitrion.cerrado()).toBe(0);
  });

  it('el click en el fondo emite (cerrar)', async () => {
    anfitrion.abierto.set(true);
    await render();

    const fondo: HTMLButtonElement | null = fixture.nativeElement.querySelector(
      'button[aria-label="Cerrar"]'
    );
    fondo?.click();
    await render();

    expect(anfitrion.cerrado()).toBe(1);
  });

  it('lleva el foco al primer campo al abrir', async () => {
    anfitrion.abierto.set(true);
    await render();
    await new Promise((r) => queueMicrotask(() => r(null)));

    expect(document.activeElement?.tagName).toBe('INPUT');
  });

  it('traduce el ancho a la clase correspondiente', async () => {
    anfitrion.abierto.set(true);
    await render();
    expect(panel()?.className).toContain('max-w-md');

    anfitrion.ancho.set('sm');
    await render();
    expect(panel()?.className).toContain('max-w-sm');

    anfitrion.ancho.set('lg');
    await render();
    expect(panel()?.className).toContain('max-w-2xl');
  });

  it('proyecta el formulario de la página adentro del panel (contrato de la T1)', async () => {
    anfitrion.abierto.set(true);
    await render();

    expect(panel()?.querySelector('form')).not.toBeNull();
  });
});
