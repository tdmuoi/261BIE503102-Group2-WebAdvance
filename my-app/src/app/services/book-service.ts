import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, timeout } from 'rxjs';

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
  /** Chỉ lấy các loại sách này */
  format?: BookType[];
}

/** Server trả tối đa 500 cuốn mỗi lần */
const CATALOG_LIMIT = 500;

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

  getBooks(query: BookQuery = {}): Observable<Book[]> {
    let params = new HttpParams();
    if (query.limit) params = params.set('limit', query.limit);
    if (query.sort) params = params.set('sort', query.sort);
    if (query.discounted) params = params.set('discounted', 'true');
    if (query.format?.length) params = params.set('format', query.format.join(','));
    return this.http.get<Book[]>(this.baseUrl, { params });
  }

  /**
   * Đọc lại danh mục khi trang yêu cầu để nhận giá và ảnh mới từ Admin.
   * API chưa có lọc / phân trang / tra theo id nên các trang xử lý trên danh sách này.
   */
  getCatalog(): Observable<Catalog> {
    return forkJoin({
      books: this.getBooks({ limit: CATALOG_LIMIT, sort: 'newest' }),
      // Thiếu tác giả hoặc thể loại thì vẫn hiện sách
      authors: this.authorService.getAuthors().pipe(catchError(() => of<Author[]>([]))),
      categories: this.categoryService.getCategories().pipe(catchError(() => of<Category[]>([]))),
    }).pipe(
      timeout(10000),
      map(({ books, authors, categories }) => ({ books: toCatalogBooks(books, authors, categories), authors, categories })),
    );
  }

  /**
   * Đánh giá của độc giả đã mua (GET /api/books/:id/reviews) — khách viết ở Tài khoản › Quản lý đơn hàng.
   * Lỗi thì coi như chưa có đánh giá, trang chi tiết vẫn hiện sách.
   */
  getReviews(bookId: string): Observable<Review[]> {
    return this.http.get<Review[]>(`${this.baseUrl}/${encodeURIComponent(bookId)}/reviews`).pipe(catchError(() => of<Review[]>([])));
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
