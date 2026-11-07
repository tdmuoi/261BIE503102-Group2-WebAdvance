import { convertToParamMap } from '@angular/router';

import { CatalogBook } from '../../models/book';
import { makeBook } from '../../testing/mock-books';
import { filterBooks, parseQuery, toParams } from './browse-query';

const book = (overrides: Partial<CatalogBook>): CatalogBook => ({
  ...makeBook(overrides),
  categorySlug: 'van-hoc',
  type: 'new',
  ...overrides,
});

describe('browse-query', () => {
  it('đọc được link từ thanh tìm kiếm trang chủ (type=paper, price=a-b)', () => {
    const query = parseQuery(convertToParamMap({ type: 'paper', price: '100000-200000', q: 'Kitchen', page: '2' }));
    expect(query).toEqual(expect.objectContaining({ types: ['new'], minPrice: 100000, maxPrice: 200000, q: 'Kitchen', page: 2 }));
  });

  it('giá trị lạ thì về mặc định', () => {
    const query = parseQuery(convertToParamMap({ type: 'abc', sort: 'xyz', page: '-3', price: 'foo' }));
    expect(query).toEqual(expect.objectContaining({ types: [], sort: 'newest', page: 1, minPrice: null, maxPrice: null }));
  });

  it('ghi URL gọn, bỏ giá trị mặc định, đọc lại ra đúng bộ lọc', () => {
    const query = parseQuery(convertToParamMap({ type: 'used', author: 'a1,a2', price: '-200000', sort: 'price-asc' }));
    const params = toParams(query);
    expect(params).toEqual({ type: 'used', author: 'a1,a2', price: '-200000', sort: 'price-asc' });
    expect(parseQuery(convertToParamMap(params))).toEqual(query);
  });

  it('chọn nhiều loại và nhiều tình trạng, ghi rồi đọc lại đúng bộ lọc', () => {
    const query = parseQuery(convertToParamMap({ type: 'new,used,abc,used', condition: 'good,fair' }));
    expect(query).toEqual(expect.objectContaining({ types: ['new', 'used'], conditions: ['good', 'fair'] }));
    expect(toParams(query)).toEqual({ type: 'new,used', condition: 'good,fair' });
  });

  it('lọc nhiều loại sách và nhiều tình trạng cùng lúc', () => {
    const books = [
      book({ _id: '1' }),
      book({ _id: '2', type: 'ebook' }),
      book({ _id: '3', type: 'used', condition: 'good' }),
      book({ _id: '4', type: 'used', condition: 'fair' }),
      book({ _id: '5', type: 'used', condition: 'like-new' }),
    ];
    const ids = (params: Record<string, string>) =>
      filterBooks(books, parseQuery(convertToParamMap(params))).map((b) => b._id).sort();

    expect(ids({ type: 'new,ebook' })).toEqual(['1', '2']);
    expect(ids({ type: 'used', condition: 'good,fair' })).toEqual(['3', '4']);
  });

  it('lọc theo loại, tác giả, giá, tìm không dấu và sắp xếp', () => {
    const books = [
      book({ _id: '1', title: 'Kỹ năng sống', authorId: 'a1', price: 50000 }),
      book({ _id: '2', title: 'Kỹ năng mềm', authorId: 'a2', price: 150000 }),
      book({ _id: '3', title: 'Kỹ năng cũ', authorId: 'a1', price: 90000, type: 'used' }),
      book({ _id: '4', title: 'Truyện', authorId: 'a1', price: 70000 }),
    ];
    const query = parseQuery(convertToParamMap({ type: 'new', q: 'ky nang', price: '0-200000', sort: 'price-desc' }));
    expect(filterBooks(books, query).map((b) => b._id)).toEqual(['2', '1']);

    const byAuthor = parseQuery(convertToParamMap({ author: 'a1', sort: 'price-asc' }));
    expect(filterBooks(books, byAuthor).map((b) => b._id)).toEqual(['1', '4', '3']);
  });
});
