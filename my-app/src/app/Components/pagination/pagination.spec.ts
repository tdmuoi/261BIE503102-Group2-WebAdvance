import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Pagination } from './pagination';

describe('Pagination', () => {
  let fixture: ComponentFixture<Pagination>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [Pagination] }).compileComponents();
    fixture = TestBed.createComponent(Pagination);
  });

  async function render(page: number, totalPages: number): Promise<string[]> {
    fixture.componentRef.setInput('page', page);
    fixture.componentRef.setInput('totalPages', totalPages);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    return [...el.querySelectorAll('.page-btn, .page-gap')].map((node) => node.textContent!.trim());
  }

  it('hiện giống Figma ở trang đầu: ‹ 1 2 3 … 21 ›', async () => {
    expect(await render(1, 21)).toEqual(['‹', '1', '2', '3', '…', '21', '›']);
  });

  it('trang giữa có dấu … hai bên', async () => {
    expect(await render(10, 21)).toEqual(['‹', '1', '…', '9', '10', '11', '…', '21', '›']);
  });

  it('chỉ 1 trang thì ẩn', async () => {
    expect(await render(1, 1)).toEqual([]);
  });

  it('bấm số trang thì báo trang mới', async () => {
    await render(1, 5);
    let selected = 0;
    fixture.componentInstance.pageChange.subscribe((page) => (selected = page));
    (fixture.nativeElement.querySelectorAll('.page-btn')[2] as HTMLButtonElement).click();
    expect(selected).toBe(2);
  });
});
