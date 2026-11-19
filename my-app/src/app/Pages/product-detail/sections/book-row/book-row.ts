import { Component, input } from '@angular/core';
import { Params } from '@angular/router';

import { CatalogBook } from '../../../../models/book';

@Component({
  selector: 'app-book-row',
  standalone: false,
  styleUrls: ['../../../homepage/sections/section-shared.css', './book-row.css'],
  templateUrl: './book-row.html',
})
export class BookRow {
  readonly tag = input.required<string>();
  readonly title = input.required<string>();
  readonly accent = input('');
  readonly books = input.required<CatalogBook[]>();
  readonly linkLabel = input('');
  readonly linkQuery = input<Params>({});
}
