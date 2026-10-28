import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BuybackRequests } from './buyback-requests';

describe('BuybackRequests', () => {
  let component: BuybackRequests;
  let fixture: ComponentFixture<BuybackRequests>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [BuybackRequests],
      imports: [CommonModule],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(BuybackRequests);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with an empty list until buyback data is available', () => {
    expect(component.requests()).toEqual([]);
    expect(component.count('')).toBe(0);
    expect(component.visibleRequests()).toEqual([]);
  });
});
