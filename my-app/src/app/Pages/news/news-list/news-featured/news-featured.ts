import { Component, computed, input, signal } from '@angular/core';

import { NewsItem } from '../../../../models/content';
import { toInitials } from '../../../../services/author-directory-service';
import { categoryLabel, fallbackCover, newsCover, newsDate } from '../../../../shared/news-utils';

@Component({
  selector: 'app-news-featured',
  standalone: false,
  styleUrl: './news-featured.css',
  templateUrl: './news-featured.html',
})
export class NewsFeatured {
  readonly article = input.required<NewsItem>();
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
