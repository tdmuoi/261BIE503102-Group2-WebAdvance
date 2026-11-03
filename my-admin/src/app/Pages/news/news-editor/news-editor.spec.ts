import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { vi } from 'vitest';
import { NewsEditor } from './news-editor';
import { NewsArticle, NewsService, newsPayload } from '../news-service';
import { AdminAuthService } from '../../../services/admin-auth-service';
import { PageHeading } from '../../../Components/page-heading/page-heading';
import { StatusBadge } from '../../../Components/status-badge/status-badge';
const blankPage = {
  items: [],
  total: 0,
  categories: [],
  stats: { total: 0, draft: 0, published: 0, scheduled: 0, hidden: 0, views: 0 },
};
describe('NewsEditor', () => {
  let fixture: ComponentFixture<NewsEditor>;
  const params = new BehaviorSubject(convertToParamMap({}));
  const service = { list: vi.fn(() => of(blankPage)), save: vi.fn(), get: vi.fn() };
  beforeEach(async () => {
    params.next(convertToParamMap({}));
    service.save.mockReset();
    service.get.mockReset();
    await TestBed.configureTestingModule({
      declarations: [NewsEditor, PageHeading, StatusBadge],
      imports: [FormsModule, RouterModule],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: {
          paramMap: params.asObservable(), snapshot: { paramMap: convertToParamMap({}) },
        } },
        { provide: NewsService, useValue: service },
        { provide: AdminAuthService, useValue: { user: { fullName: 'Editor' } } },
      ],
    }).compileComponents();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(NewsEditor);
    fixture.detectChanges();
    await fixture.whenStable();
  });
  const form = () => ({ form: { markAllAsTouched() {} }, invalid: false }) as unknown as NgForm;
  afterEach(() => { fixture.destroy(); vi.restoreAllMocks(); });
  it('cancels stale article loads when the route ID changes and clears state for new articles', () => {
    const first = new Subject<NewsArticle>();
    const second = new Subject<NewsArticle>();
    service.get.mockReturnValueOnce(first).mockReturnValueOnce(second);
    params.next(convertToParamMap({ id: 'one' }));
    params.next(convertToParamMap({ id: 'two' }));
    second.next({ ...fixture.componentInstance.article, _id: 'two', title: 'Latest' });
    first.next({ ...fixture.componentInstance.article, _id: 'one', title: 'Stale' });
    expect(fixture.componentInstance.article._id).toBe('two');
    params.next(convertToParamMap({}));
    expect(fixture.componentInstance.article._id).toBeUndefined();
    expect(fixture.componentInstance.article.title).toBe('');
  });
  it('allows clean navigation but confirms dirty or pending saves and cancels the back button', () => {
    const editor = fixture.componentInstance;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(editor.canDeactivate()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    editor.dirty = true;
    expect(editor.canDeactivate()).toBe(false);
    editor.back();
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
    editor.dirty = false;
    editor.saving = true;
    expect(editor.canDeactivate()).toBe(false);
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('đang xử lý'));
  });
  it('clears dirty only after a successful save, leaving the route without a prompt', () => {
    const editor = fixture.componentInstance;
    const response = new Subject<NewsArticle>();
    editor.article.title = 'Draft';
    editor.dirty = true;
    service.save.mockReturnValue(response);
    editor.save('draft', form());
    expect(editor.dirty).toBe(true);
    response.next({ ...editor.article, _id: 'saved' });
    expect(editor.dirty).toBe(false);
    expect(editor.saving).toBe(false);
    const confirm = vi.spyOn(window, 'confirm');
    expect(editor.canDeactivate()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
  it('preserves paragraphs and literal markup in persisted plain-text content', () => {
    const editor = fixture.componentInstance;
    editor.assign({
      ...editor.article,
      _id: 'plain',
      title: 'Plain text',
      contentFormat: 'plain-text',
      content: '2 < 3 & 4\n\n<script>literal text</script>',
    });
    fixture.detectChanges();
    const body = fixture.nativeElement.querySelector('.body-editor') as HTMLElement;
    expect(body.querySelectorAll('p').length).toBe(2);
    expect(body.textContent).toContain('2 < 3 & 4');
    expect(body.textContent).toContain('<script>literal text</script>');
    expect(body.querySelector('script')).toBeNull();
    service.save.mockReturnValue(of({ ...editor.article }));
    editor.save('draft', form());
    expect(service.save).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('&lt;script&gt;') }),
    );
  });
  it('keeps legacy Base64 covers without sending large images back on edit', () => {
    const editor = fixture.componentInstance;
    const image = 'data:image/jpeg;base64,' + 'A'.repeat(150000);
    editor.assign({
      ...editor.article,
      _id: 'legacy',
      title: 'Legacy article',
      cover: image,
      img: image,
    });
    service.save.mockReturnValue(of({ ...editor.article }));
    editor.save('draft', form());
    const body = service.save.mock.calls[0][0];
    const payload = newsPayload(body);
    expect(body.preserveCover).toBe(true);
    expect(payload).not.toHaveProperty('cover');
    expect(payload).not.toHaveProperty('img');
    expect(JSON.stringify(payload).length).toBeLessThan(10000);
  });
  it('blocks saves when the original article could not be loaded', () => {
    const editor = fixture.componentInstance;
    editor.loadFailed = true;
    editor.article.title = 'Accidental replacement';
    editor.save('draft', form());
    expect(service.save).not.toHaveBeenCalled();
  });
  it('rejects an image known to have failed loading before publishing', () => {
    const editor = fixture.componentInstance;
    Object.assign(editor.article, {
      title: 'Review',
      category: 'Review sách',
      cover: 'https://example.test/broken.jpg',
      content: '<p>Content</p>',
    });
    editor.coverError = true;
    editor.save('published', form());
    expect(editor.error).toContain('Ảnh bìa');
    expect(service.save).not.toHaveBeenCalled();
  });
  it('renders the empty editor and never creates demo articles', () => {
    expect(fixture.nativeElement.querySelector('[aria-label="Nội dung bài viết"]')).toBeTruthy();
    expect(fixture.componentInstance.article.title).toBe('');
    expect(service.save).not.toHaveBeenCalled();
  });
  it('blocks publishing when cover/category/content are missing', () => {
    const editor = fixture.componentInstance;
    editor.article.title = 'Book review';
    editor.save('published', form());
    expect(editor.error).toContain('chuyên mục');
    expect(service.save).not.toHaveBeenCalled();
  });
  it('generates Vietnamese slugs and sends drafts through the service', () => {
    const editor = fixture.componentInstance;
    editor.article.title = 'Đọc sách cũ';
    editor.titleChanged();
    expect(editor.article.slug).toBe('doc-sach-cu');
    service.save.mockReturnValue(
      of({ ...editor.article, _id: 'test-id', updatedAt: new Date().toISOString() }),
    );
    editor.save('draft', form());
    expect(service.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft', title: 'Đọc sách cũ' }),
    );
    expect(editor.dirty).toBe(false);
  });
  it('converts scheduled publication using Vietnam timezone', () => {
    const editor = fixture.componentInstance;
    Object.assign(editor.article, {
      title: 'Review',
      content: '<p>Review</p>',
      category: 'Review sách',
      cover: '/images/cover.jpg',
      _id: 'test-id',
    });
    editor.schedule = true;
    editor.scheduleDate = '2099-01-01';
    editor.scheduleTime = '08:00';
    service.save.mockReturnValue(
      of({ ...editor.article, status: 'scheduled', publishedAt: '2099-01-01T01:00:00.000Z' }),
    );
    editor.save('published', form());
    expect(service.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'scheduled', publishedAt: '2099-01-01T01:00:00.000Z' }),
    );
  });
});
