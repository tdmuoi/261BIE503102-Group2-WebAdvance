import { Component, input, model } from '@angular/core';

@Component({
  selector: 'app-quantity-stepper',
  standalone: false,
  styleUrl: './quantity-stepper.css',
  templateUrl: './quantity-stepper.html',
})
export class QuantityStepper {
  readonly value = model(1);
  readonly max = input(Number.MAX_SAFE_INTEGER);

  protected change(delta: number): void {
    this.value.set(Math.min(Math.max(1, this.value() + delta), Math.max(1, this.max())));
  }
}
