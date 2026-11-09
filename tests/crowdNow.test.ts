// 混雑は「今の混雑の目安」だけ: その列車に乗る(発車する)駅を出た直後の区間の混雑を、経路検索と発車案内に出す。
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { computeBoard, getCachedLineData, loadBoardData, loadLineData, normalizeStationName, TrainRow } from '../src/utils/diaTimetable';
import { bumpForDelay, CROWD_LEVELS, loadAllCrowdTrains } from '../src/utils/crowd';
import { DEFAULT_ROUTE_OPTIONS } from '../src/utils/routeOptions';
import { loadRouteStations, searchRoutes } from '../src/utils/routeSearch';

const crowdFile: Record<string, Record<string, string>> = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'public', 'data', 'crowd-2', 'train_wd.json'), 'utf-8'));
const hm = (h: number, m = 0) => h * 3600 + m * 60;

// 混雑データの1文字(1〜6)→ 画面のレベル(1〜5)
const level = (ch: string): number => Math.min(Number(ch), 5);

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 7, 55, 0)); // 月曜の朝
  await Promise.all(['Y', 'NI', 'SC', 'TC'].map((c) => loadLineData(c)));
  await loadAllCrowdTrains();
});
afterAll(() => vi.useRealTimers());

describe('経路検索の混雑: 乗る駅を出た直後の区間', () => {
  it('区間(脚)ごとに、その列車に乗る駅を出た直後の区間の混雑(遅れ3分以上なら1つ上げる)', async () => {
    const names = await loadRouteStations();
    let seed = 20261109;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let checked = 0;
    let differsFromMax = 0;
    for (let n = 0; n < 40; n++) {
      const a = names[Math.floor(rnd() * names.length)];
      const b = names[Math.floor(rnd() * names.length)];
      if (a === b) continue;
      const res = await searchRoutes(a, b, hm(7 + Math.floor(rnd() * 10), Math.floor(rnd() * 60)), { ...DEFAULT_ROUTE_OPTIONS }, 3);
      for (const r of res) {
        for (const leg of r.legs) {
          if (leg.crowd === undefined) continue;
          const data = getCachedLineData(leg.lineCode)!;
          const train = data.trains.find((t) => t[0] === leg.trainNo)!;
          const stops = train[5];
          // 乗る駅の、停車駅の番号 k(同じ駅名で、あとに降りる駅がある最初の停車)
          let k = -1;
          for (let i = 0; i * 3 < stops.length - 3; i++) {
            if (normalizeStationName(data.master.stations[stops[i * 3]][0]) === leg.from && normalizeStationName(data.master.stations[stops[i * 3 + 3]][0]) === leg.stops[0].name) {
              k = i;
              break;
            }
          }
          expect(k, `${leg.lineCode} ${leg.trainNo} ${leg.from}`).toBeGreaterThanOrEqual(0);
          const s = crowdFile[leg.lineCode][leg.trainNo];
          expect(leg.crowd, `${a}→${b} ${leg.trainNo}`).toBe(bumpForDelay(level(s[k]), leg.delayMin));
          // 並べ替え用の平均は、これまでどおり(乗っている区間の平均)
          expect(leg.crowdAvg).toBeDefined();
          const lastK = leg.stops.length + k;
          const seg = Array.from({ length: lastK - k }, (_, j) => bumpForDelay(level(s[k + j]), leg.delayMin));
          if (Math.max(...seg) !== seg[0]) differsFromMax++;
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
    // 「いちばん混む区間」にしていないことの確かめ: 乗る駅の直後が、乗る区間のうち最も混む所ではない区間が、実際にある
    expect(differsFromMax).toBeGreaterThan(0);
  });
});

describe('発車案内の混雑: その駅を出た直後の区間', () => {
  it('大宮の発車に、その駅を出た直後の区間の混雑が付く(遅れ3分以上なら1つ上げる)。データの色は CROWD_LEVELS', async () => {
    const data = await loadBoardData('大宮');
    let withCrowd = 0;
    for (const platform of [1, 2] as const) {
      const board = computeBoard(data, platform, Date.now(), 8);
      for (const d of board.departures) {
        const [, code, no] = d.id.split('-');
        const row = getCachedLineData(code)!.trains.find((t: TrainRow) => t[0] === no)!;
        const idx = getCachedLineData(code)!.master.stations.findIndex((s) => s[0] === '大宮');
        let k = -1;
        for (let i = 0; i * 3 < row[5].length; i++) if (row[5][i * 3] === idx && row[5][i * 3 + 2] !== -1) k = i;
        const s = crowdFile[code]?.[no];
        if (!s) {
          expect(d.crowd).toBeUndefined();
          continue;
        }
        expect(d.crowd, d.id).toBe(bumpForDelay(level(s[k]), d.delayMinutes));
        expect(CROWD_LEVELS[d.crowd! - 1].icon).toMatch(/^#[0-9A-F]{6}$/i);
        withCrowd++;
      }
    }
    expect(withCrowd).toBeGreaterThan(0);
  });
});
