import { BookCondition, ConditionGrade, DeliveryMethod, PayoutMethod } from '../../models/buyback';

/** Một mức trong "Bảng định giá tham khảo" (Figma 837:3340) */
export interface PriceTier {
  grade: ConditionGrade;
  label: string;
  desc: string;
  /** Khoảng % giá bìa Lightbook trả */
  minRate: number;
  maxRate: number;
  /** Điểm tình trạng thấp nhất của hạng (%) */
  minScore: number;
}

/** Xếp từ cao xuống thấp — gradeOf() duyệt theo thứ tự này */
export const PRICE_TIERS: readonly PriceTier[] = [
  { grade: 'like-new', label: 'Như mới', desc: 'Từ 90% · không vết bẩn, gáy thẳng', minRate: 0.45, maxRate: 0.5, minScore: 90 },
  { grade: 'good', label: 'Tốt', desc: '70–89% · dấu vết sử dụng nhẹ', minRate: 0.3, maxRate: 0.4, minScore: 70 },
  { grade: 'fair', label: 'Khá', desc: '50–69% · ố vàng, bìa trầy nhẹ', minRate: 0.15, maxRate: 0.25, minScore: 50 },
];

export interface ConditionOption {
  id: string;
  label: string;
  /** Điểm tình trạng (%) của lựa chọn. null = Lightbook không nhận sách này */
  score: number | null;
}

export interface ConditionGroup {
  key: 'cover' | 'spine' | 'pages';
  label: string;
  options: readonly ConditionOption[];
}

/** 3 nhóm chọn 1 trong "Tình trạng chi tiết" (Figma 846:3562) */
export const CONDITION_GROUPS: readonly ConditionGroup[] = [
  {
    key: 'cover',
    label: 'Bìa sách',
    options: [
      { id: 'cover-intact', label: 'Nguyên vẹn, không trầy', score: 100 },
      { id: 'cover-scratched', label: 'Trầy xước nhẹ', score: 85 },
      { id: 'cover-torn', label: 'Bong góc / rách nhẹ', score: 65 },
      { id: 'cover-faded', label: 'Ố màu, phai màu', score: 60 },
    ],
  },
  {
    key: 'spine',
    label: 'Gáy sách',
    options: [
      { id: 'spine-straight', label: 'Thẳng, không nứt', score: 100 },
      { id: 'spine-creased', label: 'Có nếp gấp nhẹ', score: 85 },
      { id: 'spine-loose', label: 'Lỏng hoặc nứt gáy', score: 55 },
    ],
  },
  {
    key: 'pages',
    label: 'Ruột sách',
    options: [
      { id: 'pages-clean', label: 'Đủ trang, sạch', score: 100 },
      { id: 'pages-notes', label: 'Có ghi chú / highlight', score: 80 },
      // Bảng định giá xếp "ố vàng" vào hạng Khá
      { id: 'pages-yellowed', label: 'Ố vàng nhẹ', score: 65 },
      // Bảng định giá ghi "Không nhận: rách hoặc thiếu trang"
      { id: 'pages-missing', label: 'Thiếu hoặc rách trang', score: null },
    ],
  },
];

/** Nhóm "Kèm theo" — chọn nhiều, chỉ ghi nhận cho bước thẩm định, không ảnh hưởng hạng */
export const EXTRA_NONE = 'none';
export const EXTRA_OPTIONS: readonly { id: string; label: string }[] = [
  { id: 'bookmark', label: 'Bookmark / quà tặng gốc' },
  { id: 'jacket', label: 'Áo sách (bìa rời)' },
  { id: 'signed', label: 'Chữ ký tác giả' },
  { id: EXTRA_NONE, label: 'Không có' },
];

/** Kết quả ước tính hạng của một cuốn */
export type GradeResult =
  /** Chưa chọn đủ Bìa / Gáy / Ruột */
  | { status: 'incomplete' }
  /** Có lựa chọn Lightbook không nhận (thiếu / rách trang) hoặc điểm dưới hạng Khá */
  | { status: 'rejected' }
  | { status: 'ok'; tier: PriceTier; score: number };

/**
 * Suy ra hạng tình trạng của một cuốn từ các chip đã chọn.
 *
 * Quy tắc:
 * 1. Mỗi lựa chọn ở Bìa / Gáy / Ruột có một "điểm tình trạng" (%) — xem CONDITION_GROUPS.
 * 2. Điểm của cuốn sách = điểm THẤP NHẤT trong 3 nhóm: phần hỏng nhất quyết định giá,
 *    giống cách thẩm định thực tế (bìa đẹp không bù được gáy nứt).
 * 3. Đổi điểm ra hạng theo bảng định giá: từ 90% → Như mới, 70–89% → Tốt, 50–69% → Khá.
 * 4. Chọn "Thiếu hoặc rách trang" (không nhận) hoặc điểm dưới 50% → không đủ điều kiện thu mua.
 * 5. Nhóm "Kèm theo" không ảnh hưởng hạng.
 *
 * Ví dụ theo Figma: Trầy xước nhẹ (85) + Thẳng (100) + Đủ trang (100) → điểm 85 → "Tốt · ~85%".
 */
export function gradeOf(condition: BookCondition): GradeResult {
  const scores: number[] = [];
  for (const group of CONDITION_GROUPS) {
    const selected = group.options.find((option) => option.id === condition[group.key]);
    if (!selected) return { status: 'incomplete' };
    if (selected.score === null) return { status: 'rejected' };
    scores.push(selected.score);
  }

  const score = Math.min(...scores);
  const tier = PRICE_TIERS.find((item) => score >= item.minScore);
  return tier ? { status: 'ok', tier, score } : { status: 'rejected' };
}

export interface PriceRange {
  min: number;
  max: number;
}

/** Thông tin tối thiểu để tính giá một cuốn */
export interface EstimateInput {
  quantity: number;
  coverPrice: number;
  condition: BookCondition;
}

/**
 * Giá ước tính = giá bìa × số lượng × khoảng % của hạng, cộng dồn các cuốn, làm tròn đến nghìn.
 * Cuốn chưa đủ thông tin hoặc không đủ điều kiện thì không tính. Không cuốn nào tính được → null.
 * Ví dụ: 129.000đ, hạng Tốt (30–40%) → 39.000đ – 52.000đ.
 */
export function estimatePrice(items: readonly EstimateInput[]): PriceRange | null {
  let min = 0;
  let max = 0;
  let counted = 0;
  for (const item of items) {
    const result = gradeOf(item.condition);
    if (result.status !== 'ok' || !(item.coverPrice > 0) || !(item.quantity > 0)) continue;
    const base = item.coverPrice * item.quantity;
    min += base * result.tier.minRate;
    max += base * result.tier.maxRate;
    counted++;
  }
  return counted ? { min: roundThousand(min), max: roundThousand(max) } : null;
}

function roundThousand(value: number): number {
  return Math.round(value / 1000) * 1000;
}

export const DELIVERY_LABELS: Record<DeliveryMethod, string> = {
  store: 'Mang đến chi nhánh',
  post: 'Gửi qua bưu điện',
};

export const PAYOUT_LABELS: Record<PayoutMethod, string> = {
  bank: 'Chuyển khoản',
  voucher: 'Voucher +10%',
};

/**
 * Kho nhận sách gửi qua bưu điện. Figma và DB chưa có địa chỉ kho riêng,
 * tạm dùng địa chỉ cửa hàng ở footer (442 Cộng Hòa) — cần xác nhận lại.
 */
export const WAREHOUSE = {
  name: 'Kho Lightbook Buyback',
  address: '442 Cộng Hòa, Tân Bình, TP. Hồ Chí Minh',
};

/** Hướng dẫn đóng gói khi gửi bưu điện */
export const PACKING_GUIDE: readonly string[] = [
  'Bọc từng cuốn trong túi ni lông để chống ẩm.',
  'Xếp sách nằm phẳng trong thùng, chèn giấy hoặc xốp để sách không xê dịch.',
  'Ghi mã phiếu và số điện thoại của bạn ở mặt ngoài thùng.',
];
