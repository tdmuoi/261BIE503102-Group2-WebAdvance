import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-access-denied',
  imports: [RouterLink],
  template: `<section role="alert" class="panel">
    <h1>Chưa có quyền truy cập</h1>
    <p>Vai trò hiện tại chưa được cấp quyền cho trang này. Vui lòng liên hệ quản trị viên để kiểm tra quyền.</p>
    <a routerLink="/login" class="btn">Đến trang đăng nhập</a>
  </section>`,
})
export class AccessDenied {}
