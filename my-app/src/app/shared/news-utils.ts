import { CatalogBook } from '../models/book';
import { NewsItem } from '../models/content';

export const DEFAULT_NEWS_COVER = 'images/news/default.svg';

const CATEGORY_COVERS = new Set(['cong-nghe', 'cam-hung', 'ebook', 'goi-y-sach', 'huong-dan', 'sach-cu', 'su-kien', 'thanh-ly', 'xu-huong']);

export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
}

export function categorySlug(category: string): string {
  return fold(category).trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function categoryLabel(category: string): string {
  const text = category.trim();
  return text === text.toUpperCase() ? text.charAt(0) + text.slice(1).toLowerCase() : text;
}

export function newsCover(item: NewsItem): string {
  if (item.cover || item.img) return (item.cover || item.img)!;
  return fallbackCover(item);
}

export function fallbackCover(item: NewsItem): string {
  const slug = item.category ? categorySlug(item.category) : '';
  return CATEGORY_COVERS.has(slug) ? `images/news/${slug}.svg` : DEFAULT_NEWS_COVER;
}

export function newsDate(item: NewsItem): string {
  const iso = item.publishedAt || item.createdAt;
  return iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function articleHtml(item: NewsItem): string {
  const content = (item.content ?? '').trim();
  const isHtml = item.contentFormat !== 'plain-text' && /<\/?[a-z][\s\S]*>/i.test(content);
  if (isHtml) return content;
  return content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function titleKey(text: string): string {
  return fold(text).replace(/\s+/g, ' ').trim();
}

export function mentionedBooks(item: NewsItem, books: CatalogBook[]): CatalogBook[] {
  if (item.bookIds?.length) {
    return item.bookIds.map((id) => books.find((b) => b._id === id)).filter((b): b is CatalogBook => !!b);
  }
  const text = `${item.title} ${(item.content ?? '').replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"')}`;
  const quoted = [...text.matchAll(/["“]([^"”\n]{2,120})["”]/g)].map((m) => titleKey(m[1]));
  if (!quoted.length) return [];

  const typeOrder = { new: 0, ebook: 1, used: 2 };
  const byKey = new Map<string, CatalogBook>();
  for (const book of [...books].sort((a, b) => typeOrder[a.type] - typeOrder[b.type])) {
    for (const key of [titleKey(book.title), titleKey(book.title.split(':')[0])]) {
      if (key && !byKey.has(key)) byKey.set(key, book);
    }
  }

  const found = new Map<string, CatalogBook>();
  for (const phrase of quoted) {
    const book = byKey.get(phrase);
    if (book && !found.has(book._id)) found.set(book._id, book);
  }
  return [...found.values()];
}
