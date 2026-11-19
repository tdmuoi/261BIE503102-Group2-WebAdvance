import { Component, ViewEncapsulation, input } from '@angular/core';

@Component({
  selector: 'app-article-content',
  standalone: false,
  template: '<div class="nb-content" [innerHTML]="html()"></div>',
  styleUrl: './article-content.css',
  encapsulation: ViewEncapsulation.None,
})
export class ArticleContent {
  readonly html = input.required<string>();
}
