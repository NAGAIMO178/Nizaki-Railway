import { describe, expect, it } from 'vitest';
import { calculateFare, fareTierLabel } from '../src/utils/fare';

describe('普通運賃(営業キロの区分)', () => {
  it('キロが0以下なら、0円', () => {
    expect(calculateFare(0)).toBe(0);
    expect(calculateFare(-1)).toBe(0);
  });

  it('区分の境目: 上限ちょうどは下の区分、少し超えると上の区分', () => {
    const table: [number, number][] = [
      [3, 150],
      [3.1, 180],
      [5, 180],
      [5.1, 230],
      [10, 230],
      [10.1, 390],
      [30, 390],
      [30.1, 660],
      [50, 660],
      [50.1, 1000],
      [100, 1000],
      [100.1, 1980],
      [200, 1980],
      [200.1, 3300],
    ];
    table.forEach(([km, fare]) => expect(calculateFare(km), `${km}km`).toBe(fare));
  });

  it('遠いほど、運賃は下がらない', () => {
    let prev = 0;
    for (let km = 0.5; km <= 300; km += 0.5) {
      const f = calculateFare(km);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });

  it('区分の名前が、運賃の区分と合っている', () => {
    expect(fareTierLabel(0)).toBe('—');
    expect(fareTierLabel(3)).toBe('3km以下');
    expect(fareTierLabel(50.1)).toBe('50.1〜100km');
    expect(fareTierLabel(250)).toBe('200.1km以上');
  });
});
