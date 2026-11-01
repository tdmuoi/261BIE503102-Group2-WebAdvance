import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, ParamMap } from '@angular/router';
import { of, BehaviorSubject, Subject } from 'rxjs';
import { vi } from 'vitest';
import { BuybackDetail } from './buyback-detail';
import { BuybackService, BuybackRequest } from '../buyback-service';
const row: BuybackRequest = {
  id: '1',
  code: 'REQ1',
  title: 'Book',
  sender: 'Customer',
  phone: '',
  email: '',
  sellerId: null,
  condition: 'Good',
  price: null,
  offerPrice: null,
  resalePrice: null,
  quantity: null,
  shipping: null,
  status: 'reviewing',
  date: '2026-01-01',
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
describe('BuybackDetail', () => {
  let fixture: ComponentFixture<BuybackDetail>;
  let params: BehaviorSubject<ParamMap>;
  const service = { get: vi.fn(), act: vi.fn() };
  beforeEach(async () => {
    params = new BehaviorSubject(convertToParamMap({ id: '1' }));
    service.get.mockReset().mockReturnValue(of({ ...row }));
    service.act.mockReset();
    await TestBed.configureTestingModule({
      declarations: [BuybackDetail],
      imports: [FormsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
        { provide: BuybackService, useValue: service },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(BuybackDetail);
    fixture.detectChanges();
    await fixture.whenStable();
  });
  it('loads the selected persisted request without inventing prices', () => {
    expect(service.get).toHaveBeenCalledWith('1');
    expect(fixture.componentInstance.buybackPrice()).toBe('');
    expect(fixture.componentInstance.resalePrice()).toBe('');
  });
  it('never applies a late save response to a different request route', () => {
    const pending = new Subject<BuybackRequest>();
    service.act.mockReturnValue(pending);
    const detail = fixture.componentInstance;
    detail.buybackPrice.set('50000');
    detail.resalePrice.set('80000');
    detail.act('quote');
    expect(detail.saving()).toBe(true);
    service.get.mockReturnValue(of({ ...row, id: '2', code: 'REQ2' }));
    params.next(convertToParamMap({ id: '2' }));
    pending.next({ ...row, offerPrice: 50000 });
    pending.complete();
    expect(detail.row()?.id).toBe('2');
    expect(detail.saving()).toBe(false);
    expect(detail.message()).toBe('');
  });
  it('requires rejection reason and valid valuation', () => {
    const page = fixture.componentInstance;
    page.act('reject');
    expect(service.act).not.toHaveBeenCalled();
    page.buybackPrice.set('100000');
    page.resalePrice.set('50000');
    page.act('quote');
    expect(service.act).not.toHaveBeenCalled();
    expect(page.error()).toContain('Giá');
  });
  it('can save the persisted offer price without requiring an unsaved resale estimate', () => {
    const page = fixture.componentInstance;
    page.buybackPrice.set('50000');
    page.resalePrice.set('');
    service.act.mockReturnValue(of({ ...row, offerPrice: 50000 }));
    page.act('quote');
    expect(service.act).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }), 'quote', {
      note: '',
      offerPrice: 50000,
    });
    expect(page.error()).toBe('');
  });
  it('sends valuation with the loaded record revision and waits for success', () => {
    const page = fixture.componentInstance;
    page.buybackPrice.set('50000');
    page.resalePrice.set('80000');
    service.act.mockReturnValue(of({ ...row, offerPrice: 50000, resalePrice: 80000 }));
    page.act('quote');
    expect(service.act).toHaveBeenCalledWith(
      expect.objectContaining({ id: '1', revision: null }),
      'quote',
      { note: '', offerPrice: 50000, resalePrice: 80000 },
    );
    expect(page.row()?.offerPrice).toBe(50000);
    expect(page.message()).toContain('Chưa gửi email');
  });
});
