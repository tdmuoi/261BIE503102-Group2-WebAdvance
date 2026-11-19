export type BannerPosition = 'hero' | 'flash_sale' | 'promo_strip' | 'home_secondary';

export type BannerState = 'live' | 'scheduled' | 'expired' | 'off';

export interface Banner {
  contractIssues?: string[];
  sourceSchedule?: Record<string, string | null>;
  _id: string;
  name: string;
  title: string;
  subtitle: string;
  image: string | null;
  link: string;
  bgColor: string;
  textColor: string;
  position: BannerPosition;
  order: number;
  active: boolean;
  startDate: string | null;
  endDate: string | null;
  state: BannerState;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BannerListResponse {
  items: Banner[];
  counts: Record<'all' | BannerState, number>;
  positions: BannerPosition[];
}

export interface BannerPayload {
  revision?: string | null;
  name: string;
  title: string;
  subtitle: string;
  image: string;
  link: string;
  bgColor: string;
  textColor: string;
  position: BannerPosition;
  active: boolean;
  startDate: string;
  endDate: string;
}

export type BannerErrors = Partial<Record<keyof BannerPayload, string>>;

export const POSITION_LABELS: Record<BannerPosition, string> = {
  hero: 'Hero trang chủ',
  flash_sale: 'Flash Sale',
  promo_strip: 'Dải quảng cáo',
  home_secondary: 'Banner phụ trang chủ',
};

export function validBannerUrl(value: string, image = false): boolean {
  if (!value) return true;
  if (value.length > 2000 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  if (/^\/(?!\/)/.test(value) || (image && /^images\//.test(value))) return true;
  if (!/^https?:\/\//i.test(value)) return false;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password; }
  catch { return false; }
}
