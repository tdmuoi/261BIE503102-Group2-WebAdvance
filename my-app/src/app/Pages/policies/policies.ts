import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { POLICIES } from './policy-content';

@Component({
  selector: 'app-policies',
  standalone: true,
  imports: [RouterLink],
  styleUrl: './policies.css',
  templateUrl: './policies.html',
})
export class Policies {
  private readonly route = inject(ActivatedRoute);
  readonly policies = POLICIES;

  constructor() {
    this.route.fragment.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((id) => {
      if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 120);
    });
  }
}
