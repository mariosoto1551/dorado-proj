import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfirmDialogComponent } from './confirm-dialog.component';

@Component({
  imports: [ConfirmDialogComponent],
  template: `
    <ui-confirm-dialog
      [abierto]="abierto()"
      titulo="Marcar como no hecha"
      [requiereMotivo]="requiereMotivo()"
      [pideMotivo]="pideMotivo()"
      (confirmar)="confirmado.set($event)"
      (cancelar)="cancelado.set(true)"
    />
  `,
})
class AnfitrionConfirm {
  readonly abierto = signal(true);

  readonly requiereMotivo = signal(false);

  readonly pideMotivo = signal(false);

  /** null = todavía no confirmó. El string vacío es un valor válido. */
  readonly confirmado = signal<string | null>(null);

  readonly cancelado = signal(false);
}

/**
 * El componente existe desde la Fase 10 y no tenía spec. Se le escribe una al
 * sumarle `pideMotivo` en la fase-14-23 T4, porque la distinción con
 * `requiereMotivo` —uno muestra el textarea, el otro además lo exige— es
 * exactamente la clase de matiz que se pierde sin un test que lo fije.
 */
describe('ConfirmDialogComponent', () => {
  let fixture: ComponentFixture<AnfitrionConfirm>;
  let anfitrion: AnfitrionConfirm;

  /** shared-ui corre con zone.js, no zoneless: hay que pedir el render a mano. */
  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const textarea = (): HTMLTextAreaElement | null =>
    fixture.nativeElement.querySelector('textarea');

  const botonConfirmar = (): HTMLButtonElement =>
    [...fixture.nativeElement.querySelectorAll('button')].find(
      (b: HTMLButtonElement) => b.textContent?.trim() === 'Confirmar'
    );

  const escribirMotivo = async (texto: string): Promise<void> => {
    const campo = textarea();

    if (!campo) {
      throw new Error('el textarea no está en pantalla');
    }

    campo.value = texto;
    campo.dispatchEvent(new Event('input'));
    await render();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AnfitrionConfirm] }).compileComponents();

    fixture = TestBed.createComponent(AnfitrionConfirm);
    anfitrion = fixture.componentInstance;
    await render();
  });

  it('cerrado no renderiza nada: es controlado por el padre', async () => {
    anfitrion.abierto.set(false);
    await render();

    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('sin motivo no muestra el textarea y confirma con cadena vacía', async () => {
    expect(textarea()).toBeNull();

    botonConfirmar().click();
    await render();

    expect(anfitrion.confirmado()).toBe('');
  });

  it('`requiereMotivo` muestra el textarea Y bloquea confirmar hasta que haya texto', async () => {
    anfitrion.requiereMotivo.set(true);
    await render();

    expect(textarea()).not.toBeNull();
    expect(botonConfirmar().disabled).toBe(true);

    // Espacios en blanco no alcanzan: el motivo es obligatorio de verdad.
    await escribirMotivo('   ');
    expect(botonConfirmar().disabled).toBe(true);

    await escribirMotivo('  Se desentendió del equipo  ');
    expect(botonConfirmar().disabled).toBe(false);

    botonConfirmar().click();
    await render();

    expect(anfitrion.confirmado()).toBe('Se desentendió del equipo');
  });

  /**
   * fase-14-23 T4: el motivo del tutor del #12 es OPCIONAL por diseño —el
   * integrante lo lee si está—. Exigirlo habría cambiado una regla de negocio
   * para acomodar al diálogo, en vez de al revés.
   */
  it('`pideMotivo` muestra el textarea pero NO lo exige', async () => {
    anfitrion.pideMotivo.set(true);
    await render();

    expect(textarea()).not.toBeNull();
    expect(botonConfirmar().disabled).toBe(false);

    botonConfirmar().click();
    await render();

    expect(anfitrion.confirmado()).toBe('');
  });

  it('reabrirlo limpia el motivo anterior: no se manda pegado a la marca siguiente', async () => {
    anfitrion.pideMotivo.set(true);
    await render();
    await escribirMotivo('Se levantó tarde');

    anfitrion.abierto.set(false);
    await render();
    anfitrion.abierto.set(true);
    await render();

    expect(textarea()?.value).toBe('');
  });

  it('declara `role="dialog"` y `aria-modal`, y el fondo cancela', async () => {
    const dialogo: HTMLElement = fixture.nativeElement.querySelector('[role="dialog"]');

    expect(dialogo.getAttribute('aria-modal')).toBe('true');

    fixture.nativeElement.querySelector('button[aria-label="Cerrar"]').click();
    await render();

    expect(anfitrion.cancelado()).toBe(true);
  });
});
