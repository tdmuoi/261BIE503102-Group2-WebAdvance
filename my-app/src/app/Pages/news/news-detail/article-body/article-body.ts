import { Component, ElementRef, afterRenderEffect, computed, inject, input, signal } from '@angular/core';

import { CatalogBook } from '../../../../models/book';
import { NewsItem } from '../../../../models/content';
import { toInitials } from '../../../../services/author-directory-service';
import { articleHtml } from '../../../../shared/news-utils';
import { TopicChip } from '../article-tags/article-tags';

interface TocItem {
  text: string;
  level: 2 | 3;
}

/** Ảnh minh họa giữa bài: tối đa 3 bìa sách thật */
const FIGURE_BOOKS = 3;

/**
 * Thân bài mặc định — Figma 879:7559: mục lục sticky bên trái (tự sinh từ h2/h3),
 * nội dung, ảnh bìa sách được nhắc đến, "Sách được nhắc đến", chủ đề, hộp tác giả bài.
 */
@Component({
  selector: 'app-article-body',
  standalone: false,
  styleUrl: './article-body.css',
  templateUrl: './article-body.html',
  host: { '(window:scroll)': 'trackActive()' },
})
export class ArticleBody {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly article = input.required<NewsItem>();
  /** Sách được nhắc đến trong bài (sách thật trong DB) */
  readonly books = input<CatalogBook[]>([]);
  readonly chips = input<TopicChip[]>([]);

  protected readonly active = signal(0);
  private headings: HTMLElement[] = [];

  /** Tách nội dung thành các khối cấp cao nhất + danh sách heading cho mục lục */
  private readonly parsed = computed(() => {
    const doc = new DOMParser().parseFromString(articleHtml(this.article()), 'text/html');
    const hasLooseText = [...doc.body.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
    const blocks = hasLooseText ? [doc.body.innerHTML] : [...doc.body.children].map((el) => el.outerHTML);
    const toc: TocItem[] = [...doc.body.querySelectorAll('h2, h3')]
      .map((el) => ({ text: el.textContent?.trim() ?? '', level: (el.tagName === 'H3' ? 3 : 2) as 2 | 3 }))
      .filter((item) => item.text);
    return { blocks, toc };
  });

  protected readonly toc = computed(() => this.parsed().toc);
  protected readonly figureBooks = computed(() => this.books().filter((book) => book.image).slice(0, FIGURE_BOOKS));

  /** Có từ 2 bìa sách thì chèn ảnh minh họa vào giữa bài */
  protected readonly parts = computed(() => {
    const { blocks } = this.parsed();
    if (this.figureBooks().length < 2 || blocks.length < 2) return [blocks.join('')];
    const mid = Math.ceil(blocks.length / 2);
    return [blocks.slice(0, mid).join(''), blocks.slice(mid).join('')];
  });

  protected readonly authorInitials = computed(() => (this.article().author?.name ? toInitials(this.article().author!.name) : ''));

  constructor() {
    // Sau khi nội dung render: gắn id cho heading (sanitizer bỏ thuộc tính id) để mục lục cuộn tới
    afterRenderEffect(() => {
      this.parts();
      this.headings = [...this.host.querySelectorAll<HTMLElement>('.nb-content h2, .nb-content h3')];
      this.headings.forEach((heading, index) => (heading.id = `muc-${index + 1}`));
      this.trackActive();
    });
  }

  /** Mục đang đọc: heading cuối cùng đã cuộn qua mép dưới header */
  protected trackActive(): void {
    if (!this.headings.length) return;
    const offset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 0;
    let current = 0;
    this.headings.forEach((heading, index) => {
      if (heading.getBoundingClientRect().top <= offset + 80) current = index;
    });
    this.active.set(current);
  }

  protected scrollTo(index: number): void {
    this.headings[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
