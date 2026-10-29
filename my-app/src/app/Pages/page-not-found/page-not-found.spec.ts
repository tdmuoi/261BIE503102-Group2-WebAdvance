import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule, provideRouter } from '@angular/router';

import { PageNotFound } from './page-not-found';

describe('PageNotFound', () => {
  let fixture: ComponentFixture<PageNotFound>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PageNotFound],
      imports: [RouterModule],
      providers: [provideRouter([])],
      // app-suggested-books có test riêng
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(PageNotFound);
    await fixture.whenStable();
  });

  it('có nút về trang chủ và tìm sách', () => {
    const links = [...fixture.nativeElement.querySelectorAll('.empty-actions a')].map((a: Element) => a.getAttribute('href'));
    expect(links).toEqual(['/', '/books']);
  });
});
