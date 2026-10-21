import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BuyAgainDrawer } from './buy-again-drawer';

describe('BuyAgainDrawer', () => {
  let component: BuyAgainDrawer;
  let fixture: ComponentFixture<BuyAgainDrawer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [BuyAgainDrawer],
    }).compileComponents();

    fixture = TestBed.createComponent(BuyAgainDrawer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
