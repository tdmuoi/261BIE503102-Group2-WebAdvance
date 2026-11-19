import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';

@Component({
  selector: 'app-buyback-success',
  standalone: false,
  styleUrl: './buyback-success.css',
  templateUrl: './buyback-success.html',
})
export class BuybackSuccess {
  readonly open = input(false);
  readonly code = input<string | null>(null);
  readonly email = input('');
  readonly closed = output<void>();
  readonly restart = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;
      if (this.open() && !dialog.open) dialog.showModal();
      else if (!this.open() && dialog.open) dialog.close();
    });
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.dialog().nativeElement.close();
  }
}
