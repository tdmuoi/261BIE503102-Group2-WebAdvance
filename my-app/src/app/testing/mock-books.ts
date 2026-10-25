import { BookView } from '../models/book';

/** Tạo sách giả cho unit test */
export function makeBook(overrides: Partial<BookView> = {}): BookView {
  return {
    _id: 'b1',
    title: 'Sách thử',
    image: 'https://example.com/cover.jpg',
    authorId: 'a1',
    categoryId: 'c1',
    price: 80000,
    originalPrice: 100000,
    discountPercent: 20,
    stock: 10,
    status: 'active',
    isbn: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    authorName: 'Tác giả thử',
    categoryName: 'Văn học',
    ...overrides,
  };
}

/** Danh sách n sách khác nhau, sách sau mới hơn sách trước */
export function makeBooks(count: number): BookView[] {
  return Array.from({ length: count }, (_, i) =>
    makeBook({
      _id: `b${i + 1}`,
      title: `Sách số ${i + 1}`,
      image: `https://example.com/cover-${i + 1}.jpg`,
      price: 10000 * (i + 1),
      originalPrice: 12000 * (i + 1),
      createdAt: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(),
      updatedAt: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(),
    }),
  );
}
