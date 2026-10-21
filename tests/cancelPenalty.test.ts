import { describe, it, expect } from 'vitest';
import { calcCancelPenalty } from '../src/utils/cancelPenalty';

describe('キャンセルの違約金', () => {
  it('元の料金の1.5倍 + 500円', () => {
    expect(calcCancelPenalty(16000)).toBe(24500);
    expect(calcCancelPenalty(1810)).toBe(3215);
  });

  it('N-POINTで払った分も、元の料金に含める', () => {
    expect(calcCancelPenalty(1000, 810)).toBe(3215);
    expect(calcCancelPenalty(0, 1810)).toBe(3215);
  });

  it('1円の位は、四捨五入', () => {
    expect(calcCancelPenalty(1001)).toBe(2002); // 1501.5 → 1502
    expect(calcCancelPenalty(1)).toBe(502); // 1.5 → 2
  });
});
