import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AVISO_IA_VERSION_VIGENTE, type ConfiguracionIaDto } from '@dorado/shared-types';

import { IaApiService } from '../core/api/ia-api.service';
import { EntradaAsistenteComponent } from './entrada-asistente.component';

function configuracion(puedeUsarse: boolean): ConfiguracionIaDto {
  return {
    disponibleEnPlan: puedeUsarse,
    habilitada: puedeUsarse,
    avisoAceptado: puedeUsarse,
    aceptoAvisoEn: puedeUsarse ? new Date().toISOString() : null,
    // fase-14-31 decisión 11: con el aviso viejo, `puedeUsarse` viene en false
    // desde el servidor y la entrada no se muestra — que es exactamente lo que
    // este componente ya hacía sin enterarse del campo nuevo.
    avisoVersionAceptada: puedeUsarse ? AVISO_IA_VERSION_VIGENTE : null,
    avisoVersionVigente: AVISO_IA_VERSION_VIGENTE,
    cuotaTokensMensuales: null,
    tokensConsumidosMes: 0,
    puedeUsarse,
  };
}

/** El cache de `IaApiService`, escrito a mano: acá no se prueba la llamada. */
const estado = signal<ConfiguracionIaDto | null>(null);

@Component({
  imports: [EntradaAsistenteComponent],
  template: `
    <app-entrada-asistente
      grupoId="grupo-1"
      [pregunta]="pregunta()"
      [variante]="variante()"
      titulo="Pedirle ayuda a la IA"
      detalle="Vos decidís qué se aplica."
    />
  `,
})
class Anfitrion {
  readonly pregunta = signal('Proponeme un catálogo.');

  readonly variante = signal<'tarjeta' | 'enlace'>('tarjeta');
}

describe('EntradaAsistenteComponent', () => {
  let fixture: ComponentFixture<Anfitrion>;
  let anfitrion: Anfitrion;

  const enlace = (): HTMLAnchorElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector('a');

  const texto = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';

  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    estado.set(null);

    await TestBed.configureTestingModule({
      imports: [Anfitrion],
      providers: [
        provideRouter([]),
        { provide: IaApiService, useValue: { configuracion: estado.asReadonly() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Anfitrion);
    anfitrion = fixture.componentInstance;
    await render();
  });

  it('sin haber preguntado todavía (config en null) no ofrece nada', async () => {
    // `null` no es «apagado», pero tampoco alcanza para prometer que anda: un
    // atajo a una pantalla que no funciona es peor que no tener el atajo.
    expect(enlace()).toBeNull();
  });

  it('con el asistente no usable tampoco', async () => {
    estado.set(configuracion(false));
    await render();

    expect(enlace()).toBeNull();
  });

  it('usable, lleva al asistente del grupo con la pregunta ya armada', async () => {
    estado.set(configuracion(true));
    await render();

    const destino = decodeURIComponent(enlace()?.getAttribute('href') ?? '');

    expect(destino).toContain('/grupos/grupo-1/asistente');
    expect(destino).toContain('pregunta=Proponeme un catálogo.');
  });

  it('la variante tarjeta muestra el detalle; la de enlace, solo el título', async () => {
    estado.set(configuracion(true));
    await render();

    expect(texto()).toContain('Vos decidís qué se aplica.');

    anfitrion.variante.set('enlace');
    await render();

    expect(texto()).toContain('Pedirle ayuda a la IA');
    expect(texto()).not.toContain('Vos decidís qué se aplica.');
  });
});
