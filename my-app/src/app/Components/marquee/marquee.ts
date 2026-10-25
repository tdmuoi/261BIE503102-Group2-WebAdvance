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

/**
 * Dải chữ chạy ngang dùng lại được.
 * Nội dung được nhân đôi và chạy translateX từ 0 đến -50% nên vòng lặp không bị giật.
 * Mỗi nửa được lặp đủ số lần để luôn phủ kín bề ngang, màn rộng cỡ nào cũng không hở.
 *
 * Ví dụ:
 * <app-marquee [items]="['Flash sale mỗi ngày', 'Sách mới mỗi tuần']" separator="✦"
 *   background="var(--color-bg-inverse)" textColor="var(--color-text-inverse)" [speed]="40" />
 */
@Component({
  selector: 'app-marquee',
  standalone: false,
  styleUrl: './marquee.css',
  templateUrl: './marquee.html',
})
export class Marquee implements AfterViewInit {
  /** Các cụm chữ, mỗi cụm có ký hiệu ngăn cách đứng trước */
  @Input() items: string[] = [];
  @Input() separator = '‖';
  @Input() background = 'var(--color-bg-highlight)';
  @Input() textColor = 'var(--color-text-primary)';
  /** Tốc độ chạy, tính bằng pixel mỗi giây */
  @Input() speed = 60;
  /** Chiều cao dải, tính cả viền (px) */
  @Input() height = 44;
  @Input() fontSize = 14;
  @Input() letterSpacing = 1.12;
  @Input() borderWidth = 1;
  /** Góc nghiêng (độ). 0 là nằm ngang */
  @Input() tilt = 0;

  @ViewChild('band', { static: true }) private band!: ElementRef<HTMLElement>;
  @ViewChild('group', { static: true }) private group!: ElementRef<HTMLElement>;

  /** Số lần lặp nội dung trong mỗi nửa */
  protected readonly repeats = signal<number[]>([0]);
  /** Thời gian chạy hết một nửa (giây) */
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
