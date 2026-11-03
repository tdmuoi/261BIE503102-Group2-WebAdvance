import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { pendingChangesGuard } from './pending-changes-guard';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { By } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AdminLayout } from '../../Components/admin-layout/admin-layout';
import { PageHeading } from '../../Components/page-heading/page-heading';
import { StatusBadge } from '../../Components/status-badge/status-badge';
import { ConfirmDialog } from '../../Components/confirm-dialog/confirm-dialog';
import { AdminAuthService } from '../../services/admin-auth-service';
import { NewsEditor } from '../news/news-editor/news-editor';
import { NewsService } from '../news/news-service';
import { Settings } from './settings';
import { SettingsService, SystemSettings } from './settings-service';

@Component({ template: '' })
class FormPage {
  allowLeave = false;
  canDeactivate() { return this.allowLeave; }
}
@Component({ template: '' })
class Destination {}

describe('pendingChangesGuard router integration (isolated routes)', () => {
  it('keeps the current URL when declined and navigates only when accepted', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([
      { path: 'form', component: FormPage, canDeactivate: [pendingChangesGuard] },
      { path: 'destination', component: Destination },
    ])] });
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/form', FormPage);
    const router = TestBed.inject(Router);
    expect(await router.navigateByUrl('/destination')).toBe(false);
    expect(router.url).toBe('/form');
    page.allowLeave = true;
    expect(await router.navigateByUrl('/destination')).toBe(true);
    expect(router.url).toBe('/destination');
  });
  it('also protects parameter changes when Angular reuses the form component', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([
      { path: 'form/:id', component: FormPage, canDeactivate: [pendingChangesGuard] },
    ])] });
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/form/one', FormPage);
    const router = TestBed.inject(Router);
    expect(await router.navigateByUrl('/form/two')).toBe(false);
    expect(router.url).toBe('/form/one');
    page.allowLeave = true;
    expect(await router.navigateByUrl('/form/two')).toBe(true);
    expect(router.url).toBe('/form/two');
  });
});

// Real layout/form components, but isolated route configuration and mocked APIs.
// This verifies the proposed registration; it does not register the application routes.
describe('pendingChangesGuard with News, Settings and the existing sidebar', () => {
  const stored: SystemSettings = {
    id: 'settings', revision: null, updatedBy: null, paymentMethods: [],
    storageOnly: true, notice: '', unsupported: [],
    values: {
      storeName: 'Lightbook', slogan: '', supportEmail: '', hotline: '', logoUrl: '',
      language: 'Vietnamese', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh',
      shippingFee: null, freeShippingThreshold: null, processingDays: '', carriers: [],
      formats: [], freePreviewLimit: null, deviceLimit: null, maxEbooksPerOrder: null,
    },
  };
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FormsModule, RouterModule],
      declarations: [AdminLayout, NewsEditor, Settings, PageHeading, StatusBadge, ConfirmDialog],
      providers: [
        provideRouter([{ path: '', component: AdminLayout, children: [
          { path: 'accounts', component: Destination },
          { path: 'news-list', component: Destination },
          { path: 'news-editor/:id', component: NewsEditor, canDeactivate: [pendingChangesGuard] },
          { path: 'settings', component: Settings, canDeactivate: [pendingChangesGuard] },
        ] }]),
        provideLocationMocks(),
        { provide: AdminAuthService, useValue: { user: {
          fullName: 'Test Admin', roleName: 'Admin', email: 'admin@example.invalid',
        } } },
        { provide: NewsService, useValue: {
          list: () => of({ categories: [] }),
          get: (id: string) => of({
            _id: id, title: 'Loaded article', content: '<p>Body</p>', contentFormat: 'html',
            desc: '', cover: '', category: '', tags: [], slug: '', metaDescription: '', status: 'draft',
          }),
        } },
        { provide: SettingsService, useValue: { get: () => of(structuredClone(stored)) } },
      ],
    });
  });
  afterEach(() => vi.restoreAllMocks());

  async function sidebar(harness: RouterTestingHarness, path: string) {
    const link = harness.routeNativeElement!.querySelector<HTMLAnchorElement>(`a.nav-item[href="${path}"]`)!;
    expect(link).not.toBeNull();
    link.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
  it('preserves News on cancelled sidebar, Back and ID changes; clean/confirmed exits do not loop', async () => {
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await harness.navigateByUrl('/news-list');
    await harness.navigateByUrl('/news-editor/one');
    const editor = harness.routeDebugElement!.query(By.directive(NewsEditor)).componentInstance as NewsEditor;
    editor.article.title = 'Unsaved title';
    editor.dirty = true;
    await sidebar(harness, '/accounts');
    expect(router.url).toBe('/news-editor/one');
    expect(editor.article.title).toBe('Unsaved title');
    expect(await router.navigateByUrl('/news-editor/two')).toBe(false);
    expect(editor.article._id).toBe('one');
    TestBed.inject(Location).back();
    await harness.fixture.whenStable();
    expect(router.url).toBe('/news-editor/one');
    expect(editor.article.title).toBe('Unsaved title');
    confirm.mockClear().mockReturnValue(true);
    editor.back();
    await harness.fixture.whenStable();
    expect(router.url).toBe('/news-list');
    expect(confirm).toHaveBeenCalledTimes(1);
    await harness.navigateByUrl('/news-editor/one');
    confirm.mockClear();
    await sidebar(harness, '/accounts');
    expect(router.url).toBe('/accounts');
    expect(confirm).not.toHaveBeenCalled();
  });
  it('preserves Settings on cancelled sidebar/Back, and allows clean or confirmed route changes', async () => {
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await harness.navigateByUrl('/accounts');
    await harness.navigateByUrl('/settings');
    const settings = harness.routeDebugElement!.query(By.directive(Settings)).componentInstance as Settings;
    settings.values!.slogan = 'Unsaved slogan';
    await sidebar(harness, '/accounts');
    expect(router.url).toBe('/settings');
    TestBed.inject(Location).back();
    await harness.fixture.whenStable();
    expect(router.url).toBe('/settings');
    expect(settings.values!.slogan).toBe('Unsaved slogan');
    confirm.mockReturnValue(true);
    expect(await router.navigateByUrl('/news-list')).toBe(true);
    expect(router.url).toBe('/news-list');
    await harness.navigateByUrl('/settings');
    confirm.mockClear();
    await sidebar(harness, '/accounts');
    expect(router.url).toBe('/accounts');
    expect(confirm).not.toHaveBeenCalled();
  });
});
