import { Component, DestroyRef, Type, afterNextRender, inject, signal } from '@angular/core';

import { ScrollMemory } from './services/scroll-memory';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('my-app');

  protected readonly librarianChat = signal<Type<unknown> | null>(null);

  constructor() {
    inject(ScrollMemory);

    let destroyed = false;
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    inject(DestroyRef).onDestroy(() => {
      destroyed = true;
      if (idle !== undefined && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
      if (timer !== undefined) clearTimeout(timer);
    });
    afterNextRender(() => {
      const load = () =>
        import('./Components/librarian-chat/librarian-chat')
          .then((m) => { if (!destroyed) this.librarianChat.set(m.LibrarianChat); })
          .catch((error) => { if (!destroyed) console.error('Cannot load librarian chat:', error); });
      if ('requestIdleCallback' in window) idle = requestIdleCallback(load, { timeout: 3000 });
      else timer = setTimeout(load, 1500);
    });
  }
}
