import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  link?: { label: string; path: string };
}

const DURATION_MS = 3500;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly state = signal<Toast[]>([]);

  readonly toasts = this.state.asReadonly();

  show(message: string, link?: Toast['link']): void {
    const toast: Toast = { id: this.nextId++, message, link };
    this.state.update((list) => [...list, toast].slice(-3));
    setTimeout(() => this.dismiss(toast.id), DURATION_MS);
  }

  dismiss(id: number): void {
    this.state.update((list) => list.filter((toast) => toast.id !== id));
  }
}
