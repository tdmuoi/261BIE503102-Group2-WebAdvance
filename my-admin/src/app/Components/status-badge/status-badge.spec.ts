import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  let component: StatusBadge;
  let fixture: ComponentFixture<StatusBadge>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [StatusBadge],
    }).compileComponents();

    fixture = TestBed.createComponent(StatusBadge);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('StatusBadge – hiển thị', () => {
  let fixture: ComponentFixture<StatusBadge>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [StatusBadge] }).compileComponents();
    fixture = TestBed.createComponent(StatusBadge);
  });

  const render = (inputs: Record<string, string>) => {
    Object.entries(inputs).forEach(([k, v]) => fixture.componentRef.setInput(k, v));
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('span') as HTMLElement;
  };

  it('dịch mã trạng thái sang tiếng Việt kèm màu', () => {
    const el = render({ status: 'pending' });
    expect(el.textContent?.trim()).toBe('Chờ xác nhận');
    expect(el.classList).toContain('status-warn');
  });

  it('chấp nhận nhiều kiểu viết mã', () => {
    const el = render({ status: 'Out-Of-Stock' });
    expect(el.textContent?.trim()).toBe('Hết hàng');
    expect(el.classList).toContain('status-bad');
  });

  it('cho phép ghi đè chữ và màu', () => {
    const el = render({ status: 'active', label: 'Đang bán', tone: 'info' });
    expect(el.textContent?.trim()).toBe('Đang bán');
    expect(el.classList).toContain('status-info');
  });

  it('mã lạ thì hiện nguyên chữ, màu xám', () => {
    const el = render({ status: 'Chờ lấy hàng' });
    expect(el.textContent?.trim()).toBe('Chờ lấy hàng');
    expect(el.classList).toContain('status-mute');
  });
});
