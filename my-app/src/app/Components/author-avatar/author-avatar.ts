import { Component, input, signal } from '@angular/core';

/** Màu nền xoay vòng khi không có ảnh — theo palette Avatar của Figma */
const TINTS = ['pink', 'mint', 'yellow', 'pink-strong'];

/**
 * Avatar tác giả — Figma "Avatar" (862:315): tròn, viền ink.
 * Có ảnh thì dùng ảnh (object-fit: cover); không có hoặc ảnh lỗi thì hiện chữ viết tắt trên nền pastel.
 * Kích thước, cỡ chữ, viền do trang dùng đặt qua class.
 */
@Component({
  selector: 'app-author-avatar',
  standalone: false,
  styleUrl: './author-avatar.css',
  templateUrl: './author-avatar.html',
  host: { '[attr.data-tint]': 'tint()' },
})
export class AuthorAvatar {
  readonly name = input.required<string>();
  readonly initials = input.required<string>();
  readonly photo = input<string | null>(null);
  /** Vị trí trong danh sách — chọn màu nền */
  readonly index = input(0);

  protected readonly failed = signal(false);

  protected tint(): string {
    return TINTS[Math.abs(this.index()) % TINTS.length];
  }
}
