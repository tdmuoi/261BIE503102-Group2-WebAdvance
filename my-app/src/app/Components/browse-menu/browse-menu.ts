import { Component, computed, inject, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';

import { BookType, Catalog } from '../../models/book';
import { BookService } from '../../services/book-service';

interface TypeOption {
  type: BookType;
  title: string;
  desc: string;
  icon: { src: string; width: number; height: number };
  tone: 'pink' | 'mint' | 'yellow';
}

interface Featured {
  slug: string;
  name: string;
}

/** Thể loại không đưa vào hàng "Nổi bật": chưa phân loại và 2 thể loại dùng để đánh dấu loại sách */
const HIDDEN_CATEGORY_SLUGS = ['uncategorized', 'used-book', 'ebook'];
const FEATURED_COUNT = 3;

/** Dropdown "Browse Book" trên header — Figma "Browse dropdown" (894:10570) */
@Component({
  selector: 'app-browse-menu',
  standalone: false,
  styleUrl: './browse-menu.css',
  templateUrl: './browse-menu.html',
})
export class BrowseMenu {
  /** Bấm vào một link trong menu (để header đóng menu) */
  readonly navigate = output<void>();

  protected readonly options: TypeOption[] = [
    {
      type: 'new',
      title: 'Sách mới',
      desc: 'Đầu sách vừa phát hành',
      icon: { src: 'images/icons/browse-new.svg', width: 22.8333, height: 21.6667 },
      tone: 'pink',
    },
    {
      type: 'used',
      title: 'Sách cũ',
      desc: 'Đã qua tay, thẩm định kỹ - chỉ từ 40% giá bìa',
      icon: { src: 'images/icons/browse-used.svg', width: 17.8333, height: 19 },
      tone: 'mint',
    },
    {
      type: 'ebook',
      title: 'Sách điện tử',
      desc: 'Đọc ngay với 1 chạm',
      icon: { src: 'images/icons/browse-ebook.svg', width: 15.5, height: 22.5 },
      tone: 'yellow',
    },
  ];

  private readonly catalog = toSignal(
    inject(BookService).getCatalog().pipe(catchError(() => of<Catalog | null>(null))),
    { initialValue: null },
  );

  /**
   * Số cuốn theo loại — chỉ hiện khi DB có field bookType thật.
   * Hiện loại sách đang suy ra từ thể loại nên ẩn số đếm để tránh hiển thị sai.
   */
  protected readonly counts = computed<Record<BookType, number> | null>(() => {
    const books = this.catalog()?.books ?? [];
    if (!books.some((book) => book.bookType)) return null;
    const counts: Record<BookType, number> = { new: 0, used: 0, ebook: 0 };
    for (const book of books) counts[book.type]++;
    return counts;
  });

  /** Các thể loại có nhiều sách nhất */
  protected readonly featured = computed<Featured[]>(() => {
    const catalog = this.catalog();
    if (!catalog) return [];
    const counts = new Map<string, number>();
    for (const book of catalog.books) {
      if (book.categorySlug && !HIDDEN_CATEGORY_SLUGS.includes(book.categorySlug)) {
        counts.set(book.categorySlug, (counts.get(book.categorySlug) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, FEATURED_COUNT)
      .map(([slug]) => ({ slug, name: catalog.categories.find((category) => category.slug === slug)?.name ?? slug }));
  });
}
