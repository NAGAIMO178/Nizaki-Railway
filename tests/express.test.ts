// 特急の予約(公開後): 直通の特急めぐりは、2つの路線(埼千環状線・土浦線)をつないだ1本の路線(東京〜日立)として扱う。
import { describe, expect, it } from 'vitest';
import {
  findExpressTrips,
  getCachedExpressData,
  getExpressStations,
  getExpressTrainEnds,
  getTripDistanceKm,
  loadExpressData,
  loadLineData,
} from '../src/utils/diaTimetable';
import { calculateFare } from '../src/utils/fare';

describe('特急めぐり(東京〜日立。直通)', () => {
  it('2つの路線をつないだ路線: 東京から日立まで、駅が1本の並びで、営業キロが続いている', async () => {
    const data = await loadExpressData('meguri');
    const names = data.master.stations.map((s) => s[0]);
    expect(names[0]).toBe('東京');
    expect(names[names.length - 1]).toBe('日立');
    expect(names.filter((n) => n === '松戸').length).toBe(1); // 接続の駅は、1つ
    const km = data.master.stations.map((s) => s[1]);
    for (let i = 1; i < km.length; i++) expect(km[i]).toBeGreaterThan(km[i - 1]);
    // 全体の営業キロは、2つの路線の距離の合計(東京〜松戸 19.0km + 松戸〜日立 124.2km)
    expect(getTripDistanceKm(data, '東京', '日立')).toBeCloseTo(143.2, 1);
  });

  it('停車駅: 東京から日立まで、松戸は1回', async () => {
    const data = await loadExpressData('meguri');
    const stops = getExpressStations(data, '特急めぐり');
    expect(stops[0]).toBe('東京');
    expect(stops[stops.length - 1]).toBe('日立');
    expect(stops.filter((n) => n === '松戸').length).toBe(1);
  });

  it('東京→日立: 下りは 1, 3, 5…号で、発車の早い順。運賃は、通しの営業キロで決まる', async () => {
    const data = await loadExpressData('meguri');
    const trips = findExpressTrips(data, '特急めぐり', '東京', '日立');
    expect(trips.length).toBeGreaterThan(20);
    trips.forEach((t, i) => {
      expect(t.trainName).toBe(`特急めぐり ${i * 2 + 1}号`);
      expect(t.arrSec).toBeGreaterThan(t.depSec);
      expect(t.distanceKm).toBeCloseTo(143.2, 1);
      expect(calculateFare(t.distanceKm)).toBe(1980);
      expect(t.destination).toBe('日立');
      expect(t.boardLine).toBe('SC'); // 東京は、埼千環状線の駅
    });
    for (let i = 1; i < trips.length; i++) expect(trips[i].depSec).toBeGreaterThan(trips[i - 1].depSec);
    expect(new Set(trips.map((t) => t.code)).size).toBe(trips.length);
  });

  it('日立→東京: 上りは 2, 4, 6…号', async () => {
    const data = await loadExpressData('meguri');
    const trips = findExpressTrips(data, '特急めぐり', '日立', '東京');
    expect(trips.length).toBeGreaterThan(20);
    trips.forEach((t, i) => expect(t.trainName).toBe(`特急めぐり ${i * 2 + 2}号`));
  });

  it('同じ列車の、東京の発車と日立の到着が、2つの路線のダイヤと合っている', async () => {
    const data = await loadExpressData('meguri');
    const sc = await loadLineData('SC');
    const tc = await loadLineData('TC');
    const trips = findExpressTrips(data, '特急めぐり', '東京', '日立');
    trips.slice(0, 15).forEach((t) => {
      const a = sc.trains.find((x) => x[0] === t.code)!;
      const b = tc.trains.find((x) => x[0] === t.code)!;
      expect(a, `${t.code} が埼千環状線にある`).toBeDefined();
      expect(b, `${t.code} が土浦線にある`).toBeDefined();
      expect(t.depSec).toBe(a[4] + a[5][2]); // 東京(始発)の発
      expect(t.arrSec).toBe(b[4] + b[5][b[5].length - 2]); // 日立(終着)の着
    });
  });

  it('接続駅(松戸)から乗っても、日立へ行ける。発車は、土浦線の部分の松戸の発車', async () => {
    const data = await loadExpressData('meguri');
    const tc = await loadLineData('TC');
    const trips = findExpressTrips(data, '特急めぐり', '松戸', '日立');
    expect(trips.length).toBeGreaterThan(20);
    trips.slice(0, 10).forEach((t) => {
      const b = tc.trains.find((x) => x[0] === t.code)!;
      expect(t.depSec).toBe(b[4] + b[5][2]);
    });
  });

  it('始発と終着: 列車番号から、東京と日立が分かる(列車位置の予約ボタンで使う)', async () => {
    const data = await loadExpressData('meguri');
    const down = findExpressTrips(data, '特急めぐり', '東京', '日立')[0];
    expect(getExpressTrainEnds('meguri', down.code)).toEqual({ from: '東京', to: '日立' });
    const up = findExpressTrips(data, '特急めぐり', '日立', '東京')[0];
    expect(getExpressTrainEnds('meguri', up.code)).toEqual({ from: '日立', to: '東京' });
  });
});

describe('直通でない特急', () => {
  it('Nライナー・あやみは、その路線のデータのまま', async () => {
    const y = await loadLineData('Y');
    const sc = await loadLineData('SC');
    expect((await loadExpressData('nliner')).code).toBe('Y');
    expect((await loadExpressData('ayami')).code).toBe('SC');
    expect(getCachedExpressData('nliner')).toBe(y);
    expect(getCachedExpressData('ayami')).toBe(sc);
  });
});
