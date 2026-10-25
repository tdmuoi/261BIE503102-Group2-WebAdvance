import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { VndPipe } from '../../../../pipes/vnd-pipe';
import { makeBooks } from '../../../../testing/mock-books';
import { HomeNewReleases } from './home-new-releases';

describe('HomeNewReleases', () => {
  let fixture: ComponentFixture<HomeNewReleases>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([])],
      declarations: [HomeNewReleases, VndPipe],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(HomeNewReleases);
    fixture.componentRef.setInput('books', makeBooks(10));
    await fixture.whenStable();
  });

  const el = () => fixture.nativeElement as HTMLElement;

  it('sách mới nhất nổi bật, 3 cuốn kế tiếp bên phải, mũi tên chuyển trang', async () => {
    expect(el().querySelector('.featured-title')?.textContent?.trim()).toBe('Sách số 10');
    expect(el().querySelectorAll('.release-card').length).toBe(3);

    (el().querySelector('.nav-btn-next') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(el().querySelector('.featured-title')?.textContent?.trim()).toBe('Sách số 6');
  });
});
