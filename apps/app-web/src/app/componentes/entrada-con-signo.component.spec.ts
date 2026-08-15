import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { EntradaConSignoComponent } from './entrada-con-signo.component';

@Component({
  imports: [EntradaConSignoComponent],
  template: `<app-entrada-con-signo [(valor)]="valor" />`,
})
class Anfitrion {
  readonly valor = signal(0);
}

/**
 * fase-14-34. Lo que se prueba acá es una sola cosa dicha de cuatro formas: que
 * se pueda restar **sin tipear un menos**, porque el teclado numérico de varios
 * celulares no tiene esa tecla y el campo anterior era imposible de usar ahí.
 */
describe('EntradaConSignoComponent', () => {
  let fixture: ComponentFixture<Anfitrion>;
  let anfitrion: Anfitrion;

  const caja = (): HTMLInputElement =>
    (fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement;

  const boton = (texto: string): HTMLButtonElement =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((candidato) =>
      (candidato.textContent ?? '').includes(texto)
    ) as HTMLButtonElement;

  const tipear = async (valor: string): Promise<void> => {
    caja().value = valor;
    caja().dispatchEvent(new Event('input'));
    await render();
  };

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

  it('la caja NO es un type=number: ahí el teclado del celular decide si hay «−»', () => {
    expect(caja().getAttribute('type')).toBe('text');
    expect(caja().getAttribute('inputmode')).toBe('numeric');
  });

  it('con «Restar» elegido, tipear 10 da −10', async () => {
    boton('Restar').click();
    await tipear('10');

    expect(anfitrion.valor()).toBe(-10);
  });

  it('cambiar de signo con un número ya escrito lo da vuelta sin retipearlo', async () => {
    await tipear('25');
    expect(anfitrion.valor()).toBe(25);

    boton('Restar').click();
    await render();

    expect(anfitrion.valor()).toBe(-25);
    expect(caja().value).toBe('25');
  });

  it('lo que no es dígito no entra: un «-» tipeado no rompe el valor', async () => {
    await tipear('-5');

    expect(caja().value).toBe('5');
    expect(anfitrion.valor()).toBe(5);
  });

  it('se puede vaciar la caja para retipear (no se le devuelve un 0 encima)', async () => {
    await tipear('12');
    await tipear('');

    expect(caja().value).toBe('');
    expect(anfitrion.valor()).toBe(0);
  });

  it('el reset del formulario limpia la caja pero deja elegido el signo', async () => {
    boton('Restar').click();
    await tipear('7');

    // Lo que hace la pantalla después de guardar.
    anfitrion.valor.set(0);
    await render();

    expect(caja().value).toBe('');

    await tipear('3');

    expect(anfitrion.valor()).toBe(-3);
  });

  it('un valor negativo que viene de afuera se muestra con «Restar» elegido', async () => {
    anfitrion.valor.set(-40);
    await render();

    expect(caja().value).toBe('40');
    expect(boton('Restar').getAttribute('aria-pressed')).toBe('true');
    expect(boton('Sumar').getAttribute('aria-pressed')).toBe('false');
  });
});
