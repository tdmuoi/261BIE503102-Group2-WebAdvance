import { ParamMap, Params } from '@angular/router';

import { BookType, CatalogBook } from '../../models/book';

/**
 * Trạng thái trang Browse nằm hết trên URL để reload / nút Back giữ đúng bộ lọc:
 *   /books?type=new&category=ky-nang-song&author=id1,id2&price=50000-200000&q=kitchen&sale=true&sort=price-asc&page=2
 * Trang chủ (thanh tìm kiếm, nút "Xem tất cả deal") đã gửi sẵn type / category / price / q / sale theo đúng dạng này.
 */
export type BrowseSort = 'newest' | 'price-asc' | 'price-desc' | 'discount';

export interface BrowseQuery {
  type: BookType | null;
  /** slug thể loại */
  category: string | null;
  /** id tác giả */
  authors: string[];
  q: string;
  minPrice: number | null;
  maxPrice: number | null;
  /** Chỉ sách đang giảm giá */
  sale: boolean;
  sort: BrowseSort;
  page: number;
}

export const PAGE_SIZE = 24;

/** Thanh trượt giá: 0 – 500.000đ+ (kéo hết bên phải = không giới hạn trên) */
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

/** Thanh tìm kiếm trang chủ dùng "paper" cho sách giấy mới */
const TYPE_ALIASES: Record<string, BookType> = { new: 'new', paper: 'new', used: 'used', ebook: 'ebook' };

export function parseQuery(params: ParamMap): BrowseQuery {
  const [minPrice, maxPrice] = parsePrice(params.get('price'));
  const sort = params.get('sort') as BrowseSort;
  return {
    type: TYPE_ALIASES[params.get('type') ?? ''] ?? null,
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

/** Chỉ ghi các giá trị khác mặc định cho URL gọn */
export function toParams(query: BrowseQuery): Params {
  const params: Params = {};
  if (query.type) params['type'] = query.type;
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

/** "50000-200000" | "-200000" | "500000-" → [min, max] */
function parsePrice(value: string | null): [number | null, number | null] {
  const match = /^(\d*)-(\d*)$/.exec(value ?? '');
  if (!match) return [null, null];
  const min = match[1] ? Number(match[1]) : null;
  const max = match[2] ? Number(match[2]) : null;
  return min !== null && max !== null && min > max ? [max, min] : [min, max];
}

/** Bỏ dấu + chữ thường để "ky nang" tìm ra "Kỹ năng" */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
}

/** Lọc theo loại sách — phạm vi của cả trang (chip thể loại, danh sách tác giả, gợi ý) */
export function booksOfType(books: CatalogBook[], type: BookType | null): CatalogBook[] {
  return type ? books.filter((book) => book.type === type) : books;
}

/** Lọc + sắp xếp danh sách sách theo bộ lọc trên URL */
export function filterBooks(books: CatalogBook[], query: BrowseQuery): CatalogBook[] {
  const q = normalizeText(query.q);
  const result = booksOfType(books, query.type).filter(
    (book) =>
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
