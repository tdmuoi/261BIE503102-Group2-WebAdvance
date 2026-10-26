import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BuybackDetail } from './buyback-detail';

describe('BuybackDetail', () => {
  let component: BuybackDetail;
  let fixture: ComponentFixture<BuybackDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [BuybackDetail],
    }).compileComponents();

    fixture = TestBed.createComponent(BuybackDetail);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
