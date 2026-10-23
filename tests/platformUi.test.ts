// 番線を画面に出すための、データの読み出し(発車案内・列車詳細・経路の詳細)を、実際のダイヤ(公開後)で調べる。
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { computeBoard, computeLiveTrains, getCachedLineData, loadBoardData, loadLineData, TrainRow } from '../src/utils/diaTimetable';
import { departurePlatformOfRow, legPlatformParts, platformAtStop } from '../src/utils/platform';
import { DEFAULT_ROUTE_OPTIONS } from '../src/utils/routeOptions';
import { searchRoutes } from '../src/utils/routeSearch';

const raw = (code: string): TrainRow[] =>
  JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'public', 'data', 'dia-2', `${code}_trains.json`), 'utf-8'));
const hm = (h: number, m = 0) => h * 3600 + m * 60;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 7, 55, 0)); // 月曜の朝
  await Promise.all(['Y', 'NI', 'SC', 'TC'].map((c) => loadLineData(c)));
});
afterAll(() => vi.useRealTimers());

describe('番線の読み出し', () => {
  it('列車の行と駅の番号から、発車の番線を読む。終着駅(発なし)・番線なしは undefined', () => {
    const row = ['1', 0, 'D', 'op', 0, [0, -1, 0, 1, 60, 90, 2, 120, -1], '01K', '終点', '始発', ['2', '3', '4']] as TrainRow;
    expect(departurePlatformOfRow(row, 0)).toBe('2');
    expect(departurePlatformOfRow(row, 1)).toBe('3');
    expect(departurePlatformOfRow(row, 2)).toBeUndefined(); // 終着は、着だけ
    expect(departurePlatformOfRow(row, 9)).toBeUndefined();
    const old = ['1', 0, 'D', 'op', 0, [0, -1, 0]] as TrainRow;
    expect(departurePlatformOfRow(old, 0)).toBeUndefined();
  });

  it('経路の区間の「[発] → [着]」: どちらも無ければ出さない。片方だけなら、その方だけ', () => {
    expect(legPlatformParts({})).toBeUndefined();
    expect(legPlatformParts({ depPlatform: '', arrPlatform: undefined })).toBeUndefined();
    expect(legPlatformParts({ depPlatform: '5', arrPlatform: '3' })).toEqual({ dep: '5', arr: '3' });
    expect(legPlatformParts({ depPlatform: '5' })).toEqual({ dep: '5', arr: undefined });
    expect(legPlatformParts({ arrPlatform: '3' })).toEqual({ dep: undefined, arr: '3' });
  });
});

describe('発車案内の番線', () => {
  it('大宮の下りの発車に、番線が付き、ダイヤのファイルの値と一致する', async () => {
    const data = await loadBoardData('大宮');
    const board = computeBoard(data, 1, Date.now(), 6);
    expect(board.departures.length).toBeGreaterThan(0);
    board.departures.forEach((d) => {
      expect(d.platform, d.id).toMatch(/^\d+$/);
      const [, code, no] = d.id.split('-');
      const row = raw(code).find((t) => t[0] === no)!;
      const idx = getCachedLineData(code)!.master.stations.findIndex((s) => s[0] === '大宮');
      expect(d.platform).toBe(departurePlatformOfRow(row, idx));
    });
  });

  it('松戸(直通のある駅)でも、路線ごとの行から読む', async () => {
    const data = await loadBoardData('松戸');
    const board = computeBoard(data, 1, Date.now(), 8);
    board.departures.forEach((d) => expect(d.platform, d.id).toMatch(/^\d+$/));
  });
});

describe('列車詳細の停車駅の番線', () => {
  it('止まる駅に番線が付き、通過する駅には付かない。ダイヤのファイルの値と一致する', () => {
    const data = getCachedLineData('SC')!;
    const live = computeLiveTrains(data, 'saichi', 1, new Date(2026, 10, 2, 8, 0, 0).getTime());
    expect(live.length).toBeGreaterThan(0);
    live.forEach((t) => {
      const row = raw('SC').find((r) => r[0] === t.trainNo)!;
      const stopRows = t.rows.filter((r) => !r.pass);
      t.rows.filter((r) => r.pass).forEach((r) => expect(r.platform).toBeUndefined());
      stopRows.forEach((r) => expect(r.platform, `${t.trainNo} ${r.stationName}`).toMatch(/^\d+$/));
      // 最後の停車駅(終着)の番線は、行の最後の要素
      expect(stopRows[stopRows.length - 1].platform).toBe(platformAtStop(row, row[5].length / 3 - 1));
    });
  });
});

describe('経路の区間の番線', () => {
  it('東京→日立(直通)でも、どの区間にも、乗る駅と降りる駅の番線が付く', async () => {
    const res = await searchRoutes('東京', '日立', hm(8), DEFAULT_ROUTE_OPTIONS, 3);
    expect(res.length).toBeGreaterThan(0);
    res.forEach((r) =>
      r.legs.forEach((leg) => {
        expect(leg.depPlatform, `${leg.lineName} ${leg.from}`).toMatch(/^\d+$/);
        expect(leg.arrPlatform, `${leg.lineName} ${leg.to}`).toMatch(/^\d+$/);
        // その区間の列車の行(その路線のファイル)の値と一致する
        const data = getCachedLineData(leg.lineCode)!;
        const row = raw(leg.lineCode).find((t) => t[0] === leg.trainNo)!;
        const fromIdx = data.master.stations.findIndex((s) => s[0] === leg.from);
        expect(leg.depPlatform).toBe(departurePlatformOfRow(row, fromIdx));
      })
    );
  });
});
