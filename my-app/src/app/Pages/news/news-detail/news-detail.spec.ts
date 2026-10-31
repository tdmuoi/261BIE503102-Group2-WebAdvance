import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { NewsDetail } from './news-detail';

describe('NewsDetail', () => {
  let component: NewsDetail;
  let fixture: ComponentFixture<NewsDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NewsDetail],
      providers: [provideHttpClient(), provideRouter([])],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(NewsDetail);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
