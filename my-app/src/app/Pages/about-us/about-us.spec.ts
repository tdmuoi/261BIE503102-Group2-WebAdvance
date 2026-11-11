import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { RouterModule, provideRouter } from '@angular/router';

import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';

import { EngagementService } from '../../services/engagement-service';
import { AboutUs } from './about-us';

describe('AboutUs', () => {
  let fixture: ComponentFixture<AboutUs>;
  const subscribeNewsletter = vi.fn();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AboutUs],
      imports: [RouterModule],
      providers: [provideRouter([]), { provide: EngagementService, useValue: { subscribeNewsletter } }],
      // app-marquee có test riêng
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(AboutUs);
    await fixture.whenStable();
  });

  it('hiện đủ các phần theo Figma', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.timeline li').length).toBe(4);
    expect(el.querySelectorAll('.value').length).toBe(4);
    expect(el.querySelectorAll('.stat').length).toBe(4);
    expect(el.querySelectorAll('.member').length).toBe(4);
    expect(el.querySelectorAll('.partner').length).toBe(8);
  });

  it('phần Sứ mệnh & Tầm nhìn lấy theo Content 1', () => {
    const text = fixture.nativeElement.querySelector('.story-text')?.textContent ?? '';
    expect(text).toContain('Sứ mệnh & Tầm nhìn');
    expect(text).toContain('nền tảng sách tiêu dùng xanh hàng đầu tại Việt Nam');
  });

  it('đội ngũ không còn câu trích dẫn và "Đang đọc"', () => {
    expect(fixture.nativeElement.querySelector('.member')?.textContent).not.toContain('Đang đọc');
  });

  it('"Tham gia miễn phí" mở pop-up đăng ký bản tin (topic news); email đã có thì báo đã đăng ký', async () => {
    const el: HTMLElement = fixture.nativeElement;
    const component = fixture.componentInstance;
    (el.querySelector('.cta-btn') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(el.querySelector('.join-modal')?.textContent).toContain('Tham gia Lightbook Community');

    component.joinEmail.set('sai-email');
    component.submitJoin();
    expect(component.joinError()).toBe('Email chưa đúng định dạng');

    subscribeNewsletter.mockReturnValueOnce(of({}));
    component.joinEmail.set('mai@gmail.com');
    component.submitJoin();
    expect(subscribeNewsletter).toHaveBeenCalledWith('mai@gmail.com', 'news');
    expect(component.joinState()).toBe('done');

    subscribeNewsletter.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409 })));
    component.openJoin();
    component.submitJoin();
    expect(component.joinState()).toBe('duplicate');
  });
});
