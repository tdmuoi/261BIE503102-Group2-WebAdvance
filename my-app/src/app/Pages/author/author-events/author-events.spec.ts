import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthorEvents } from './author-events';

describe('AuthorEvents', () => {
  let component: AuthorEvents;
  let fixture: ComponentFixture<AuthorEvents>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AuthorEvents],
      providers: [provideHttpClient(), provideRouter([])],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(AuthorEvents);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
