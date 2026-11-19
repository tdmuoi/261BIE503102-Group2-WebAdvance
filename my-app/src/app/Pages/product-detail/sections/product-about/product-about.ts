import { Component, computed, input, linkedSignal } from '@angular/core';

import { CatalogBook } from '../../../../models/book';

interface Spec {
  label: string;
  value: string;
}

const COLLAPSE_LENGTH = 600;

@Component({
  selector: 'app-product-about',
  standalone: false,
  styleUrl: './product-about.css',
  templateUrl: './product-about.html',
})
export class ProductAbout {
  readonly book = input.required<CatalogBook>();

  protected readonly paragraphs = computed(() =>
    (this.book().description ?? '').split(/\n+/).map((p) => p.trim()).filter(Boolean),
  );

  protected readonly collapsible = computed(() => (this.book().description ?? '').length > COLLAPSE_LENGTH);

  protected readonly expanded = linkedSignal({ source: this.book, computation: () => false });

  protected readonly specs = computed<Spec[]>(() => {
    const book = this.book();
    const rows: [string, string | number | null | undefined][] = [
      ['Nhà xuất bản', book.publisher],
      ['Dịch giả', book.translator],
      ['Số trang', book.pages ? `${book.pages} trang` : null],
      ['Kích thước', book.size],
      ['Năm xuất bản', book.publishYear],
      ['Loại bìa', book.coverType],
      ['Ngôn ngữ', book.language],
      ['ISBN', book.isbn],
    ];
    return rows.filter(([, value]) => value).map(([label, value]) => ({ label, value: String(value) }));
  });
}
