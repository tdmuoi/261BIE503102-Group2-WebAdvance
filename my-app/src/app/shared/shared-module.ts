import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { BookCard } from '../Components/book-card/book-card';
import { Marquee } from '../Components/marquee/marquee';
import { Pagination } from '../Components/pagination/pagination';
import { QuantityStepper } from '../Components/quantity-stepper/quantity-stepper';
import { StatusCard } from '../Components/status-card/status-card';
import { TrimCover } from '../directives/trim-cover';
import { VndPipe } from '../pipes/vnd-pipe';

/**
 * Component / pipe / directive dùng chung giữa AppModule và các module tải sau (lazy),
 * ví dụ trang chi tiết sách. Một component chỉ được khai báo ở một NgModule nên đặt ở đây.
 */
@NgModule({
  declarations: [BookCard, Marquee, Pagination, QuantityStepper, StatusCard, TrimCover, VndPipe],
  imports: [RouterModule],
  exports: [BookCard, Marquee, Pagination, QuantityStepper, StatusCard, TrimCover, VndPipe],
})
export class SharedModule {}
