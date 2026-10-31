import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { ContentSharedModule } from '../../shared/content-shared-module';
import { SharedModule } from '../../shared/shared-module';
import { ArticleBody } from './news-detail/article-body/article-body';
import { ArticleContent } from './news-detail/article-content/article-content';
import { ArticlePicks } from './news-detail/article-picks/article-picks';
import { ArticleShare } from './news-detail/article-share/article-share';
import { ArticleTags } from './news-detail/article-tags/article-tags';
import { PickItem } from './news-detail/article-picks/pick-item/pick-item';
import { NewsDetail } from './news-detail/news-detail';
import { NewsFeatured } from './news-list/news-featured/news-featured';
import { NewsList } from './news-list/news-list';
import { NewsNewsletter } from './news-list/news-newsletter/news-newsletter';

const routes: Routes = [
  { path: '', component: NewsList },
  { path: ':id', component: NewsDetail },
];

/** Lightbook News /news, /news/:id — tải riêng khi vào trang (xem app-routing-module.ts) */
@NgModule({
  declarations: [
    NewsList,
    NewsFeatured,
    NewsNewsletter,
    NewsDetail,
    ArticleBody,
    ArticleContent,
    ArticlePicks,
    ArticleShare,
    ArticleTags,
    PickItem,
  ],
  imports: [SharedModule, ContentSharedModule, ReactiveFormsModule, RouterModule.forChild(routes)],
})
export class NewsModule {}
