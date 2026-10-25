import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, RouterModule } from '@angular/router';

import { HomeSearch } from './home-search';

describe('HomeSearch', () => {
  let fixture: ComponentFixture<HomeSearch>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([])],
      declarations: [HomeSearch],
    }).compileComponents();
    fixture = TestBed.createComponent(HomeSearch);
    fixture.componentRef.setInput('categories', [{ _id: 'c1', name: 'Văn học', slug: 'van-hoc' }]);
    await fixture.whenStable();
  });

  it('đưa thể loại từ API vào dropdown', () => {
    const options = [...fixture.nativeElement.querySelectorAll('select[name="category"] option')] as HTMLOptionElement[];
    expect(options.map((option) => option.textContent)).toEqual(['Thể loại', 'Văn học']);
  });

  it('bấm Tìm sách thì chuyển sang Browse Book kèm từ khoá', () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const input = fixture.nativeElement.querySelector('input[name="q"]') as HTMLInputElement;
    input.value = 'Kitchen';
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).requestSubmit();

    expect(navigate).toHaveBeenCalledWith(['/browse-book'], { queryParams: { q: 'Kitchen' } });
  });
});
