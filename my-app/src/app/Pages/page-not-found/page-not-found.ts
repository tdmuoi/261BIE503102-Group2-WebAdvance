import { Component } from '@angular/core';

@Component({
  selector: 'app-page-not-found',
  standalone: false,
  styleUrls: ['../cart/shop.css', './page-not-found.css'],
  templateUrl: './page-not-found.html',
})
export class PageNotFound {
  readonly perks = [
    { icon: 'images/auth/truck.svg', w: 17, label: 'Ưu đãi vận chuyển theo chính sách hiện hành' },
    { icon: 'images/auth/gift.svg', w: 16, label: 'Tặng bookmark mỗi đơn' },
    { icon: 'images/shop/check-sm.svg', w: 16, label: 'Đổi trả trong 7 ngày' },
  ];
}
