import { describe, expect, it } from 'vitest';
import { calcDeliveryAddPoints, calcReservationPoints } from '../src/utils/points';

describe('予約のポイント(アプリ側。サーバーと同じ数字)', () => {
  it('新しい予約: 3%。最低50pt', () => {
    expect(calcReservationPoints(900)).toBe(50);
    expect(calcReservationPoints(1667)).toBe(50);
    expect(calcReservationPoints(1700)).toBe(51);
    expect(calcReservationPoints(5350)).toBe(160);
  });

  it('デリバリーを足したとき: 増えた金額の3%。最低はなし', () => {
    expect(calcDeliveryAddPoints(450)).toBe(13);
    expect(calcDeliveryAddPoints(1000)).toBe(30);
    expect(calcDeliveryAddPoints(1667)).toBe(50);
    expect(calcDeliveryAddPoints(33)).toBe(0);
  });

  it('金額が0円以下なら、0pt', () => {
    expect(calcDeliveryAddPoints(0)).toBe(0);
    expect(calcDeliveryAddPoints(-500)).toBe(0);
  });
});
