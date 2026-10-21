import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EbookReader } from './ebook-reader';

describe('EbookReader', () => {
  let component: EbookReader;
  let fixture: ComponentFixture<EbookReader>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [EbookReader],
    }).compileComponents();

    fixture = TestBed.createComponent(EbookReader);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
