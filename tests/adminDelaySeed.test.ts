// 管理者設定の遅れ・一部運休: 同じ列車は、発車案内・列車位置・経路検索のどれでも、同じ遅れ・同じ運休になる。
// ばらつきの種は「ダイヤの日+列車番号」。0:00 をまたいでも変わらない。
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { disruptionManager, type LineDisruption } from '../src/utils/disruptionManager';
import { computeBoard, computeLiveTrains, getCachedLineData, loadBoardData, loadLineData, resolveTrainDelay } from '../src/utils/diaTimetable';
import { DEFAULT_ROUTE_OPTIONS } from '../src/utils/routeOptions';
import { loadRouteStations, searchRoutes } from '../src/utils/routeSearch';
import { adminDelaySeed, serviceDayKey, serviceDayStartOf } from '../src/utils/serviceDay';

const hm = (h: number, m = 0) => h * 3600 + m * 60;
const LINES: [string, string][] = [['Y', 'kanzaki'], ['NI', 'kanzaki_kosoku'], ['SC', 'saichi_loop'], ['TC', 'tsuchiura']];

const disruption = (lineId: string, code: string, over: Partial<LineDisruption>): LineDisruption => ({
  lineId,
  lineName: lineId,
  code,
  statusType: 'delay',
  targetDirection: 'both',
  maxDelayMinutes: 5,
  durationUntil: '',
  section: '全線',
  reason: '車両点検のため',
  customMessage: '',
  useCustomMessage: false,
  linkToSystem: true,
  updatedAt: '',
  ...over,
});
const setAll = (over: Partial<LineDisruption>) => LINES.forEach(([code, id]) => disruptionManager.setLineDisruption(disruption(id, code, over)));

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 12, 0, 0)); // 月曜の昼
  await Promise.all(LINES.map(([c]) => loadLineData(c)));
  await loadRouteStations();
});
afterEach(() => disruptionManager.clearAllDisruptions());
afterAll(() => vi.useRealTimers());

describe('ダイヤの日・種', () => {
  it('0:00〜3:59 は、前日のダイヤの続き。種は、ダイヤの日+列車番号', () => {
    const d = (h: number, m: number, day = 2) => new Date(2026, 10, day, h, m).getTime();
    const evening = serviceDayStartOf(d(23, 55));
    expect(serviceDayStartOf(d(0, 5, 3))).toBe(evening); // 0 時をまたいでも、同じダイヤの日
    expect(serviceDayStartOf(d(3, 59, 3))).toBe(evening);
    expect(serviceDayStartOf(d(4, 0, 3))).not.toBe(evening);
    expect(serviceDayKey(evening)).toBe('2026-11-2');
    expect(adminDelaySeed(evening, '163121')).toBe('2026-11-2|163121');
    expect(adminDelaySeed(evening, '163121')).not.toBe(adminDelaySeed(evening, '163122'));
  });
});

describe('同じ列車は、3つの画面で、同じ遅れ・同じ運休', () => {
  const dayStart = new Date(2026, 10, 2).getTime();
  const rowOf = (code: string, no: string) => getCachedLineData(code)!.trains.find((t) => t[0] === no)!;

  const check = async (statusType: 'delay' | 'partially_suspended') => {
    setAll({ statusType });
    const now = Date.now();
    const board = computeBoard(await loadBoardData('大宮'), 1, now, 8).departures.filter((d) => d.lineName === '神埼線');
    const live = computeLiveTrains(getCachedLineData('Y')!, 'kanzaki', 1, now);
    const route = await searchRoutes('大宮', '朝霞台', hm(12), { ...DEFAULT_ROUTE_OPTIONS, realtime: true }, 3);

    const expected = (no: string) => resolveTrainDelay('Y', no, dayStart, 0, '大宮', rowOf('Y', no)[4]);
    let boardChecked = 0;
    let suspendedSeen = 0;
    const suspendedNos = new Set<string>();
    for (const d of board) {
      const no = d.id.split('-')[2];
      const e = expected(no);
      expect(d.isSuspended, no).toBe(e.isSuspended);
      if (e.isSuspended) {
        suspendedSeen++;
        suspendedNos.add(no);
      } else expect(d.delayMinutes, no).toBe(e.delayMinutes);
      boardChecked++;
    }
    expect(boardChecked).toBeGreaterThan(0);

    // 列車位置: 運休の列車は出ない。出ている列車の遅れは、同じ
    let liveChecked = 0;
    for (const t of live) {
      const e = expected(t.trainNo);
      expect(e.isSuspended, t.trainNo).toBe(false);
      expect(t.delayMinutes, t.trainNo).toBe(e.delayMinutes);
      liveChecked++;
    }
    expect(liveChecked).toBeGreaterThan(0);
    suspendedNos.forEach((no) => expect(live.some((t) => t.trainNo === no), `列車位置に運休の ${no}`).toBe(false));

    // 経路検索: 運休の列車を案内しない。案内する列車の遅れは、同じ
    for (const r of route) {
      for (const leg of r.legs) {
        if (leg.lineCode !== 'Y') continue;
        const e = expected(leg.trainNo);
        expect(e.isSuspended, `経路に運休の ${leg.trainNo}`).toBe(false);
        expect(leg.delayMin, leg.trainNo).toBe(e.delayMinutes);
      }
    }
    return { suspendedSeen, boardNos: board.map((d) => d.id.split('-')[2]), liveNos: live.map((t) => t.trainNo), routeNos: route.flatMap((r) => r.legs.map((l) => l.trainNo)) };
  };

  it('遅延(最大5分): 発車案内・列車位置・経路検索が、同じ列車で同じ遅れ', async () => {
    const r = await check('delay');
    // 3つの画面に、重なる列車がある(比べられている)
    expect(r.boardNos.some((n) => r.liveNos.includes(n)) || r.boardNos.some((n) => r.routeNos.includes(n))).toBe(true);
  });

  it('一部運休(3本に1本): 運休の抽選が、どの画面でも同じ(運休の列車は、列車位置にも経路にも出ない)', async () => {
    const r = await check('partially_suspended');
    expect(r.suspendedSeen).toBeGreaterThan(0);
  });
});

describe('0:00 をまたいでも、遅れ・運休は変わらない', () => {
  const at = (h: number, m: number, day: number) => new Date(2026, 10, day, h, m, 0).getTime();
  const liveAll = (ms: number) => LINES.flatMap(([code, id]) => [1, 2].map((dir) => computeLiveTrains(getCachedLineData(code)!, id, dir as 1 | 2, ms)).flat());

  it('23:55 に走っていて 0:05 にも走っている列車は、遅れの値が同じ。運休の抽選も同じ', () => {
    const before = at(23, 55, 2);
    const after = at(0, 5, 3);
    const base1 = new Set(liveAll(before).map((t) => t.id));
    const common = liveAll(after).map((t) => t.id).filter((id) => base1.has(id));
    expect(common.length).toBeGreaterThan(0);

    for (const statusType of ['delay', 'partially_suspended'] as const) {
      setAll({ statusType });
      const a = new Map(liveAll(before).map((t) => [t.id, t.delayMinutes]));
      const b = new Map(liveAll(after).map((t) => [t.id, t.delayMinutes]));
      for (const id of common) {
        // 運休の列車は、どちらにも出ない / 出る列車は、同じ遅れ
        expect(a.has(id), `${statusType} ${id}`).toBe(b.has(id));
        if (a.has(id)) expect(a.get(id), `${statusType} ${id}`).toBe(b.get(id));
      }
      disruptionManager.clearAllDisruptions();
    }
  });
});
