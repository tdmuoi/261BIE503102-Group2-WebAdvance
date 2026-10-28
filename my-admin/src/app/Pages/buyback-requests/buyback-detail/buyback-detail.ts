import { Component, computed, signal } from '@angular/core';

@Component({
  selector: 'app-buyback-detail',
  standalone: false,
  styleUrl: './buyback-detail.css',
  templateUrl: './buyback-detail.html',
})
export class BuybackDetail {
  readonly photoLabels = ['Ảnh mặt trước', 'Ảnh gáy sách', 'Ảnh trang trong'];
  readonly steps = ['Gửi yêu cầu', 'Chờ duyệt', 'Nhận sách', 'Kiểm định tình trạng', 'Thanh toán cho khách'];
  readonly checks = [
    'Không thuộc danh mục cấm bán',
    'Không phải sách photo / in lậu',
    'Tình trạng từ 70%',
    'Có đủ ảnh mặt trước / sau',
  ];

  readonly buybackPrice = signal('');
  readonly resalePrice = signal('');
  readonly note = signal('');
  readonly estimatedMargin = computed(() => {
    const buyback = Number(this.buybackPrice());
    const resale = Number(this.resalePrice());
    return this.buybackPrice() && this.resalePrice() ? resale - buyback : null;
  });
  readonly isLoss = computed(() => (this.estimatedMargin() ?? 0) < 0);

  setBuybackPrice(value: string): void {
    this.buybackPrice.set(value);
  }

  setResalePrice(value: string): void {
    this.resalePrice.set(value);
  }

  money(value: number | null): string {
    return value === null ? '—' : `${value.toLocaleString('vi-VN')}đ`;
  }

  print(): void {
    window.print();
  }
}
