import { CanDeactivateFn } from '@angular/router';

export interface PendingChangesForm {
  canDeactivate(): boolean;
}

export const pendingChangesGuard: CanDeactivateFn<PendingChangesForm> = (component) =>
  component.canDeactivate();
