import { Component, computed, input, signal } from '@angular/core';

import { NewsItem } from '../../models/content';
import { DEFAULT_NEWS_COVER, newsCover, newsDate } from '../../shared/news-utils';

/** Thẻ bài viết Lightbook News — Figma "Article card" (863:391), dạng dọc cho lưới 3 cột, cover 16:10 */
@Component({
  selector: 'app-article-card',
  standalone: false,
  styleUrl: './article-card.css',
  templateUrl: './article-card.html',
})
export class ArticleCard {
  readonly article = input.required<NewsItem>();

  private readonly coverFailed = signal(false);

  protected readonly cover = computed(() => (this.coverFailed() ? DEFAULT_NEWS_COVER : newsCover(this.article())));
  protected readonly date = computed(() => newsDate(this.article()));

  protected onCoverError(): void {
    this.coverFailed.set(true);
  }
}
