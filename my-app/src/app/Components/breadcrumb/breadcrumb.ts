import { Component, input } from '@angular/core';

export interface Crumb {
  label: string;
  /** Không có link = trang hiện tại (mục cuối) */
  link?: string | unknown[];
}

/** Breadcrumb chung — Figma "Breadcrumb" (860:287): mục trước là link stone-600, mục cuối Bold ink */
@Component({
  selector: 'app-breadcrumb',
  standalone: false,
  styleUrl: './breadcrumb.css',
  templateUrl: './breadcrumb.html',
})
export class Breadcrumb {
  readonly items = input.required<Crumb[]>();
}
