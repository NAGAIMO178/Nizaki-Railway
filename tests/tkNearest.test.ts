// 最寄り駅(位置情報から駅を決める): 高宮線の13駅(大宮は神埼線 Y12 と同じ駅)。見せないあいだは、4路線74駅のまま。
import { afterEach, describe, expect, it, vi } from 'vitest';

const sw = vi.hoisted(() => ({ launched: false }));
vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));
vi.mock('../src/utils/tkLine', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/utils/tkLine')>()), isTkLaunched: () => sw.launched }));

import { calculateDistanceKm, findNearestStation, KANZAKI_STATION_GEOS, stationGeos, TK_STATION_COORDS, TK_STATION_GEOS } from '../src/utils/nearestStation';
import { departureFromCoords } from '../src/utils/departureFromLocation';
import { TK_STATION_NAMES } from '../src/utils/tkLine';

const locateAt = (lat: number, lng: number) =>
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: lat, longitude: lng } }) } });

afterEach(() => {
  sw.launched = false;
  vi.unstubAllGlobals();
});

describe('見せないとき(既定): 候補は、4路線の74駅のまま', () => {
  it('駅の一覧は、これまでの74駅そのもの。高宮線は入らない', () => {
    expect(stationGeos()).toBe(KANZAKI_STATION_GEOS);
    expect(stationGeos()).toHaveLength(74);
    expect(stationGeos().some((g) => g.code.startsWith('TK'))).toBe(false);
    expect(new Set(stationGeos().map((g) => g.lineName)).size).toBe(4);
  });

  it('高宮線の駅のそばでも、高宮線の駅にはならない(経路検索の出発駅・最寄り駅のどちらも)', async () => {
    const takanezawa = TK_STATION_GEOS[TK_STATION_GEOS.length - 1];
    expect(departureFromCoords(takanezawa.lat, takanezawa.lng, [...TK_STATION_NAMES])).toBeNull();
    locateAt(takanezawa.lat, takanezawa.lng);
    const res = await findNearestStation();
    expect(res.station?.code.startsWith('TK')).toBe(false);
    expect(res.isWithinRange).toBe(false);
  });
});

describe('見せるとき: 高宮線の12駅(大宮を除く)が、候補に入る', () => {
  it('74 + 12 = 86駅。大宮は、高宮線の分を足さない(TK01 の候補は無い)。駅の名前・番号は、TK_STATION_NAMES の並びのとおり', () => {
    sw.launched = true;
    const all = stationGeos();
    expect(all).toHaveLength(86);
    expect(all.slice(0, 74)).toEqual(KANZAKI_STATION_GEOS);
    expect(all.filter((g) => g.code === 'TK01')).toEqual([]);
    expect(all.filter((g) => g.name === '大宮').map((g) => g.code)).toEqual(['Y12', 'SC11']);
    expect(TK_STATION_COORDS).toHaveLength(TK_STATION_NAMES.length - 1);
    expect(TK_STATION_GEOS.map((g) => g.name)).toEqual(TK_STATION_NAMES.slice(1));
    expect(TK_STATION_GEOS.map((g) => g.code)).toEqual(TK_STATION_NAMES.slice(1).map((_, i) => `TK${String(i + 2).padStart(2, '0')}`));
    expect(new Set(all.map((g) => g.id)).size).toBe(86);
  });

  it('座標は、ユーザーが届けたとおり(羽貫・宇都宮・高根沢)。隣り合う駅の距離の合計は、路線の 127.8km に近い(124.3km)', () => {
    expect(TK_STATION_GEOS[0]).toMatchObject({ lat: 36.00751475276408, lng: 139.60846768824695 });
    expect(TK_STATION_GEOS[9]).toMatchObject({ lat: 36.558954401568506, lng: 139.89845109745053 });
    expect(TK_STATION_GEOS[11]).toMatchObject({ lat: 36.624419555624925, lng: 139.99304989679882 });
    const oomiya = KANZAKI_STATION_GEOS.find((g) => g.code === 'Y12')!;
    const pts = [[oomiya.lat, oomiya.lng], ...TK_STATION_COORDS];
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += haversine(pts[i - 1], pts[i]);
    expect(total).toBeGreaterThan(123.5);
    expect(total).toBeLessThan(125.5);
  });

  it('各駅のそばの座標は、その駅になる(経路検索の出発駅)。大宮のそばは、これまでどおり大宮', () => {
    sw.launched = true;
    for (const g of TK_STATION_GEOS) expect(departureFromCoords(g.lat, g.lng, [...TK_STATION_NAMES]), g.name).toBe(g.name);
    const oomiya = KANZAKI_STATION_GEOS.find((g) => g.code === 'Y12')!;
    expect(departureFromCoords(oomiya.lat, oomiya.lng, [...TK_STATION_NAMES])).toBe('大宮');
  });

  it('最寄り駅の判定(位置情報)も、高宮線の駅を返す。大宮の近くは、高宮線でなく、これまでの大宮', async () => {
    sw.launched = true;
    const utsunomiya = TK_STATION_GEOS.find((g) => g.name === TK_STATION_NAMES[10])!;
    locateAt(utsunomiya.lat + 0.001, utsunomiya.lng);
    const res = await findNearestStation();
    expect(res.station).toMatchObject({ name: TK_STATION_NAMES[10], code: 'TK11', lineName: '5. 高宮線' });
    expect(res.isWithinRange).toBe(true);

    const oomiya = KANZAKI_STATION_GEOS.find((g) => g.code === 'Y12')!;
    locateAt(oomiya.lat, oomiya.lng);
    expect((await findNearestStation()).station?.name).toBe('大宮');
  });
});

const haversine = (a: number[], b: number[]) => calculateDistanceKm(a[0], a[1], b[0], b[1]);
