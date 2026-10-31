import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { ArticleCard } from '../Components/article-card/article-card';
import { AuthorAvatar } from '../Components/author-avatar/author-avatar';
import { Breadcrumb } from '../Components/breadcrumb/breadcrumb';
import { EventCard } from '../Components/event-card/event-card';
import { SectionHead } from '../Components/section-head/section-head';
import { Sticker } from '../Components/sticker/sticker';

/**
 * Component dùng chung giữa các trang tải sau (lazy) Tác giả và Lightbook News.
 * Không import vào AppModule để không làm bundle ban đầu lớn thêm.
 */
@NgModule({
  declarations: [ArticleCard, AuthorAvatar, Breadcrumb, EventCard, SectionHead, Sticker],
  imports: [RouterModule],
  exports: [ArticleCard, AuthorAvatar, Breadcrumb, EventCard, SectionHead, Sticker],
})
export class ContentSharedModule {}
