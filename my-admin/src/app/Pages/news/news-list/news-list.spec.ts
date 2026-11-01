import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterModule, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { NewsList } from './news-list';
import { NewsService } from '../news-service';
import { PageHeading } from '../../../Components/page-heading/page-heading';
import { StatCard } from '../../../Components/stat-card/stat-card';
import { StatusBadge } from '../../../Components/status-badge/status-badge';
import { Pagination } from '../../../Components/pagination/pagination';
const page = {
  items: [],
  total: 0,
  categories: ['Review sách'],
  stats: { total: 0, published: 0, scheduled: 0, draft: 0, hidden: 0, views: 0 },
};
describe('NewsList', () => {
  let fixture: ComponentFixture<NewsList>;
  const service = { list: vi.fn(() => of(page)) };
  beforeEach(async () => {
    service.list.mockReset().mockReturnValue(of(page));
    await TestBed.configureTestingModule({
      declarations: [NewsList, PageHeading, StatCard, StatusBadge, Pagination],
      imports: [FormsModule, RouterModule],
      providers: [provideRouter([]), { provide: NewsService, useValue: service }],
    }).compileComponents();
    fixture = TestBed.createComponent(NewsList);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });
  it('renders a true empty state', () => {
    expect(fixture.nativeElement.textContent).toContain('Không có bài viết phù hợp');
  });
  it('sends search, filters and pagination to the API', () => {
    const list = fixture.componentInstance;
    list.search = ' sách ';
    list.category = 'Review sách';
    list.status = 'draft';
    list.load(3);
    expect(service.list).toHaveBeenLastCalledWith({
      search: 'sách',
      category: 'Review sách',
      status: 'draft',
      limit: 10,
      skip: 20,
    });
  });
  it('clears stale data and displays permission errors', () => {
    service.list.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    fixture.componentInstance.load();
    fixture.detectChanges();
    expect(fixture.componentInstance.data).toBeUndefined();
    expect(fixture.nativeElement.textContent).toContain('chưa có quyền');
  });
});
