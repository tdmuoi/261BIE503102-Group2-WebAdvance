import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { VndPipe } from '../../../../pipes/vnd-pipe';
import { BookService } from '../../../../services/book-service';
import { CartService } from '../../../../services/cart-service';
import { BuyAgainDrawer } from './buy-again-drawer';

describe('BuyAgainDrawer', () => {
  let fixture: ComponentFixture<BuyAgainDrawer>;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      declarations: [BuyAgainDrawer, VndPipe],
      imports: [RouterModule],
      providers: [provideRouter([]), { provide: BookService, useValue: { getCatalog: () => of({ books: [], authors: [], categories: [] }) } }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(BuyAgainDrawer);
    fixture.componentRef.setInput('book', { _id: 'ove', title: 'Người Đàn Ông Mang Tên Ove', image: 'ove.png', price: 115000 });
    fixture.detectChanges();
  });

  it('mở ra là thêm sách vào giỏ và hiện thông báo đã thêm', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(TestBed.inject(CartService).quantityOf('ove')).toBe(1);
    expect(el.querySelector('.title')?.textContent).toContain('Giỏ hàng (1)');
    expect(el.querySelector('.added')?.textContent).toContain('Đã thêm “Người Đàn Ông Mang Tên Ove” vào giỏ');
    expect(el.querySelector('.total')?.textContent).toContain('145.000');
  });
});
