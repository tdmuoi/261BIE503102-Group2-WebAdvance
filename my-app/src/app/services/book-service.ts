import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, shareReplay, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { Author, Book, BookType, Catalog, CatalogBook, Category, Review } from '../models/book';
import { AuthorService } from './author-service';
import { CategoryService } from './category-service';

export interface BookQuery {
  /** Số sách tối đa (server giới hạn 200) */
  limit?: number;
  /** newest: mới tạo trước, updated: mới cập nhật trước */
  sort?: 'newest' | 'updated';
  /** Chỉ lấy sách đang giảm giá */
  discounted?: boolean;
}

/** Server trả tối đa 200 cuốn mỗi lần */
const CATALOG_LIMIT = 200;

/**
 * DB chưa có field loại sách (bookType). Tạm suy ra từ thể loại đặc biệt có sẵn trong DB:
 * slug "used-book" (Sách cũ) và "ebook" (Ebook); còn lại là sách mới.
 */
const TYPE_BY_CATEGORY: Record<string, BookType> = {
  'used-book': 'used',
  ebook: 'ebook',
};

@Injectable({ providedIn: 'root' })
export class BookService {
  private readonly http = inject(HttpClient);
  private readonly authorService = inject(AuthorService);
  private readonly categoryService = inject(CategoryService);
  private readonly baseUrl = `${environment.apiUrl}/books`;

  private catalog$?: Observable<Catalog>;

  getBooks(query: BookQuery = {}): Observable<Book[]> {
    let params = new HttpParams();
    if (query.limit) params = params.set('limit', query.limit);
    if (query.sort) params = params.set('sort', query.sort);
    if (query.discounted) params = params.set('discounted', 'true');
    return this.http.get<Book[]>(this.baseUrl, { params });
  }

  /**
   * Toàn bộ sách đang bán + tác giả + thể loại, tải một lần rồi dùng chung.
   * API chưa có lọc / phân trang / tra theo id nên các trang xử lý trên danh sách này.
   * Lỗi thì không giữ lại, lần gọi sau tải lại.
   */
  getCatalog(): Observable<Catalog> {
    this.catalog$ ??= forkJoin({
      books: this.getBooks({ limit: CATALOG_LIMIT, sort: 'newest' }),
      // Thiếu tác giả hoặc thể loại thì vẫn hiện sách
      authors: this.authorService.getAuthors().pipe(catchError(() => of<Author[]>([]))),
      categories: this.categoryService.getCategories().pipe(catchError(() => of<Category[]>([]))),
    }).pipe(
      map(({ books, authors, categories }) => ({ books: toCatalogBooks(books, authors, categories), authors, categories })),
      catchError((error) => {
        this.catalog$ = undefined;
        return throwError(() => error);
      }),
      shareReplay(1),
    );
    return this.catalog$;
  }

  /** Tìm sách theo slug, hoặc theo _id như các link hiện có trên trang chủ */
  getBook(idOrSlug: string): Observable<CatalogBook | null> {
    return this.getCatalog().pipe(
      map(({ books }) => books.find((book) => book.slug === idOrSlug || book._id === idOrSlug) ?? null),
    );
  }

  /** Chưa có API đánh giá trong my-server nên luôn trả về danh sách rỗng */
  getReviews(_bookId: string): Observable<Review[]> {
    return of([]);
  }
}

/** Ghép tên tác giả, thể loại và loại sách vào từng cuốn */
function toCatalogBooks(books: Book[], authors: Author[], categories: Category[]): CatalogBook[] {
  const authorNames = new Map(authors.map((author) => [author._id, author.name]));
  const categoryById = new Map(categories.map((category) => [category._id, category]));

  return books.map((book) => {
    const category = book.categoryId ? categoryById.get(book.categoryId) : undefined;
    const categorySlug = category?.slug ?? '';
    return {
      ...book,
      authorName: (book.authorId && authorNames.get(book.authorId)) || 'Đang cập nhật tác giả',
      categoryName: category?.name ?? 'Chưa phân loại',
      categorySlug,
      type: book.bookType ?? TYPE_BY_CATEGORY[categorySlug] ?? 'new',
    };
  });
}
