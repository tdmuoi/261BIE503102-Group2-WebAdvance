import { Component } from '@angular/core';

import { POLICIES } from '../../Pages/policies/policy-content';

export const SOCIAL_LINKS = {
  instagram: '',
  facebook: '',
};

@Component({
  selector: 'app-footer-legal',
  standalone: false,
  styleUrl: './footer-legal.css',
  templateUrl: './footer-legal.html',
})
export class FooterLegal {
  readonly social = SOCIAL_LINKS;
  readonly policies = POLICIES;
}
