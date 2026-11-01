import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterModule, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { NewsEditor } from './news-editor';
import { NewsService, newsPayload } from '../news-service';
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
  const service = { list: vi.fn(() => of(blankPage)), save: vi.fn() };
  beforeEach(async () => {
    service.save.mockReset();
    await TestBed.configureTestingModule({
      declarations: [NewsEditor, PageHeading, StatusBadge],
      imports: [FormsModule, RouterModule],
      providers: [
        provideRouter([]),
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
