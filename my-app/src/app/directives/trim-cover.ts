import { DestroyRef, Directive, ElementRef, effect, inject, input } from '@angular/core';

/** Điểm ảnh được coi là "lề trắng" khi cả 3 kênh màu đều sáng hơn ngưỡng này */
const WHITE_LEVEL = 235;
/** Một hàng/cột là lề khi ít nhất 97% điểm ảnh là trắng */
const BLANK_RATIO = 0.97;
/** Mỗi cạnh cắt tối đa 20%, tránh cắt nhầm bìa sách nền trắng */
const MAX_TRIM = 0.2;
/** Ngay sau lề thật là mép bìa: trong dải 3% kế tiếp phải có hàng/cột với ít nhất 50% điểm ảnh không trắng */
const EDGE_DENSITY = 0.5;
const EDGE_BAND = 0.03;
/** Lề mỏng hơn 1% thì bỏ qua */
const MIN_TRIM = 0.01;
/** Kích thước ảnh thu nhỏ dùng để dò lề */
const SAMPLE_SIZE = 120;

interface TrimBox {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Ảnh bìa trên CDN thường chừa lề trắng quanh cuốn sách, nên khi hiển thị
 * kiểu object-fit: cover sẽ lộ sọc trắng hai bên. Directive này dò lề trắng
 * của từng ảnh rồi thay bằng bản đã cắt lề. Ảnh không có lề giữ nguyên.
 *
 * Dùng thay cho [src]:  <img [appTrimCover]="book.image" [alt]="book.title" />
 */
@Directive({
  selector: 'img[appTrimCover]',
  standalone: false,
})
export class TrimCover {
  readonly source = input.required<string>({ alias: 'appTrimCover' });

  private readonly img = inject<ElementRef<HTMLImageElement>>(ElementRef).nativeElement;
  private objectUrl: string | null = null;
  /** Ảnh đang hiển thị đã là bản cắt lề hoặc đã kiểm tra xong */
  private settled = false;

  constructor() {
    // Bật CORS trước khi gán src thì mới đọc được điểm ảnh
    this.img.crossOrigin = 'anonymous';
    this.img.addEventListener('load', this.onLoad);
    this.img.addEventListener('error', this.onError);

    effect(() => {
      this.settled = false;
      this.releaseUrl();
      this.img.crossOrigin = 'anonymous';
      this.img.src = this.source();
    });

    inject(DestroyRef).onDestroy(() => {
      this.img.removeEventListener('load', this.onLoad);
      this.img.removeEventListener('error', this.onError);
      this.releaseUrl();
    });
  }

  private readonly onLoad = (): void => {
    if (this.settled) return;
    this.settled = true;

    const box = this.detectMargins();
    if (box) this.applyTrim(box);
  };

  /** CDN không hỗ trợ CORS thì tải lại ảnh như bình thường, không cắt lề */
  private readonly onError = (): void => {
    if (this.img.crossOrigin === null || this.settled) return;
    this.settled = true;
    this.img.removeAttribute('crossorigin');
    this.img.src = this.source();
  };

  private detectMargins(): TrimBox | null {
    const { naturalWidth: width, naturalHeight: height } = this.img;
    if (!width || !height) return null;

    const scale = Math.min(1, SAMPLE_SIZE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    let data: Uint8ClampedArray;
    try {
      ctx.drawImage(this.img, 0, 0, w, h);
      data = ctx.getImageData(0, 0, w, h).data;
    } catch {
      return null; // ảnh không cho đọc điểm ảnh
    }

    const isWhite = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      return data[i] > WHITE_LEVEL && data[i + 1] > WHITE_LEVEL && data[i + 2] > WHITE_LEVEL;
    };
    const rowWhite = (y: number) => {
      let white = 0;
      for (let x = 0; x < w; x++) if (isWhite(x, y)) white++;
      return white / w;
    };
    const colWhite = (x: number) => {
      let white = 0;
      for (let y = 0; y < h; y++) if (isWhite(x, y)) white++;
      return white / h;
    };
    const rowBlank = (y: number) => rowWhite(y) >= BLANK_RATIO;
    const colBlank = (x: number) => colWhite(x) >= BLANK_RATIO;

    const maxRows = Math.floor(h * MAX_TRIM);
    const maxCols = Math.floor(w * MAX_TRIM);
    let top = 0;
    while (top < maxRows && rowBlank(top)) top++;
    let bottom = 0;
    while (bottom < maxRows && rowBlank(h - 1 - bottom)) bottom++;
    let left = 0;
    while (left < maxCols && colBlank(left)) left++;
    let right = 0;
    while (right < maxCols && colBlank(w - 1 - right)) right++;

    // Bìa nền trắng: sau vùng trắng chỉ là vài nét chữ lẻ tẻ, không phải mép bìa đặc → không cắt
    // Xét cả một dải mỏng để bỏ qua vệt bóng mờ sát mép bìa
    const density = (whiteOf: (i: number) => number, start: number, step: 1 | -1, size: number) => {
      const count = Math.max(1, Math.ceil(size * EDGE_BAND));
      let best = 0;
      for (let k = 0; k < count; k++) {
        const index = start + step * k;
        if (index < 0 || index >= size) break;
        best = Math.max(best, 1 - whiteOf(index));
      }
      return best;
    };
    if (top && density(rowWhite, top, 1, h) < EDGE_DENSITY) top = 0;
    if (bottom && density(rowWhite, h - 1 - bottom, -1, h) < EDGE_DENSITY) bottom = 0;
    if (left && density(colWhite, left, 1, w) < EDGE_DENSITY) left = 0;
    if (right && density(colWhite, w - 1 - right, -1, w) < EDGE_DENSITY) right = 0;

    // Lề thật nằm đối xứng (ảnh bìa được đặt giữa khung trắng). Chỉ cắt một trục khi
    // cả hai phía đều có lề, và cắt đều theo phía mỏng hơn, để không ăn vào bìa nền trắng.
    const vertical = Math.min(top / h, bottom / h);
    const horizontal = Math.min(left / w, right / w);
    const box = {
      top: vertical >= MIN_TRIM ? vertical : 0,
      bottom: vertical >= MIN_TRIM ? vertical : 0,
      left: horizontal >= MIN_TRIM ? horizontal : 0,
      right: horizontal >= MIN_TRIM ? horizontal : 0,
    };
    return box.top || box.left ? box : null;
  }

  private applyTrim(box: TrimBox): void {
    const { naturalWidth: width, naturalHeight: height } = this.img;
    // Cắt lấn thêm 1 điểm ảnh cho chắc không còn vệt trắng mảnh
    const sx = Math.ceil(width * box.left) + (box.left ? 1 : 0);
    const sy = Math.ceil(height * box.top) + (box.top ? 1 : 0);
    const sw = Math.floor(width * (1 - box.left - box.right)) - (box.left ? 1 : 0) - (box.right ? 1 : 0);
    const sh = Math.floor(height * (1 - box.top - box.bottom)) - (box.top ? 1 : 0) - (box.bottom ? 1 : 0);
    if (sw <= 0 || sh <= 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(this.img, sx, sy, sw, sh, 0, 0, sw, sh);

    const expected = this.source();
    canvas.toBlob(
      (blob) => {
        // Bỏ qua nếu ảnh đã đổi sang sách khác trong lúc xử lý
        if (!blob || this.source() !== expected) return;
        this.releaseUrl();
        this.objectUrl = URL.createObjectURL(blob);
        this.img.src = this.objectUrl;
      },
      'image/webp',
      0.92,
    );
  }

  private releaseUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
