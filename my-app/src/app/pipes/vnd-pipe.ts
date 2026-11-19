import { Pipe, PipeTransform } from '@angular/core';

const formatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

@Pipe({
  name: 'vnd',
  standalone: false,
})
export class VndPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) return '';
    return `${formatter.format(value)}đ`;
  }
}
