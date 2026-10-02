import { ActiveOrder } from '../types';

export const getLocalDateString = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const toMinutes = (hhmm: string): number | null => {
  const [h, m] = hhmm.split(':').map(Number);
  return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m;
};

// 予約の有効期限(到着時刻)。日付や時刻が分からなければ null(=期限なし扱い)
export const getOrderExpiryTimestamp = (order: ActiveOrder): number | null => {
  const arrival = order.arrivalTime || order.departureTime;
  if (!order.reservedDate || !arrival) return null;

  const [y, mo, d] = order.reservedDate.split('-').map(Number);
  const arrMin = toMinutes(arrival);
  if ([y, mo, d].some(Number.isNaN) || arrMin === null) return null;

  let ts = new Date(y, mo - 1, d, Math.floor(arrMin / 60), arrMin % 60, 0, 0).getTime();
  const depMin = order.departureTime ? toMinutes(order.departureTime) : null;
  if (depMin !== null && arrMin < depMin) ts += 24 * 60 * 60 * 1000; // 日またぎ
  return ts;
};

export const isOrderExpired = (order: ActiveOrder, now: number = Date.now()): boolean => {
  const ts = getOrderExpiryTimestamp(order);
  return ts !== null && now >= ts;
};
