import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { Subject, catchError, of, startWith, switchMap, tap } from 'rxjs';

import { CatalogBook } from '../../models/book';
import { BookService } from '../../services/book-service';

type LoadState = 'loading' | 'ready' | 'error';

/** Trang Thu mua sách /book-buyback — Figma 829:2668 */
@Component({
  selector: 'app-book-buyback',
  standalone: false,
  styleUrl: './book-buyback.css',
  templateUrl: './book-buyback.html',
})
export class BookBuyback {
  private readonly bookService = inject(BookService);
  private readonly title = inject(Title);
  private readonly formSection = viewChild.required<ElementRef<HTMLElement>>('formSection');
  private readonly usedSection = viewChild.required<ElementRef<HTMLElement>>('usedSection');
  private readonly reload$ = new Subject<void>();

  protected readonly marquee = [
    'Đọc xong · Trao lại',
    'Thẩm định trong 48h',
    'Gửi bưu điện hoặc mang đến chi nhánh',
    'Nhận tiền hoặc voucher +10%',
  ];

  protected readonly state = signal<LoadState>('loading');
  /** Toàn bộ sách đang bán — dùng để gợi ý tên sách trong phiếu */
  protected readonly books = signal<CatalogBook[]>([]);
  protected readonly usedBooks = computed(() => this.books().filter((book) => book.type === 'used'));

  /**
   * 3 bìa cho hero: ưu tiên sách cũ mới lên kệ.
   * Chưa có sách cũ nào thì lấy sách mới nhất có ảnh để cụm ảnh không trống.
   */
  protected readonly heroCovers = computed(() => {
    const withImage = (list: CatalogBook[]) => list.filter((book) => book.image);
    const used = withImage(this.usedBooks());
    return (used.length ? used : withImage(this.books())).slice(0, 3);
  });

  constructor() {
    const previousTitle = this.title.getTitle();
    this.title.setTitle('Thu mua sách cũ | Lightbook');
    inject(DestroyRef).onDestroy(() => this.title.setTitle(previousTitle));

    this.reload$
      .pipe(
        startWith(undefined),
        tap(() => this.state.set('loading')),
        switchMap(() =>
          this.bookService.getCatalog().pipe(
            catchError((error) => {
              console.error('Không tải được sách:', error);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((catalog) => {
        this.books.set(catalog?.books ?? []);
        this.state.set(catalog ? 'ready' : 'error');
      });
  }

  protected reload(): void {
    this.reload$.next();
  }

  protected scrollToForm(): void {
    this.formSection().nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected scrollToUsed(): void {
    this.usedSection().nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
