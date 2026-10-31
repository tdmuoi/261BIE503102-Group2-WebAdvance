import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { ContentSharedModule } from '../../shared/content-shared-module';
import { SharedModule } from '../../shared/shared-module';
import { AuthorDetail } from './author-detail/author-detail';
import { AuthorEvents } from './author-events/author-events';
import { EventFeatured } from './author-events/event-featured/event-featured';
import { EventsNewsletter } from './author-events/events-newsletter/events-newsletter';
import { AuthorFeatured } from './author-list/author-featured/author-featured';
import { AuthorList } from './author-list/author-list';
import { AuthorWorks } from './author-works/author-works';
import { EventReserve } from './event-reserve/event-reserve';

/** "events" phải đứng trước ":id" để không bị hiểu là id tác giả */
const routes: Routes = [
  { path: '', component: AuthorList },
  { path: 'events', component: AuthorEvents },
  { path: ':id', component: AuthorDetail },
  { path: ':id/works', component: AuthorWorks },
];

/** Các trang Tác giả /authors/... — tải riêng khi vào trang (xem app-routing-module.ts) */
@NgModule({
  declarations: [
    AuthorList,
    AuthorFeatured,
    AuthorDetail,
    AuthorWorks,
    AuthorEvents,
    EventFeatured,
    EventsNewsletter,
    EventReserve,
  ],
  imports: [SharedModule, ContentSharedModule, ReactiveFormsModule, RouterModule.forChild(routes)],
})
export class AuthorModule {}
