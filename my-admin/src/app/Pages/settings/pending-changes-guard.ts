import { CanDeactivateFn } from '@angular/router';

export interface PendingChangesForm {
  canDeactivate(): boolean;
}

// Must be registered with canDeactivate in app-routing-module.ts after group approval.
export const pendingChangesGuard: CanDeactivateFn<PendingChangesForm> = (component) =>
  component.canDeactivate();
