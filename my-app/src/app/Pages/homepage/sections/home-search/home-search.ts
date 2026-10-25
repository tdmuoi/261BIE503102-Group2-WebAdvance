import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';

import { Category } from '../../../../models/book';

interface FilterOption {
  value: string;
  label: string;
}

interface FilterField {
  name: string;
  label: string;
  icon: string;
  options: FilterOption[];
}

@Component({
  selector: 'app-home-search',
  standalone: false,
  styleUrl: './home-search.css',
  templateUrl: './home-search.html',
})
export class HomeSearch {
  /** Thể loại lấy từ API, dùng cho dropdown "Thể loại" */
  readonly categories = input<Category[]>([]);

  private readonly router = inject(Router);

  protected readonly typeField: FilterField = {
    name: 'type',
    label: 'Loại sách',
    icon: 'images/icons/marker-pin.svg',
    options: [
      { value: 'paper', label: 'Sách giấy' },
      { value: 'ebook', label: 'Ebook' },
      { value: 'used', label: 'Sách cũ' },
    ],
  };

  protected readonly ageField: FilterField = {
    name: 'age',
    label: 'Độ tuổi',
    icon: 'images/icons/calendar.svg',
    options: [
      { value: 'kids', label: 'Thiếu nhi (0–11)' },
      { value: 'teen', label: 'Thiếu niên (12–17)' },
      { value: 'adult', label: 'Người lớn (18+)' },
    ],
  };

  protected readonly priceField: FilterField = {
    name: 'price',
    label: 'Khoảng giá',
    icon: 'images/icons/briefcase.svg',
    options: [
      { value: '0-100000', label: 'Dưới 100.000đ' },
      { value: '100000-200000', label: '100.000đ – 200.000đ' },
      { value: '200000-500000', label: '200.000đ – 500.000đ' },
      { value: '500000-', label: 'Trên 500.000đ' },
    ],
  };

  /** Chuyển sang trang Browse Book kèm các bộ lọc đã chọn */
  protected onSearch(event: Event): void {
    event.preventDefault();
    const data = new FormData(event.target as HTMLFormElement);
    const queryParams: Record<string, string> = {};
    data.forEach((value, key) => {
      const text = String(value).trim();
      if (text) queryParams[key] = text;
    });
    this.router.navigate(['/browse-book'], { queryParams });
  }
}
