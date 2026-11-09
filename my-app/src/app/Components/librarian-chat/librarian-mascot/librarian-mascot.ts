import { Component, input } from '@angular/core';

let nextId = 0;

/**
 * Mascot Thủ thư Lightbook: bé lông xù tai mèo đeo tai nghe có micro (nhận diện là trợ lý AI).
 * Vẽ bằng SVG, màu lấy từ biến trong styles.css. Có thể hiện nhiều lần trên trang
 * nên id gradient được đánh số riêng cho từng bản.
 */
@Component({
  selector: 'app-librarian-mascot',
  styleUrl: './librarian-mascot.css',
  templateUrl: './librarian-mascot.html',
  host: { '[class.lm-animated]': 'animated()' },
})
export class LibrarianMascot {
  /** Nhún nhảy + chớp mắt (dùng cho nút nổi) */
  readonly animated = input(false);

  protected readonly uid = `lm${nextId++}`;
  protected readonly bodyFill = `url(#${this.uid}-body)`;
  protected readonly phoneFill = `url(#${this.uid}-phone)`;
}
