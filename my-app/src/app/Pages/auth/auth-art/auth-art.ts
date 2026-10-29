import { Component, input } from '@angular/core';

/**
 * Khung minh hoạ bên phải các trang đăng nhập / đăng ký / quên mật khẩu
 * (Figma: "Illustration – bìa sách xếp chồng"). Login nền vàng, Register nền hồng, Quên mật khẩu nền mint.
 */
@Component({
  selector: 'app-auth-art',
  standalone: false,
  styleUrl: './auth-art.css',
  templateUrl: './auth-art.html',
  host: {
    'aria-hidden': 'true',
    '[class.is-pink]': "tone() === 'pink'",
    '[class.is-mint]': "tone() === 'mint'",
  },
})
export class AuthArt {
  readonly tone = input<'yellow' | 'pink' | 'mint'>('yellow');
}
