import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Vouchers } from './vouchers';

describe('Vouchers', () => {
  let component: Vouchers;
  let fixture: ComponentFixture<Vouchers>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [Vouchers],
    }).compileComponents();

    fixture = TestBed.createComponent(Vouchers);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
