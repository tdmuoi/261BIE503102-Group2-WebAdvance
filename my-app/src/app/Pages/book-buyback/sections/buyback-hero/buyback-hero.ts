import { Component, input, output } from '@angular/core';

import { CatalogBook } from '../../../../models/book';

@Component({
  selector: 'app-buyback-hero',
  standalone: false,
  styleUrls: ['./buyback-hero.css', './buyback-hero-visual.css'],
  templateUrl: './buyback-hero.html',
})
export class BuybackHero {
  readonly covers = input<CatalogBook[]>([]);

  readonly sell = output<void>();
  readonly browse = output<void>();

  protected readonly positions = ['center', 'left', 'right'];

  protected readonly stats = [
    { value: '12.480', label: 'cuốn sách đã tái sinh' },
    { value: '48h', label: 'thẩm định & báo giá' },
    { value: '+10%', label: 'khi nhận voucher' },
  ];
}
