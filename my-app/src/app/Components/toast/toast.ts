import { Component, inject } from '@angular/core';

import { ToastService } from '../../services/toast-service';

/** Vùng hiện thông báo — gắn một lần trong app.html */
@Component({
  selector: 'app-toast',
  standalone: false,
  styleUrl: './toast.css',
  templateUrl: './toast.html',
})
export class ToastHost {
  protected readonly toastService = inject(ToastService);
}
