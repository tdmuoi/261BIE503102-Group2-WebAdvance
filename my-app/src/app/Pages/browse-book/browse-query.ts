import { ParamMap, Params } from '@angular/router';

import { BookType, CatalogBook } from '../../models/book';

export type BrowseSort = 'newest' | 'price-asc' | 'price-desc' | 'discount';

export interface BrowseQuery {
  types: BookType[];
  conditions: string[];
  category: string | null;
  authors: string[];
  q: string;
  minPrice: number | null;
  maxPrice: number | null;
  sale: boolean;
  sort: BrowseSort;
  page: number;
}

export const PAGE_SIZE = 24;

export const PRICE_MAX = 500_000;
export const PRICE_STEP = 10_000;

export const SORT_OPTIONS: { value: BrowseSort; label: string }[] = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'discount', label: 'Giảm nhiều nhất' },
  { value: 'price-asc', label: 'Giá thấp đến cao' },
  { value: 'price-desc', label: 'Giá cao đến thấp' },
];

export const TYPE_LABELS: Record<BookType, string> = {
  new: 'Sách mới',
  used: 'Sách cũ',
  ebook: 'Sách điện tử',
};

export const CONDITION_LABELS: Record<string, string> = {
  'like-new': 'Như mới',
  good: 'Tốt',
  fair: 'Khá',
  used: 'Đã qua sử dụng',
};

const TYPE_ALIASES: Record<string, BookType> = { new: 'new', paper: 'new', used: 'used', ebook: 'ebook' };

export function parseQuery(params: ParamMap): BrowseQuery {
  const [minPrice, maxPrice] = parsePrice(params.get('price'));
  const sort = params.get('sort') as BrowseSort;
  return {
    types: parseTypes(params.get('type')),
    conditions: (params.get('condition') ?? '').split(',').filter(Boolean),
    category: params.get('category') || null,
    authors: (params.get('author') ?? '').split(',').filter(Boolean),
    q: (params.get('q') ?? '').trim(),
    minPrice,
    maxPrice,
    sale: params.get('sale') === 'true',
    sort: SORT_OPTIONS.some((option) => option.value === sort) ? sort : 'newest',
    page: Math.max(1, Number.parseInt(params.get('page') ?? '', 10) || 1),
  };
}

export function toParams(query: BrowseQuery): Params {
  const params: Params = {};
  if (query.types.length) params['type'] = query.types.join(',');
  if (query.conditions.length) params['condition'] = query.conditions.join(',');
  if (query.category) params['category'] = query.category;
  if (query.authors.length) params['author'] = query.authors.join(',');
  if (query.minPrice !== null || query.maxPrice !== null) {
    params['price'] = `${query.minPrice ?? ''}-${query.maxPrice ?? ''}`;
  }
  if (query.q) params['q'] = query.q;
  if (query.sale) params['sale'] = 'true';
  if (query.sort !== 'newest') params['sort'] = query.sort;
  if (query.page > 1) params['page'] = query.page;
  return params;
}

function parseTypes(value: string | null): BookType[] {
  const types = (value ?? '').split(',').map((type) => TYPE_ALIASES[type]).filter(Boolean);
  return [...new Set(types)];
}

function parsePrice(value: string | null): [number | null, number | null] {
  const match = /^(\d*)-(\d*)$/.exec(value ?? '');
  if (!match) return [null, null];
  const min = match[1] ? Number(match[1]) : null;
  const max = match[2] ? Number(match[2]) : null;
  return min !== null && max !== null && min > max ? [max, min] : [min, max];
}

export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
}

export function booksOfTypes(books: CatalogBook[], types: BookType[]): CatalogBook[] {
  return types.length ? books.filter((book) => types.includes(book.type)) : books;
}

export function filterBooks(books: CatalogBook[], query: BrowseQuery): CatalogBook[] {
  const q = normalizeText(query.q);
  const result = booksOfTypes(books, query.types).filter(
    (book) =>
      (!query.conditions.length || (!!book.condition && query.conditions.includes(book.condition))) &&
      (!query.category || book.categorySlug === query.category) &&
      (!query.authors.length || (!!book.authorId && query.authors.includes(book.authorId))) &&
      (query.minPrice === null || book.price >= query.minPrice) &&
      (query.maxPrice === null || book.price <= query.maxPrice) &&
      (!query.sale || book.discountPercent > 0) &&
      (!q || normalizeText(`${book.title} ${book.authorName} ${book.isbn ?? ''}`).includes(q)),
  );
  return sortBooks(result, query.sort);
}

export function sortBooks(books: CatalogBook[], sort: BrowseSort): CatalogBook[] {
  const list = [...books];
  switch (sort) {
    case 'price-asc':
      return list.sort((a, b) => a.price - b.price);
    case 'price-desc':
      return list.sort((a, b) => b.price - a.price);
    case 'discount':
      return list.sort((a, b) => b.discountPercent - a.discountPercent);
    default:
      return list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }
}
