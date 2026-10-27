import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AdminBook, Author, BookPayload, Category, FieldErrors } from '../../../models/book';
import { BookService } from '../../../services/book-service';

function emptyForm(): BookPayload {
  return {
    title: '',
    authorId: null,
    authorName: '',
    categoryId: '',
    image: '',
    isbn: '',
    publisher: '',
    publishYear: null,
    pages: null,
    description: '',
    price: null,
    originalPrice: null,
    stock: 0,
    status: 'active',
  };
}

/**
 * Thêm sách (/book-form) và Sửa sách (/book-form/:id) dùng chung 1 form.
 * - Tác giả: chọn trong danh sách gợi ý hoặc gõ tên mới (server tự tạo tác giả).
 * - % giảm giá tự tính từ giá gốc và giá bán.
 * - Lưu xong quay về danh sách và hiện thông báo.
 */
@Component({
  selector: 'app-book-form',
  standalone: false,
  styleUrl: './book-form.css',
  templateUrl: './book-form.html',
})
export class BookForm {
  private readonly bookService = inject(BookService);
  private readonly router = inject(Router);

  readonly bookId = inject(ActivatedRoute).snapshot.paramMap.get('id');
  readonly isEdit = !!this.bookId;

  /** Dữ liệu form (ngModel) — object thường, trạng thái tải/lưu dùng signal */
  form: BookPayload = emptyForm();

  readonly book = signal<AdminBook | null>(null);
  readonly categories = signal<Category[]>([]);
  readonly authors = signal<Author[]>([]);
  readonly loading = signal(this.isEdit);
  readonly saving = signal(false);
  readonly errors = signal<FieldErrors>({});
  readonly serverError = signal('');
  readonly notFound = signal(false);
  readonly imageBroken = signal(false);
  readonly confirmDelete = signal(false);
  readonly deleting = signal(false);

  /** Thể loại trùng tên (vd 2 mục "Thiếu nhi") thì ghi thêm slug cho dễ phân biệt */
  readonly categoryOptions = computed(() => {
    const list = this.categories();
    const count = new Map<string, number>();
    list.forEach((c) => count.set(c.name, (count.get(c.name) ?? 0) + 1));
    return list.map((c) => ({ id: c._id, label: (count.get(c.name) ?? 0) > 1 ? `${c.name} (${c.slug})` : c.name }));
  });

  constructor() {
    this.bookService.getCategories().subscribe({ next: (list) => this.categories.set(list), error: () => {} });
    this.bookService.getAuthors().subscribe({
      next: (list) => this.authors.set([...list].sort((a, b) => a.name.localeCompare(b.name, 'vi'))),
      error: () => {},
    });

    if (this.bookId) {
      this.bookService.getBook(this.bookId).subscribe({
        next: (book) => {
          this.book.set(book);
          this.form = {
            title: book.title ?? '',
            authorId: book.authorId,
            authorName: book.authorName ?? '',
            categoryId: book.categoryId ?? '',
            image: book.image ?? '',
            isbn: book.isbn ?? '',
            publisher: book.publisher ?? '',
            publishYear: book.publishYear ?? null,
            pages: book.pages ?? null,
            description: book.description ?? '',
            price: book.price,
            originalPrice: book.originalPrice ?? book.price,
            stock: book.stock ?? 0,
            status: book.status === 'hidden' ? 'hidden' : 'active',
          };
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.notFound.set(err.status === 404);
          this.serverError.set(err.status === 404 ? '' : this.connectionMessage(err));
          this.loading.set(false);
        },
      });
    }
  }

  // ---------- Hiển thị ----------
  get discountPercent(): number {
    const { price, originalPrice } = this.form;
    if (!originalPrice || price === null || price > originalPrice) return 0;
    return Math.round(((originalPrice - price) / originalPrice) * 100);
  }

  get isNewAuthor(): boolean {
    const name = this.form.authorName.trim();
    return !!name && !this.findAuthor(name);
  }

  /** Người dùng sửa ô nào thì xoá thông báo lỗi của ô đó */
  clearError(field: string): void {
    const key = (field === 'authorName' ? 'authorId' : field) as keyof FieldErrors;
    if (!this.errors()[key]) return;
    const next = { ...this.errors() };
    delete next[key];
    this.errors.set(next);
  }

  onImageChange(): void {
    this.imageBroken.set(false);
  }

  // ---------- Lưu ----------
  /** Kiểm tra ở trình duyệt trước (server cũng kiểm tra lại) */
  validate(): FieldErrors {
    const f = this.form;
    const e: FieldErrors = {};
    if (!f.title.trim()) e.title = 'Vui lòng nhập tên sách';
    if (!f.categoryId) e.categoryId = 'Vui lòng chọn thể loại';
    if (f.price === null || f.price < 0) e.price = 'Giá bán phải là số ≥ 0';
    if (f.originalPrice !== null && f.price !== null && f.originalPrice < f.price) {
      e.originalPrice = 'Giá gốc không được nhỏ hơn giá bán';
    }
    if (f.stock === null || f.stock < 0 || !Number.isInteger(f.stock)) e.stock = 'Tồn kho phải là số nguyên ≥ 0';
    if (f.publishYear !== null && (f.publishYear < 1000 || f.publishYear > 2100)) e.publishYear = 'Năm không hợp lệ';
    if (f.pages !== null && (f.pages <= 0 || !Number.isInteger(f.pages))) e.pages = 'Số trang phải > 0';
    return e;
  }

  save(): void {
    const errors = this.validate();
    this.errors.set(errors);
    this.serverError.set('');
    if (Object.keys(errors).length) {
      this.scrollToFirstError();
      return;
    }

    const author = this.findAuthor(this.form.authorName.trim());
    const payload: BookPayload = {
      ...this.form,
      authorId: author?._id ?? null,
      authorName: this.form.authorName.trim(),
      originalPrice: this.form.originalPrice ?? this.form.price,
    };

    this.saving.set(true);
    const request = this.bookId ? this.bookService.updateBook(this.bookId, payload) : this.bookService.createBook(payload);
    request.subscribe({
      next: (book) => {
        this.saving.set(false);
        this.router.navigate(['/book-list'], {
          state: { flash: `${this.isEdit ? 'Đã lưu thay đổi' : 'Đã thêm sách'} "${book.title}"` },
        });
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        if (err.status === 400 && err.error?.errors) {
          this.errors.set(err.error.errors);
          this.scrollToFirstError();
        } else {
          this.serverError.set(this.connectionMessage(err));
        }
      },
    });
  }

  deleteBook(): void {
    if (!this.bookId) return;
    this.deleting.set(true);
    this.bookService.deleteBook(this.bookId).subscribe({
      next: () => {
        this.deleting.set(false);
        this.confirmDelete.set(false);
        this.router.navigate(['/book-list'], { state: { flash: `Đã xoá sách "${this.form.title}"` } });
      },
      error: (err: HttpErrorResponse) => {
        this.deleting.set(false);
        this.confirmDelete.set(false);
        this.serverError.set(this.connectionMessage(err));
      },
    });
  }

  // ---------- Hàm phụ ----------
  private findAuthor(name: string): Author | undefined {
    const key = name.toLocaleLowerCase('vi');
    return this.authors().find((a) => a.name.toLocaleLowerCase('vi') === key);
  }

  private connectionMessage(err: HttpErrorResponse): string {
    return err.status === 0
      ? 'Không kết nối được my-server (http://localhost:3002). Hãy chạy "npm run dev" trong thư mục my-server.'
      : err.error?.message || 'Có lỗi xảy ra, vui lòng thử lại.';
  }

  private scrollToFirstError(): void {
    setTimeout(() => document.querySelector('.has-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }
}
