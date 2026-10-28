import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BuybackDetail } from './buyback-detail';

describe('BuybackDetail', () => {
  let component: BuybackDetail;
  let fixture: ComponentFixture<BuybackDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [BuybackDetail],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(BuybackDetail);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start without request data or sample prices', () => {
    expect(component.buybackPrice()).toBe('');
    expect(component.resalePrice()).toBe('');
  });
});
