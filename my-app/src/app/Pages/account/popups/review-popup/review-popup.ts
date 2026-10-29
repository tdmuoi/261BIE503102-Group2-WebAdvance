import { Component, DestroyRef, OnDestroy, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AccountService } from '../../../../services/account-service';
import { ToastService } from '../../../../services/toast-service';
import { USE_MOCK_REVIEWS, mockSubmitReview } from './review.mock';

/** Sách được đánh giá */
export interface ReviewTarget {
  bookId: string;
  title: string;
  image: string | null;
  author?: string;
  /** Dòng nhỏ dưới tên: "Sách mới · mua 18/10/2026" */
  meta?: string;
}

export const REVIEW_TAGS = ['Cốt truyện cuốn', 'Bản dịch mượt', 'Đóng gói cẩn thận', 'Giao nhanh', 'Đáng tiền'];
/** Figma chỉ có nhãn 4 sao "Rất thích"; các mức còn lại tự đặt */
export const RATING_LABELS = ['', 'Không thích', 'Chưa ưng lắm', 'Bình thường', 'Rất thích', 'Tuyệt vời'];
export const MAX_CONTENT = 500;
const MAX_PHOTOS = 3;
const MAX_PHOTO_MB = 5;

/**
 * Pop-up "Viết đánh giá" (Figma 908:15047). Dùng lại được ở trang chi tiết sách:
 *   @if (reviewing(); as b) { <app-review-popup [book]="b" (closed)="reviewing.set(null)" (submitted)="..." /> }
 * Ảnh chỉ xem trước, gửi lên khi có API.
 */
@Component({
  selector: 'app-review-popup',
  standalone: false,
  styleUrls: ['../popup.css', './review-popup.css'],
  templateUrl: './review-popup.html',
  host: { '(document:keydown.escape)': 'close()' },
})
export class ReviewPopup implements OnDestroy {
  private readonly account = inject(AccountService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly book = input.required<ReviewTarget>();
  readonly closed = output<void>();
  readonly submitted = output<{ bookId: string; rating: number }>();

  readonly tags = REVIEW_TAGS;
  readonly stars = [1, 2, 3, 4, 5];
  readonly maxContent = MAX_CONTENT;
  readonly maxPhotos = MAX_PHOTOS;

  readonly rating = signal(0);
  readonly hover = signal(0);
  readonly shown = computed(() => this.hover() || this.rating());
  readonly ratingLabel = computed(() => RATING_LABELS[this.shown()]);
  readonly picked = signal<string[]>([]);
  readonly content = signal('');
  readonly anonymous = signal(false);
  readonly photos = signal<{ file: File; url: string }[]>([]);
  readonly error = signal<string | null>(null);
  readonly sending = signal(false);

  constructor() {
    document.body.style.overflow = 'hidden';
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
    this.photos().forEach((p) => URL.revokeObjectURL(p.url));
  }

  rate(value: number): void {
    this.rating.set(value);
    this.error.set(null);
  }

  toggleTag(tag: string): void {
    this.picked.update((list) => (list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]));
  }

  onContent(event: Event): void {
    this.content.set((event.target as HTMLTextAreaElement).value.slice(0, MAX_CONTENT));
  }

  addPhotos(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const files = Array.from(inputEl.files ?? []);
    inputEl.value = '';
    const room = MAX_PHOTOS - this.photos().length;
    const valid = files.filter((f) => f.type.startsWith('image/') && f.size <= MAX_PHOTO_MB * 1024 * 1024);
    if (valid.length < files.length) this.error.set(`Chỉ nhận ảnh JPG/PNG, tối đa ${MAX_PHOTO_MB}MB mỗi ảnh`);
    if (valid.length > room) this.error.set(`Chỉ thêm được tối đa ${MAX_PHOTOS} ảnh`);
    this.photos.update((list) => [...list, ...valid.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }

  removePhoto(index: number): void {
    const photo = this.photos()[index];
    if (photo) URL.revokeObjectURL(photo.url);
    this.photos.update((list) => list.filter((_, i) => i !== index));
  }

  close(): void {
    if (!this.sending()) this.closed.emit();
  }

  submit(): void {
    if (this.sending()) return;
    if (!this.rating()) {
      this.error.set('Bạn chọn số sao trước khi gửi nhé');
      return;
    }
    const body = {
      bookId: this.book().bookId,
      rating: this.rating(),
      tags: this.picked(),
      content: this.content().trim(),
      anonymous: this.anonymous(),
    };
    this.sending.set(true);
    this.error.set(null);
    // TODO: thay bằng API — bỏ nhánh mock khi my-server có POST /api/reviews
    const request$ = USE_MOCK_REVIEWS
      ? mockSubmitReview({ ...body, photoCount: this.photos().length })
      : this.account.submitReview(body, this.photos().map((p) => p.file));
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.sending.set(false);
        this.toast.show('Cảm ơn bạn đã đánh giá!');
        this.submitted.emit(res);
        this.closed.emit();
      },
      error: (err: { error?: { message?: string } }) => {
        this.sending.set(false);
        this.error.set(err?.error?.message ?? 'Chưa gửi được đánh giá, vui lòng thử lại.');
      },
    });
  }
}
