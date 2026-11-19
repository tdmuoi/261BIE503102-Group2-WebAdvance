import { Component, input } from '@angular/core';
import { Params } from '@angular/router';

export interface Crumb {
  label: string;
  link?: string | unknown[];
  queryParams?: Params;
}

@Component({
  selector: 'app-breadcrumb',
  standalone: false,
  styleUrl: './breadcrumb.css',
  templateUrl: './breadcrumb.html',
})
export class Breadcrumb {
  readonly items = input.required<Crumb[]>();
}
