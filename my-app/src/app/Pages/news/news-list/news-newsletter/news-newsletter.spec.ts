import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Observable, of, throwError } from 'rxjs';

import { EngagementService } from '../../../../services/engagement-service';
import { NewsNewsletter } from './news-newsletter';

describe('NewsNewsletter', () => {
  let fixture: ComponentFixture<NewsNewsletter>;

  async function open(subscribeNewsletter: () => Observable<unknown>) {
    await TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      declarations: [NewsNewsletter],
      providers: [{ provide: EngagementService, useValue: { subscribeNewsletter } }],
    }).compileComponents();
    fixture = TestBed.createComponent(NewsNewsletter);
    await fixture.whenStable();
  }

  const el = () => fixture.nativeElement as HTMLElement;

  async function submit(email: string) {
    const input = el().querySelector('input') as HTMLInputElement;
    input.value = email;
    input.dispatchEvent(new Event('input'));
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  it('đăng ký xong hiện pop-up, bấm "Đã hiểu" thì đóng', async () => {
    await open(() => of({}));
    await submit('a@vidu.com');
    expect(el().querySelector('.np-title')?.textContent).toContain('đăng ký thành công');

    (el().querySelector('.np-btn') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(el().querySelector('.np-modal')).toBeNull();
  });

  it('email đã đăng ký thì pop-up báo đã đăng ký rồi', async () => {
    await open(() => throwError(() => ({ status: 409 })));
    await submit('a@vidu.com');
    expect(el().querySelector('.np-title')?.textContent).toContain('đã đăng ký rồi');
  });

  it('lỗi server thì báo ngay dưới ô nhập, không hiện pop-up', async () => {
    await open(() => throwError(() => ({ status: 500 })));
    await submit('a@vidu.com');
    expect(el().querySelector('.np-modal')).toBeNull();
    expect(el().querySelector('.nn-msg')?.textContent).toContain('Không đăng ký được');
  });

  it('email sai định dạng thì không gửi', async () => {
    const subscribe = vi.fn(() => of({}));
    await open(subscribe);
    await submit('khong-phai-email');
    expect(subscribe).not.toHaveBeenCalled();
  });
});
