import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { BookCard } from '../Components/book-card/book-card';
import { Marquee } from '../Components/marquee/marquee';
import { Pagination } from '../Components/pagination/pagination';
import { QuantityStepper } from '../Components/quantity-stepper/quantity-stepper';
import { StatusCard } from '../Components/status-card/status-card';
import { TrimCover } from '../directives/trim-cover';
import { VndPipe } from '../pipes/vnd-pipe';

@NgModule({
  declarations: [BookCard, Marquee, Pagination, QuantityStepper, StatusCard, TrimCover, VndPipe],
  imports: [RouterModule],
  exports: [BookCard, Marquee, Pagination, QuantityStepper, StatusCard, TrimCover, VndPipe],
})
export class SharedModule {}
