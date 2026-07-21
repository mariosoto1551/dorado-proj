import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  texto: string;
  tono: 'exito' | 'error' | 'info';
}

/** Toasts efímeros de feedback (éxito/error) — se auto-descartan a los 4s. */
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

  info(texto: string): void {
    this.mostrar(texto, 'info');
  }

  descartar(id: number): void {
    this.listaSignal.update((l) => l.filter((t) => t.id !== id));
  }

  private mostrar(texto: string, tono: Toast['tono']): void {
    const id = ++this.secuencia;
    this.listaSignal.update((l) => [...l, { id, texto, tono }]);
    setTimeout(() => this.descartar(id), 4000);
  }
}
