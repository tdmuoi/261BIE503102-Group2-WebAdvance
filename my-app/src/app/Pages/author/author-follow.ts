import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../services/auth-service';
import { EngagementService } from '../../services/engagement-service';
import { ToastService } from '../../services/toast-service';

/**
 * Nút "Theo dõi tác giả" và "Chia sẻ" trên các trang Tác giả.
 * Danh sách tác giả đang theo dõi tải lại mỗi khi đăng nhập / đăng xuất;
 * bấm nút đổi ngay giữa "Theo dõi tác giả" ↔ "Đã theo dõi", lỗi thì trả lại như cũ.
 */
@Injectable({ providedIn: 'root' })
export class AuthorFollow {
  private readonly engagement = inject(EngagementService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly followed = signal<ReadonlySet<string>>(new Set());
  private readonly busy = signal<ReadonlySet<string>>(new Set());

  constructor() {
    effect(() => {
      const loggedIn = !!this.auth.user();
      untracked(() => (loggedIn ? this.load() : this.followed.set(new Set())));
    });
  }

  isFollowing(authorId: string): boolean {
    return this.followed().has(authorId);
  }

  isBusy(authorId: string): boolean {
    return this.busy().has(authorId);
  }

  toggle(authorId: string, name: string): void {
    if (!this.auth.user()) {
      this.toast.show('Bạn đăng nhập để theo dõi tác giả nhé.');
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    if (this.isBusy(authorId)) return;

    const following = this.isFollowing(authorId);
    this.setFollowing(authorId, !following);
    this.busy.update((ids) => new Set(ids).add(authorId));
    const request$ = following ? this.engagement.unfollowAuthor(authorId) : this.engagement.followAuthor(authorId);
    request$.subscribe({
      next: () => {
        this.done(authorId);
        this.toast.show(following ? `Đã bỏ theo dõi ${name}.` : `Đã theo dõi ${name}. Bạn sẽ nhận tin khi có sách mới.`);
      },
      error: () => {
        this.done(authorId);
        this.setFollowing(authorId, following);
        this.toast.show('Không cập nhật được lúc này, vui lòng thử lại.');
      },
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

  private load(): void {
    this.engagement.getFollowedAuthors().subscribe({
      next: (ids) => this.followed.set(new Set(ids)),
      error: () => this.followed.set(new Set()),
    });
  }

  private setFollowing(authorId: string, following: boolean): void {
    this.followed.update((ids) => {
      const next = new Set(ids);
      if (following) next.add(authorId);
      else next.delete(authorId);
      return next;
    });
  }

  private done(authorId: string): void {
    this.busy.update((ids) => {
      const next = new Set(ids);
      next.delete(authorId);
      return next;
    });
  }
}
