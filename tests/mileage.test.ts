import { describe, expect, it } from 'vitest';
import { rankFor } from '../src/utils/mileage';

describe('マイレージのランク', () => {
  it('0kmは、レギュラー。次のゴールドまで300km', () => {
    const r = rankFor(0);
    expect(r.rank).toBe('レギュラー');
    expect(r.nextRank).toBe('ゴールド');
    expect(r.kmToNext).toBe(300);
    expect(r.progress).toBe(0);
  });

  it('境目: 300kmちょうどで、ゴールド', () => {
    expect(rankFor(299.9).rank).toBe('レギュラー');
    expect(rankFor(300).rank).toBe('ゴールド');
    expect(rankFor(999.9).rank).toBe('ゴールド');
    expect(rankFor(1000).rank).toBe('プレミアム');
  });

  it('進み具合は、0〜1。いちばん上は、次のランクなし・1', () => {
    expect(rankFor(150).progress).toBeCloseTo(0.5);
    const top = rankFor(5000);
    expect(top.rank).toBe('プレミアム');
    expect(top.nextRank).toBeNull();
    expect(top.kmToNext).toBe(0);
    expect(top.progress).toBe(1);
  });
});
