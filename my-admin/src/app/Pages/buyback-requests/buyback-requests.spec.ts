import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BuybackRequests } from './buyback-requests';

describe('BuybackRequests', () => {
  let component: BuybackRequests;
  let fixture: ComponentFixture<BuybackRequests>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [BuybackRequests],
    }).compileComponents();

    fixture = TestBed.createComponent(BuybackRequests);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
