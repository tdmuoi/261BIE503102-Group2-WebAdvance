import { Component, input, output } from '@angular/core';

import { CatalogBook } from '../../../../models/book';

export interface EmptyTip {
  id: string;
  label: string;
}

@Component({
  selector: 'app-browse-empty',
  standalone: false,
  styleUrl: './browse-empty.css',
  templateUrl: './browse-empty.html',
})
export class BrowseEmpty {
  readonly tips = input<EmptyTip[]>([]);
  readonly suggestions = input<CatalogBook[]>([]);

  readonly tip = output<string>();
  readonly clearAll = output<void>();
}
