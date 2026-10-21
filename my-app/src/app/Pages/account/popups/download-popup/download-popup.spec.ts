import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DownloadPopup } from './download-popup';

describe('DownloadPopup', () => {
  let component: DownloadPopup;
  let fixture: ComponentFixture<DownloadPopup>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DownloadPopup],
    }).compileComponents();

    fixture = TestBed.createComponent(DownloadPopup);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
