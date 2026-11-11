import { Observable } from 'rxjs';

/**
 * Thu nhỏ ảnh đại diện thành JPEG vuông (cắt giữa) dạng data URL để gửi kèm JSON.
 * 256px, chất lượng 0.82 → thường dưới 40KB, vừa giới hạn của my-server (PUT /api/account/avatar).
 */
export function shrinkImage(file: File, size = 256, quality = 0.82): Observable<string> {
  return new Observable<string>((subscriber) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      URL.revokeObjectURL(url);
      if (!ctx || !side) {
        subscriber.error(new Error('Không đọc được ảnh'));
        return;
      }
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
      subscriber.next(canvas.toDataURL('image/jpeg', quality));
      subscriber.complete();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      subscriber.error(new Error('Không đọc được ảnh'));
    };
    img.src = url;
  });
}
