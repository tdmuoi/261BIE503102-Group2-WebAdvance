import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared-module';
import { BookBuyback } from './book-buyback';
import { BuybackForm } from './buyback-form/buyback-form';
import { BuybackCycle } from './sections/buyback-cycle/buyback-cycle';
import { BuybackGuide } from './sections/buyback-guide/buyback-guide';
import { BuybackHero } from './sections/buyback-hero/buyback-hero';
import { BuybackUsed } from './sections/buyback-used/buyback-used';

/** Trang Thu mua sách /book-buyback — tải riêng khi vào trang (xem app-routing-module.ts) */
@NgModule({
  declarations: [BookBuyback, BuybackHero, BuybackCycle, BuybackGuide, BuybackForm, BuybackUsed],
  imports: [SharedModule, ReactiveFormsModule, RouterModule.forChild([{ path: '', component: BookBuyback }])],
})
export class BookBuybackModule {}
