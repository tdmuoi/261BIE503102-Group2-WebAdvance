import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pagination } from './pagination';

describe('Pagination', () => {
  let component: Pagination;
  let fixture: ComponentFixture<Pagination>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [Pagination],
    }).compileComponents();

    fixture = TestBed.createComponent(Pagination);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('Pagination – logic', () => {
  const make = (page: number, total: number, pageSize = 10) => {
    const p = new Pagination();
    p.page = page;
    p.total = total;
    p.pageSize = pageSize;
    return p;
  };

  it('ít trang thì hiện hết', () => {
    expect(make(1, 45).pages).toEqual([1, 2, 3, 4, 5]);
    expect(make(1, 70).pages).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('nhiều trang thì có dấu …', () => {
    expect(make(1, 420).pages).toEqual([1, 2, 3, 4, 5, '...', 42]);
    expect(make(20, 420).pages).toEqual([1, '...', 19, 20, 21, '...', 42]);
    expect(make(42, 420).pages).toEqual([1, '...', 38, 39, 40, 41, 42]);
  });

  it('tính đúng khoảng đang hiển thị', () => {
    const p = make(3, 2486, 6);
    expect(p.from).toBe(13);
    expect(p.to).toBe(18);
    expect(make(42, 415).to).toBe(415);
    expect(make(1, 0).from).toBe(0);
  });

  it('phát pageChange khi chuyển trang, bỏ qua trang hiện tại và ngoài phạm vi', () => {
    const p = make(1, 100);
    const emitted: number[] = [];
    p.pageChange.subscribe((v) => emitted.push(v));
    p.goTo(1);
    p.goTo(0);
    p.goTo('...');
    p.goTo(3);
    p.goTo(99);
    expect(emitted).toEqual([3, 10]);
  });
});
