import { Component, input, output } from '@angular/core';

import { CatalogBook } from '../../../../models/book';

/** Hero trang Thu mua sách — Figma 829:2669 */
@Component({
  selector: 'app-buyback-hero',
  standalone: false,
  styleUrls: ['./buyback-hero.css', './buyback-hero-visual.css'],
  templateUrl: './buyback-hero.html',
})
export class BuybackHero {
  /** Tối đa 3 bìa sách thật cho cụm ảnh: trái, giữa, phải */
  readonly covers = input<CatalogBook[]>([]);

  /** "Thanh lý sách ngay" — cuộn xuống phiếu */
  readonly sell = output<void>();
  /** "Xem sách đã qua tay" — cuộn xuống khu sách thanh lý */
  readonly browse = output<void>();

  /** Vị trí bìa theo thứ tự sách truyền vào: cuốn đầu ở giữa (nổi lên trên), rồi trái, phải */
  protected readonly positions = ['center', 'left', 'right'];

  protected readonly stats = [
    { value: '12.480', label: 'cuốn sách đã tái sinh' },
    { value: '48h', label: 'thẩm định & báo giá' },
    { value: '+10%', label: 'khi nhận voucher' },
  ];
}
