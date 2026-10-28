import { Component, input, output } from '@angular/core';

import { CatalogBook } from '../../../../models/book';

export interface EmptyTip {
  id: string;
  label: string;
}

/** Không có kết quả — Figma "Empty state" + "Có thể bạn sẽ thích" (frame Không có kết quả 892:9498) */
@Component({
  selector: 'app-browse-empty',
  standalone: false,
  styleUrl: './browse-empty.css',
  templateUrl: './browse-empty.html',
})
export class BrowseEmpty {
  /** Gợi ý nới bộ lọc, mỗi gợi ý bỏ một điều kiện đang áp dụng */
  readonly tips = input<EmptyTip[]>([]);
  /** Sách đề xuất bên dưới */
  readonly suggestions = input<CatalogBook[]>([]);

  readonly tip = output<string>();
  readonly clearAll = output<void>();
}
