import { Component, computed, input, linkedSignal, output, signal } from '@angular/core';

import { BookType } from '../../../../models/book';
import { BrowseQuery, PRICE_MAX, normalizeText } from '../../browse-query';

/** Tác giả có sách trong phạm vi đang xem, kèm số đầu sách */
export interface AuthorFacet {
  id: string;
  name: string;
  count: number;
}

/** Một lựa chọn trong nhóm checkbox, kèm số đầu sách */
export interface TypeFacet {
  id: BookType;
  label: string;
  count: number;
}

export interface ConditionFacet {
  id: string;
  label: string;
  count: number;
}

export interface FilterChange {
  types: BookType[];
  conditions: string[];
  authors: string[];
  minPrice: number | null;
  maxPrice: number | null;
}

const TOP_AUTHORS = 5;
const SEARCH_LIMIT = 8;

/**
 * Sidebar "Bộ lọc" — Figma "Filter sidebar" (893:9983). Chọn xong bấm "Áp dụng bộ lọc" mới đổi kết quả.
 * Tablet/mobile: thành drawer trượt từ phải (trang cha mở/đóng qua input open).
 * Nhóm "Ấn bản" (bìa cứng / bìa mềm) trong Figma chưa làm vì DB chưa có field loại bìa.
 */
@Component({
  selector: 'app-browse-filters',
  standalone: false,
  styleUrl: './browse-filters.css',
  templateUrl: './browse-filters.html',
  host: { '[class.is-open]': 'open()' },
})
export class BrowseFilters {
  readonly query = input.required<BrowseQuery>();
  readonly types = input.required<TypeFacet[]>();
  readonly conditions = input.required<ConditionFacet[]>();
  readonly authors = input.required<AuthorFacet[]>();
  /** Drawer đang mở (chỉ có tác dụng trên tablet/mobile) */
  readonly open = input(false);

  readonly apply = output<FilterChange>();
  readonly clearAll = output<void>();
  readonly close = output<void>();

  // Lựa chọn tạm, chưa áp dụng — tự đặt lại mỗi khi URL đổi, nên vào từ menu "Sách mới" là ô đó đã tích sẵn
  protected readonly selectedTypes = linkedSignal(() => this.query().types);
  protected readonly selectedConditions = linkedSignal(() => this.query().conditions);
  protected readonly selectedAuthors = linkedSignal(() => this.query().authors);
  protected readonly minPrice = linkedSignal(() => this.query().minPrice ?? 0);
  protected readonly maxPrice = linkedSignal(() => this.query().maxPrice ?? PRICE_MAX);
  protected readonly authorSearch = signal('');

  /** Tình trạng chỉ có ở sách cũ: ẩn khi đang chọn các loại sách khác */
  protected readonly showConditions = computed(() => {
    const types = this.selectedTypes();
    return this.conditions().length > 0 && (!types.length || types.includes('used'));
  });

  /** Chưa gõ tìm: 5 tác giả nhiều sách nhất. Đang gõ: các tác giả khớp tên. Tác giả đã chọn luôn hiện. */
  protected readonly visibleAuthors = computed(() => {
    const all = this.authors();
    const search = normalizeText(this.authorSearch().trim());
    const shown = search
      ? all.filter((author) => normalizeText(author.name).includes(search)).slice(0, SEARCH_LIMIT)
      : all.slice(0, TOP_AUTHORS);
    const selected = all.filter((author) => this.selectedAuthors().includes(author.id) && !shown.includes(author));
    return [...selected, ...shown];
  });

  protected toggleType(id: BookType): void {
    this.selectedTypes.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  protected toggleCondition(id: string): void {
    this.selectedConditions.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  protected toggleAuthor(id: string): void {
    this.selectedAuthors.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  protected onAuthorSearch(event: Event): void {
    this.authorSearch.set((event.target as HTMLInputElement).value);
  }

  protected submit(): void {
    this.apply.emit({
      types: this.selectedTypes(),
      conditions: this.showConditions() ? this.selectedConditions() : [],
      authors: this.selectedAuthors(),
      minPrice: this.minPrice() > 0 ? this.minPrice() : null,
      maxPrice: this.maxPrice() < PRICE_MAX ? this.maxPrice() : null,
    });
  }
}
