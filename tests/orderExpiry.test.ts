import { describe, expect, it } from 'vitest';
import type { ActiveOrder } from '../src/types';
import { getLocalDateString, getOrderExpiryTimestamp, isOrderExpired } from '../src/utils/orderExpiry';

const order = (over: Partial<ActiveOrder>): ActiveOrder => ({
  orderId: 'T1',
  trainName: '特急めぐり 3号',
  carNo: 1,
  seatNo: '1A',
  items: [],
  totalPrice: 0,
  status: 'confirmed',
  estimatedDeliveryTime: '',
  deliveryStation: '',
  ...over,
});

describe('予約の有効期限', () => {
  it('日付の文字列は、ゼロ埋めの YYYY-MM-DD', () => {
    expect(getLocalDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(getLocalDateString(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('期限は、予約日の到着時刻', () => {
    const ts = getOrderExpiryTimestamp(order({ reservedDate: '2026-11-01', departureTime: '10:00', arrivalTime: '12:30' }));
    expect(ts).toBe(new Date(2026, 10, 1, 12, 30).getTime());
  });

  it('到着時刻がなければ、発車時刻を使う', () => {
    const ts = getOrderExpiryTimestamp(order({ reservedDate: '2026-11-01', departureTime: '10:00' }));
    expect(ts).toBe(new Date(2026, 10, 1, 10, 0).getTime());
  });

  it('到着が発車より早ければ、日またぎで翌日', () => {
    const ts = getOrderExpiryTimestamp(order({ reservedDate: '2026-11-01', departureTime: '23:30', arrivalTime: '00:20' }));
    expect(ts).toBe(new Date(2026, 10, 2, 0, 20).getTime());
  });

  it('日付や時刻が分からなければ、期限なし(null)で、切れない', () => {
    expect(getOrderExpiryTimestamp(order({ departureTime: '10:00' }))).toBeNull();
    expect(getOrderExpiryTimestamp(order({ reservedDate: '2026-11-01' }))).toBeNull();
    expect(getOrderExpiryTimestamp(order({ reservedDate: 'xxxx', departureTime: '10:00' }))).toBeNull();
    expect(getOrderExpiryTimestamp(order({ reservedDate: '2026-11-01', arrivalTime: 'ab:cd' }))).toBeNull();
    expect(isOrderExpired(order({}), Date.now())).toBe(false);
  });

  it('期限ちょうどから、切れる', () => {
    const o = order({ reservedDate: '2026-11-01', departureTime: '10:00', arrivalTime: '12:30' });
    const ts = new Date(2026, 10, 1, 12, 30).getTime();
    expect(isOrderExpired(o, ts - 1)).toBe(false);
    expect(isOrderExpired(o, ts)).toBe(true);
  });
});
