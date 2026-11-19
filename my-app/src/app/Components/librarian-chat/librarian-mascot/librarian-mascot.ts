import { Component, input } from '@angular/core';

let nextId = 0;

@Component({
  selector: 'app-librarian-mascot',
  styleUrl: './librarian-mascot.css',
  templateUrl: './librarian-mascot.html',
  host: { '[class.lm-animated]': 'animated()' },
})
export class LibrarianMascot {
  readonly animated = input(false);

  protected readonly uid = `lm${nextId++}`;
  protected readonly bodyFill = `url(#${this.uid}-body)`;
  protected readonly phoneFill = `url(#${this.uid}-phone)`;
}
