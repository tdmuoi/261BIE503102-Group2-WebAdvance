import { Component, ViewEncapsulation, input } from '@angular/core';

/**
 * Nội dung HTML của bài viết. Render qua [innerHTML] với sanitize mặc định của Angular
 * (không dùng bypassSecurityTrust*). Không đóng gói style (ViewEncapsulation.None) để định dạng
 * được thẻ bên trong nội dung — mọi selector đều nằm dưới class .nb-content.
 */
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
