import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { VndPipe } from '../../../../pipes/vnd-pipe';
import { makeBook, makeBooks } from '../../../../testing/mock-books';
import { HomeCombos } from './home-combos';

interface ComboShape {
  name: string;
  books: { _id: string }[];
  price: number;
  originalPrice: number;
}

describe('HomeCombos', () => {
  let fixture: ComponentFixture<HomeCombos>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([])],
      declarations: [HomeCombos, VndPipe],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(HomeCombos);
  });

  it('ghép combo từ sách thật, không trùng sách, giá thấp hơn giá gốc', async () => {
    fixture.componentRef.setInput('books', [
      makeBook({ _id: 'kid', title: 'Chuyện xóm gà - Lễ hội', price: 50000, originalPrice: 60000 }),
      ...makeBooks(10),
    ]);
    await fixture.whenStable();

    const combos = (fixture.componentInstance as unknown as { combos: () => ComboShape[] }).combos();
    expect(combos.length).toBe(3);
    expect(combos.find((combo) => combo.name === 'Đọc cùng con')!.books[0]._id).toBe('kid');

    const ids = combos.flatMap((combo) => combo.books.map((book) => book._id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const combo of combos) expect(combo.price).toBeLessThan(combo.originalPrice);
  });
});
