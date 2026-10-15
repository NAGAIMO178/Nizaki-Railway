// 経路検索と、特急の号数の付け方を、実際のダイヤ(公開後)で動かして、いつも成り立つことを調べる。
// 日付は、月曜の昼に固定する(自動の遅れは、日付で決まるので)。
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROUTE_OPTIONS, RouteOptions } from '../src/utils/routeOptions';
import { RouteResult, searchRoutes, loadRouteStations, TRANSFER_SEC, RELAXED_TRANSFER_SEC } from '../src/utils/routeSearch';
import { findExpressTrips, loadLineData } from '../src/utils/diaTimetable';
import { calculateFare } from '../src/utils/fare';

const opts = (o: Partial<RouteOptions> = {}): RouteOptions => ({ ...DEFAULT_ROUTE_OPTIONS, ...o });
const hm = (h: number, m = 0) => h * 3600 + m * 60;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 12, 0, 0)); // 月曜
});
afterAll(() => vi.useRealTimers());

// 駅の組み合わせと出発時刻を、いつも同じ順で選ぶ
const samplePairs = async (n: number) => {
  const names = await loadRouteStations();
  let seed = 20261101;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const out: { a: string; b: string; ready: number }[] = [];
  while (out.length < n) {
    const a = names[Math.floor(rnd() * names.length)];
    const b = names[Math.floor(rnd() * names.length)];
    if (a !== b) out.push({ a, b, ready: hm(6 + Math.floor(rnd() * 14), Math.floor(rnd() * 60)) });
  }
  return out;
};

const checkRoute = (r: RouteResult, from: string, to: string) => {
  expect(r.legs[0].from).toBe(from);
  expect(r.legs[r.legs.length - 1].to).toBe(to);
  expect(r.arrSec).toBeGreaterThan(r.depSec);
  // 直通(乗ったまま続く区間)は、乗換に数えない
  expect(r.transfers).toBe(r.legs.filter((l) => !l.through).length - 1);
  expect(r.connections.length).toBe(r.legs.length - 1);
  expect(r.risk).toBeGreaterThanOrEqual(0);
  expect(r.risk).toBeLessThanOrEqual(1);
  r.legs.forEach((leg, i) => {
    expect(leg.arrSec).toBeGreaterThan(leg.depSec);
    if (i > 0) {
      const prev = r.legs[i - 1];
      expect(leg.from).toBe(prev.to); // 同じ駅で乗り継ぐ
      if (leg.through) {
        // 直通: 同じ列車・同じ遅れで、降りずに続く。別の路線で、乗換の余裕は求めない
        expect(leg.trainNo).toBe(prev.trainNo);
        expect(leg.lineCode).not.toBe(prev.lineCode);
        expect(leg.delayMin).toBe(prev.delayMin);
        expect(leg.depSec).toBeGreaterThanOrEqual(prev.arrSec);
        expect(r.connections[i - 1]).toMatchObject({ through: true, level: 'ok', risk: 0 });
      } else {
        expect(r.connections[i - 1].through).toBeUndefined();
      }
    }
  });
  expect(r.legs[0].through).toBeUndefined();
  expect(r.fare).toBeGreaterThan(0);
};

// 乗換の判定は、乗り換える所(直通でない所)だけに見る
const realTransfers = (r: RouteResult) => r.connections.filter((c) => !c.through);

describe('経路検索', () => {
  it('東京→日立: 朝に、乗り方が見つかる。つながりに、つじつまが合っている', async () => {
    const res = await searchRoutes('東京', '日立', hm(6), opts(), 3);
    expect(res.length).toBeGreaterThan(0);
    res.forEach((r) => checkRoute(r, '東京', '日立'));
  });

  it('終電のあとは、見つからない(空の結果)', async () => {
    expect(await searchRoutes('東京', '日立', hm(23, 59), opts(), 3)).toEqual([]);
  });

  it('同じ駅や、存在しない駅は、空の結果', async () => {
    expect(await searchRoutes('東京', '東京', hm(8), opts())).toEqual([]);
    expect(await searchRoutes('東京', 'どこにもない駅', hm(8), opts())).toEqual([]);
  });

  it('リアルタイム検索のとき: 乗換は、必ず乗り継げる(最短の4分以上)。「間に合わない」は出ない', async () => {
    for (const { a, b, ready } of await samplePairs(40)) {
      const res = await searchRoutes(a, b, ready, opts({ realtime: true }), 3);
      res.forEach((r) => {
        checkRoute(r, a, b);
        realTransfers(r).forEach((c) => {
          expect(c.level, `${a}→${b} ${c.station}`).not.toBe('fail');
          expect(c.gapMin, `${a}→${b} ${c.station}`).toBeGreaterThanOrEqual(TRANSFER_SEC / 60 - 0.05);
        });
      });
    }
  });

  it('ゆったりの乗換: 乗換は、8分以上', async () => {
    for (const { a, b, ready } of await samplePairs(25)) {
      const res = await searchRoutes(a, b, ready, opts({ relaxedTransfer: true }), 3);
      res.forEach((r) => realTransfers(r).forEach((c) => expect(c.gapMin, `${a}→${b}`).toBeGreaterThanOrEqual(RELAXED_TRANSFER_SEC / 60 - 0.05)));
    }
  });

  it('乗換なしの指定: 乗換のある結果は、出ない', async () => {
    for (const { a, b, ready } of await samplePairs(25)) {
      const res = await searchRoutes(a, b, ready, opts({ maxTransfers: 0 }), 3);
      res.forEach((r) => expect(r.transfers).toBe(0));
    }
  });

  it('乗換の警告の段階は、余裕の分数と合っている(リアルタイム検索でないときも)', async () => {
    let fails = 0;
    let tights = 0;
    for (const { a, b, ready } of await samplePairs(40)) {
      const res = await searchRoutes(a, b, ready, opts({ realtime: false }), 3);
      res.forEach((r) =>
        realTransfers(r).forEach((c) => {
          if (c.level === 'fail') {
            fails++;
            expect(c.gapMin).toBeLessThan(TRANSFER_SEC / 60 + 0.05);
            expect(c.risk).toBe(1);
          } else if (c.level === 'tight') {
            tights++;
            expect(c.gapMin).toBeGreaterThanOrEqual(TRANSFER_SEC / 60 - 0.05);
            expect(c.gapMin).toBeLessThan(TRANSFER_SEC / 60 + 1 + 0.05);
          } else {
            expect(c.gapMin).toBeGreaterThanOrEqual(TRANSFER_SEC / 60 + 1 - 0.05);
          }
          expect(c.risk).toBeGreaterThanOrEqual(0);
          expect(c.risk).toBeLessThanOrEqual(1);
        })
      );
    }
    // 余裕の少ない乗換が、どこかで出る(出なくなったら、判定が壊れている)。「間に合わない」は、まれなので、数は問わない
    expect(tights).toBeGreaterThan(0);
    expect(fails).toBeGreaterThanOrEqual(0);
  });

  it('乗換がなければ、失敗する確率は0', async () => {
    for (const { a, b, ready } of await samplePairs(25)) {
      const res = await searchRoutes(a, b, ready, opts(), 3);
      res.filter((r) => r.transfers === 0).forEach((r) => expect(r.risk).toBe(0));
    }
  });

  it('遅れに強い順: 失敗する確率の低い順に並ぶ(同じ確率なら、早く着く順)', async () => {
    let checked = 0;
    for (const { a, b, ready } of await samplePairs(40)) {
      const res = await searchRoutes(a, b, ready, opts({ sortBy: 'safe' }), 3);
      res.forEach((r) => checkRoute(r, a, b));
      for (let i = 1; i < res.length; i++) {
        const p = Math.round(res[i - 1].risk * 1000);
        const q = Math.round(res[i].risk * 1000);
        expect(p, `${a}→${b}`).toBeLessThanOrEqual(q);
        if (p === q) expect(res[i - 1].arrSec).toBeLessThanOrEqual(res[i].arrSec);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('空いている順: 混雑の点数の低い順に並ぶ', async () => {
    for (const { a, b, ready } of await samplePairs(25)) {
      const res = await searchRoutes(a, b, ready, opts({ sortBy: 'crowd' }), 3);
      for (let i = 1; i < res.length; i++) {
        expect(res[i - 1].crowdScore ?? 99).toBeLessThanOrEqual(res[i].crowdScore ?? 99);
      }
    }
  });
});

describe('直通運転', () => {
  it('東京→日立: 特急めぐりに乗ったまま行ける(乗換なし)。運賃は、全区間の営業キロを通しで計算する', async () => {
    const res = await searchRoutes('東京', '日立', hm(6), opts({ maxTransfers: 0 }), 3);
    expect(res.length).toBeGreaterThan(0);
    res.forEach((r) => {
      checkRoute(r, '東京', '日立');
      expect(r.transfers).toBe(0);
      expect(r.legs.map((l) => l.lineCode)).toEqual(['SC', 'TC']);
      expect(r.legs[1].through).toBe(true);
      // 運賃は、2つの区間の営業キロを足した全体(約143km)の区分
      expect(r.km).toBeCloseTo(r.legs[0].km + r.legs[1].km, 0);
      expect(r.fare).toBe(calculateFare(r.km));
      // 通しの運賃は、区間ごとの運賃を足したものより、安い
      expect(r.fare).toBeLessThan(calculateFare(r.legs[0].km) + calculateFare(r.legs[1].km));
    });
  });

  it('越谷レイクタウン→池袋: 大宮でつながる直通(越谷経由)に、乗ったまま行ける', async () => {
    const res = await searchRoutes('越谷レイクタウン', '池袋', hm(8), opts({ maxTransfers: 0 }), 3);
    expect(res.length).toBeGreaterThan(0);
    res.forEach((r) => {
      checkRoute(r, '越谷レイクタウン', '池袋');
      expect(r.legs.map((l) => l.lineCode)).toEqual(['Y', 'SC']);
      expect(r.legs[0].to).toBe('大宮');
    });
  });

  it('逆向き(土浦→東京)も、乗ったまま行ける', async () => {
    const res = await searchRoutes('土浦', '東京', hm(8), opts({ maxTransfers: 0 }), 3);
    expect(res.length).toBeGreaterThan(0);
    res.forEach((r) => {
      checkRoute(r, '土浦', '東京');
      expect(r.legs.map((l) => l.lineCode)).toEqual(['TC', 'SC']);
    });
  });

  it('直通の部分は、リアルタイム検索でなくても、遅れは同じ(同じ列車)', async () => {
    let through = 0;
    for (const { a, b, ready } of await samplePairs(40)) {
      for (const realtime of [true, false]) {
        const res = await searchRoutes(a, b, ready, opts({ realtime }), 3);
        res.forEach((r) => {
          checkRoute(r, a, b);
          through += r.legs.filter((l) => l.through).length;
        });
      }
    }
    // 直通を使う結果が、どこかで出る(出なくなったら、直通の探し方が壊れている)
    expect(through).toBeGreaterThan(0);
  });
});

describe('特急の号数', () => {
  it('Nライナー 東京→大宮: 下りは 1, 3, 5…号で、発車の早い順。列車番号は重ならない', async () => {
    const data = await loadLineData('Y');
    const trips = findExpressTrips(data, '特急(Nライナー)', '東京', '大宮');
    expect(trips.length).toBeGreaterThan(5);
    trips.forEach((t, i) => expect(t.trainName).toBe(`特急Nライナー ${i * 2 + 1}号`));
    for (let i = 1; i < trips.length; i++) expect(trips[i].depSec).toBeGreaterThan(trips[i - 1].depSec);
    expect(new Set(trips.map((t) => t.code)).size).toBe(trips.length);
  });

  it('Nライナー 大宮→東京: 上りは 2, 4, 6…号', async () => {
    const data = await loadLineData('Y');
    const trips = findExpressTrips(data, '特急(Nライナー)', '大宮', '東京');
    expect(trips.length).toBeGreaterThan(5);
    trips.forEach((t, i) => expect(t.trainName).toBe(`特急Nライナー ${i * 2 + 2}号`));
  });
});
