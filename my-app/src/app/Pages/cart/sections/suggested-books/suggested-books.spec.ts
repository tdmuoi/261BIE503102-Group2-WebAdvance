import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { CatalogBook } from '../../../../models/book';
import { BookService } from '../../../../services/book-service';
import { SuggestedBooks } from './suggested-books';

const book = (id: string, discountPercent: number) =>
  ({ _id: id, title: id, discountPercent, createdAt: '2026-01-01', stock: 5 }) as CatalogBook;

describe('SuggestedBooks', () => {
  let fixture: ComponentFixture<SuggestedBooks>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SuggestedBooks],
      providers: [
        { provide: BookService, useValue: { getCatalog: () => of({ books: [book('a', 0), book('b', 30), book('c', 10)], authors: [], categories: [] }) } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(SuggestedBooks);
    fixture.componentRef.setInput('excludeIds', ['c']);
    await fixture.whenStable();
  });

  it('ưu tiên sách giảm giá, bỏ sách đã có trong giỏ', () => {
    expect(fixture.componentInstance.books().map((b) => b._id)).toEqual(['b', 'a']);
  });
});
