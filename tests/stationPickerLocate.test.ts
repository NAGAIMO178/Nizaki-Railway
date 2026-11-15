// 駅を選ぶシートの最寄り駅: 開いたとき自動で探す(押させない)・見つかったら「最寄り駅」の行・見つからなければ何も出さない・直近の場所は使い回す
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { StationPickerSheet } from '../src/components/StationPickerSheet';
import { findNearestForPicker, locateDepartureStation } from '../src/utils/departureFromLocation';
import { findNearestStation } from '../src/utils/nearestStation';
import { forgetPosition, recentPosition, RECENT_POSITION_TTL_MS, rememberPosition } from '../src/utils/recentPosition';
import { loadRouteStations } from '../src/utils/routeSearch';
import { searchNearestForPicker, showPickerExtras } from '../src/utils/stationPicker';

let stations: string[];
beforeAll(async () => {
  stations = await loadRouteStations();
});

const root = path.resolve(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf-8');

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    React.createElement(StationPickerSheet as never, {
      isOpen: true,
      title: '出発駅',
      value: '',
      stations,
      onSelect: () => undefined,
      onClose: () => undefined,
      ...props,
    })
  );

// 位置情報の作りもの。呼ばれた回数を数える
let calls = 0;
const setGeo = (impl: unknown) => Object.defineProperty(globalThis, 'navigator', { value: impl, configurable: true });
const geoAt = (lat: number, lng: number, delayMs = 0) => ({
  geolocation: {
    getCurrentPosition: (ok: (p: unknown) => void) => {
      calls++;
      setTimeout(() => ok({ coords: { latitude: lat, longitude: lng } }), delayMs);
    },
  },
});
const geoDenied = () => ({ geolocation: { getCurrentPosition: (_ok: unknown, ng: () => void) => { calls++; ng(); } } });

beforeEach(() => {
  calls = 0;
  forgetPosition();
});
afterEach(() => {
  forgetPosition();
  Reflect.deleteProperty(globalThis, 'navigator');
});

describe('シートの見た目(押す行は、もう無い)', () => {
  it('「最寄り駅を探す」の押す行は、どの場合も出ない', () => {
    expect(render({ onLocate: async () => null })).not.toContain('最寄り駅を探す');
    expect(render({ onLocate: async () => null, nearest: '東京' })).not.toContain('最寄り駅を探す');
    expect(render({})).not.toContain('最寄り駅を探す');
  });

  it('最寄り駅がすでに分かっているときは、「最寄り駅」の見出し+駅名(これまでどおり)。探している表示は出ない', () => {
    const html = render({ onLocate: async () => '東京', nearest: '大宮' });
    expect(html).toContain('最寄り駅</div>');
    expect(html).not.toContain('探しています');
  });

  it('探す関数も最寄り駅も無いシート(ほかの使い方)は、これまでどおり(最寄り駅・履歴の行なし)', () => {
    const html = render({});
    expect(html).not.toContain('最寄り駅');
    expect(html).not.toContain('すべての駅');
  });

  it('開いただけの描きでは、探しを始めない(探しは、開いたあとの動き)。許可の画面は、描くだけでは出ない', () => {
    const onLocate = vi.fn(async () => '東京');
    render({ onLocate });
    expect(onLocate).not.toHaveBeenCalled();
  });

  it('行を出すのは、「すべて」で検索の文字が空のときだけ(路線のタブが「すべて」でない・文字があるときは出さない)', () => {
    expect(showPickerExtras('all', '')).toBe(true);
    expect(showPickerExtras('all', '   ')).toBe(true);
    expect(showPickerExtras('Y', '')).toBe(false);
    expect(showPickerExtras('all', '大宮')).toBe(false);
    expect(showPickerExtras('NI', '大宮')).toBe(false);
  });
});

describe('シートを開いたときの探し', () => {
  it('見つかれば、その駅。見つからない・失敗は、どちらも null(行は出ない)', async () => {
    expect(await searchNearestForPicker(async () => '大宮')).toBe('大宮');
    expect(await searchNearestForPicker(async () => null)).toBeNull();
    expect(await searchNearestForPicker(async () => '')).toBeNull();
    expect(await searchNearestForPicker(async () => { throw new Error('x'); })).toBeNull();
  });

  it('東京駅のそばなら見つかる。許可されない・位置情報が使えない・20km より遠い(大阪)は、見つからない', async () => {
    setGeo(geoAt(35.6815, 139.7675));
    expect(await findNearestForPicker(stations)).toBe('東京');
    forgetPosition();
    setGeo(geoDenied());
    expect(await findNearestForPicker(stations)).toBeNull();
    setGeo({});
    expect(await findNearestForPicker(stations)).toBeNull();
    setGeo(geoAt(34.6937, 135.5023));
    expect(await findNearestForPicker(stations)).toBeNull();
  });

  it('許可されなかったときは、場所を覚えない(次に開いたとき、また探す)', async () => {
    setGeo(geoDenied());
    expect(await findNearestForPicker(stations)).toBeNull();
    expect(recentPosition()).toBeNull();
    expect(calls).toBe(1);
  });
});

describe('直近の場所の使い回し(許可の画面を、また出さない)', () => {
  it('一度分かったら、数分のあいだは、もう一度探さない(位置情報を呼ばない)', async () => {
    setGeo(geoAt(35.9065, 139.6245));
    expect(await findNearestForPicker(stations)).toBe('大宮');
    expect(calls).toBe(1);
    expect(await findNearestForPicker(stations)).toBe('大宮');
    expect(await findNearestForPicker(stations)).toBe('大宮');
    expect(calls).toBe(1);
  });

  it('ホームの最寄り駅の探し(findNearestStation)で分かった場所も、使い回す', async () => {
    setGeo(geoAt(35.6815, 139.7675));
    await findNearestStation();
    expect(calls).toBe(1);
    expect(await findNearestForPicker(stations)).toBe('東京');
    expect(calls).toBe(1);
  });

  it('使い回した場所でも、20km より遠いときは見つからない・選べる駅の中から決める', async () => {
    rememberPosition(34.6937, 135.5023);
    expect(await findNearestForPicker(stations)).toBeNull();
    rememberPosition(35.9065, 139.6245);
    expect(await findNearestForPicker(['東京'])).toBeNull(); // 大宮にいて、東京しか選べないなら、遠すぎる
  });

  it('数分たつと古くなる(使わない)。ちょうど期限までは使える', () => {
    const t0 = 1_000_000;
    rememberPosition(35.68, 139.76, t0);
    expect(recentPosition(t0 + RECENT_POSITION_TTL_MS)).toEqual({ lat: 35.68, lng: 139.76 });
    expect(recentPosition(t0 + RECENT_POSITION_TTL_MS + 1)).toBeNull();
    expect(recentPosition(t0 - 1)).toBeNull();
    expect(RECENT_POSITION_TTL_MS).toBeLessThanOrEqual(5 * 60 * 1000);
  });

  it('おかしい座標は覚えない。覚えるのはアプリのメモリの中だけ(端末の保存先・サーバーには、書かない)', () => {
    rememberPosition(Number.NaN, 139.7);
    expect(recentPosition()).toBeNull();
    const src = read('src', 'utils', 'recentPosition.ts');
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|fetch\(|callGas|document\.cookie/);
  });

  it('同時に何度頼まれても、位置情報を呼ぶのは1回', async () => {
    setGeo(geoAt(35.6815, 139.7675, 30));
    const [a, b] = await Promise.all([locateDepartureStation(stations), locateDepartureStation(stations)]);
    expect([a, b]).toEqual(['東京', '東京']);
    expect(calls).toBe(1);
  });
});

describe('つなぎ(出発・到着・経由の同じシート)', () => {
  const sheet = read('src', 'components', 'StationPickerSheet.tsx');
  const route = read('src', 'components', 'RouteSearch.tsx');

  it('シートは、開いたとき(isOpen)に、最寄り駅がまだ分かっていなければ自動で探し、閉じた・開き直したあとの結果は使わない。見つかっても、自動で選ばない・閉じない', () => {
    expect(sheet).toMatch(/if \(!isOpen \|\| !locate \|\| knownRef\.current\) return;/);
    expect(sheet).toContain('if (run !== findRun.current) return;');
    expect(sheet).toContain('最寄り駅を探しています…');
    expect(sheet).not.toContain('最寄り駅を探す');
  });

  it('RouteSearch は、直近の場所を使い回す探しを渡し、分かった駅を覚える。nearest の渡し方(出発のシートだけ)と、最初の自動の探し(triedLocate)は、そのまま', () => {
    expect(route).toMatch(/onLocate=\{\(\) =>\s*findNearestForPicker\(stations\)\.then\(\(name\) => \{\s*if \(name\) setNearest\(name\);/);
    expect(route).toContain("nearest={picker === 'from' ? nearest : undefined}");
    expect(route).toContain('if (!stations || triedLocate.current || hadFrom.current) return;');
  });

  it('お知らせの4行目は、最寄り駅を探せるようになったこと。showAfter は、そのまま', () => {
    const notes = JSON.parse(read('release-notes.json')) as { notes: string[]; showAfter: string };
    expect(notes.notes[3]).toBe('駅を選ぶとき、最寄り駅を探せるようにしました');
    expect(notes.showAfter).toBe('2026-11-20T08:00:00+09:00');
  });
});
