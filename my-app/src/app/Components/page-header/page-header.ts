import { Component } from '@angular/core';

interface NavItem {
  label: string;
  path: string;
}

@Component({
  selector: 'app-page-header',
  standalone: false,
  styleUrl: './page-header.css',
  templateUrl: './page-header.html',
})
export class PageHeader {
  // Menu chính — đường dẫn khớp với app-routing-module.ts
  protected readonly navItems: NavItem[] = [
    { label: 'About', path: '/about-us' },
    { label: 'Browse book', path: '/browse-book' },
    { label: 'Book buyback', path: '/book-buyback' },
    { label: 'Authors', path: '/author-list' },
    { label: 'Lightbook news', path: '/news-list' },
  ];
}
