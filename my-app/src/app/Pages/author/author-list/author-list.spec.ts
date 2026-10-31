import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthorList } from './author-list';

describe('AuthorList', () => {
  let component: AuthorList;
  let fixture: ComponentFixture<AuthorList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AuthorList],
      providers: [provideHttpClient(), provideRouter([])],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(AuthorList);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
