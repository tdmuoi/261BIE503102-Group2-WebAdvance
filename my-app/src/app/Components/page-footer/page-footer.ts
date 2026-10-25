import { Component, signal } from '@angular/core';

interface FooterLink {
  label: string;
  path: string;
}

@Component({
  selector: 'app-page-footer',
  standalone: false,
  styleUrl: './page-footer.css',
  templateUrl: './page-footer.html',
})
export class PageFooter {
  protected readonly currentYear = new Date().getFullYear();

  // Các trang chưa có route sẽ tạm vào trang 404 cho tới khi nhóm làm xong
  protected readonly exploreLinks: FooterLink[] = [
    { label: 'Seasonal Reading Box', path: '/seasonal-reading-box' },
    { label: 'Virtual Book Clubs', path: '/book-clubs' },
    { label: 'Author Events & Salons', path: '/author-events' },
    { label: 'Stationery & Bookmarks', path: '/stationery' },
  ];

  // Link ngoài — thay bằng địa chỉ thật khi có
  protected readonly legalLinks = [
    { label: 'Privacy Policy', href: '#' },
    { label: 'Terms of Service', href: '#' },
    { label: 'Instagram', href: '#' },
    { label: 'Substack', href: '#' },
  ];

  protected readonly subscribed = signal(false);

  protected onSubscribe(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    if (!input.checkValidity()) return;
    input.value = '';
    this.subscribed.set(true);
  }
}
