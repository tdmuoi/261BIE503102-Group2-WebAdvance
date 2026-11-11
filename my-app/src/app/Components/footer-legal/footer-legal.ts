import { Component } from '@angular/core';

import { POLICIES } from '../../Pages/policies/policy-content';

/**
 * Link mạng xã hội ở chân trang — điền địa chỉ thật khi có.
 * Để trống thì link chưa bấm được.
 */
export const SOCIAL_LINKS = {
  instagram: '',
  facebook: '',
};

/**
 * Nhóm link cuối chân trang: 3 chính sách (mở trang /policies đúng mục), Instagram, Facebook.
 * Dùng trong page-footer: <app-footer-legal />
 */
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
