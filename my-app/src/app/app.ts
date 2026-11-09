import { Component, Type, afterNextRender, signal } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('my-app');

  /** Widget chat Thủ thư Lightbook — tải riêng khi trình duyệt rảnh để không làm nặng lần tải đầu */
  protected readonly librarianChat = signal<Type<unknown> | null>(null);

  constructor() {
    afterNextRender(() => {
      const load = () =>
        import('./Components/librarian-chat/librarian-chat')
          .then((m) => this.librarianChat.set(m.LibrarianChat))
          .catch((error) => console.error('Cannot load librarian chat:', error));
      if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 3000 });
      else setTimeout(load, 1500);
    });
  }
}
