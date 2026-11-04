import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { PageFooter } from './page-footer';
import { FooterLegal } from '../footer-legal/footer-legal';

describe('PageFooter', () => {
  let component: PageFooter;
  let fixture: ComponentFixture<PageFooter>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([])],
      declarations: [PageFooter, FooterLegal],
    }).compileComponents();

    fixture = TestBed.createComponent(PageFooter);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
