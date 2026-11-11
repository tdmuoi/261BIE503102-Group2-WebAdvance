import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { POLICIES } from './policy-content';

/**
 * Trang Chính sách: bảo mật, thanh toán, mua hàng & đổi trả (nội dung Content 1.docx).
 * Mở đúng mục bằng fragment: /policies#bao-mat · #thanh-toan · #doi-tra
 * Standalone để chỉ cần thêm 1 dòng route, không phải khai báo trong app-module.
 */
@Component({
  selector: 'app-policies',
  standalone: true,
  imports: [RouterLink],
  styleUrl: './policies.css',
  templateUrl: './policies.html',
})
export class Policies {
  private readonly route = inject(ActivatedRoute);
  readonly policies = POLICIES;

  constructor() {
    // Tự cuộn tới mục theo fragment (không phụ thuộc cấu hình anchorScrolling của router)
    this.route.fragment.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((id) => {
      // chờ router cuộn lên đầu trang (scrollPositionRestoration: 'top') xong rồi mới cuộn tới mục
      if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 120);
    });
  }
}
