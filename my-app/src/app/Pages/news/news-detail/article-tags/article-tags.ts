import { Component, input } from '@angular/core';
import { Params } from '@angular/router';

export interface TopicChip {
  label: string;
  link: string | unknown[];
  queryParams?: Params;
}

@Component({
  selector: 'app-article-tags',
  standalone: false,
  styleUrl: './article-tags.css',
  template: `
    <span class="at-label">Chủ đề:</span>
    @for (chip of chips(); track chip.label) {
      <a class="at-chip" [routerLink]="chip.link" [queryParams]="chip.queryParams">{{ chip.label }}</a>
    }
  `,
})
export class ArticleTags {
  readonly chips = input.required<TopicChip[]>();
}
