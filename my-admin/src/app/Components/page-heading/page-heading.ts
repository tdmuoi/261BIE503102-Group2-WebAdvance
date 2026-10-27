import { Component, Input } from '@angular/core';

/**
 * Tiêu đề đầu trang: breadcrumb + tiêu đề + mô tả + vùng nút bên phải.
 *
 * Cách dùng:
 *   <app-page-heading
 *     title="Quản lý sản phẩm"
 *     subtitle="Danh sách sách đang kinh doanh: sách mới, sách cũ, sách thanh lý và ebook."
 *     [breadcrumbs]="[{ label: 'Kho sách', link: '/book-list' }, { label: 'Sản phẩm' }]">
 *     <!-- Các nút đặt bên trong sẽ hiện ở góc phải -->
 *     <button class="btn">Xuất Excel</button>
 *     <a class="btn btn-primary" routerLink="/book-form">+ Thêm sản phẩm</a>
 *   </app-page-heading>
 *
 * Breadcrumb luôn bắt đầu bằng "Admin" (link về Dashboard). Mục cuối không cần link.
 */
export interface Breadcrumb {
  label: string;
  link?: string;
}

@Component({
  selector: 'app-page-heading',
  standalone: false,
  styleUrl: './page-heading.css',
  templateUrl: './page-heading.html',
  // Bỏ thuộc tính title="..." trên thẻ host để trình duyệt không hiện tooltip khi rê chuột
  host: { '[attr.title]': 'null' },
})
export class PageHeading {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() breadcrumbs: Breadcrumb[] = [];
  /** Ẩn mục "Admin" ở đầu breadcrumb (vd: trang Dashboard) */
  @Input() hideRoot = false;
}
