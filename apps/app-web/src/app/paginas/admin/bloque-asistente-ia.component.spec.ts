import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AVISO_IA_VERSION_VIGENTE,
  type CambiarConfiguracionIaRequest,
  type ConfiguracionIaDto,
} from '@dorado/shared-types';

import { ToastService } from '../../componentes/toast.service';
import { IaApiService } from '../../core/api/ia-api.service';
import { BloqueAsistenteIaComponent } from './bloque-asistente-ia.component';

/**
 * El aviso que se vuelve a pedir (fase-14-31 decisión 11), del lado de la
 * pantalla.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTOS TESTS CUIDAN:
 *
 * el backend ya apaga el asistente solo —`puedeUsarse` en false y un 403 con
 * `AVISO_DESACTUALIZADO`—, así que lo que puede salir mal acá no es que se
 * use sin consentimiento: es que el dueño **no entienda qué le están pidiendo**.
 * Dos confusiones concretas y las dos evitables:
 *
 * 1. Decirle «Prendido» cuando el asistente no anda. El switch está en sí y el
 *    estado real es apagado; mostrar el switch sería mentirle sobre lo único
 *    que vino a mirar.
 * 2. Decirle que nunca aceptó nada cuando sí aceptó, hace meses, otra lista de
 *    datos. Es la diferencia entre pedirle que lea un aviso nuevo y acusarlo de
 *    no haber hecho algo que hizo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function configuracion(parcial: Partial<ConfiguracionIaDto> = {}): ConfiguracionIaDto {
  return {
    disponibleEnPlan: true,
    habilitada: true,
    avisoAceptado: true,
    aceptoAvisoEn: '2026-08-04T12:00:00.000Z',
    avisoVersionAceptada: AVISO_IA_VERSION_VIGENTE,
    avisoVersionVigente: AVISO_IA_VERSION_VIGENTE,
    cuotaTokensMensuales: 2_000_000,
    tokensConsumidosMes: 1000,
    puedeUsarse: true,
    ...parcial,
  };
}

/** La fila real de quien aceptó en el #29: con fecha, versión 1, y hoy rige la 2. */
function consentimientoViejo(): ConfiguracionIaDto {
  return configuracion({
    habilitada: true,
    avisoAceptado: false,
    avisoVersionAceptada: 1,
    puedeUsarse: false,
  });
}

const estado = signal<ConfiguracionIaDto | null>(null);

describe('BloqueAsistenteIaComponent', () => {
  let fixture: ComponentFixture<BloqueAsistenteIaComponent>;
  let cambiar: ReturnType<typeof vi.fn>;

  const texto = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';

  const botones = (): HTMLButtonElement[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));

  const boton = (etiqueta: string): HTMLButtonElement | undefined =>
    botones().find((candidato) => (candidato.textContent ?? '').includes(etiqueta));

  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    estado.set(configuracion());
    cambiar = vi.fn(() => of(configuracion()));

    await TestBed.configureTestingModule({
      imports: [BloqueAsistenteIaComponent],
      providers: [
        {
          provide: IaApiService,
          useValue: {
            configuracion: estado.asReadonly(),
            cargarConfiguracion: vi.fn(async () => estado()),
            cambiarConfiguracion: cambiar,
          },
        },
        { provide: ToastService, useValue: { exito: vi.fn(), error: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BloqueAsistenteIaComponent);
    await render();
  });

  it('con el aviso vigente aceptado dice Prendido y no muestra ningún aviso', async () => {
    expect(texto()).toContain('Prendido');
    expect(texto()).not.toContain('El aviso cambió');
    expect(boton('Acepto el aviso nuevo')).toBeUndefined();
  });

  it('con el consentimiento viejo NO dice Prendido, aunque el switch lo esté', async () => {
    estado.set(consentimientoViejo());
    await render();

    expect(texto()).toContain('Apagado hasta que aceptes el aviso');
    expect(texto()).not.toContain('>Prendido<');
  });

  it('distingue «el aviso cambió» de «nunca lo aceptaste»', async () => {
    estado.set(consentimientoViejo());
    await render();

    expect(texto()).toContain('El aviso cambió');
    // Y conserva la fecha de la aceptación que sí dio, con las dos versiones:
    // acusarlo de no haber aceptado nada sería falso.
    expect(texto()).toContain('Aviso aceptado el');
    expect(texto()).toContain('versión 1');

    estado.set(
      configuracion({
        habilitada: false,
        avisoAceptado: false,
        avisoVersionAceptada: null,
        aceptoAvisoEn: null,
        puedeUsarse: false,
      })
    );
    await render();

    expect(texto()).toContain('Antes de prenderlo');
    expect(texto()).not.toContain('El aviso cambió');
  });

  it('el aviso nombra las dos clases de dato que agregó este ítem', async () => {
    estado.set(consentimientoViejo());
    await render();

    // Son la razón entera por la que se vuelve a pedir el consentimiento: si el
    // texto no las dice, el aviso nuevo no se distingue del viejo.
    expect(texto()).toContain('saldo en monedas');
    expect(texto()).toContain('Qué hizo y qué no hizo');
  });

  it('aceptar el aviso nuevo no toca el switch: manda habilitada true y aceptaAviso true', async () => {
    estado.set(consentimientoViejo());
    await render();

    boton('Acepto el aviso nuevo')?.click();
    await render();

    // `habilitada: true` y no `!estabaPrendido`: el dueño no está
    // reconsiderando la feature, está firmando una lista de datos más larga.
    expect(cambiar).toHaveBeenCalledWith({
      habilitada: true,
      aceptaAviso: true,
    } satisfies CambiarConfiguracionIaRequest);
  });

  it('el botón de apagar sigue estando mientras se acepta el aviso', async () => {
    estado.set(consentimientoViejo());
    await render();

    // Aceptar no puede ser la única salida: el dueño que lee el aviso nuevo y
    // NO quiere que esos datos salgan tiene que poder apagarlo ahí mismo.
    expect(boton('Apagar')).toBeDefined();
  });
});
