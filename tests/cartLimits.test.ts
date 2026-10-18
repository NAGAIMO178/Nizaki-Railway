import { describe, it, expect } from 'vitest';
import { canAddOne, withinLimits, MAX_PER_ITEM, MAX_TOTAL_QUANTITY } from '../src/utils/cartLimits';

describe('デリバリーの数量の上限', () => {
  it('1つの商品は、9個まで', () => {
    expect(canAddOne({ a: MAX_PER_ITEM - 1 }, 'a')).toBe(true);
    expect(canAddOne({ a: MAX_PER_ITEM }, 'a')).toBe(false);
  });

  it('合計は、20個まで(別の商品でも数える)', () => {
    const cart = { a: 9, b: 9, c: 1 }; // 19個
    expect(canAddOne(cart, 'c')).toBe(true);
    expect(canAddOne({ ...cart, c: 2 }, 'd')).toBe(false); // 20個
    expect(MAX_TOTAL_QUANTITY).toBe(20);
  });

  it('すでに注文した分も、足して数える', () => {
    expect(canAddOne({ a: 3 }, 'a', { a: 6 })).toBe(false); // 同じ商品で 9個
    expect(canAddOne({ a: 2 }, 'a', { a: 6 })).toBe(true);
    expect(canAddOne({ b: 1 }, 'b', { a: 9, c: 9 })).toBe(true); // 19個 → 20個
    expect(canAddOne({ b: 2 }, 'b', { a: 9, c: 9 })).toBe(false); // もう 20個
      });

  it('確定前の確認: 上限を超えるカゴ・おかしな数は通さない', () => {
    expect(withinLimits({ a: 9, b: 9, c: 2 })).toBe(true);
    expect(withinLimits({ a: 10 })).toBe(false);
    expect(withinLimits({ a: 9, b: 9, c: 3 })).toBe(false);
    expect(withinLimits({ a: 4 }, { a: 6 })).toBe(false);
    expect(withinLimits({ a: 11101 })).toBe(false);
    expect(withinLimits({ a: 1.5 })).toBe(false);
    expect(withinLimits({ a: -1 })).toBe(false);
    expect(withinLimits({ a: Number.NaN })).toBe(false);
  });
});
