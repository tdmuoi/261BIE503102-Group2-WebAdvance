import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  /** Link hành động kèm theo, ví dụ "Xem giỏ hàng" */
  link?: { label: string; path: string };
}

const DURATION_MS = 3500;

/** Thông báo nhỏ góc dưới màn hình (component Toast gắn sẵn trong app.html) */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly state = signal<Toast[]>([]);

  readonly toasts = this.state.asReadonly();

  show(message: string, link?: Toast['link']): void {
    const toast: Toast = { id: this.nextId++, message, link };
    // Chỉ giữ 3 thông báo gần nhất
    this.state.update((list) => [...list, toast].slice(-3));
    setTimeout(() => this.dismiss(toast.id), DURATION_MS);
  }

  dismiss(id: number): void {
    this.state.update((list) => list.filter((toast) => toast.id !== id));
  }
}
