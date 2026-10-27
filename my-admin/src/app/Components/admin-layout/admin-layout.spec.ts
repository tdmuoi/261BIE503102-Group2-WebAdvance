import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { AdminLayout } from './admin-layout';

describe('AdminLayout', () => {
  let component: AdminLayout;
  let fixture: ComponentFixture<AdminLayout>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([])],
      declarations: [AdminLayout],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminLayout);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('AdminLayout – menu', () => {
  it('làm sáng mục cha khi ở trang con', async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([])],
      declarations: [AdminLayout],
    }).compileComponents();
    const c = TestBed.createComponent(AdminLayout).componentInstance;
    const books = c.navGroups[1].items[0];
    c.currentUrl = '/book-form/123?tab=info';
    expect(c.isActive(books)).toBe(true);
    c.currentUrl = '/book-list-old';
    expect(c.isActive(books)).toBe(false);
  });
});
