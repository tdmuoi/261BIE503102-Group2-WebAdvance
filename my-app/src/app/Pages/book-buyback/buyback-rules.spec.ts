import { BookCondition } from '../../models/buyback';
import { CONDITION_GROUPS, estimatePrice, gradeOf, toggleConditionOption } from './buyback-rules';

const condition = (cover: string, spine: string, pages: string): BookCondition => ({ cover: [cover], spine: [spine], pages: [pages], extras: [] });

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
    expect(gradeOf({ cover: ['cover-intact'], spine: [], pages: [], extras: [] }).status).toBe('incomplete');
  });

  it('thiếu / rách trang thì không nhận', () => {
    expect(gradeOf(condition('cover-intact', 'spine-straight', 'pages-missing')).status).toBe('rejected');
  });

  it('chọn nhiều trong một phần thì lấy lựa chọn tệ nhất', () => {
    const result = gradeOf({ cover: ['cover-scratched', 'cover-faded'], spine: ['spine-straight'], pages: ['pages-clean'], extras: [] });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.tier.label).toBe('Khá');
      expect(result.score).toBe(60);
    }
  });

  it('có một lựa chọn không nhận thì cả cuốn không nhận', () => {
    const result = gradeOf({ cover: ['cover-intact'], spine: ['spine-straight'], pages: ['pages-notes', 'pages-missing'], extras: [] });
    expect(result.status).toBe('rejected');
  });

  it('chọn được nhiều chip hư hỏng, bấm lại thì bỏ chọn', () => {
    const cover = CONDITION_GROUPS[0];
    const picked = toggleConditionOption(cover, ['cover-scratched'], 'cover-faded');
    expect(picked).toEqual(['cover-scratched', 'cover-faded']);
    expect(toggleConditionOption(cover, picked, 'cover-faded')).toEqual(['cover-scratched']);
  });

  it('"Nguyên vẹn" không đi cùng lựa chọn báo hư hỏng', () => {
    const cover = CONDITION_GROUPS[0];
    expect(toggleConditionOption(cover, ['cover-scratched', 'cover-faded'], 'cover-intact')).toEqual(['cover-intact']);
    expect(toggleConditionOption(cover, ['cover-intact'], 'cover-torn')).toEqual(['cover-torn']);
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
