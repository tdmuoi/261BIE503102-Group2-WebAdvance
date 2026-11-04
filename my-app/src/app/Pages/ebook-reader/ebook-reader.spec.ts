import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, RouterModule, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { User } from '../../models/user';
import { AuthService } from '../../services/auth-service';
import { resetMockOrders } from '../account/orders/orders.mock';
import { EbookReader, splitMarks } from './ebook-reader';
import { buildChapters, remainingLabel } from './ebook-reader.mock';

describe('EbookReader', () => {
  let fixture: ComponentFixture<EbookReader>;
  let component: EbookReader;
  let el: HTMLElement;
  const user = signal<User | null>({ _id: 'u1', fullName: 'Nguyễn Thùy Dung', email: 'a@b.c', phone: '0909123268' });

  async function setup(id: string) {
    localStorage.clear();
    resetMockOrders();
    await TestBed.configureTestingModule({
      declarations: [EbookReader],
      imports: [RouterModule],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user } },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id })) } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    vi.useFakeTimers();
    fixture = TestBed.createComponent(EbookReader);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
    vi.advanceTimersByTime(500);
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.useRealTimers();
    user.set({ _id: 'u1', fullName: 'Nguyễn Thùy Dung', email: 'a@b.c', phone: '0909123268' });
  });

  it('mở "Kitchen" đúng Figma: trang 58/140, Chương 3, đánh dấu trang 23, 47 và ghi chú trang 58', async () => {
    await setup('mock-kitchen-ebook');
    expect(component.status()).toBe('ready');
    expect(component.page()).toBe(58);
    expect(component.current().chapter.title).toBe('Chương 3');
    expect(el.querySelector('.progress-labels')?.textContent).toContain('Trang 58 / 140 · 42%');
    expect(component.remaining()).toBe('Còn khoảng 1 giờ 22 phút đọc');
    expect(component.marks().map((m) => m.label)).toEqual(['Trang 23', 'Trang 47', 'Ghi chú · trang 58']);
    expect(el.querySelector('.hl')?.textContent).toContain('Khi đọc, người dùng có thể bôi đen');
  });

  it('lật trang, nhảy chương, đánh dấu trang và lưu tiến độ', async () => {
    await setup('mock-kitchen-ebook');
    component.next();
    expect(component.page()).toBe(59);
    component.goTo(component.chapters()[4].startPage);
    expect(component.current().chapter.title).toBe('Chương 5');
    component.toggleBookmark();
    expect(component.bookmarked()).toBe(true);
    fixture.detectChanges();
    const saved = JSON.parse(localStorage.getItem('lightbook.reader.mock-kitchen-ebook') ?? '{}');
    expect(saved.page).toBe(80);
    expect(saved.bookmarks).toContain(80);
  });

  it('tuỳ chỉnh: cỡ chữ, nền tối, cuộn dọc hiện cả chương', async () => {
    await setup('mock-kitchen-ebook');
    component.setSetting('fontSize', 20);
    component.toggleDark();
    component.setSetting('mode', 'scroll');
    fixture.detectChanges();
    expect(el.querySelector('.reader')?.getAttribute('data-theme')).toBe('dark');
    expect(component.visiblePages().length).toBe(22); // Chương 3: trang 41–62
    expect(JSON.parse(localStorage.getItem('lightbook.reader.settings') ?? '{}')).toMatchObject({ fontSize: 20, theme: 'dark', mode: 'scroll' });
  });

  it('sách không có trong tủ → báo không tìm thấy; chưa đăng nhập → yêu cầu đăng nhập', async () => {
    await setup('khong-co');
    expect(component.status()).toBe('notfound');
    user.set(null);
    fixture.detectChanges();
    expect(component.status()).toBe('login');
    expect(el.querySelector('a.btn-pill')?.textContent).toContain('Đăng nhập');
  });

  it('hàm phụ: tô sáng, chia chương, thời gian còn lại', () => {
    expect(splitMarks('abc def ghi', ['def'])).toEqual([{ text: 'abc ', mark: false }, { text: 'def', mark: true }, { text: ' ghi', mark: false }]);
    expect(buildChapters(140).map((c) => c.startPage)).toEqual([1, 19, 41, 63, 80, 97, 113, 128]);
    expect(remainingLabel(80)).toBe('Còn khoảng 1 giờ 20 phút đọc');
    expect(remainingLabel(0)).toBe('Đã đến trang cuối');
  });
});
