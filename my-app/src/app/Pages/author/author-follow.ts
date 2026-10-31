import { Injectable, inject } from '@angular/core';

import { EngagementService, EngagementUnavailableError } from '../../services/engagement-service';
import { ToastService } from '../../services/toast-service';

/** Nút "Theo dõi" và "Chia sẻ" trên các trang Tác giả — báo kết quả bằng toast */
@Injectable({ providedIn: 'root' })
export class AuthorFollow {
  private readonly engagement = inject(EngagementService);
  private readonly toast = inject(ToastService);

  follow(authorId: string, name: string): void {
    this.engagement.followAuthor(authorId).subscribe({
      next: () => this.toast.show(`Đã theo dõi ${name}. Bạn sẽ nhận tin khi có sách mới.`),
      error: (error) =>
        this.toast.show(
          error instanceof EngagementUnavailableError
            ? 'Tính năng theo dõi tác giả sắp ra mắt.'
            : 'Không theo dõi được lúc này, vui lòng thử lại.',
        ),
    });
  }

  /** Chia sẻ trang hiện tại: dùng bảng chia sẻ của máy, không có thì sao chép liên kết */
  async share(title: string): Promise<void> {
    const url = location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      this.toast.show('Đã sao chép liên kết trang tác giả.');
    } catch (error) {
      // Người dùng tự đóng bảng chia sẻ thì không báo lỗi
      if ((error as DOMException)?.name !== 'AbortError') this.toast.show('Không chia sẻ được, vui lòng sao chép địa chỉ trang.');
    }
  }
}
