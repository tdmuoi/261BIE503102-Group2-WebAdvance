
import { Component } from '@angular/core';

// Model thong tin dang nhap
// Theo cach tao UserLogin trong Chuong V
export class UserLogin {
  constructor(
    public email: string = '',
    public password: string = '',
    public rememberMe: boolean = false
  ) {}
}

// Kieu du lieu sach hien thi tren trang Login
interface BookPreview {
  _id: string;
  title: string;
  image?: string;
  authorName?: string;
  categoryName?: string;
}

@Component({
  selector: 'app-login',
  standalone: false,
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login {

  // Model su dung cho Two-way Binding
  user = new UserLogin();

  // Trang thai an/hien mat khau
  showPassword: boolean = false;

  // Danh sach sach - se lay tu API sau
  books: BookPreview[] = [];

  // Xu ly khi anh sach khong tai duoc
  onImageError(event: Event): void {
    const image = event.target as HTMLImageElement;

    if (image) {
      image.hidden = true;
    }
  }

  // Xu ly khi nhan nut Dang nhap
  onLogin(): void {

    // Kiem tra email va mat khau
    alert('Thông tin hợp lệ. Đây là minh họa, chưa kết nối API đăng nhập.');
  }
}
