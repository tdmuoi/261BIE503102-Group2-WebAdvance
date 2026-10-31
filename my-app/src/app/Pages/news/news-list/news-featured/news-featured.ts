import { Component, computed, input, signal } from '@angular/core';

import { NewsItem } from '../../../../models/content';
import { toInitials } from '../../../../services/author-directory-service';
import { categoryLabel, fallbackCover, newsCover, newsDate } from '../../../../shared/news-utils';

/** Bài nổi bật lớn cạnh thẻ vàng "Đọc nhiều this week" — Figma 878:7287, 878:7344 */
@Component({
  selector: 'app-news-featured',
  standalone: false,
  styleUrl: './news-featured.css',
  templateUrl: './news-featured.html',
})
export class NewsFeatured {
  readonly article = input.required<NewsItem>();
  /** Đã xếp theo lượt xem — rỗng thì ẩn thẻ vàng */
  readonly mostRead = input<NewsItem[]>([]);

  protected readonly categoryLabel = categoryLabel;
  private readonly coverFailed = signal(false);

  protected readonly cover = computed(() => (this.coverFailed() ? fallbackCover(this.article()) : newsCover(this.article())));
  protected readonly date = computed(() => newsDate(this.article()));
  protected readonly authorInitials = computed(() => (this.article().author?.name ? toInitials(this.article().author!.name) : ''));

  protected onCoverError(): void {
    this.coverFailed.set(true);
  }
}
