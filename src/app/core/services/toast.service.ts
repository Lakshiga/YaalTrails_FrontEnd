import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  icon: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  show(message: string, icon = 'bi-check2-circle'): void {
    const toast = { id: this.nextId++, message, icon };
    this.toasts.update((list) => [...list.slice(-2), toast]);
    setTimeout(() => this.dismiss(toast.id), 3200);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
