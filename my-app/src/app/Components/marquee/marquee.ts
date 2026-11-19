import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  Input,
  ViewChild,
  inject,
  signal,
} from '@angular/core';

@Component({
  selector: 'app-marquee',
  standalone: false,
  styleUrl: './marquee.css',
  templateUrl: './marquee.html',
})
export class Marquee implements AfterViewInit {
  @Input() items: string[] = [];
  @Input() separator = '‖';
  @Input() background = 'var(--color-bg-highlight)';
  @Input() textColor = 'var(--color-text-primary)';
  @Input() speed = 60;
  @Input() height = 44;
  @Input() fontSize = 14;
  @Input() letterSpacing = 1.12;
  @Input() borderWidth = 1;
  @Input() tilt = 0;

  @ViewChild('band', { static: true }) private band!: ElementRef<HTMLElement>;
  @ViewChild('group', { static: true }) private group!: ElementRef<HTMLElement>;

  protected readonly repeats = signal<number[]>([0]);
  protected readonly duration = signal(30);

  private readonly destroyRef = inject(DestroyRef);

  ngAfterViewInit(): void {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => this.measure());
    observer.observe(this.band.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private measure(): void {
    const unitWidth = this.group.nativeElement.scrollWidth / this.repeats().length;
    const bandWidth = this.band.nativeElement.clientWidth;
    if (!unitWidth || !bandWidth) return;

    const count = Math.max(1, Math.ceil(bandWidth / unitWidth));
    if (count !== this.repeats().length) {
      this.repeats.set(Array.from({ length: count }, (_, i) => i));
    }
    this.duration.set((count * unitWidth) / Math.max(this.speed, 1));
  }
}
