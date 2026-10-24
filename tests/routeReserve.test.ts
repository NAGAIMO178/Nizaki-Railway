// 経路の詳細(公開後)の、特急の号数と、予約画面へ飛ぶ指定を、実際のダイヤで調べる。
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { EXPRESS_TYPES, findExpressTrips, getCachedExpressData, getExpressStations, loadExpressData, loadLineData } from '../src/utils/diaTimetable';
import { legGou, reserveTargets } from '../src/utils/routeReserve';
import { searchRoutes } from '../src/utils/routeSearch';
import type { RouteLeg } from '../src/utils/routeSearch';

const hm = (h: number, m = 0) => h * 3600 + m * 60;
const leg = (o: Partial<RouteLeg>): RouteLeg => ({ lineCode: 'SC', lineName: '', trainNo: '', typeAbbr: '', typeName: '', paid: true, destLabel: '', from: '', to: '', ...o }) as RouteLeg;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 12, 0, 0)); // 月曜
  await Promise.all(['Y', 'NI', 'SC', 'TC'].map((c) => loadLineData(c)));
  await Promise.all((Object.keys(EXPRESS_TYPES) as (keyof typeof EXPRESS_TYPES)[]).map((k) => loadExpressData(k)));
});
afterAll(() => vi.useRealTimers());

describe('特急の号数(予約画面と同じ番号)', () => {
  it('どの特急の列車も、予約画面の列車名(findExpressTrips)の号数と一致する', () => {
    for (const key of Object.keys(EXPRESS_TYPES) as (keyof typeof EXPRESS_TYPES)[]) {
      const e = EXPRESS_TYPES[key];
      const data = getCachedExpressData(key)!;
      const names = getExpressStations(data, e.typeName);
      const from = names[0];
      const to = names[names.length - 1];
      const trips = findExpressTrips(data, e.typeName, from, to);
      expect(trips.length, key).toBeGreaterThan(5);
      let checked = 0;
      for (const t of trips) {
        // 路線のコード: つないだデータのときは、乗る駅の、もとの路線
        const lineCode = t.boardLine ?? e.lineCode;
        const g = legGou(leg({ lineCode, trainNo: t.code, typeName: e.typeName, from, to }));
        expect(g, `${key} ${t.code}`).toBe(t.trainName.replace(/^.* /, ''));
        checked++;
      }
      expect(checked).toBe(trips.length);
    }
  });

  it('各停などの有料でない区間には、何も出さない', () => {
    expect(legGou(leg({ paid: false, typeName: '各停', trainNo: '000001' }))).toBeUndefined();
    expect(legGou(leg({ paid: true, typeName: '特急あやみ', trainNo: 'ありえない番号' }))).toBeUndefined();
  });

  it('直通で2つの路線にまたがる特急めぐりは、両方の区間に同じ号数', async () => {
    const found = await searchRoutes('東京', '日立', hm(17, 0), undefined, 3);
    const direct = found.find((r) => r.legs.length === 2 && r.legs[1].through && r.legs[0].trainNo === r.legs[1].trainNo);
    expect(direct, '東京〜日立の、直通のめぐりが見つからない').toBeTruthy();
    const [a, b] = direct!.legs;
    expect(a.lineCode).not.toBe(b.lineCode);
    expect(legGou(a)).toMatch(/^\d+号$/);
    expect(legGou(a)).toBe(legGou(b));
  });
});

describe('予約画面へ(区間ごとのボタン)', () => {
  it('直通の特急めぐりは、1つのボタン。乗る駅・降りる駅・列車が、その経路のとおり。ラベルは、区間と時刻', async () => {
    const found = await searchRoutes('東京', '日立', hm(17, 0), undefined, 3);
    const direct = found.find((r) => r.legs.length === 2 && r.legs[1].through)!;
    const targets = reserveTargets(direct.legs);
    expect(targets).toHaveLength(1);
    const t = targets[0];
    expect(t.preset).toEqual({ expressType: 'meguri', boarding: '東京', destination: '日立', trainCode: direct.legs[0].trainNo });
    const trip = findExpressTrips(getCachedExpressData('meguri')!, EXPRESS_TYPES.meguri.typeName, '東京', '日立').find((x) => x.code === direct.legs[0].trainNo)!;
    expect(t.label).toBe(`東京 → 日立 ${trip.depTime} の予約へ`);
  });

  it('途中で降りる経路は、降りる駅が、その経路で降りる駅(終点ではない)', async () => {
    const found = await searchRoutes('東京', '土浦', hm(9, 0), undefined, 3);
    const r = found.find((x) => x.hasPaid)!;
    const targets = reserveTargets(r.legs);
    expect(targets.length).toBeGreaterThan(0);
    const last = r.legs[r.legs.length - 1];
    expect(targets[targets.length - 1].preset.destination).toBe(last.to);
  });

  it('有料の区間が2つあるときは、ボタンが2つ(区間ごと)', () => {
    const meguri = getCachedExpressData('meguri')!;
    const m = findExpressTrips(meguri, EXPRESS_TYPES.meguri.typeName, '東京', '松戸')[10];
    const ay = getCachedExpressData('ayami')!;
    const aNames = getExpressStations(ay, EXPRESS_TYPES.ayami.typeName);
    const a = findExpressTrips(ay, EXPRESS_TYPES.ayami.typeName, aNames[0], aNames[1])[5];
    const legs = [
      leg({ lineCode: 'SC', trainNo: m.code, typeName: '特急めぐり', from: '東京', to: '松戸' }),
      leg({ lineCode: 'SC', trainNo: a.code, typeName: '特急あやみ', from: aNames[0], to: aNames[1] }),
    ];
    const targets = reserveTargets(legs);
    expect(targets.map((t) => t.preset.expressType)).toEqual(['meguri', 'ayami']);
    expect(targets[0].label).toBe(`東京 → 松戸 ${m.depTime} の予約へ`);
    expect(targets[1].preset.trainCode).toBe(a.code);
  });

  it('有料の区間が無い経路・予約画面で選べない列車は、ボタンを出さない', async () => {
    expect(reserveTargets([leg({ paid: false, typeName: '各停', trainNo: '000001', from: '東京', to: '大宮' })])).toEqual([]);
    expect(reserveTargets([leg({ trainNo: '存在しない', typeName: '特急めぐり', from: '東京', to: '日立' })])).toEqual([]);
    expect(reserveTargets([])).toEqual([]);
  });
});
