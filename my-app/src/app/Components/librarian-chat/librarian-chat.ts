import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { ChatTurn, LibrarianPick, LibrarianService } from '../../services/librarian-service';
import { LibrarianBook } from './librarian-book/librarian-book';
import { LibrarianMascot } from './librarian-mascot/librarian-mascot';

interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  books?: LibrarianPick[];
  followUp?: string;
}

const MAX_LENGTH = 500;
const HISTORY_TURNS = 6;
const GREETING = 'Chào bạn, mình là thủ thư của Lightbook. Hôm nay bạn đang muốn tìm một cuốn sách thế nào? Kể mình nghe nhé.';
const ERROR_TEXT = 'Xin lỗi bạn, mình đang gặp chút trục trặc. Bạn thử lại sau một lát giúp mình nhé.';

/**
 * Widget chat "Thủ thư Lightbook": nút tròn nổi góc phải dưới, mở panel trò chuyện.
 * Khách kể mục tiêu học tập / gu đọc, thủ thư gợi ý sách có trong kho kèm lý do.
 * Gắn một lần trong app.html (tải lazy khi trình duyệt rảnh) nên có ở mọi trang.
 */
@Component({
  selector: 'app-librarian-chat',
  // Standalone để tải lazy bằng import() trong App, không làm nặng bundle ban đầu
  imports: [ReactiveFormsModule, LibrarianBook, LibrarianMascot],
  styleUrl: './librarian-chat.css',
  templateUrl: './librarian-chat.html',
})
export class LibrarianChat {
  private readonly librarian = inject(LibrarianService);
  private readonly scrollBox = viewChild<ElementRef<HTMLElement>>('scrollBox');
  private readonly inputBox = viewChild<ElementRef<HTMLInputElement>>('inputBox');

  protected readonly maxLength = MAX_LENGTH;
  protected readonly open = signal(false);
  protected readonly loading = signal(false);
  protected readonly messages = signal<ChatMessage[]>([{ role: 'bot', text: GREETING }]);
  protected readonly input = new FormControl('', { nonNullable: true });

  protected readonly suggestions = [
    'Tôi đang tự học lập trình web',
    'Một cuốn romance có kết buồn',
    'Quà tặng dưới 150k cho bạn thích đọc',
  ];

  protected toggle(): void {
    this.open.update((open) => !open);
    if (this.open()) this.afterRender(() => this.inputBox()?.nativeElement.focus());
  }

  protected close(): void {
    this.open.set(false);
  }

  /** Mobile: panel phủ gần hết màn hình nên thu lại khi khách mở trang chi tiết sách */
  protected onBookOpened(): void {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches) this.close();
  }

  /** Form không gắn [formGroup] nên phải tự chặn submit mặc định, nếu không trình duyệt tải lại trang */
  protected submit(event: Event): void {
    event.preventDefault();
    this.send();
  }

  protected send(text: string = this.input.value): void {
    const message = text.trim().slice(0, MAX_LENGTH);
    if (!message || this.loading()) return;

    const history = this.buildHistory();
    this.messages.update((list) => [...list, { role: 'user', text: message }]);
    this.input.setValue('');
    this.loading.set(true);
    this.scrollDown();

    this.librarian.ask(message, history).subscribe({
      next: (res) => this.pushBot({ role: 'bot', text: res.reply, books: res.books, followUp: res.followUp }),
      error: (err) => this.pushBot({ role: 'bot', text: err?.error?.message || ERROR_TEXT }),
    });
  }

  /** Lượt bot kèm tên sách đã gợi ý, để khách hỏi tiếp được kiểu "cuốn thứ 2 có khó không" */
  private buildHistory(): ChatTurn[] {
    return this.messages()
      .slice(1)
      .slice(-HISTORY_TURNS)
      .map((m) => {
        const parts = [m.text];
        if (m.books?.length) parts.push(`[Đã gợi ý: ${m.books.map((b, i) => `${i + 1}. ${b.title}`).join('; ')}]`);
        if (m.followUp) parts.push(m.followUp);
        return { role: m.role, text: parts.filter(Boolean).join(' ') };
      });
  }

  private pushBot(message: ChatMessage): void {
    this.messages.update((list) => [...list, message]);
    this.loading.set(false);
    this.scrollDown();
    this.afterRender(() => this.inputBox()?.nativeElement.focus());
  }

  private scrollDown(): void {
    this.afterRender(() => {
      const el = this.scrollBox()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  private afterRender(fn: () => void): void {
    setTimeout(fn);
  }
}
