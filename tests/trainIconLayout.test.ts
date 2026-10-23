import { describe, it, expect } from 'vitest';
import { trainIconCenter, trainIconStep, isCompactTrainIcons, TRAIN_ICON_LEFT_LIMIT, TRAIN_ICON_RIGHTMOST } from '../src/utils/trainIconLayout';

const centers = (total: number) => Array.from({ length: total }, (_, i) => trainIconCenter(total, i));

describe('列車位置の列車の並べ方', () => {
  it('1本・2本は、これまでどおり(小さくしない)', () => {
    expect(centers(1)).toEqual([-62]);
    expect(centers(2)).toEqual([-86, -56]);
    expect(isCompactTrainIcons(1)).toBe(false);
    expect(isCompactTrainIcons(2)).toBe(false);
  });

  it('3本以上は、小さくして、左端(-112px)を超えず、右端(-56px)を動かさない', () => {
    for (let total = 3; total <= 10; total++) {
      const c = centers(total);
      expect(isCompactTrainIcons(total)).toBe(true);
      expect(c[total - 1]).toBe(TRAIN_ICON_RIGHTMOST);
      expect(Math.min(...c), `total=${total}`).toBeGreaterThanOrEqual(TRAIN_ICON_LEFT_LIMIT);
      // 左から順に、間隔をあけて並ぶ(0が最優等で、いちばん左)
      for (let i = 1; i < total; i++) expect(c[i]).toBeGreaterThan(c[i - 1]);
    }
  });

  it('3本は、間隔22px(通過の札が重ならない広さ)、4本は18px、本数が増えるほどせばまる', () => {
    expect(centers(3)).toEqual([-100, -78, -56]);
    expect(trainIconStep(4)).toBe(18);
    expect(trainIconStep(3)).toBeGreaterThan(trainIconStep(4));
    expect(trainIconStep(4)).toBeGreaterThan(trainIconStep(6));
  });

  it('線路(-24px)と駅の丸(-31px)を跨がない(列車は -36px より左)', () => {
    for (let total = 1; total <= 10; total++) expect(Math.max(...centers(total))).toBeLessThanOrEqual(-36);
  });
});
