// イベントの対象の予約: 本物の公開のあと、乗車日がイベントの開始(2026-11-01)より前の予約は、対象にならない。
// 公開日(LAUNCH_AT)が入ったときの動きを、作りものの公開日で確かめる(preview の指定があっても、本物の公開が優先)。
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/launch', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/utils/launch')>();
  return { ...orig, LAUNCH_AT: '2026-10-31T00:00:00+09:00', isLaunched: () => true };
});

import { EXPRESS_TYPES, findExpressTrips, getCachedExpressData } from '../src/utils/diaTimetable';
import { EventOrder, getEventState, isEventEligibleOrder, loadEventData } from '../src/utils/eventTare';

const meguri = () => findExpressTrips(getCachedExpressData('meguri')!, EXPRESS_TYPES.meguri.typeName, '東京', '日立');
const orderOf = (i: number, reservedDate: string, over: Partial<EventOrder> = {}): EventOrder => ({
  orderId: `o-${reservedDate}-${i}`,
  trainName: meguri()[i].trainName,
  boardingStation: '東京駅',
  destinationStation: '土浦駅',
  reservedDate,
  ...over,
});

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 12, 0)); // 本物の公開のあと
  await loadEventData();
});
afterAll(() => vi.useRealTimers());

describe('乗車日が、イベントの開始より前の予約', () => {
  it('2026-11-01 より前の予約は、対象にならない。11-01 以降は、対象', () => {
    expect(isEventEligibleOrder(orderOf(5, '2026-10-01'))).toBe(false);
    expect(isEventEligibleOrder(orderOf(5, '2026-10-31'))).toBe(false);
    expect(isEventEligibleOrder(orderOf(1, '2026-11-01'))).toBe(true); // 11/1 の5:35発
    expect(isEventEligibleOrder(orderOf(5, '2026-11-02'))).toBe(true);
    expect(isEventEligibleOrder(orderOf(5, '2026-12-24'))).toBe(true);
  });

  it('昔の予約だけでは、イベントは進まない(「土浦に着いた」にならない)', () => {
    const old = orderOf(5, '2026-10-01');
    const s = getEventState(true, [old], new Date(2026, 10, 2, 12, 0));
    expect(s.phase).toBe('no_reservation');
    expect(s.orderId).toBeNull();
  });

  it('古い予約と新しい予約があるときは、新しいほうが選ばれる(どの順に渡しても)', () => {
    const old = orderOf(5, '2026-10-01');
    const fresh = orderOf(20, '2026-11-02');
    const now = new Date(2026, 10, 2, 9, 0);
    expect(getEventState(true, [old, fresh], now).orderId).toBe(fresh.orderId);
    expect(getEventState(true, [fresh, old], now).orderId).toBe(fresh.orderId);
  });

  it('取り消した予約は、日付がよくても、対象にならない', () => {
    expect(isEventEligibleOrder(orderOf(5, '2026-11-02', { result: 'cancelled' }))).toBe(false);
    const state = getEventState(true, [orderOf(5, '2026-11-02', { result: 'cancelled' })], new Date(2026, 10, 2, 9, 0));
    expect(state.phase).toBe('no_reservation');
  });
});
