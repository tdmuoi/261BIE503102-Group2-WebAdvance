import { Component, effect, inject, input, signal } from '@angular/core';

import { ToastService } from '../../../../services/toast-service';

/** Bài đã lưu chỉ giữ trên trình duyệt của người đọc (chưa có API lưu bài) */
const SAVED_KEY = 'lightbook-saved-news';

function readSaved(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Nút chia sẻ: Facebook, sao chép liên kết, lưu bài — Figma "Share" (879:7500) */
@Component({
  selector: 'app-article-share',
  standalone: false,
  styleUrl: './article-share.css',
  templateUrl: './article-share.html',
})
export class ArticleShare {
  private readonly toast = inject(ToastService);

  readonly articleId = input.required<string>();
  /** Hiện chữ "Chia sẻ:" phía trước */
  readonly showLabel = input(true);

  protected readonly saved = signal(false);

  constructor() {
    // Chuyển sang bài khác (cùng component) thì đọc lại trạng thái đã lưu
    effect(() => this.saved.set(readSaved().includes(this.articleId())));
  }

  protected shareFacebook(): void {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(location.href)}`;
    window.open(url, '_blank', 'noopener,width=600,height=520');
  }

  protected async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(location.href);
      this.toast.show('Đã sao chép liên kết bài viết.');
    } catch {
      this.toast.show('Không sao chép được, vui lòng sao chép địa chỉ trang.');
    }
  }

  protected toggleSave(): void {
    const id = this.articleId();
    const list = readSaved().filter((item) => item !== id);
    const saved = !this.saved();
    if (saved) list.push(id);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(list));
    } catch {
      // Trình duyệt chặn lưu trữ thì chỉ đổi trạng thái tạm thời
    }
    this.saved.set(saved);
    this.toast.show(saved ? 'Đã lưu bài viết trên trình duyệt này.' : 'Đã bỏ lưu bài viết.');
  }
}
