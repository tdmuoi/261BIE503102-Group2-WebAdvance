import { Component, computed, input, linkedSignal, output, signal } from '@angular/core';

import { BookType } from '../../../../models/book';
import { BrowseQuery, PRICE_MAX, normalizeText } from '../../browse-query';

export interface AuthorFacet {
  id: string;
  name: string;
  count: number;
}

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
  readonly open = input(false);

  readonly apply = output<FilterChange>();
  readonly clearAll = output<void>();
  readonly close = output<void>();

  protected readonly selectedTypes = linkedSignal(() => this.query().types);
  protected readonly selectedConditions = linkedSignal(() => this.query().conditions);
  protected readonly selectedAuthors = linkedSignal(() => this.query().authors);
  protected readonly minPrice = linkedSignal(() => this.query().minPrice ?? 0);
  protected readonly maxPrice = linkedSignal(() => this.query().maxPrice ?? PRICE_MAX);
  protected readonly authorSearch = signal('');

  protected readonly showConditions = computed(() => {
    const types = this.selectedTypes();
    return this.conditions().length > 0 && (!types.length || types.includes('used'));
  });

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
