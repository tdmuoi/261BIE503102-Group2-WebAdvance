import { Location } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ICONS } from '../../Components/admin-layout/admin-layout';

interface Shortcut {
  title: string;
  description: string;
  link: string;
  icon: string;
}

@Component({
  selector: 'app-page-not-found',
  standalone: false,
  styleUrl: './page-not-found.css',
  templateUrl: './page-not-found.html',
})
export class PageNotFound {
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  readonly icons = ICONS;
  readonly currentPath = this.router.url.split(/[?#]/)[0] || '/';
  readonly shortcuts: Shortcut[] = [
    { title: 'Đơn hàng', description: 'Theo dõi đơn', link: '/orders', icon: ICONS.order },
    { title: 'Sách', description: 'Quản lý kho sách', link: '/book-list', icon: ICONS.book },
    { title: 'Thanh lý', description: 'Yêu cầu thanh lý', link: '/buyback-requests', icon: ICONS.buyback },
    { title: 'Tài khoản', description: 'Quản lý khách hàng', link: '/accounts', icon: ICONS.users },
  ];

  goBack(): void {
    this.location.back();
  }

  search(keyword: string): void {
    const query = keyword.trim();
    this.router.navigate(['/book-list'], { queryParams: query ? { q: query } : {} });
  }
}
