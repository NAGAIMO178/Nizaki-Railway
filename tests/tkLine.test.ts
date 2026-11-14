// 高宮線(TK): データは入れてあるが、利用者には見せない(tkLine.ts のスイッチが入るまで)。見せないあいだは、既存4路線は、組み込み前と同じ。
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));
// 「見せない」の確認は、公開の日時や時計に左右されないように、スイッチの状態(隠れている)を、こちらで決める(公開の日時を過ぎても、落ちない)。
// スイッチそのもの(日時で切り替わる)は、下の「スイッチ」で、本物を使って確かめる。
vi.mock('../src/utils/tkLine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/tkLine')>();
  return { ...actual, isTkLaunched: () => false, visibleLineCodes: (c: string[]) => c.filter((x) => x !== actual.TK_CODE) };
});

import { TK_STATION_NAMES } from '../src/utils/tkLine';
import { TK_STATION_GEOS } from '../src/utils/nearestStation';

const DIA = path.resolve(__dirname, '..', 'public', 'data', 'dia-2');
const CROWD = path.resolve(__dirname, '..', 'public', 'data', 'crowd-2');
const json = (dir: string, file: string) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
const hm = (h: number, m = 0) => h * 3600 + m * 60;
const TK_STATIONS = ['羽貫', '加須', '古河', '八俣', '下妻', '騰波ノ江', '新治', '栃木県総合運動公園', '群馬製作所', '宇都宮', '清原', '高根沢'];

// 読み込んだファイル名を記録する(見せないあいだに、高宮線のファイルを読んでいないことの確認)
const fetched: string[] = [];
const baseFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetched.push(String(input).split('?')[0]);
    return baseFetch(input, init);
  }) as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 8, 0, 0)); // 月曜の朝
});
afterEach(() => vi.resetModules());

describe('スイッチ(本物): 公開の日時の前は見せない・日時になったら見せる', () => {
  it('公開の日時(TK_LAUNCH_AT)の 1ミリ秒前までは見せず、ちょうどの時刻から見せる。見せないあいだは、路線の一覧から高宮線を除く', async () => {
    const real = await vi.importActual<typeof import('../src/utils/tkLine')>('../src/utils/tkLine');
    expect(Number.isFinite(Date.parse(real.TK_LAUNCH_AT as string))).toBe(true);
    const at = Date.parse(real.TK_LAUNCH_AT as string);
    try {
      for (const t of [at - 30 * 24 * 3600 * 1000, at - 1]) {
        vi.setSystemTime(t);
        expect(real.isTkLaunched(), String(t)).toBe(false);
        expect(real.visibleLineCodes(['Y', 'NI', 'SC', 'TC', 'TK'])).toEqual(['Y', 'NI', 'SC', 'TC']);
      }
      for (const t of [at, at + 1, at + 24 * 3600 * 1000]) {
        vi.setSystemTime(t);
        expect(real.isTkLaunched(), String(t)).toBe(true);
        expect(real.visibleLineCodes(['Y', 'NI', 'SC', 'TC', 'TK'])).toEqual(['Y', 'NI', 'SC', 'TC', 'TK']);
      }
    } finally {
      vi.setSystemTime(new Date(2026, 10, 2, 8, 0, 0));
    }
  });
});

describe('データ', () => {
  it('master.json は、4路線のまま(古い版のアプリが、高宮線を出さないように)。高宮線つきは master-tk.json', () => {
    const m = json(DIA, 'master.json');
    const mu = json(DIA, 'master-tk.json');
    expect(Object.keys(m).sort()).toEqual(['NI', 'SC', 'TC', 'Y']);
    expect(Object.keys(mu).sort()).toEqual(['NI', 'SC', 'TC', 'TK', 'Y']);
    for (const c of ['NI', 'SC', 'TC', 'Y']) expect(mu[c], c).toEqual(m[c]);
    expect(mu.TK.stations.map((s: [string, number]) => s[0])).toEqual(['大宮', '羽貫', '加須', '古河', '八俣', '下妻', '騰波ノ江', '新治', '栃木県総合運動公園', '群馬製作所', '宇都宮', '清原', '高根沢']);
  });

  it('駅名の並び(TK_STATION_NAMES)が、master-tk.json・配線.json・最寄り駅の駅名と、そろっている。誤った駅名(古+賀)は、どこにも残っていない', () => {
    const mu = json(DIA, 'master-tk.json');
    expect(mu.TK.stations.map((s: [string, number]) => s[0])).toEqual(TK_STATION_NAMES);
    expect(Object.keys(json(DIA, '配線.json').高宮線).sort()).toEqual([...TK_STATION_NAMES].sort());
    expect(TK_STATION_GEOS.map((g) => g.name)).toEqual(TK_STATION_NAMES.slice(1));
    const wrong = '古' + '賀';
    expect(TK_STATION_NAMES).toContain('古' + '河');
    const roots = ['src', 'public', 'tests', 'gas', 'tools'].map((d) => path.resolve(__dirname, '..', d));
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx|json|csv|gs|md|html|js|css|txt)$/.test(e.name) && fs.readFileSync(p, 'utf-8').includes(wrong)) hits.push(path.relative(path.resolve(__dirname, '..'), p));
      }
    };
    roots.filter((r) => fs.existsSync(r)).forEach(walk);
    expect(hits).toEqual([]);
  });

  it('旧名(宇都宮線・UT)のデータが残っていない: UT_ のファイル・master-ut.json が無い。路線名は 高宮線、種別は 特急すみかぜ・快速・各停', () => {
    const files = fs.readdirSync(DIA);
    expect(files.filter((f) => f.startsWith('UT_') || f === 'master-ut.json')).toEqual([]);
    const mu = json(DIA, 'master-tk.json');
    expect(mu.TK.name).toBe('高宮線');
    expect(mu.TK.types.map((t: [string, string, number]) => t[0])).toEqual(['特急すみかぜ', '快速', '各停']);
    expect(Object.keys(json(DIA, '配線.json'))).toContain('高宮線');
    expect(Object.keys(json(DIA, '配線.json'))).not.toContain('宇都宮線');
    for (const f of ['運用.json', '運行番号.json']) {
      const d = json(DIA, f);
      expect(Object.keys(d), f).toContain('TK');
      expect(Object.keys(d), f).not.toContain('UT');
    }
  });

  it('高宮線の列車(170本)・駅ごとのファイル(13)が、そろっている', () => {
    const trains = json(DIA, 'TK_trains.json');
    expect(trains).toHaveLength(170);
    for (let i = 0; i < 13; i++) expect(fs.existsSync(path.join(DIA, `TK_st${i}.json`)), `TK_st${i}`).toBe(true);
    expect(fs.existsSync(path.join(DIA, 'TK_st13.json'))).toBe(false);
  });

  it('混雑のデータに、高宮線の全列車があり、区間の数が合う(停車駅 − 1)。ほかの路線の列車数は、そのまま', () => {
    const trains = json(DIA, 'TK_trains.json') as [string, number, string, string, number, number[]][];
    for (const day of ['train_wd.json', 'train_we.json']) {
      const c = json(CROWD, day);
      expect(Object.keys(c)).toEqual(['NI', 'Y', 'SC', 'TC', 'TK']);
      expect({ NI: Object.keys(c.NI).length, Y: Object.keys(c.Y).length, SC: Object.keys(c.SC).length, TC: Object.keys(c.TC).length }).toEqual({ NI: 409, Y: 472, SC: 820, TC: 685 });
      for (const t of trains) expect(c.TK[t[0]]?.length, `${day} ${t[0]}`).toBe(t[5].length / 3 - 1);
    }
  });
});

describe('見せないとき(既定): 高宮線は、どこにも出ない', () => {
  it('路線の一覧・時刻表の路線・経路検索の駅に、高宮線がない。高宮線のファイルを読まない', async () => {
    const dia = await import('../src/utils/diaTimetable');
    const rs = await import('../src/utils/routeSearch');
    fetched.length = 0;
    expect(Object.keys(await dia.loadMasterSummary()).sort()).toEqual(['NI', 'SC', 'TC', 'Y']);
    expect((await dia.loadTimetableLines()).map((l) => l.code)).toEqual(['Y', 'NI', 'SC', 'TC']);
    const names = await rs.loadRouteStations();
    expect(names).toContain('大宮');
    for (const n of TK_STATIONS) expect(names, n).not.toContain(n);
    await expect(dia.loadLineData('TK')).rejects.toThrow();
    await (await import('../src/utils/crowd')).loadAllCrowdTrains();
    expect(fetched.filter((f) => /TK_|master-tk/.test(f))).toEqual([]);
  });

  it('大宮の発車案内に、高宮線の列車がない。経路検索の結果にも、高宮線の区間がない', async () => {
    const dia = await import('../src/utils/diaTimetable');
    const rs = await import('../src/utils/routeSearch');
    const { DEFAULT_ROUTE_OPTIONS } = await import('../src/utils/routeOptions');
    const board = dia.computeBoard(await dia.loadBoardData('大宮'), 1, Date.now(), 12);
    expect(board.departures.length).toBeGreaterThan(0);
    board.departures.forEach((d) => expect(d.lineName).not.toBe('高宮線'));
    for (const [a, b] of [['大宮', '東京'], ['東京', '横浜'], ['松戸', '大宮'], ['大宮', '宇都宮']]) {
      const res = await rs.searchRoutes(a, b, hm(8), { ...DEFAULT_ROUTE_OPTIONS }, 3).catch(() => []);
      res.forEach((r) => r.legs.forEach((l) => expect(l.lineCode, `${a}→${b}`).not.toBe('TK')));
    }
    expect(await rs.searchRoutes('大宮', '宇都宮', hm(8), { ...DEFAULT_ROUTE_OPTIONS }, 3).catch(() => [])).toEqual([]);
  });

  it('混雑のデータにも、高宮線は使われない', async () => {
    const crowd = await import('../src/utils/crowd');
    await crowd.loadAllCrowdTrains();
    const t = (json(DIA, 'TK_trains.json') as string[][])[0][0];
    expect(crowd.trainSegmentLevel('wd', 'TK', t, 0)).toBeUndefined();
    expect(crowd.trainMaxLevelAnyLine('wd', t)).toBeUndefined();
  });
});

describe('見せるとき(スイッチを入れた状態を、作りものにして確かめる): 高宮線が出て、動く', () => {
  const visible = async () => {
    vi.resetModules();
    vi.doMock('../src/utils/tkLine', async () => {
      const actual = await vi.importActual<typeof import('../src/utils/tkLine')>('../src/utils/tkLine');
      return { ...actual, isTkLaunched: () => true, visibleLineCodes: (c: string[]) => c };
    });
    return { dia: await import('../src/utils/diaTimetable'), rs: await import('../src/utils/routeSearch'), crowd: await import('../src/utils/crowd') };
  };

  it('路線の一覧・時刻表に高宮線(大宮〜高根沢)が出る。大宮は、神埼線・環状線・高宮線の乗換駅', async () => {
    const { dia, rs } = await visible();
    const m = await dia.loadMasterSummary();
    expect(m.TK.name).toBe('高宮線');
    expect(m.TK.stations).toHaveLength(13);
    expect((await dia.loadTimetableLines()).map((l) => l.code)).toEqual(['Y', 'NI', 'SC', 'TC', 'TK']);
    const names = await rs.loadRouteStations();
    for (const n of TK_STATIONS) expect(names, n).toContain(n);
  });

  it('高宮線の列車が、発車案内・列車位置・経路検索に出る', async () => {
    const { dia, rs, crowd } = await visible();
    const { DEFAULT_ROUTE_OPTIONS } = await import('../src/utils/routeOptions');
    await dia.loadLineData('TK');
    await crowd.loadAllCrowdTrains();
    const board = dia.computeBoard(await dia.loadBoardData('大宮'), 1, Date.now(), 12);
    expect(board.departures.some((d) => d.lineName === '高宮線')).toBe(true);
    const live = dia.computeLiveTrains(dia.getCachedLineData('TK')!, 'takamiya', 1, new Date(2026, 10, 2, 9, 0, 0).getTime());
    expect(live.length).toBeGreaterThan(0);
    const res = await rs.searchRoutes('大宮', '宇都宮', hm(8), { ...DEFAULT_ROUTE_OPTIONS }, 3);
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].legs[0].lineCode).toBe('TK');
    const t = (json(DIA, 'TK_trains.json') as string[][])[0][0];
    expect(crowd.trainSegmentLevel('wd', 'TK', t, 0)).toBeDefined();
  });
});
