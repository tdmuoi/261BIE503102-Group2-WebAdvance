import { Component, computed, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NgForm } from '@angular/forms';
import { Subscription, switchMap, catchError, of } from 'rxjs';
import { BuybackRequest, BuybackService, buybackError } from '../buyback-service';
@Component({
  selector: 'app-buyback-detail',
  standalone: false,
  styleUrl: './buyback-detail.css',
  templateUrl: './buyback-detail.html',
})
export class BuybackDetail implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private service = inject(BuybackService);
  private subscriptions = new Subscription();
  private mutation?: Subscription;
  readonly row = signal<BuybackRequest | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly buybackPrice = signal('');
  readonly resalePrice = signal('');
  readonly note = signal('');
  readonly estimatedMargin = computed(() =>
    this.buybackPrice() && this.resalePrice()
      ? Number(this.resalePrice()) - Number(this.buybackPrice())
      : null,
  );
  readonly isLoss = computed(() => (this.estimatedMargin() ?? 0) < 0);
  ngOnInit() {
    this.subscriptions.add(
      this.route.paramMap
        .pipe(
          switchMap((params) => {
            this.mutation?.unsubscribe();
            this.saving.set(false);
            this.message.set('');
            this.loading.set(true);
            this.row.set(null);
            this.error.set('');
            const id = params.get('id');
            if (!id) {
              this.error.set('Thiếu ID yêu cầu. Chọn yêu cầu từ danh sách.');
              return of(null);
            }
            return this.service.get(id).pipe(
              catchError((e) => {
                this.error.set(buybackError(e));
                return of(null);
              }),
            );
          }),
        )
        .subscribe((row) => {
          this.row.set(row);
          this.buybackPrice.set(row?.offerPrice == null ? '' : String(row.offerPrice));
          this.resalePrice.set(row?.resalePrice == null ? '' : String(row.resalePrice));
          this.note.set(row?.adminNote || '');
          this.loading.set(false);
        }),
    );
  }
  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    this.mutation?.unsubscribe();
  }
  setBuybackPrice(v: string) {
    this.buybackPrice.set(v);
  }
  setResalePrice(v: string) {
    this.resalePrice.set(v);
  }
  money(v: number | null) {
    return v === null ? '—' : v.toLocaleString('vi-VN') + 'đ';
  }
  print() {
    if (this.row()) window.print();
  }
  act(action: 'approve' | 'reject' | 'quote', form?: NgForm) {
    const row = this.row();
    if (!row || this.loading() || this.saving()) return;
    this.error.set('');
    this.message.set('');
    form?.control.markAllAsTouched();
    if (action === 'reject' && !this.note().trim()) {
      this.error.set('Nhập lý do từ chối trong ghi chú.');
      return;
    }
    const offerPrice = Number(this.buybackPrice()),
      resalePrice = this.resalePrice().trim() ? Number(this.resalePrice()) : undefined;
    if (
      action === 'quote' &&
      (form?.invalid ||
        !Number.isSafeInteger(offerPrice) ||
        offerPrice < 1 ||
        offerPrice > 100000000 ||
        (resalePrice !== undefined &&
          (!Number.isSafeInteger(resalePrice) ||
            resalePrice < offerPrice ||
            resalePrice > 100000000)))
    ) {
      this.error.set(
        'Giá nguyên dương; giá bán lại không thấp hơn giá thu mua, tối đa 100 triệu đồng.',
      );
      return;
    }
    if (this.note().length > 2000) {
      this.error.set('Ghi chú tối đa 2000 ký tự.');
      return;
    }
    this.saving.set(true);
    this.mutation = this.service
      .act(row, action, {
        note: this.note().trim(),
        ...(action === 'quote'
          ? { offerPrice, ...(resalePrice !== undefined ? { resalePrice } : {}) }
          : {}),
      })
      .subscribe({
        next: (saved) => {
          this.row.set(saved);
          this.saving.set(false);
          this.message.set(
            'Đã lưu yêu cầu vào MongoDB. Giá bán lại chỉ tính thử, không lưu. Chưa gửi email hoặc chuyển tiền.',
          );
        },
        error: (e) => {
          this.saving.set(false);
          this.error.set(buybackError(e));
        },
      });
  }
}
