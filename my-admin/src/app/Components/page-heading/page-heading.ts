import { Component, Input } from '@angular/core';

export interface Breadcrumb {
  label: string;
  link?: string;
}

@Component({
  selector: 'app-page-heading',
  standalone: false,
  styleUrl: './page-heading.css',
  templateUrl: './page-heading.html',
  host: { '[attr.title]': 'null' },
})
export class PageHeading {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() breadcrumbs: Breadcrumb[] = [];
  @Input() hideRoot = false;
}
