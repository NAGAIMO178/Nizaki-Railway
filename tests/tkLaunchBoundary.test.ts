// 高宮線の公開の瞬間(TK_LAUNCH_AT): 本物のスイッチ(作りものにしない)で、時計を公開の 1 ミリ秒前・ちょうどに合わせて、
// 画面に出るものが、前は既存4路線のまま・あとは高宮線つきになることを確かめる。(公開の日時を変えても、そのまま通る)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { TK_LAUNCH_AT } from '../src/utils/tkLine';

const AT = Date.parse(TK_LAUNCH_AT as string);
const FOUR = ['Y', 'NI', 'SC', 'TC'];
const baseFetch = globalThis.fetch;
const fetched: string[] = [];

beforeEach(() => {
  vi.resetModules();
  fetched.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetched.push(String(input).split('?')[0]);
    return baseFetch(input, init);
  }) as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = baseFetch;
  vi.resetModules();
});

// 画面の部品を、その時刻に読み込み直して(路線の一覧などは、読み込んだ時刻で決まる)、見えるものを集める
const snapshot = async () => {
  const dia = await import('../src/utils/diaTimetable');
  const rs = await import('../src/utils/routeSearch');
  const geo = await import('../src/utils/nearestStation');
  const layout = await import('../src/utils/routeMapLayout');
  const reg = await import('../src/components/MyStationRegisterCard');
  const dn = await import('../src/utils/delayNotifySettings');
  const dm = await import('../src/utils/disruptionManager');
  const md = await import('../src/data/mockData');
  const tl = await import('../src/components/TrainLocationTab');
  const summary = await dia.loadMasterSummary();
  const net = layout.buildNetworkMap(summary);
  return {
    masterLines: Object.keys(summary).sort(),
    timetableLines: (await dia.loadTimetableLines()).map((l) => l.code),
    routeStations: await rs.loadRouteStations(),
    expressKeys: dia.visibleExpressKeys(),
    nearestCount: geo.stationGeos().length,
    mapLines: net.lines.map((l) => l.code),
    mapHeight: net.height,
    registerable: reg.REGISTERABLE_LINES.map((l) => l.code),
    delayNotify: dn.DELAY_NOTIFY_LINES.map((l) => l.id),
    status: dm.DEFAULT_LINE_INFOS.map((l) => l.code),
    mock: md.MOCK_LINES.map((l) => l.code),
    locationTabs: tl.LINES_DATA.map((l) => l.code),
    oomiyaTransfers: tl.LINES_DATA.find((l) => l.code === 'Y')!.stations.find((s) => s.name === '大宮')!.transfers,
    fetched: [...fetched],
  };
};

describe('公開の 1 ミリ秒前まで: 既存4路線のまま。高宮線は、どこにも出ず、高宮線のファイルも読まない', () => {
  it.each([['1ミリ秒前', AT - 1], ['1週間前', AT - 7 * 24 * 3600 * 1000]])('%s', async (_label, t) => {
    vi.setSystemTime(t);
    const s = await snapshot();
    expect(s.masterLines).toEqual([...FOUR].sort());
    expect(s.timetableLines).toEqual(['Y', 'NI', 'SC', 'TC']);
    expect(s.routeStations).toContain('大宮');
    expect(s.routeStations).not.toContain('宇都宮');
    expect(s.expressKeys).toEqual(['ayami', 'nliner', 'meguri']);
    expect(s.nearestCount).toBe(74);
    expect(s.mapLines).toEqual(['SC', 'Y', 'NI']);
    expect(s.mapHeight).toBe(1580);
    expect(s.registerable).toEqual(FOUR);
    expect(s.delayNotify).toEqual(['kanzaki', 'kanzaki_kosoku', 'saichi_loop', 'tsuchiura']);
    expect(s.status).toEqual(FOUR);
    expect(s.mock).toEqual(FOUR);
    expect(s.locationTabs).toEqual(FOUR);
    expect(s.oomiyaTransfers).not.toContain('TK');
    expect(s.fetched.some((f) => /master-tk|TK_/.test(f))).toBe(false);
  });
});

describe('公開の時刻ちょうどから: 高宮線が、すべての画面の一覧に出る', () => {
  it.each([['ちょうど', AT], ['1時間後', AT + 3600 * 1000]])('%s', async (_label, t) => {
    vi.setSystemTime(t);
    const s = await snapshot();
    expect(s.masterLines).toEqual([...FOUR, 'TK'].sort());
    expect(s.timetableLines).toEqual(['Y', 'NI', 'SC', 'TC', 'TK']);
    for (const n of ['宇都宮', '高根沢', '古河']) expect(s.routeStations).toContain(n);
    expect(s.expressKeys).toEqual(['ayami', 'nliner', 'meguri', 'sumikaze']);
    expect(s.nearestCount).toBe(86);
    expect(s.mapLines).toEqual(['SC', 'Y', 'NI', 'TK']);
    expect(s.mapHeight).toBe(1880);
    expect(s.registerable).toEqual([...FOUR, 'TK']);
    expect(s.delayNotify).toEqual(['kanzaki', 'kanzaki_kosoku', 'saichi_loop', 'tsuchiura', 'takamiya']);
    expect(s.status).toEqual([...FOUR, 'TK']);
    expect(s.mock).toEqual([...FOUR, 'TK']);
    expect(s.locationTabs).toEqual([...FOUR, 'TK']);
    expect(s.oomiyaTransfers).toContain('TK');
    expect(s.fetched.some((f) => /master-tk/.test(f))).toBe(true);
  });
});
