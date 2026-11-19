import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared-module';
import { BookBuyback } from './book-buyback';
import { BuybackForm } from './buyback-form/buyback-form';
import { BuybackSuccess } from './buyback-success/buyback-success';
import { BuybackCycle } from './sections/buyback-cycle/buyback-cycle';
import { BuybackGuide } from './sections/buyback-guide/buyback-guide';
import { BuybackHero } from './sections/buyback-hero/buyback-hero';
import { BuybackUsed } from './sections/buyback-used/buyback-used';

@NgModule({
  declarations: [BookBuyback, BuybackHero, BuybackCycle, BuybackGuide, BuybackForm, BuybackSuccess, BuybackUsed],
  imports: [SharedModule, ReactiveFormsModule, RouterModule.forChild([{ path: '', component: BookBuyback }])],
})
export class BookBuybackModule {}
