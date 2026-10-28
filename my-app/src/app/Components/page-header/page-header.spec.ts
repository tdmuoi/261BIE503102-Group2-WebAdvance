import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { of } from 'rxjs';

import { Catalog } from '../../models/book';
import { BookService } from '../../services/book-service';
import { CartService } from '../../services/cart-service';
import { makeBook } from '../../testing/mock-books';
import { BrowseMenu } from '../browse-menu/browse-menu';
import { PageHeader } from './page-header';

describe('PageHeader', () => {
  let fixture: ComponentFixture<PageHeader>;

  const catalog: Catalog = {
    books: [
      { ...makeBook({ _id: 'b1' }), categorySlug: 'van-hoc', type: 'new' },
      { ...makeBook({ _id: 'b2' }), categorySlug: 'van-hoc', type: 'new' },
      { ...makeBook({ _id: 'b3' }), categorySlug: 'uncategorized', type: 'new' },
    ],
    authors: [],
    categories: [{ _id: 'c1', name: 'Văn học', slug: 'van-hoc' }],
  };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([])],
      declarations: [PageHeader, BrowseMenu],
      providers: [{ provide: BookService, useValue: { getCatalog: () => of(catalog) } }],
    }).compileComponents();

    fixture = TestBed.createComponent(PageHeader);
    await fixture.whenStable();
  });

  const el = () => fixture.nativeElement as HTMLElement;

  it('hiện số cuốn trong giỏ trên icon giỏ hàng', async () => {
    expect(el().querySelector('.cart-count')).toBeNull();

    TestBed.inject(CartService).add(makeBook(), 3);
    await fixture.whenStable();

    expect(el().querySelector('.cart-count')?.textContent?.trim()).toBe('3');
  });

  it('rê chuột vào Browse Book mở dropdown 3 loại sách và thể loại nổi bật', async () => {
    el().querySelector('.nav-link-menu')!.dispatchEvent(new MouseEvent('mouseenter'));
    await fixture.whenStable();

    const options = [...el().querySelectorAll('.menu-option')].map((a) => a.getAttribute('href'));
    expect(options).toEqual(['/books?type=new', '/books?type=used', '/books?type=ebook']);
    // Bỏ qua "Chưa phân loại"; DB chưa có bookType nên không hiện số đếm
    expect(el().querySelector('.menu-genre')?.textContent?.trim()).toBe('Văn học');
    expect(el().querySelector('.menu-count')).toBeNull();
  });

  it('nhấn Escape đóng dropdown', async () => {
    el().querySelector('.nav-link-menu')!.dispatchEvent(new MouseEvent('mouseenter'));
    await fixture.whenStable();
    el().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();

    expect(el().querySelector('app-browse-menu')).toBeNull();
  });
});
