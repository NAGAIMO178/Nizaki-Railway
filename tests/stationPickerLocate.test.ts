// 駅を選ぶシートの「最寄り駅を探す」の行: 出る条件・押したときの結果(見つかる/見つからない/許可されない/ほかの欄で選んでいる)
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { StationPickerSheet } from '../src/components/StationPickerSheet';
import { locateDepartureStation } from '../src/utils/departureFromLocation';
import { loadRouteStations } from '../src/utils/routeSearch';
import { searchNearestForPicker, showPickerExtras } from '../src/utils/stationPicker';

let stations: string[];
beforeAll(async () => {
  stations = await loadRouteStations();
});

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

describe('「最寄り駅を探す」の行が出る・出ない', () => {
  it('探す関数が渡され、最寄り駅がまだ無いときは、出る(一番上)', () => {
    const html = render({ onLocate: async () => null });
    expect(html).toContain('最寄り駅を探す');
    expect(html).not.toContain('見つかりませんでした'); // 押す前は、知らせを出さない
    expect(html).not.toContain('探しています');
  });

  it('探す関数が渡されないシート(ほかの使い方)では、出ない=見た目はこれまでどおり', () => {
    const html = render({});
    expect(html).not.toContain('最寄り駅を探す');
    expect(html).not.toContain('すべての駅');
  });

  it('最寄り駅がすでにあるときは、探す行ではなく、これまでの「最寄り駅」の見出し+駅名', () => {
    const html = render({ onLocate: async () => null, nearest: '東京' });
    expect(html).not.toContain('最寄り駅を探す');
    expect(html).toContain('最寄り駅</div>');
  });

  it('「すべて」で検索の文字が空のときだけ、行を出す(路線のタブが「すべて」でない・文字があるときは出さない)', () => {
    expect(showPickerExtras('all', '')).toBe(true);
    expect(showPickerExtras('all', '   ')).toBe(true);
    expect(showPickerExtras('Y', '')).toBe(false);
    expect(showPickerExtras('all', '大宮')).toBe(false);
    expect(showPickerExtras('NI', '大宮')).toBe(false);
  });

  it('自動では、探さない・許可の画面を出さない(描くだけでは、探す関数を呼ばない)', () => {
    const onLocate = vi.fn(async () => '東京');
    render({ onLocate });
    expect(onLocate).not.toHaveBeenCalled();
  });
});

describe('押したときの結果', () => {
  it('見つかったら、その駅を選ぶ', async () => {
    expect(await searchNearestForPicker(async () => '大宮', new Set())).toEqual({ kind: 'found', name: '大宮' });
  });

  it('見つからない(null)・探しが失敗したときは、見つからない', async () => {
    expect(await searchNearestForPicker(async () => null, new Set())).toEqual({ kind: 'none' });
    expect(await searchNearestForPicker(async () => { throw new Error('x'); }, new Set())).toEqual({ kind: 'none' });
  });

  it('見つかった駅が、ほかの欄で選んでいる駅(経由駅のシート)のときは、選ばない', async () => {
    expect(await searchNearestForPicker(async () => '東京', new Set(['東京']))).toEqual({ kind: 'taken' });
  });
});

describe('位置情報の結果を作りものにして、実際の探しにつなぐ', () => {
  const setGeo = (impl: unknown) => Object.defineProperty(globalThis, 'navigator', { value: impl, configurable: true });
  afterEach(() => Reflect.deleteProperty(globalThis, 'navigator'));

  it('東京駅のそばなら見つかる', async () => {
    setGeo({ geolocation: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 35.6815, longitude: 139.7675 } }) } });
    expect(await searchNearestForPicker(() => locateDepartureStation(stations), new Set())).toEqual({ kind: 'found', name: '東京' });
  });

  it('許可されない・位置情報が使えない・遠すぎるときは、見つからない', async () => {
    setGeo({ geolocation: { getCurrentPosition: (_ok: unknown, ng: () => void) => ng() } });
    expect(await searchNearestForPicker(() => locateDepartureStation(stations), new Set())).toEqual({ kind: 'none' });
    setGeo({});
    expect(await searchNearestForPicker(() => locateDepartureStation(stations), new Set())).toEqual({ kind: 'none' });
    setGeo({ geolocation: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 34.6937, longitude: 135.5023 } }) } });
    expect(await searchNearestForPicker(() => locateDepartureStation(stations), new Set())).toEqual({ kind: 'none' });
  });
});

describe('RouteSearch のつなぎ(出発・到着・経由の同じシート)', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'components', 'RouteSearch.tsx'), 'utf-8');

  it('探す関数を渡し、分かった駅を、次に開いたときの「最寄り駅」に覚える。いまの nearest の渡し方(出発のシートだけ)と、最初の自動の探し(triedLocate)は、そのまま', () => {
    expect(src).toMatch(/onLocate=\{\(\) =>\s*locateDepartureStation\(stations\)\.then\(\(name\) => \{\s*if \(name\) setNearest\(name\);/);
    expect(src).toContain("nearest={picker === 'from' ? nearest : undefined}");
    expect(src).toContain('if (!stations || triedLocate.current || hadFrom.current) return;');
  });

  it('お知らせの4行目に、最寄り駅を探せるようになったことが入っている', () => {
    const notes = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'release-notes.json'), 'utf-8')) as { notes: string[] };
    expect(notes.notes).toHaveLength(4);
    expect(notes.notes[3]).toBe('駅を選ぶとき、最寄り駅を探せるようにしました');
  });
});
