import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, timeout } from 'rxjs';

import { environment } from '../../environments/environment';
import { Author, Book, BookType, Catalog, CatalogBook, Category, Review, ReviewVote, ReviewVoteResult } from '../models/book';
import { AuthService } from './auth-service';
import { AuthorService } from './author-service';
import { CategoryService } from './category-service';

export interface BookQuery {
  limit?: number;
  sort?: 'newest' | 'updated';
  discounted?: boolean;
  format?: BookType[];
}

const CATALOG_LIMIT = 500;

const TYPE_BY_CATEGORY: Record<string, BookType> = {
  'used-book': 'used',
  ebook: 'ebook',
};

@Injectable({ providedIn: 'root' })
export class BookService {
  private readonly http = inject(HttpClient);
  private readonly authorService = inject(AuthorService);
  private readonly categoryService = inject(CategoryService);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = `${environment.apiUrl}/books`;

  getBooks(query: BookQuery = {}): Observable<Book[]> {
    let params = new HttpParams();
    if (query.limit) params = params.set('limit', query.limit);
    if (query.sort) params = params.set('sort', query.sort);
    if (query.discounted) params = params.set('discounted', 'true');
    if (query.format?.length) params = params.set('format', query.format.join(','));
    return this.http.get<Book[]>(this.baseUrl, { params });
  }

  getCatalog(): Observable<Catalog> {
    return forkJoin({
      books: this.getBooks({ limit: CATALOG_LIMIT, sort: 'newest' }),
      authors: this.authorService.getAuthors().pipe(catchError(() => of<Author[]>([]))),
      categories: this.categoryService.getCategories().pipe(catchError(() => of<Category[]>([]))),
    }).pipe(
      timeout(10000),
      map(({ books, authors, categories }) => ({ books: toCatalogBooks(books, authors, categories), authors, categories })),
    );
  }

  getReviews(bookId: string): Observable<Review[]> {
    return this.http
      .get<Review[]>(`${this.baseUrl}/${encodeURIComponent(bookId)}/reviews`, { headers: this.authHeaders() })
      .pipe(catchError(() => of<Review[]>([])));
  }

  voteReview(reviewId: string, value: ReviewVote): Observable<ReviewVoteResult> {
    return this.http.post<ReviewVoteResult>(
      `${environment.apiUrl}/reviews/${encodeURIComponent(reviewId)}/vote`,
      { value },
      { headers: this.authHeaders() },
    );
  }

  private authHeaders(): HttpHeaders | undefined {
    const token = this.auth.token;
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
  }
}

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
