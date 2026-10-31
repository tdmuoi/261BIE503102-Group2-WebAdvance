import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthorDetail } from './author-detail';

describe('AuthorDetail', () => {
  let component: AuthorDetail;
  let fixture: ComponentFixture<AuthorDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AuthorDetail],
      providers: [provideHttpClient(), provideRouter([])],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(AuthorDetail);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
