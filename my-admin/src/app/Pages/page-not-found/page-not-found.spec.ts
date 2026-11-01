import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { vi } from 'vitest';
import { PageNotFound } from './page-not-found';

describe('PageNotFound', () => {
  let component: PageNotFound;
  let fixture: ComponentFixture<PageNotFound>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PageNotFound],
      imports: [RouterModule.forRoot([])],
    }).compileComponents();

    fixture = TestBed.createComponent(PageNotFound);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
  it('returns a direct unknown URL to Dashboard when there is no in-app history', () => {
    vi.spyOn(TestBed.inject(Location), 'getState').mockReturnValue({ navigationId: 1 });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.goBack();
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
  });
  it('uses browser back for an existing in-app navigation', () => {
    vi.spyOn(TestBed.inject(Location), 'getState').mockReturnValue({ navigationId: 3 });
    const back = vi.spyOn(TestBed.inject(Location), 'back');
    component.goBack();
    expect(back).toHaveBeenCalledOnce();
  });
  it('passes book searches using the supported q query parameter', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.search(' book ');
    expect(navigate).toHaveBeenCalledWith(['/book-list'], { queryParams: { q: 'book' } });
  });
});
