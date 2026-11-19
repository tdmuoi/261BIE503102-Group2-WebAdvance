import { BookCondition, ConditionGrade, DeliveryMethod, PayoutMethod } from '../../models/buyback';

export interface PriceTier {
  grade: ConditionGrade;
  label: string;
  desc: string;
  minRate: number;
  maxRate: number;
  minScore: number;
}

export const PRICE_TIERS: readonly PriceTier[] = [
  { grade: 'like-new', label: 'Như mới', desc: 'Từ 90% · không vết bẩn, gáy thẳng', minRate: 0.45, maxRate: 0.5, minScore: 90 },
  { grade: 'good', label: 'Tốt', desc: '70–89% · dấu vết sử dụng nhẹ', minRate: 0.3, maxRate: 0.4, minScore: 70 },
  { grade: 'fair', label: 'Khá', desc: '50–69% · ố vàng, bìa trầy nhẹ', minRate: 0.15, maxRate: 0.25, minScore: 50 },
];

export interface ConditionOption {
  id: string;
  label: string;
  score: number | null;
}

export interface ConditionGroup {
  key: 'cover' | 'spine' | 'pages';
  label: string;
  options: readonly ConditionOption[];
}

const PERFECT_SCORE = 100;

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
      { id: 'pages-yellowed', label: 'Ố vàng nhẹ', score: 65 },
      { id: 'pages-missing', label: 'Thiếu hoặc rách trang', score: null },
    ],
  },
];

export function toggleConditionOption(group: ConditionGroup, current: readonly string[], id: string): string[] {
  if (current.includes(id)) return current.filter((value) => value !== id);
  const perfect = group.options.filter((option) => option.score === PERFECT_SCORE).map((option) => option.id);
  return perfect.includes(id) ? [id] : [...current.filter((value) => !perfect.includes(value)), id];
}

export const EXTRA_NONE = 'none';
export const EXTRA_OPTIONS: readonly { id: string; label: string }[] = [
  { id: 'bookmark', label: 'Bookmark / quà tặng gốc' },
  { id: 'jacket', label: 'Áo sách (bìa rời)' },
  { id: 'signed', label: 'Chữ ký tác giả' },
  { id: EXTRA_NONE, label: 'Không có' },
];

export type GradeResult =
  | { status: 'incomplete' }
  | { status: 'rejected' }
  | { status: 'ok'; tier: PriceTier; score: number };

export function gradeOf(condition: BookCondition): GradeResult {
  const scores: number[] = [];
  for (const group of CONDITION_GROUPS) {
    const selected = group.options.filter((option) => condition[group.key].includes(option.id));
    if (!selected.length) return { status: 'incomplete' };
    for (const { score } of selected) {
      if (score === null) return { status: 'rejected' };
      scores.push(score);
    }
  }

  const score = Math.min(...scores);
  const tier = PRICE_TIERS.find((item) => score >= item.minScore);
  return tier ? { status: 'ok', tier, score } : { status: 'rejected' };
}

export interface PriceRange {
  min: number;
  max: number;
}

export interface EstimateInput {
  quantity: number;
  coverPrice: number;
  condition: BookCondition;
}

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
  store: 'Mang đến cửa hàng',
  post: 'Gửi qua bưu điện',
};

export const PAYOUT_LABELS: Record<PayoutMethod, string> = {
  bank: 'Chuyển khoản',
  voucher: 'Voucher +10%',
};

export const STORE = {
  name: 'Cửa hàng Lightbook',
  address: '442 Cộng Hòa, Tân Bình, TP. Hồ Chí Minh',
  hours: 'Mở cửa 8:00–20:00 hằng ngày',
};

export const WAREHOUSE = {
  name: 'Kho Lightbook Buyback',
  address: '442 Cộng Hòa, Tân Bình, TP. Hồ Chí Minh',
};

export const PACKING_GUIDE: readonly string[] = [
  'Bọc từng cuốn trong túi ni lông để chống ẩm.',
  'Xếp sách nằm phẳng trong thùng, chèn giấy hoặc xốp để sách không xê dịch.',
  'Ghi mã phiếu và số điện thoại của bạn ở mặt ngoài thùng.',
];
