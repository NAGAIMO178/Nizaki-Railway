// 運転整理の入口: 管理者の保存でエンジンを1回動かす(出来事づくり・結果の保存)と、利用者の端末が、保存された結果を読んで画面のダイヤに重ねること。
// ダイヤは高宮線(TK)の実物(public/data/dia-2)。GAS は作りもの(本番には、何も書かない)。
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const gas = vi.hoisted(() => ({ calls: [] as { action: string; payload: Record<string, unknown> }[], replies: {} as Record<string, unknown> }));
vi.mock('../src/utils/accountApi', () => ({
  callGas: vi.fn(async (action: string, payload: Record<string, unknown>) => {
    gas.calls.push({ action, payload });
    const r = gas.replies[action];
    if (r instanceof Error) throw r;
    return r ?? { status: 'success' };
  }),
}));

import { buildData, fixedDia, type RearrangeData, type RearrangeEvent } from '../src/utils/rearrange';
import type { LineDisruption } from '../src/utils/disruptionManager';
import {
  currentServiceDay, departsFrom, fetchRearrangeFlag, parseSaved, rearrangeView, setSavedRearrange, syncRearrange, getSavedRearrange, type RearrangeSaved,
} from '../src/utils/rearrangeOverlay';
import { buildRearrangeEvents, makeSavedRearrange, runRearrangeFor, saveRearrangeFlag } from '../src/utils/rearrangeAdmin';
import { computeBoard, computeLiveTrains, type BoardData, type LineData, type TrainRow } from '../src/utils/diaTimetable';

const read = (f: string) => JSON.parse(readFileSync(`public/data/dia-2/${f}`, 'utf8'));
const master = read('master-tk.json').TK;
const wiring = read('配線.json')['高宮線'];
const rows = read('TK_trains.json') as TrainRow[];
const data: RearrangeData = buildData(rows, master, wiring, 360);
const st = (name: string) => data.stations.findIndex((s) => s.name === name);
const NOW = new Date(2026, 10, 23, 9, 30, 0).getTime(); // 公開(11/20)のあとの月曜の朝
const DAY0 = new Date(2026, 10, 23, 0, 0, 0).getTime();

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  gas.calls = [];
  gas.replies = {};
  setSavedRearrange(null);
});
afterEach(() => setSavedRearrange(null));

const dis = (over: Partial<LineDisruption> = {}): LineDisruption => ({
  lineId: 'takamiya', lineName: '高宮線', code: 'TK', statusType: 'suspended', targetDirection: 'both', maxDelayMinutes: 10,
  durationUntil: '', section: '下妻 〜 宇都宮 間', reason: '', customMessage: '', useCustomMessage: false, linkToSystem: true, updatedAt: '',
  expiresAtTimestamp: NOW + 2 * 3600 * 1000, ...over,
});

describe('管理者: 運行乱れから、出来事を作る', () => {
  it('区間運休(上下線)は suspend 1件: 開始は保存した時刻、終了は自動解除の時刻', () => {
    const ev = buildRearrangeEvents(dis(), data, NOW);
    expect(ev).toEqual([{ kind: 'suspend', from: st('下妻'), to: st('宇都宮'), startSec: 9.5 * 3600, endSec: 11.5 * 3600 }]);
  });
  it('自動解除が無いときの終了は、その日のダイヤの最後', () => {
    const ev = buildRearrangeEvents(dis({ expiresAtTimestamp: undefined }), data, NOW);
    const last = Math.max(...data.trains.map((t) => t.nodes[t.nodes.length - 1].sa));
    expect(ev).toEqual([{ kind: 'suspend', from: st('下妻'), to: st('宇都宮'), startSec: 9.5 * 3600, endSec: last }]);
  });
  it('0時〜4時は、前日のダイヤの続きとして、24時以降の秒数になる', () => {
    const late = new Date(2026, 10, 24, 1, 0, 0).getTime();
    const [e] = buildRearrangeEvents(dis({ expiresAtTimestamp: late + 3600_000 }), data, late);
    expect(e).toMatchObject({ kind: 'suspend', startSec: 25 * 3600, endSec: 26 * 3600 });
  });
  it('片方の方向だけの運休は、その方向で区間を走る列車の cancel にする', () => {
    const ev = buildRearrangeEvents(dis({ targetDirection: 'up' }), data, NOW);
    expect(ev.length).toBeGreaterThan(0);
    for (const e of ev) {
      expect(e.kind).toBe('cancel');
      const t = data.trains.find((x) => x.no === (e as { train: string }).train)!;
      expect(t.dir).toBe('U');
      expect(t.nodes.some((n) => n.st >= st('下妻') && n.st <= st('宇都宮') && n.sd >= 9.5 * 3600 && n.sd < 11.5 * 3600)).toBe(true);
    }
  });
  it('遅れは、既存の列車ごとの遅れ(getEffectiveDelayForTrain)を、delay の出来事にする', () => {
    const eff = vi.fn((_l: string, seed: string | number, direction?: 1 | 2 | 'up' | 'down' | 'both') => {
      const n = Number(String(seed).split('|')[1]) % 4; // 列車ごとに違う遅れ(0〜3分)
      return { delayMinutes: n, isSuspended: false, direction };
    });
    const ev = buildRearrangeEvents(dis({ statusType: 'delay', section: '全線' }), data, NOW, eff as never);
    expect(ev.length).toBeGreaterThan(0);
    for (const e of ev) {
      expect(e.kind).toBe('delay');
      const d = e as Extract<RearrangeEvent, { kind: 'delay' }>;
      const t = data.trains.find((x) => x.no === d.train)!;
      expect(d.at).toBe(t.nodes.find((n) => n.stop)!.st); // 区間の指定が無ければ、始発駅
      expect(d.sec).toBe((Number(t.no) % 4) * 60);
    }
    expect(ev.length).toBeLessThan(data.trains.length); // 遅れ0の列車は、出来事にしない
  });
  it('遅れの駅は、影響区間に入る最初の停車駅', () => {
    const eff = vi.fn(() => ({ delayMinutes: 5, isSuspended: false }));
    const ev = buildRearrangeEvents(dis({ statusType: 'delay', section: '下妻 〜 宇都宮 間' }), data, NOW, eff as never);
    for (const e of ev) {
      const d = e as Extract<RearrangeEvent, { kind: 'delay' }>;
      const t = data.trains.find((x) => x.no === d.train)!;
      expect(d.at).toBe(t.nodes.find((n) => n.stop && n.st >= st('下妻') && n.st <= st('宇都宮'))!.st);
    }
    expect(eff).toHaveBeenCalled();
  });
  it('一部運休・平常・連動なし・別の路線・自動解除が過去 は、出来事なし', () => {
    for (const over of [{ statusType: 'partially_suspended' as const }, { statusType: 'normal' as const }, { linkToSystem: false }, { lineId: 'kanzaki' }, { expiresAtTimestamp: NOW - 1000 }]) {
      expect(buildRearrangeEvents(dis(over), data, NOW), JSON.stringify(over)).toEqual([]);
    }
  });
  it('同じ入力からは、同じ出来事(時刻や乱数を使わない)', () => {
    const eff = () => ({ delayMinutes: 3, isSuspended: false });
    const a = buildRearrangeEvents(dis({ statusType: 'delay', section: '全線' }), data, NOW, eff as never);
    const b = buildRearrangeEvents(dis({ statusType: 'delay', section: '全線' }), data, NOW, eff as never);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('管理者: エンジンを1回動かして、結果を保存する', () => {
  const susEvents = buildRearrangeEvents(dis(), data, NOW);

  it('保存する形は、きょうのダイヤの日つき・JSON で5万字より小さい・読み直せる', () => {
    const saved = makeSavedRearrange(data, susEvents, NOW)!;
    expect(saved.day).toBe(currentServiceDay(NOW));
    const text = JSON.stringify(saved);
    expect(text.length).toBeLessThan(50000);
    expect(parseSaved(JSON.parse(text))).toEqual(saved);
  });
  it('出来事が無いときは、null', () => {
    expect(makeSavedRearrange(data, [], NOW)).toBeNull();
  });
  it('遅れ(全列車ぶん)でも、時間内に動いて、5万字に収まる', () => {
    const eff = () => ({ delayMinutes: 15, isSuspended: false });
    const ev = buildRearrangeEvents(dis({ statusType: 'delay', section: '全線', maxDelayMinutes: 15 }), data, NOW, eff as never);
    expect(ev.length).toBe(data.trains.length);
    const t0 = Date.now();
    const saved = makeSavedRearrange(data, ev, NOW)!;
    expect(JSON.stringify(saved).length).toBeLessThan(50000);
    void t0;
  }, 60000);
  it('runRearrangeFor: 高宮線なら、結果を adminSaveRearrangeResult で1回だけ送る(管理トークン・結果)', async () => {
    vi.stubGlobal('fetch', (async (url: string) => ({ ok: true, json: async () => JSON.parse(readFileSync(`public/data/dia-2/${decodeURIComponent(String(url).split('/dia-2/')[1].split('?')[0])}`, 'utf8')) })) as never);
    try {
      expect(await runRearrangeFor(dis(), NOW)).toBe('saved');
      const saves = gas.calls.filter((c) => c.action === 'adminSaveRearrangeResult');
      expect(saves).toHaveLength(1);
      expect(parseSaved(saves[0].payload.result)).not.toBeNull();
      // 別の路線は、何もしない
      gas.calls = [];
      expect(await runRearrangeFor(dis({ lineId: 'kanzaki' }), NOW)).toBe('skipped');
      expect(gas.calls).toHaveLength(0);
      // 出来事が無い(一部運休)ときは、保存された結果を空にする
      expect(await runRearrangeFor(dis({ statusType: 'partially_suspended' }), NOW)).toBe('cleared');
      expect(gas.calls.at(-1)).toMatchObject({ action: 'adminSaveRearrangeResult', payload: { result: null } });
      // 保存に失敗したら 'failed'
      gas.replies.adminSaveRearrangeResult = { status: 'error' };
      expect(await runRearrangeFor(dis(), NOW)).toBe('failed');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('トグルの保存: 成功したら、サーバーの値。失敗は null', async () => {
    gas.replies.adminSetRearrangeFlag = { status: 'success', enabled: true };
    expect(await saveRearrangeFlag(true)).toBe(true);
    expect(gas.calls[0]).toMatchObject({ action: 'adminSetRearrangeFlag', payload: { enabled: true } });
    gas.replies.adminSetRearrangeFlag = { status: 'error' };
    expect(await saveRearrangeFlag(false)).toBeNull();
    gas.replies.adminSetRearrangeFlag = new Error('offline');
    expect(await saveRearrangeFlag(false)).toBeNull();
  });
});

describe('利用者: トグルと結果の取り込み', () => {
  const saved = makeSavedRearrange(data, buildRearrangeEvents(dis(), data, NOW), NOW)!;
  it('OFF・失敗・アクションが無い は、OFF 扱い(結果を取りにいかない)', async () => {
    for (const reply of [{ status: 'success', enabled: false }, { status: 'error' }, new Error('offline'), { status: 'success' }]) {
      gas.calls = [];
      gas.replies = { getRearrangeFlag: reply, getRearrangeResult: { status: 'success', result: saved } };
      setSavedRearrange(saved);
      await syncRearrange();
      expect(getSavedRearrange(), String(reply)).toBeNull();
      expect(gas.calls.map((c) => c.action)).toEqual(['getRearrangeFlag']);
    }
    expect(await fetchRearrangeFlag()).toBe(false);
  });
  it('ON で結果があれば取り込む。結果が無い・読めない・取得に失敗 は、重ねない', async () => {
    gas.replies = { getRearrangeFlag: { status: 'success', enabled: true }, getRearrangeResult: { status: 'success', result: saved } };
    await syncRearrange();
    expect(getSavedRearrange()).toEqual(saved);
    for (const result of [{ status: 'success', result: null }, { status: 'success', result: { v: 2 } }, { status: 'error' }, new Error('offline')]) {
      gas.replies = { getRearrangeFlag: { status: 'success', enabled: true }, getRearrangeResult: result };
      await syncRearrange();
      expect(getSavedRearrange(), String(result)).toBeNull();
    }
  });
  it('parseSaved は、形の違う中身を断る', () => {
    for (const bad of [null, 1, {}, { compact: {}, day: 'x' }, { compact: { v: 1, cancelled: [1], trains: [], pass: [], hold: [] }, day: 'x' }, { compact: { ...saved.compact, trains: [{ no: 1 }] }, day: 'x' }, { compact: saved.compact }]) {
      expect(parseSaved(bad)).toBeNull();
    }
  });
});

describe('利用者: 結果を、ダイヤの行に重ねる', () => {
  const sus = buildRearrangeEvents(dis(), data, NOW);
  const saved = makeSavedRearrange(data, sus, NOW)!;

  it('何も取り込んでいない・高宮線ではない・別の日の結果 は、重ねない(いまのダイヤのまま)', () => {
    expect(rearrangeView('TK', master, rows, NOW)).toBeNull();
    setSavedRearrange(saved);
    expect(rearrangeView('Y', master, rows, NOW)).toBeNull();
    expect(rearrangeView('TK', master, rows, NOW + 24 * 3600 * 1000)).toBeNull();
    expect(rearrangeView('TK', master, rows, NOW)).not.toBeNull();
  });
  it('行き先が変わった列車は、行が作り直され、それ以外の行は、そのまま', () => {
    setSavedRearrange(saved);
    const v = rearrangeView('TK', master, rows, NOW)!;
    expect(v.rows).toHaveLength(rows.length);
    const fx = fixedDia(data, sus);
    let changed = 0;
    rows.forEach((r, i) => {
      const f = fx.trains.find((t) => t.no === r[0]);
      if (f && (f.changedDest || f.changedOrigin)) {
        changed++;
        expect(v.rows[i]).not.toBe(r);
        expect(v.rows[i][7]).toBe(f.changedDest ? f.dest : r[7]);
        expect(v.rows[i][8]).toBe(f.changedOrigin ? f.origin : r[8]);
        const stops = f.nodes.filter((n) => n.stop);
        expect(v.rows[i][5].length).toBe(stops.length * 3);
        expect(v.rows[i][5].filter((_, k) => k % 3 === 0)).toEqual(stops.map((n) => n.st));
        expect(v.rows[i][5][1]).toBe(-1); // 始発の着は、無し
        expect(v.rows[i][5][v.rows[i][5].length - 1]).toBe(-1); // 終点の発は、無し
      } else if (f) {
        expect(v.rows[i]).toBe(r);
      }
    });
    expect(changed).toBeGreaterThan(0);
    expect([...v.cancelled].sort()).toEqual([...fx.cancelled].sort());
  });
  it('手前で打ち切られた列車は、打ち切りの駅から先で出なくなり、折り返す列車は、その駅から出る', () => {
    setSavedRearrange(saved);
    const v = rearrangeView('TK', master, rows, NOW)!;
    const fx = fixedDia(data, sus);
    const cutEnd = fx.trains.find((t) => t.changedDest)!;
    const i = rows.findIndex((r) => r[0] === cutEnd.no);
    const last = cutEnd.nodes[cutEnd.nodes.length - 1].st;
    expect(departsFrom(rows[i], last)).toBe(true);
    expect(departsFrom(v.rows[i], last)).toBe(false);
    const cutStart = fx.trains.find((t) => t.changedOrigin)!;
    const j = rows.findIndex((r) => r[0] === cutStart.no);
    const first = cutStart.nodes[0].st;
    expect(departsFrom(v.rows[j], first)).toBe(true);
    expect(v.offset.get(cutStart.no) ?? 0).toBeGreaterThanOrEqual(0);
  });
  it('遅れは、停車駅ごとの分で持つ', () => {
    const slow = data.trains.find((t) => t.typeName === '各停' && t.dir === 'D' && Math.floor(t.nodes[0].sd / 3600) === 8)!;
    const ev: RearrangeEvent[] = [{ kind: 'delay', train: slow.no, at: slow.nodes[0].st, sec: 20 * 60 }];
    setSavedRearrange(makeSavedRearrange(data, ev, NOW)!);
    const v = rearrangeView('TK', master, rows, NOW)!;
    const d = v.delays.get(slow.no)!;
    expect(d[0]).toBeGreaterThanOrEqual(20);
    expect(d.length).toBe(slow.nodes.filter((n) => n.stop).length);
  });
});

describe('利用者: 発車案内・列車位置が、重ねた結果を読む', () => {
  const lineData: LineData = { code: 'TK', master, trains: rows };
  const fileOf = (idx: number) => read(`TK_st${idx}.json`);
  const board = (stName: string, nowMs: number, limit = 12) =>
    computeBoard({ stationName: stName, lines: [{ code: 'TK', master, trains: rows, file: fileOf(st(stName)), stationIdx: st(stName) }] } as BoardData, 1, nowMs, limit);
  const sus = buildRearrangeEvents(dis(), data, NOW);
  const saved = makeSavedRearrange(data, sus, NOW)!;
  const fx = fixedDia(data, sus);

  it('OFF(結果なし)のときは、いまのダイヤのまま', () => {
    const a = JSON.stringify(board('下妻', NOW));
    setSavedRearrange(null);
    expect(JSON.stringify(board('下妻', NOW))).toBe(a);
  });
  it('ON: 行き先が変わった列車は、発車案内でも新しい行き先で出る', () => {
    const off = board('大宮', NOW, 6);
    setSavedRearrange(saved);
    const on = board('大宮', NOW, 6);
    expect(off.departures.every((d) => d.destination === '高根沢')).toBe(true);
    expect(on.departures.length).toBeGreaterThan(0);
    expect(on.departures.some((d) => d.destination === '下妻')).toBe(true);
    for (const d of on.departures) {
      const t = fx.trains.find((x) => d.id.startsWith(`dia-TK-${x.no}-`));
      if (t?.changedDest) expect(d.destination).toBe(t.dest);
    }
  });
  it('ON: 止まっている区間に入る側の駅では、出なくなった列車が「見合わせ」で出る(運行終了には、ならない)', () => {
    const off = board('下妻', NOW);
    expect(off.status).toBe('ok');
    expect(off.departures.every((d) => !d.isSuspended)).toBe(true);
    setSavedRearrange(saved);
    const on = board('下妻', NOW);
    expect(on.status).toBe('ok');
    expect(on.departures.length).toBeGreaterThan(0);
    expect(on.departures.every((d) => d.isSuspended)).toBe(true);
    expect(on.departures.map((d) => d.destination)).toEqual(off.departures.map((d) => d.destination)); // 行き先は、もとのまま(行けない)
  });
  it('ON: 打ち切りの駅(終点)でも、その列車は、通常の出発としては出ない', () => {
    setSavedRearrange(saved);
    for (const t of fx.trains.filter((x) => x.changedDest)) {
      const last = data.stations[t.nodes[t.nodes.length - 1].st].name;
      const dep = board(last, DAY0 + t.nodes[t.nodes.length - 1].schedArr * 1000 - 60_000, 20);
      for (const d of dep.departures.filter((x) => x.id.startsWith(`dia-TK-${t.no}-`))) expect(d.isSuspended, `${t.no}@${last}`).toBe(true);
    }
  });
  it('ON: 運休の列車は、列車位置に出ない。OFFでは出る', () => {
    const cancelled = fx.cancelled[0];
    if (!cancelled) return; // 運休が出ない入力のときは、確かめることがない
    const tr = data.trains.find((t) => t.no === cancelled)!;
    const mid = DAY0 + ((tr.nodes[0].sd + tr.nodes[tr.nodes.length - 1].sa) / 2) * 1000;
    const dir = tr.dir === 'D' ? 1 : 2;
    setSavedRearrange(null);
    expect(computeLiveTrains(lineData, 'takamiya', dir, mid).some((t) => t.trainNo === cancelled)).toBe(true);
    setSavedRearrange(saved);
    expect(computeLiveTrains(lineData, 'takamiya', dir, mid).some((t) => t.trainNo === cancelled)).toBe(false);
  });
  it('ON: 行き先が変わった列車は、列車位置でも新しい行き先', () => {
    setSavedRearrange(saved);
    const t = fx.trains.find((x) => x.changedDest)!;
    const mid = DAY0 + ((t.nodes[0].schedDep + t.nodes[t.nodes.length - 1].schedArr) / 2) * 1000;
    const live = computeLiveTrains(lineData, 'takamiya', t.dir === 'D' ? 1 : 2, mid).find((x) => x.trainNo === t.no);
    expect(live?.destination).toBe(t.dest);
    expect(live?.endStationName).toBe(t.dest);
  });
  it('ON: 遅れは、重ねた結果の分(列車位置・発車案内)', () => {
    const slow = data.trains.find((t) => t.typeName === '各停' && t.dir === 'D' && Math.floor(t.nodes[0].sd / 3600) === 8)!;
    setSavedRearrange(makeSavedRearrange(data, [{ kind: 'delay', train: slow.no, at: slow.nodes[0].st, sec: 20 * 60 }], NOW)!);
    const first = data.stations[slow.nodes[0].st].name;
    const dep = board(first, DAY0 + (slow.nodes[0].sd - 120) * 1000, 12).departures.find((d) => d.id.startsWith(`dia-TK-${slow.no}-`));
    expect(dep?.delayMinutes).toBeGreaterThanOrEqual(20);
    const mid = DAY0 + (slow.nodes[0].sd + 30 * 60) * 1000;
    const live = computeLiveTrains(lineData, 'takamiya', 1, mid).find((t) => t.trainNo === slow.no);
    expect(live?.delayMinutes).toBeGreaterThanOrEqual(15);
  });
});

describe('入口は1か所(画面ごとの手作業の反映を作らない)', () => {
  it('diaTimetable の読み替えは、rearrangeView(発車案内・列車位置)だけを通る', () => {
    const src = readFileSync('src/utils/diaTimetable.ts', 'utf8');
    expect(src.match(/rearrangeView\(/g)).toHaveLength(2);
    for (const f of ['MyStationCard', 'TrainLocationTab', 'StatusCard']) {
      expect(readFileSync(`src/components/${f}.tsx`, 'utf8')).not.toMatch(/rearrange/i);
    }
  });
});
