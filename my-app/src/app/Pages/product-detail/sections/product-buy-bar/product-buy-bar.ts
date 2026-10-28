import { Component, input, output } from '@angular/core';

/**
 * Thanh "Thêm vào giỏ / Mua ngay" dính đáy màn hình trên mobile.
 * Dùng position: sticky (không phải fixed) và đặt cuối trang chi tiết, nên khi cuộn tới cuối
 * thanh tự dừng lại phía trên footer, không che footer; header dính ở đầu nên không chồng nhau.
 */
@Component({
  selector: 'app-product-buy-bar',
  standalone: false,
  styleUrl: './product-buy-bar.css',
  templateUrl: './product-buy-bar.html',
})
export class ProductBuyBar {
  /** Không thêm được nữa (hết hàng hoặc đã thêm hết số còn trong kho) */
  readonly disabled = input(false);

  readonly add = output<void>();
  readonly buy = output<void>();
}
