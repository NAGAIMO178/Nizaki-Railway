// 経路検索の出発駅を、最寄り駅にする(座標から駅を決める部分)
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { departureFromCoords, locateDepartureStation, MAX_DEPARTURE_KM } from '../src/utils/departureFromLocation';
import { KANZAKI_STATION_GEOS } from '../src/utils/nearestStation';
import { normalizeStationName } from '../src/utils/diaTimetable';
import { loadRouteStations } from '../src/utils/routeSearch';

let stations: string[];
beforeAll(async () => {
  stations = await loadRouteStations();
});

describe('座標から、最寄りの駅', () => {
  it('駅のすぐそばの座標は、その駅の名前(経路検索の駅の名前)になる', () => {
    const found = KANZAKI_STATION_GEOS.filter((g) => stations.includes(normalizeStationName(g.name)));
    expect(found.length).toBeGreaterThan(60);
    for (const g of found) expect(departureFromCoords(g.lat, g.lng, stations), g.name).toBe(normalizeStationName(g.name));
  });

  it('東京・大宮・日立の近くは、その駅', () => {
    expect(departureFromCoords(35.6815, 139.7675, stations)).toBe('東京');
    expect(departureFromCoords(35.9065, 139.6245, stations)).toBe('大宮');
    const hitachi = KANZAKI_STATION_GEOS.find((g) => g.name === '日立')!;
    expect(departureFromCoords(hitachi.lat + 0.001, hitachi.lng, stations)).toBe('日立');
  });

  it('遠すぎる(駅から20km を超える)・座標がおかしいときは null', () => {
    expect(MAX_DEPARTURE_KM).toBe(20);
    expect(departureFromCoords(34.6937, 135.5023, stations)).toBeNull(); // 大阪
    expect(departureFromCoords(Number.NaN, 139.7, stations)).toBeNull();
    expect(departureFromCoords(35.68, 139.76, [])).toBeNull();
  });

  it('経路検索に無い駅の名前は選ばない(その中の最寄り)', () => {
    expect(departureFromCoords(35.85, 139.62, ['大宮'])).toBe('大宮'); // 大宮の南 6km
    expect(departureFromCoords(35.6812, 139.7671, ['大宮'])).toBeNull(); // 東京にいて、大宮しか無いなら、遠すぎる
  });
});

describe('位置情報を、ブラウザの許可の画面で使う', () => {
  const setGeo = (geo: unknown) => {
    Object.defineProperty(globalThis, 'navigator', { value: { geolocation: geo }, configurable: true, writable: true });
  };

  it('許可されて座標が返れば、最寄り駅の名前だけを返す', async () => {
    setGeo({ getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 35.9063, longitude: 139.624 } }) });
    expect(await locateDepartureStation(stations)).toBe('大宮');
  });

  it('許可されない・失敗・位置情報が使えない・例外は null(今までどおり)', async () => {
    setGeo({ getCurrentPosition: (_: unknown, err: (e: unknown) => void) => err({ code: 1 }) });
    expect(await locateDepartureStation(stations)).toBeNull();
    setGeo({ getCurrentPosition: () => { throw new Error('x'); } });
    expect(await locateDepartureStation(stations)).toBeNull();
    setGeo(undefined);
    expect(await locateDepartureStation(stations)).toBeNull();
  });
});
