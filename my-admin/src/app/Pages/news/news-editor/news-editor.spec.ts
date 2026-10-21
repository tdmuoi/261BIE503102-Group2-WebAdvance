import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NewsEditor } from './news-editor';

describe('NewsEditor', () => {
  let component: NewsEditor;
  let fixture: ComponentFixture<NewsEditor>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NewsEditor],
    }).compileComponents();

    fixture = TestBed.createComponent(NewsEditor);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
