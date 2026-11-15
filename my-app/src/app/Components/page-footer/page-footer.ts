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

  // Cột Explore: các trang chính của web khách (đều có route trong app-routing-module.ts)
  protected readonly exploreLinks: FooterLink[] = [
    { label: 'About Lightbook', path: '/about-us' },
    { label: 'Browse Books', path: '/books' },
    { label: 'Book Buyback', path: '/book-buyback' },
    { label: 'Authors', path: '/authors' },
    { label: 'Author Events', path: '/authors/events' },
    { label: 'Lightbook News', path: '/news' },
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
