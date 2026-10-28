import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { ToastService } from '../../services/toast-service';
import { ToastHost } from './toast';

describe('ToastHost', () => {
  let fixture: ComponentFixture<ToastHost>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([])],
      declarations: [ToastHost],
    }).compileComponents();

    fixture = TestBed.createComponent(ToastHost);
    await fixture.whenStable();
  });

  it('hiện thông báo kèm link', async () => {
    TestBed.inject(ToastService).show('Đã thêm vào giỏ', { label: 'Xem giỏ hàng', path: '/cart' });
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.toast-message')?.textContent).toBe('Đã thêm vào giỏ');
    expect(el.querySelector('.toast-link')?.getAttribute('href')).toBe('/cart');
  });
});
