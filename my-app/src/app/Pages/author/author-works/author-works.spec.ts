import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthorWorks } from './author-works';

describe('AuthorWorks', () => {
  let component: AuthorWorks;
  let fixture: ComponentFixture<AuthorWorks>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AuthorWorks],
      providers: [provideHttpClient(), provideRouter([])],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(AuthorWorks);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
