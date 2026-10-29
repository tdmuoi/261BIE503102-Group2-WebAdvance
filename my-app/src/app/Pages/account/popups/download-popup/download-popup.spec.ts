import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ToastService } from '../../../../services/toast-service';
import { DownloadPopup, formatSize } from './download-popup';

describe('DownloadPopup', () => {
  let fixture: ComponentFixture<DownloadPopup>;
  let component: DownloadPopup;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [DownloadPopup] }).compileComponents();
    fixture = TestBed.createComponent(DownloadPopup);
    fixture.componentRef.setInput('ebook', {
      bookId: 'k', title: 'Kitchen', image: '', author: 'Banana Yoshimoto', translator: 'Lương Việt Dũng',
      purchasedAt: '2026-10-12T10:30:00+07:00', sizes: { EPUB: 2.1, PDF: 8.4 }, format: 'EPUB',
    });
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('mặc định chọn định dạng của ebook, đổi sang PDF thì nút hiện dung lượng PDF', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.btn-pink')?.textContent).toContain('2,1 MB');
    component.picked.set('PDF');
    fixture.detectChanges();
    expect(el.querySelector('.btn-pink')?.textContent).toContain('8,4 MB');
    expect(component.byline()).toBe('Banana Yoshimoto · Lương Việt Dũng dịch');
  });

  it('Tải về: báo toast và đóng pop-up', () => {
    const show = vi.spyOn(TestBed.inject(ToastService), 'show');
    const closed = vi.fn();
    component.closed.subscribe(closed);
    component.download();
    expect(show).toHaveBeenCalled();
    expect(closed).toHaveBeenCalled();
    expect(formatSize(14.2)).toBe('14,2 MB');
  });
});
