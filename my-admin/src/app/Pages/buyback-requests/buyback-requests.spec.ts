import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { BuybackRequests } from './buyback-requests';
import { BuybackService, BuybackRequest } from './buyback-service';
const row: BuybackRequest = {
  id: '1',
  code: 'REQ1',
  title: 'Book',
  sender: 'Customer',
  phone: '0900',
  email: '',
  sellerId: null,
  condition: 'Good',
  price: null,
  offerPrice: null,
  resalePrice: null,
  quantity: null,
  shipping: null,
  status: 'pending',
  date: '2026-01-01T00:00:00Z',
  cover: '',
  coverText: '',
  images: [],
  note: '',
  adminNote: '',
  isDemo: false,
  imageIsCatalogCover: false,
  conditionVerified: false,
  photosVerified: false,
  revision: null,
};
describe('BuybackRequests API logic', () => {
  let fixture: ComponentFixture<BuybackRequests>;
  const service = { list: vi.fn(), act: vi.fn() };
  beforeEach(async () => {
    service.list
      .mockReset()
      .mockReturnValue(of({ items: [{ ...row }], total: 1, notice: 'Stored data' }));
    service.act.mockReset();
    await TestBed.configureTestingModule({
      declarations: [BuybackRequests],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [provideRouter([]), { provide: BuybackService, useValue: service }],
    }).compileComponents();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(BuybackRequests);
    fixture.detectChanges();
  });
  it('loads persisted rows and retains unknown price/quantity/shipping', () => {
    expect(fixture.componentInstance.requests()[0].price).toBeNull();
    expect(fixture.componentInstance.money(null)).toContain('định giá');
    expect(service.act).not.toHaveBeenCalled();
  });
  it('does not change a status before the backend confirms', () => {
    const result = new Subject<BuybackRequest>();
    service.act.mockReturnValue(result);
    const page = fixture.componentInstance;
    page.approve('1');
    expect(page.requests()[0].status).toBe('pending');
    expect(page.saving()).toBe(true);
    result.next({ ...row, status: 'reviewing' });
    result.complete();
    expect(page.requests()[0].status).toBe('reviewing');
    expect(page.saving()).toBe(false);
  });
  it('does not re-approve processed requests or delete persisted history', () => {
    const page = fixture.componentInstance;
    page.requests.set([{ ...row, status: 'paid' }]);
    page.approve('1');
    page.askDelete(['1']);
    expect(service.act).not.toHaveBeenCalled();
    expect(page.requests().length).toBe(1);
  });
  it('keeps state unchanged when a mutation fails', () => {
    service.act.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'Changed' } })),
    );
    const page = fixture.componentInstance;
    page.approve('1');
    expect(page.requests()[0].status).toBe('pending');
    expect(page.error()).toContain('Changed');
    expect(page.saving()).toBe(false);
  });
  it('filters persisted data and resets selection/page', () => {
    const page = fixture.componentInstance;
    page.page.set(3);
    page.toggle('1');
    page.onSearch('REQ1');
    expect(page.page()).toBe(1);
    expect(page.selectedIds()).toEqual([]);
    expect(page.visibleRequests().length).toBe(1);
    page.setStatus('paid');
    expect(page.visibleRequests()).toEqual([]);
  });
  it('opens the route with the database ID', () => {
    fixture.componentInstance.openDetails(row);
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/buyback-detail', '1']);
  });
});
