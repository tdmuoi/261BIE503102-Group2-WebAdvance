import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterModule, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { Settings } from './settings';
import { SettingsService, SystemSettings } from './settings-service';
import { PageHeading } from '../../Components/page-heading/page-heading';
import { StatusBadge } from '../../Components/status-badge/status-badge';
import { ConfirmDialog } from '../../Components/confirm-dialog/confirm-dialog';
const stored: SystemSettings = {
  id: 'settings-id',
  revision: '2026-01-01T00:00:00.000Z',
  updatedBy: null,
  storageOnly: true,
  notice: 'Cấu hình thật từ API',
  unsupported: ['payments'],
  values: {
    storeName: '',
    slogan: '',
    supportEmail: '',
    hotline: '',
    logoUrl: '',
    language: 'Vietnamese',
    currency: '',
    timezone: '',
    shippingFee: null,
    freeShippingThreshold: null,
    processingDays: '',
    carriers: [],
    formats: [],
    freePreviewLimit: 10,
    deviceLimit: null,
    maxEbooksPerOrder: null,
  },
  paymentMethods: [
    { id: 'vnpay', name: 'Cổng VNPay', configured: true, description: 'QR ngân hàng' },
  ],
};
describe('Settings', () => {
  let fixture: ComponentFixture<Settings>;
  const service = { get: vi.fn(() => of(structuredClone(stored))), save: vi.fn() };
  beforeEach(async () => {
    service.get.mockReset().mockImplementation(() => of(structuredClone(stored)));
    service.save.mockReset();
    await TestBed.configureTestingModule({
      declarations: [Settings, PageHeading, StatusBadge, ConfirmDialog],
      imports: [FormsModule, RouterModule],
      providers: [provideRouter([]), { provide: SettingsService, useValue: service }],
    }).compileComponents();
    fixture = TestBed.createComponent(Settings);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });
  const form = (invalid = false) =>
    ({
      control: { markAllAsTouched() {} },
      form: { markAsPristine() {} },
      invalid,
      resetForm: vi.fn(),
    }) as unknown as NgForm;
  it('rejects a new logo that failed to load without making a request', () => {
    const page = fixture.componentInstance;
    page.values!.logoUrl = 'https://example.test/missing.png';
    page.logoError = true;
    page.save(form());
    expect(page.error).toContain('logo');
    expect(service.save).not.toHaveBeenCalled();
  });
  it('renders all six navigation groups and uses persisted values without demo defaults', () => {
    expect(fixture.nativeElement.querySelectorAll('.settings-nav>button').length).toBe(6);
    expect(fixture.componentInstance.values?.freePreviewLimit).toBe(10);
    expect(fixture.componentInstance.values?.shippingFee).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.switch:disabled').length).toBe(4);
    expect(service.save).not.toHaveBeenCalled();
  });
  it('sends only changed fields with the original revision', () => {
    const page = fixture.componentInstance;
    page.values!.slogan = 'Read together';
    service.save.mockReturnValue(
      of({ ...stored, values: { ...stored.values, slogan: 'Read together' } }),
    );
    page.save(form());
    expect(service.save).toHaveBeenCalledWith({ slogan: 'Read together' }, stored.revision);
    expect(page.dirty).toBe(false);
    expect(page.message).toContain('MongoDB');
  });
  it('blocks invalid forms and does not pretend unsupported functions were saved', () => {
    const page = fixture.componentInstance;
    page.values!.supportEmail = 'bad';
    page.save(form(true));
    expect(service.save).not.toHaveBeenCalled();
    page.unsupported('Thanh toán');
    expect(page.error).toContain('chưa hỗ trợ');
    expect(page.message).toBe('');
    expect(service.save).not.toHaveBeenCalled();
  });
  it('restores the last loaded configuration without writing to the backend', () => {
    const page = fixture.componentInstance;
    page.values!.shippingFee = 50000;
    page.toggle('carriers', 'GHN');
    expect(page.dirty).toBe(true);
    const f = form();
    page.cancel(f);
    expect(page.values?.shippingFee).toBeNull();
    expect(page.values?.carriers).toEqual([]);
    expect(page.dirty).toBe(false);
    expect(f.resetForm).toHaveBeenCalled();
    expect(service.save).not.toHaveBeenCalled();
  });
  it('retains changes after a concurrency failure and clears loading/saving state', () => {
    const page = fixture.componentInstance;
    page.values!.slogan = 'Unsaved';
    service.save.mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 409, error: { message: 'Cấu hình đã thay đổi' } }),
      ),
    );
    page.save(form());
    expect(page.saving).toBe(false);
    expect(page.dirty).toBe(true);
    expect(page.values?.slogan).toBe('Unsaved');
    expect(page.error).toContain('đã thay đổi');
  });
  it('shows API failures without fabricating configuration', () => {
    service.get.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    const failed = TestBed.createComponent(Settings);
    failed.detectChanges();
    expect(failed.componentInstance.values).toBeUndefined();
    expect(failed.componentInstance.loading).toBe(false);
    expect(failed.nativeElement.textContent).toContain('chưa được đăng ký');
    failed.destroy();
  });
});
