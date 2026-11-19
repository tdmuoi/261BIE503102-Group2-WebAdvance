import { Component, computed, input, signal } from '@angular/core';

import { NewsItem } from '../../models/content';
import { categoryLabel, fallbackCover, newsCover, newsDate } from '../../shared/news-utils';

@Component({
  selector: 'app-article-card',
  standalone: false,
  styleUrl: './article-card.css',
  templateUrl: './article-card.html',
})
export class ArticleCard {
  readonly article = input.required<NewsItem>();

  private readonly coverFailed = signal(false);

  protected readonly cover = computed(() => (this.coverFailed() ? fallbackCover(this.article()) : newsCover(this.article())));
  protected readonly date = computed(() => newsDate(this.article()));
  protected readonly category = computed(() => (this.article().category ? categoryLabel(this.article().category!) : ''));

  protected onCoverError(): void {
    this.coverFailed.set(true);
  }
}
