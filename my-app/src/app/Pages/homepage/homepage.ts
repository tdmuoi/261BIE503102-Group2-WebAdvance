import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, of } from 'rxjs';

import { Author, Book, BookView, Category } from '../../models/book';
import { AuthorService } from '../../services/author-service';
import { BookService } from '../../services/book-service';
import { CategoryService } from '../../services/category-service';

type LoadState = 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-homepage',
  standalone: false,
  styleUrl: './homepage.css',
  templateUrl: './homepage.html',
})
export class Homepage {
  private readonly bookService = inject(BookService);
  private readonly authorService = inject(AuthorService);
  private readonly categoryService = inject(CategoryService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<LoadState>('loading');
  protected readonly books = signal<BookView[]>([]);
  protected readonly authors = signal<Author[]>([]);
  protected readonly categories = signal<Category[]>([]);

  // Dải vàng giữa Flash Sale và Sách mới
  protected readonly promoItems = [
    'Flash sale mỗi ngày',
    'Sách mới mỗi tuần',
    'Freeship từ 300K',
    'Gói quà miễn phí',
    'Đổi trả 7 ngày',
  ];

  // Ribbon nghiêng giữa "Góc tác giả" và "Combo"
  protected readonly ribbonItems = ['Author of the month', 'Góc tác giả', 'Bundle & save'];

  constructor() {
    this.load();
  }

  /** Tải sách, tác giả, thể loại một lần rồi chia cho các section */
  protected load(): void {
    this.state.set('loading');

    forkJoin({
      books: this.bookService.getBooks({ limit: 200 }),
      // Thiếu tác giả hoặc thể loại thì trang vẫn hiện sách
      authors: this.authorService.getAuthors().pipe(catchError(() => of<Author[]>([]))),
      categories: this.categoryService.getCategories().pipe(catchError(() => of<Category[]>([]))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ books, authors, categories }) => {
          this.authors.set(authors);
          this.categories.set(categories);
          this.books.set(this.toViews(books, authors, categories));
          this.state.set('ready');
        },
        error: (error) => {
          console.error('Không tải được dữ liệu trang chủ:', error);
          this.state.set('error');
        },
      });
  }

  /** Ghép tên tác giả, tên thể loại vào từng sách theo id */
  private toViews(books: Book[], authors: Author[], categories: Category[]): BookView[] {
    const authorNames = new Map(authors.map((author) => [author._id, author.name]));
    const categoryNames = new Map(categories.map((category) => [category._id, category.name]));

    return books.map((book) => ({
      ...book,
      authorName: (book.authorId && authorNames.get(book.authorId)) || 'Đang cập nhật tác giả',
      categoryName: (book.categoryId && categoryNames.get(book.categoryId)) || 'Chưa phân loại',
    }));
  }
}
