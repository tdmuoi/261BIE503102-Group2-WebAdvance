import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  let component: ConfirmDialog;
  let fixture: ComponentFixture<ConfirmDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ConfirmDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('ConfirmDialog – hành vi', () => {
  let fixture: ComponentFixture<ConfirmDialog>;
  let component: ConfirmDialog;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [ConfirmDialog] }).compileComponents();
    fixture = TestBed.createComponent(ConfirmDialog);
    component = fixture.componentInstance;
  });

  it('đóng thì không render gì', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.dialog')).toBeNull();
  });

  it('mở thì hiện tiêu đề, bấm nút phát đúng sự kiện', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('title', 'Xoá sách?');
    fixture.componentRef.setInput('confirmText', 'Xoá');
    fixture.detectChanges();

    let confirmed = 0;
    let cancelled = 0;
    component.confirmed.subscribe(() => confirmed++);
    component.cancelled.subscribe(() => cancelled++);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.title')?.textContent).toContain('Xoá sách?');
    const [cancelBtn, okBtn] = Array.from(el.querySelectorAll<HTMLButtonElement>('.actions button'));
    okBtn.click();
    cancelBtn.click();
    component.onEsc();
    expect(confirmed).toBe(1);
    expect(cancelled).toBe(2);
  });

  it('đang loading thì không phát sự kiện', () => {
    component.open = true;
    component.loading = true;
    let count = 0;
    component.confirmed.subscribe(() => count++);
    component.cancelled.subscribe(() => count++);
    component.confirm();
    component.cancel();
    expect(count).toBe(0);
  });
});
