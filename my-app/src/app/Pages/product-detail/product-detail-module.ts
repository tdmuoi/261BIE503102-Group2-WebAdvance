import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared-module';
import { ProductDetail } from './product-detail';
import { BookRow } from './sections/book-row/book-row';
import { ProductAbout } from './sections/product-about/product-about';
import { ProductBuyBar } from './sections/product-buy-bar/product-buy-bar';
import { ProductGallery } from './sections/product-gallery/product-gallery';
import { ProductInfo } from './sections/product-info/product-info';
import { ProductReviews } from './sections/product-reviews/product-reviews';

/** Trang chi tiết sách /books/:slug — tải riêng khi vào trang (xem app-routing-module.ts) */
@NgModule({
  declarations: [ProductDetail, ProductGallery, ProductInfo, ProductAbout, ProductReviews, BookRow, ProductBuyBar],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: ProductDetail }])],
})
export class ProductDetailModule {}
