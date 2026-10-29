import { Component } from '@angular/core';

import { PRICE_TIERS } from '../../buyback-rules';

/** Cột trái khu thanh lý: tiêu đề, bảng định giá, hình thức nhận tiền — Figma 837:3333 */
@Component({
  selector: 'app-buyback-guide',
  standalone: false,
  styleUrls: ['../../../homepage/sections/section-shared.css', './buyback-guide.css'],
  templateUrl: './buyback-guide.html',
})
export class BuybackGuide {
  protected readonly tiers = PRICE_TIERS;
  protected readonly tints: Record<string, string> = { 'like-new': 'mint', good: 'yellow', fair: 'pink' };

  protected percent(rate: number): number {
    return Math.round(rate * 100);
  }
}
