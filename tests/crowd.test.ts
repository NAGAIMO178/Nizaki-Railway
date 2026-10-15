import { describe, expect, it } from 'vitest';
import { bumpForDelay, crowdDelayRate, CROWD_MAX_LEVEL, dayTypeOf } from '../src/utils/crowd';

describe('混雑の計算', () => {
  it('土曜・日曜は「土休日」、ほかは「平日」', () => {
    expect(dayTypeOf(new Date(2026, 10, 2, 12).getTime())).toBe('wd'); // 月
    expect(dayTypeOf(new Date(2026, 10, 6, 12).getTime())).toBe('wd'); // 金
    expect(dayTypeOf(new Date(2026, 10, 7, 12).getTime())).toBe('we'); // 土
    expect(dayTypeOf(new Date(2026, 10, 8, 12).getTime())).toBe('we'); // 日
  });

  it('3分以上遅れた列車は、混雑を1つ上げる。上限を超えない', () => {
    expect(bumpForDelay(3, undefined)).toBe(3);
    expect(bumpForDelay(3, 0)).toBe(3);
    expect(bumpForDelay(3, 2)).toBe(3);
    expect(bumpForDelay(3, 3)).toBe(4);
    expect(bumpForDelay(CROWD_MAX_LEVEL, 10)).toBe(CROWD_MAX_LEVEL);
  });

  it('混んだ列車ほど、遅れやすい。レベルの範囲の外は、端に合わせる', () => {
    let prev = 0;
    for (let lv = 1; lv <= CROWD_MAX_LEVEL; lv++) {
      const r = crowdDelayRate(lv);
      expect(r).toBeGreaterThan(prev);
      expect(r).toBeLessThan(1);
      prev = r;
    }
    expect(crowdDelayRate(0)).toBe(crowdDelayRate(1));
    expect(crowdDelayRate(99)).toBe(crowdDelayRate(CROWD_MAX_LEVEL));
  });
});
