/** Vị trí đặt banner trên web khách */
export type BannerPosition = 'hero' | 'flash_sale' | 'promo_strip';

/** live: đang hiển thị | scheduled: chưa tới ngày | expired: đã hết hạn | off: admin tắt */
export type BannerState = 'live' | 'scheduled' | 'expired' | 'off';

/** Banner từ GET /api/admin/banners (my-server/routes/admin-banners.js) */
export interface Banner {
  _id: string;
  /** Tên nội bộ để admin nhận biết, không hiện cho khách */
  name: string;
  /** Chữ lớn trên banner (bỏ trống nếu ảnh đã có chữ) */
  title: string;
  subtitle: string;
  image: string | null;
  /** Bấm vào banner thì đi tới đâu: /books?type=ebook hoặc https://... */
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

/** Dữ liệu form gửi lên. Ngày dạng 'YYYY-MM-DD' (giờ Việt Nam), bỏ trống = không giới hạn */
export interface BannerPayload {
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
};
