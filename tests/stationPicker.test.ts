// 経路検索の駅を選ぶシート: 駅の一覧(重複なし・路線ごと)と絞り込み(実際のダイヤ)
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { loadTimetableLines } from '../src/utils/diaTimetable';
import type { TimetableLine } from '../src/utils/diaTimetable';
import { loadRouteStations } from '../src/utils/routeSearch';
import { addRecent, buildPickerData, filterPickerStations, RECENT_MAX } from '../src/utils/stationPicker';
import type { PickerData } from '../src/utils/stationPicker';

let lines: TimetableLine[];
let stations: string[];
let data: PickerData;

beforeAll(async () => {
  lines = await loadTimetableLines();
  stations = await loadRouteStations();
  data = buildPickerData(lines, stations);
});

describe('駅の一覧', () => {
  it('「すべて」は、経路検索で選べる駅が、名前ごとに1つ(重複なし)・全部ある', () => {
    const names = data.all.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual([...stations].sort());
  });

  it('複数の路線に出る駅(東京・松戸・大宮)は、1つで、出る路線を全部持つ', () => {
    const tokyo = data.all.find((s) => s.name === '東京')!;
    expect(tokyo.lines.length).toBeGreaterThanOrEqual(3);
    expect(new Set(tokyo.lines.map((l) => l.code)).size).toBe(tokyo.lines.length);
    expect(data.all.filter((s) => s.name === '松戸')).toHaveLength(1);
    expect(data.all.find((s) => s.name === '松戸')!.lines.length).toBeGreaterThanOrEqual(2);
    expect(data.all.filter((s) => s.name === '大宮')).toHaveLength(1);
  });

  it('路線を選んだときは、その路線の駅が、路線の並びで、駅番号つき(環状線の重複は1つ)', () => {
    const y = data.byLine['Y'];
    expect(y.length).toBeGreaterThan(20);
    expect(y[0].name).toBe('東京');
    expect(y[0].lines.find((l) => l.code === 'Y')!.stationCode).toBe('Y01');
    expect(y[2].lines.find((l) => l.code === 'Y')!.stationCode).toBe('Y03');
    expect(y[2].name).toBe('北千住');
    for (const code of Object.keys(data.byLine)) {
      const names = data.byLine[code].map((s) => s.name);
      expect(new Set(names).size, code).toBe(names.length);
    }
  });

  it('路線のデータに無い駅も、「すべて」には残る(選べる)', () => {
    const d = buildPickerData([], ['東京', '大宮']);
    expect(d.all.map((s) => s.name)).toEqual(['東京', '大宮']);
    expect(d.all[0].lines).toEqual([]);
  });
});

describe('絞り込み', () => {
  it('駅名の前から合うものを先に。途中で合うものはそのあと。空の入力は、そのまま', () => {
    expect(filterPickerStations(data.all, '').length).toBe(data.all.length);
    const r = filterPickerStations(data.all, '北').map((s) => s.name);
    expect(r[0].startsWith('北')).toBe(true);
    expect(r).toContain('北千住');
    expect(r.every((n) => n.includes('北'))).toBe(true);
  });

  it('駅番号(y03)でも、全角・ひらがなでも探せる', () => {
    expect(filterPickerStations(data.all, 'y03').map((s) => s.name)).toContain('北千住');
    expect(filterPickerStations(data.all, 'Ｙ０３').map((s) => s.name)).toContain('北千住');
    expect(filterPickerStations(data.all, 'ひばり').map((s) => s.name)).toContain('ひばりヶ丘');
    expect(filterPickerStations(data.all, '存在しない駅')).toEqual([]);
  });

  it('路線を選んだ一覧の中でも絞り込める', () => {
    const r = filterPickerStations(data.byLine['Y'], '千');
    expect(r.map((s) => s.name)).toContain('北千住');
  });
});

describe('履歴', () => {
  it('新しい順・重複なし・最大5つ', () => {
    let r: string[] = [];
    for (const n of ['東京', '大宮', '東京', '日立', '松戸', '柏', '土浦']) r = addRecent(r, n);
    expect(r).toEqual(['土浦', '柏', '松戸', '日立', '東京']);
    expect(r).toHaveLength(RECENT_MAX);
  });
});
