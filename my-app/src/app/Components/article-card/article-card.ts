import { Component, computed, input, signal } from '@angular/core';

import { NewsItem } from '../../models/content';
import { categoryLabel, fallbackCover, newsCover, newsDate } from '../../shared/news-utils';

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

  /** Cover lỗi thì dùng ảnh vẽ sẵn theo chuyên mục */
  protected readonly cover = computed(() => (this.coverFailed() ? fallbackCover(this.article()) : newsCover(this.article())));
  protected readonly date = computed(() => newsDate(this.article()));
  protected readonly category = computed(() => (this.article().category ? categoryLabel(this.article().category!) : ''));

  protected onCoverError(): void {
    this.coverFailed.set(true);
  }
}
