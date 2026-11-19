import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-product-buy-bar',
  standalone: false,
  styleUrl: './product-buy-bar.css',
  templateUrl: './product-buy-bar.html',
})
export class ProductBuyBar {
  readonly disabled = input(false);

  readonly add = output<void>();
  readonly buy = output<void>();
}
