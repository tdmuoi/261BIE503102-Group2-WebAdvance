import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Policies } from './policies';

describe('Policies', () => {
  let fixture: ComponentFixture<Policies>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Policies], providers: [provideRouter([])] }).compileComponents();
    fixture = TestBed.createComponent(Policies);
    await fixture.whenStable();
  });

  it('hiện đủ 3 chính sách theo Content 1, mỗi mục có id để link tới', () => {
    const el: HTMLElement = fixture.nativeElement;
    const ids = Array.from(el.querySelectorAll('.doc')).map((d) => d.id);
    expect(ids).toEqual(['bao-mat', 'thanh-toan', 'doi-tra']);
    expect(el.querySelector('#doi-tra')?.textContent).toContain('trong vòng 7 ngày kể từ khi nhận hàng');
    expect(el.textContent).not.toContain('Lightbooks');
  });
});
