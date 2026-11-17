import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, RouterModule, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { User } from '../../models/user';
import { AuthService } from '../../services/auth-service';
import { provideFakeCustomerApi } from '../../testing/fake-customer-api';
import { EbookReader } from './ebook-reader';
import { PdfBook, PdfLoader, PdfOpenError } from './pdf-book';
import { chapterOf, remainingLabel, spreadPages, spreadStart } from './reader-state';

const QUOTE = 'Khi đọc, người dùng có thể bôi đen một câu để tô sáng, thêm ghi chú hoặc tra từ.';

/** PDF giả 140 trang (jsdom không vẽ được canvas): lớp chữ mỗi trang có 2 dòng */
function fakeBook(): PdfBook & { rendered: number[] } {
  const rendered: number[] = [];
  return {
    rendered,
    numPages: 140,
    async renderPage(n, _canvas, text) {
      rendered.push(n);
      text.innerHTML = `<span>Trang ${n} mở đầu</span><span>${n === 58 ? QUOTE : 'Dòng thường'}</span>`;
    },
    async pageRatio() {
      return 1.5;
    },
    async pageText(n) {
      return n === 90 ? 'Một buổi sáng ở căn bếp nhỏ' : `Nội dung trang ${n}`;
    },
    async outline() {
      return [{ title: 'Chương 1', page: 1 }, { title: 'Chương 2', page: 19 }, { title: 'Chương 3', page: 41 }, { title: 'Chương 4', page: 63 }];
    },
    destroy() {},
  };
}

describe('EbookReader', () => {
  let fixture: ComponentFixture<EbookReader>;
  let component: EbookReader;
  let el: HTMLElement;
  let book: ReturnType<typeof fakeBook>;
  let open: ReturnType<typeof vi.fn>;
  const user = signal<User | null>({ _id: 'u1', fullName: 'Nguyễn Thùy Dung', email: 'a@b.c', phone: '0909123268' });

  async function setup(id: string, opener?: () => Promise<PdfBook>) {
    localStorage.clear();
    book = fakeBook();
    open = vi.fn(opener ?? (async () => book));
    await TestBed.configureTestingModule({
      imports: [RouterModule, EbookReader],
      providers: [
        provideRouter([]),
        provideFakeCustomerApi(),
        { provide: AuthService, useValue: { user, isLoggedIn: () => !!user(), token: 'f'.repeat(64) } },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id })) } },
        { provide: PdfLoader, useValue: { open } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    vi.useFakeTimers();
    fixture = TestBed.createComponent(EbookReader);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(500); // tủ sách
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(500); // tiến độ trên server + mở PDF
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(10); // vẽ trang
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.useRealTimers();
    user.set({ _id: 'u1', fullName: 'Nguyễn Thùy Dung', email: 'a@b.c', phone: '0909123268' });
  });

  it('mở PDF của sách trong tủ: trang 58/140, mục lục từ PDF, đánh dấu và tô sáng trên lớp chữ', async () => {
    await setup('kitchen-ebook');
    expect(open).toHaveBeenCalledWith('kitchen-ebook');
    expect(component.status()).toBe('ready');
    expect(component.page()).toBe(58);
    expect(component.chapter()?.title).toBe('Chương 3');
    expect(el.querySelector('.progress-labels')?.textContent).toContain('Trang 58 / 140 · 42%');
    expect(component.remaining()).toBe('Còn khoảng 1 giờ 22 phút đọc');
    expect(component.marks().map((m) => m.label)).toEqual(['Trang 23', 'Trang 47', 'Ghi chú · trang 58']);
    expect(book.rendered).toContain(58);
    expect(el.querySelector('.textLayer .hl')?.textContent).toBe(QUOTE);
  });

  it('lật trang, nhảy theo mục lục, đánh dấu trang và lưu tiến độ', async () => {
    await setup('kitchen-ebook');
    component.next();
    expect(component.page()).toBe(59);
    component.goTo(component.chapters()[3].startPage);
    expect(component.chapter()?.title).toBe('Chương 4');
    component.toggleBookmark();
    expect(component.bookmarked()).toBe(true);
    fixture.detectChanges();
    const saved = JSON.parse(localStorage.getItem('lightbook.reader.kitchen-ebook') ?? '{}');
    expect(saved.page).toBe(63);
    expect(saved.bookmarks).toContain(63);
  });

  it('lật trang trên màn hình rộng: mở 2 trang, lật theo cặp, có hiệu ứng lật', async () => {
    await setup('kitchen-ebook');
    component.columnWidth.set(1200);
    fixture.detectChanges();
    expect(component.twoUp()).toBe(true);
    expect(component.visiblePages()).toEqual([57, 58]);
    expect(component.pageLabel()).toBe('57–58');
    component.next();
    fixture.detectChanges();
    expect(component.page()).toBe(59);
    expect(component.visiblePages()).toEqual([59, 60]);
    expect(component.flip()).toBe('next');
    expect(el.querySelector('article.turn-next')?.getAttribute('data-page')).toBe('59');
    expect(el.querySelectorAll('article.is-left, article.is-right').length).toBe(2);
    await vi.advanceTimersByTimeAsync(700);
    expect(component.flip()).toBeNull();
    component.prev();
    expect(component.visiblePages()).toEqual([57, 58]);
    expect(component.flip()).toBe('prev');
  });

  it('tuỳ chỉnh: thu phóng, nền tối, cuộn dọc rộng cả cột và cuộn liền cả cuốn', async () => {
    await setup('kitchen-ebook');
    component.columnWidth.set(1200);
    component.setSetting('zoom', 120);
    component.toggleDark();
    component.setSetting('mode', 'scroll');
    fixture.detectChanges();
    expect(el.querySelector('.reader')?.getAttribute('data-theme')).toBe('dark');
    expect(component.twoUp()).toBe(false);
    expect(component.visiblePages().length).toBe(140);
    component.setSetting('zoom', 100);
    expect(component.pageWidth()).toBe(1192); // cả cột đọc
    expect(component.pageHeight()).toBe(1788); // giữ chỗ theo tỉ lệ trang PDF
    component.next();
    expect(component.page()).toBe(59);
    fixture.detectChanges();
    expect(JSON.parse(localStorage.getItem('lightbook.reader.settings') ?? '{}')).toMatchObject({ zoom: 100, theme: 'dark', mode: 'scroll' });
  });

  it('tìm trong sách đọc chữ của từng trang PDF', async () => {
    await setup('kitchen-ebook');
    component.query.set('căn bếp');
    fixture.detectChanges();
    expect(component.searchResults().searching).toBe(true);
    await vi.advanceTimersByTimeAsync(400);
    expect(component.searchResults().items.map((r) => r.page)).toEqual([90]);
  });

  it('server từ chối file PDF → báo lỗi, có nút thử lại', async () => {
    await setup('kitchen-ebook', () => Promise.reject(new PdfOpenError('Ebook này chưa có trong tủ sách của bạn hoặc chưa có file PDF.')));
    expect(component.status()).toBe('pdferror');
    expect(component.pdfError()).toContain('chưa có file PDF');
  });

  it('sách không có trong tủ → báo không tìm thấy, không tải PDF; chưa đăng nhập → yêu cầu đăng nhập', async () => {
    await setup('khong-co');
    expect(component.status()).toBe('notfound');
    expect(open).not.toHaveBeenCalled();
    user.set(null);
    fixture.detectChanges();
    expect(component.status()).toBe('login');
    expect(el.querySelector('a.btn-pill')?.textContent).toContain('Đăng nhập');
  });

  it('hàm phụ: cặp trang khi lật, mục lục, thời gian còn lại', () => {
    expect(spreadStart(58)).toBe(57);
    expect(spreadStart(57)).toBe(57);
    expect(spreadPages(58, 140, true)).toEqual([57, 58]);
    expect(spreadPages(139, 139, true)).toEqual([139]);
    expect(spreadPages(58, 140, false)).toEqual([58]);
    expect(chapterOf([{ index: 1, title: 'A', startPage: 5 }], 3)).toBeNull();
    expect(remainingLabel(80)).toBe('Còn khoảng 1 giờ 20 phút đọc');
    expect(remainingLabel(0)).toBe('Đã đến trang cuối');
  });
});
