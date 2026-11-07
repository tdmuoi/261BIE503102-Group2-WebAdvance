import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { convertToParamMap } from '@angular/router';

import { parseQuery } from '../../browse-query';
import { BrowseFilters, FilterChange } from './browse-filters';

describe('BrowseFilters', () => {
  let fixture: ComponentFixture<BrowseFilters>;

  async function open(params: Record<string, string>) {
    await TestBed.configureTestingModule({
      declarations: [BrowseFilters],
      // app-browse-price có test riêng
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(BrowseFilters);
    fixture.componentRef.setInput('query', parseQuery(convertToParamMap(params)));
    fixture.componentRef.setInput('types', [
      { id: 'new', label: 'Sách mới', count: 154 },
      { id: 'used', label: 'Sách cũ', count: 47 },
      { id: 'ebook', label: 'Sách điện tử', count: 5 },
    ]);
    fixture.componentRef.setInput('conditions', [
      { id: 'good', label: 'Tốt', count: 30 },
      { id: 'fair', label: 'Khá', count: 17 },
    ]);
    fixture.componentRef.setInput('authors', []);
    await fixture.whenStable();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const box = (label: string) =>
    [...el().querySelectorAll('label.check')]
      .find((item) => item.textContent?.includes(label))
      ?.querySelector('input') as HTMLInputElement | undefined;

  it('vào từ menu "Sách mới" thì ô Sách mới đã tích sẵn', async () => {
    await open({ type: 'new' });
    expect(box('Sách mới')?.checked).toBe(true);
    expect(box('Sách cũ')?.checked).toBe(false);
    expect(box('Sách điện tử')?.checked).toBe(false);
  });

  it('chỉ hiện nhóm Tình trạng khi có chọn sách cũ', async () => {
    await open({ type: 'new' });
    expect(box('Tốt')).toBeUndefined();

    box('Sách cũ')!.click();
    await fixture.whenStable();
    expect(box('Tốt')).toBeDefined();
  });

  it('chọn được nhiều loại và nhiều tình trạng rồi mới áp dụng', async () => {
    await open({ type: 'used' });
    const changes: FilterChange[] = [];
    fixture.componentInstance.apply.subscribe((change) => changes.push(change));

    box('Sách mới')!.click();
    box('Tốt')!.click();
    box('Khá')!.click();
    await fixture.whenStable();
    expect(changes).toEqual([]);

    (el().querySelector('.filters-apply') as HTMLButtonElement).click();
    expect(changes[0]).toEqual(expect.objectContaining({ types: ['used', 'new'], conditions: ['good', 'fair'] }));
  });
});
