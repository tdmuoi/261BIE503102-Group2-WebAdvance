import { Component, ElementRef, computed, effect, input, output, signal, viewChild } from '@angular/core';

import { BookView } from '../../../../../models/book';

const MAX_RESULTS = 60;

function plain(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
}

@Component({
  selector: 'app-combo-picker',
  standalone: false,
  styleUrl: './combo-picker.css',
  templateUrl: './combo-picker.html',
})
export class ComboPicker {
  readonly books = input.required<BookView[]>();
  readonly open = input(false);
  readonly picked = output<BookView>();
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly query = signal('');

  protected readonly results = computed(() => {
    const q = plain(this.query().trim());
    const list = q ? this.books().filter((book) => plain(`${book.title} ${book.authorName}`).includes(q)) : this.books();
    return list.slice(0, MAX_RESULTS);
  });

  constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;
      if (this.open() && !dialog.open) {
        this.query.set('');
        dialog.showModal();
      } else if (!this.open() && dialog.open) {
        dialog.close();
      }
    });
  }

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.dialog().nativeElement.close();
  }
}
