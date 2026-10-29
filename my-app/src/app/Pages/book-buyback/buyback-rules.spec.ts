import { BookCondition } from '../../models/buyback';
import { estimatePrice, gradeOf } from './buyback-rules';

const condition = (cover: string, spine: string, pages: string): BookCondition => ({ cover, spine, pages, extras: [] });

describe('buyback-rules', () => {
  it('lấy điểm thấp nhất làm hạng (ví dụ Figma: Tốt · ~85%)', () => {
    const result = gradeOf(condition('cover-scratched', 'spine-straight', 'pages-clean'));
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.tier.label).toBe('Tốt');
      expect(result.score).toBe(85);
    }
  });

  it('chưa chọn đủ 3 nhóm thì chưa ước tính', () => {
    expect(gradeOf({ cover: 'cover-intact', spine: null, pages: null, extras: [] }).status).toBe('incomplete');
  });

  it('thiếu / rách trang thì không nhận', () => {
    expect(gradeOf(condition('cover-intact', 'spine-straight', 'pages-missing')).status).toBe('rejected');
  });

  it('129.000đ hạng Tốt → 39.000đ – 52.000đ', () => {
    const range = estimatePrice([{ quantity: 1, coverPrice: 129_000, condition: condition('cover-scratched', 'spine-straight', 'pages-clean') }]);
    expect(range).toEqual({ min: 39_000, max: 52_000 });
  });

  it('cộng dồn nhiều cuốn rồi mới làm tròn', () => {
    const good = condition('cover-scratched', 'spine-straight', 'pages-clean');
    const range = estimatePrice([
      { quantity: 2, coverPrice: 129_000, condition: good },
      { quantity: 1, coverPrice: 80_000, condition: condition('cover-intact', 'spine-straight', 'pages-clean') },
    ]);
    // 258.000 × 30–40% = 77.400 – 103.200; 80.000 × 45–50% = 36.000 – 40.000
    expect(range).toEqual({ min: 113_000, max: 143_000 });
  });
});
