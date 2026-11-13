// 高宮線(非表示)の特急すみかぜ: 見せているあいだ、経路検索 → 予約画面へ・予約の見守り(発車のお知らせ)・走行距離が、すみかぜを扱えること。
// 高宮線を見せるスイッチは、このテストの中だけ入れる(本物のスイッチは、変えない)。
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));
vi.mock('../src/utils/tkLine', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/utils/tkLine')>()), isTkLaunched: () => true, visibleLineCodes: (codes: string[]) => codes }));

import { EXPRESS_TYPES, findExpressTrips, getCachedExpressData, loadExpressData, loadLineData } from '../src/utils/diaTimetable';
import { legGou, reserveTargets } from '../src/utils/routeReserve';
import { searchRoutes } from '../src/utils/routeSearch';
import { resolveOrder } from '../src/utils/useReservationWatcher';
import { computeMileage } from '../src/utils/mileage';
import { legShowsCrowd } from '../src/utils/crowdShown';
import type { ActiveOrder } from '../src/types';

const hm = (h: number, m = 0) => h * 3600 + m * 60;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 12, 0, 0)); // 月曜
  await Promise.all(['Y', 'NI', 'SC', 'TC', 'TK'].map((c) => loadLineData(c)));
  await loadExpressData('sumikaze');
});
afterAll(() => vi.useRealTimers());

describe('経路検索 → 予約画面へ', () => {
  it('大宮 → 高根沢: すみかぜの区間が出て、号数が予約画面の列車名と同じ。「予約へ」の指定が、その列車・区間', async () => {
    const found = await searchRoutes('大宮', '高根沢', hm(17, 0), undefined, 5);
    const r = found.find((x) => x.legs.length === 1 && x.legs[0].typeName === '特急すみかぜ');
    expect(r, '大宮〜高根沢の特急すみかぜが見つからない').toBeTruthy();
    const l = r!.legs[0];
    expect(l.paid).toBe(true);
    expect(legShowsCrowd({ typeName: l.typeName, crowd: 3 })).toBe(false); // 混雑は出さない
    const trip = findExpressTrips(getCachedExpressData('sumikaze')!, '特急すみかぜ', '大宮', '高根沢').find((t) => t.code === l.trainNo)!;
    expect(legGou(l)).toBe(trip.trainName.replace(/^.* /, ''));
    const targets = reserveTargets(r!.legs);
    expect(targets).toHaveLength(1);
    expect(targets[0].preset).toEqual({ expressType: 'sumikaze', boarding: '大宮', destination: '高根沢', trainCode: l.trainNo });
    expect(targets[0].label).toBe(`大宮 → 高根沢 ${trip.depTime} の予約へ`);
  });
});

describe('予約の見守り・走行距離', () => {
  const trip = () => findExpressTrips(getCachedExpressData('sumikaze')!, '特急すみかぜ', '大宮', '高根沢')[0];
  const order = (): ActiveOrder => ({
    orderId: 'EQ-SUMI00010', trainName: trip().trainName, carNo: 1, seatNo: '3A,3B', seatType: 'special', boardingStation: '大宮駅', destinationStation: '高根沢駅',
    departureTime: trip().depTime, arrivalTime: trip().arrTime, reservedDate: '2026-11-02', items: [], totalPrice: 8360, status: 'confirmed', estimatedDeliveryTime: '', deliveryStation: '大宮駅',
  });

  it('予約から、ダイヤ上の列車を探せる(発車のお知らせ・到着の判定に使う)', async () => {
    const r = await resolveOrder(order());
    expect(r).toBeTruthy();
    expect(r!.code).toBe(trip().code);
    expect(r!.lineCode).toBe('TK');
    expect(r!.boarding).toBe('大宮');
    expect(r!.carNo).toBe(1);
    expect(r!.seatNo).toBe('3A,3B');
    expect(r!.depSec).toBe(trip().depSec);
  });

  it('走行距離(マイル): 大宮 → 高根沢 = 127.8km', async () => {
    const m = await computeMileage([{ orderId: 'EQ-SUMI00010', reservedDate: '2026-11-02', trainName: trip().trainName, boardingStation: '大宮駅', destinationStation: '高根沢駅', totalPrice: 8360 }] as never);
    expect(m.log[0].km).toBeCloseTo(127.8, 1);
    expect(m.totalKm).toBeCloseTo(127.8, 1);
  });

  it('特急の名前: 予約の列車名の頭と、表の頭が一致する', () => {
    expect(trip().trainName.startsWith(EXPRESS_TYPES.sumikaze.label)).toBe(true);
  });
});
