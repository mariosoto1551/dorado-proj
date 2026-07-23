import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  texto: string;
  tono: 'exito' | 'error';
}

/** Toasts efímeros del panel (auto-descartan a los 3s). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly listaSignal = signal<Toast[]>([]);

  private secuencia = 0;

  readonly lista = this.listaSignal.asReadonly();

  exito(texto: string): void {
    this.mostrar(texto, 'exito');
  }

  error(texto: string): void {
    this.mostrar(texto, 'error');
  }

  descartar(id: number): void {
    this.listaSignal.update((lista) => lista.filter((t) => t.id !== id));
  }

  private mostrar(texto: string, tono: Toast['tono']): void {
    const id = ++this.secuencia;

    this.listaSignal.update((lista) => [...lista, { id, texto, tono }]);
    setTimeout(() => this.descartar(id), 3000);
  }
}
