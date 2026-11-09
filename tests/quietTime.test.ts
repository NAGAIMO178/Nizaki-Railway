// 「列車がない時間」を、ダイヤ(最終の到着・始発の発車)から決める。純粋な関数と、実際のダイヤでの検索
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import type { TrainRow } from '../src/utils/diaTimetable';
import { planArrival } from '../src/utils/arrivalPlan';
import { DEFAULT_ROUTE_OPTIONS } from '../src/utils/routeOptions';
import { getCachedQuietWindow, getQuietWindow, loadRouteStations, searchRoutes } from '../src/utils/routeSearch';
import { FALLBACK_QUIET_WINDOW, isQuietTime, minutesOfClock, quietWindowFromBounds, serviceBoundsOf } from '../src/utils/quietTime';

const hm = (h: number, m = 0, s = 0) => h * 3600 + m * 60 + s;
const dia = (code: string): TrainRow[] => JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'public', 'data', 'dia-2', `${code}_trains.json`), 'utf-8'));
// 列車1本(始発 t0 から、駅 0 発・駅 1 着)
const train = (t0: number, travelSec: number): TrainRow => ['1', 0, 'D', 'op', t0, [0, -1, 0, 1, travelSec, -1]] as TrainRow;

describe('最終の到着・始発の発車', () => {
  it('全路線の全列車から、最後の到着と、最初の発車を調べる', () => {
    const b = serviceBoundsOf([[train(hm(5), 600), train(hm(23, 50), 1800)], [train(hm(4, 51), 300)]]);
    expect(b).toEqual({ lastArrSec: hm(23, 50) + 1800, firstDepSec: hm(4, 51) });
  });

  it('列車が無ければ null', () => {
    expect(serviceBoundsOf([])).toBeNull();
    expect(serviceBoundsOf([[]])).toBeNull();
    expect(quietWindowFromBounds(null)).toBeNull();
  });

  it('列車がない時間: 最終の到着の「次の分」から、始発の発車の分の手前まで(24時以降も、日をまたいで扱う)', () => {
    // 最終の到着 24:23:20(0:23:20)・始発 4:51 → 0:24〜4:50
    expect(quietWindowFromBounds({ lastArrSec: hm(24, 23, 20), firstDepSec: hm(4, 51) })).toEqual({ fromMin: 24, toMin: 291 });
    // 最終の到着が、ちょうど 0:23:00 でも、0:23 は、列車がある(まだ到着する)
    expect(quietWindowFromBounds({ lastArrSec: hm(24, 23), firstDepSec: hm(4, 51) })).toEqual({ fromMin: 24, toMin: 291 });
    // 24時前に終わるダイヤ(23:50 着)→ 23:51〜4:51 の手前(日をまたぐ)
    expect(quietWindowFromBounds({ lastArrSec: hm(23, 50), firstDepSec: hm(4, 51) })).toEqual({ fromMin: 23 * 60 + 51, toMin: 291 });
  });
});

describe('列車がない時間か', () => {
  const W = { fromMin: 24, toMin: 291 };

  it('最終の到着の前後・始発の前後', () => {
    for (const t of ['00:00', '00:10', '00:20', '00:23', '04:51', '04:52', '12:00', '23:59']) expect(isQuietTime(t, W), t).toBe(false);
    for (const t of ['00:24', '00:25', '01:00', '03:59', '04:00', '04:50']) expect(isQuietTime(t, W), t).toBe(true);
  });

  it('日をまたぐ範囲(23:51〜4:50)でも、前後が合う', () => {
    const w = { fromMin: 23 * 60 + 51, toMin: 291 };
    for (const t of ['23:50', '12:00', '04:51']) expect(isQuietTime(t, w), t).toBe(false);
    for (const t of ['23:51', '23:59', '00:00', '03:00', '04:50']) expect(isQuietTime(t, w), t).toBe(true);
  });

  it('ダイヤの値が無い・調べられない(null・未定)ときは、安全策: 0:00〜0:29 は探す。0:30〜3:59 は、列車がない', () => {
    for (const w of [null, undefined]) {
      for (const t of ['00:00', '00:29', '04:00', '12:00']) expect(isQuietTime(t, w), `${t} ${w}`).toBe(false);
      for (const t of ['00:30', '01:00', '03:59']) expect(isQuietTime(t, w), `${t} ${w}`).toBe(true);
    }
    expect(FALLBACK_QUIET_WINDOW).toEqual({ fromMin: 30, toMin: 240 });
  });

  it('時刻が読めないときは、列車がない時間ではない', () => {
    for (const t of ['', undefined, '深夜', '25:00', '12:60', '9時']) expect(isQuietTime(t as string | undefined, { fromMin: 24, toMin: 291 }), String(t)).toBe(false);
    expect(minutesOfClock('0:10')).toBe(10);
    expect(minutesOfClock('04:51')).toBe(291);
  });
});

describe('実際のダイヤ(公開後)', () => {
  const NOW = new Date(2026, 10, 2, 22, 0); // 月曜 22:00(「明日」は、火曜)
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    await loadRouteStations();
  });
  afterAll(() => vi.useRealTimers());

  it('最終の到着は 0:23(土浦線)・始発の発車は 4:51。列車がない時間は 0:24〜4:50', async () => {
    const b = serviceBoundsOf(['Y', 'NI', 'SC', 'TC'].map(dia));
    expect(b).not.toBeNull();
    expect(b!.lastArrSec).toBe(hm(24, 23, 20));
    expect(b!.firstDepSec).toBe(hm(4, 51));
    // 読み込み時に、1回だけ調べて覚えた値と、同じ
    expect(await getQuietWindow()).toEqual({ fromMin: 24, toMin: 291 });
    expect(getCachedQuietWindow()).toEqual({ fromMin: 24, toMin: 291 });
  });

  it('出発 0:10(新橋→東京)は、終電が探せる(前日のダイヤの続き 24:10 以降)', async () => {
    const res = await searchRoutes('新橋', '東京', hm(24, 10), { ...DEFAULT_ROUTE_OPTIONS }, 3);
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].depSec).toBeGreaterThanOrEqual(hm(24, 10));
  });

  it('到着 0:20 まで(品川→東京)は、探せる。最終の到着のあとの 0:25・1:00 は、探さず空', async () => {
    const ok = await planArrival({ from: '品川', to: '東京', day: 'tomorrow', arriveBy: '00:20', now: NOW });
    expect(ok.options.length).toBeGreaterThan(0);
    ok.options.forEach((o) => expect(o.arrSec).toBeLessThanOrEqual(hm(24, 20)));
    for (const arriveBy of ['00:25', '01:00', '03:59']) {
      const p = await planArrival({ from: '品川', to: '東京', day: 'tomorrow', arriveBy, now: NOW });
      expect(p.options, arriveBy).toEqual([]);
      expect(p.pickIndex).toBe(-1);
    }
  });
});
