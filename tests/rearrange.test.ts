import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildData, rearrange, makeLog, applyChanges, fixedDia, type RearrangeData } from '../src/utils/rearrange';
import type { TrainRow } from '../src/utils/diaTimetable';

// 高宮線(TK)の、実際のダイヤ(public/data/dia-2)で、整理案の計算を確かめる
const read = (f: string) => JSON.parse(readFileSync(`public/data/dia-2/${f}`, 'utf8'));
const master = read('master-tk.json').TK;
const wiring = read('配線.json')['高宮線'];
const rows = read('TK_trains.json') as TrainRow[];
const data: RearrangeData = buildData(rows, master, wiring, 360);
const st = (name: string) => data.stations.findIndex((s) => s.name === name);
const trainAt = (typeName: string, dir: 'D' | 'U', hour: number) =>
  data.trains.find((t) => t.typeName === typeName && t.dir === dir && Math.floor(t.nodes[0].sd / 3600) === hour)!;

describe('高宮線のデータの読み込み', () => {
  it('170本・13駅で、待避と折返しの駅が、配線から決まる', () => {
    expect(data.trains).toHaveLength(170);
    expect(data.stations).toHaveLength(13);
    expect(data.sidings.map((i) => data.stations[i].name).sort()).toEqual(['下妻', '加須', '古河', '宇都宮', '新治'].sort());
    expect(data.turnStations.map((i) => data.stations[i].name).sort()).toEqual(['古河', '大宮', '宇都宮', '高根沢'].sort());
  });
  it('通過駅も含めて、全駅の時刻が、増える順に並ぶ', () => {
    for (const t of data.trains) {
      for (let i = 1; i < t.nodes.length; i++) expect(t.nodes[i].sa).toBeGreaterThanOrEqual(t.nodes[i - 1].sd);
    }
  });
});

describe('遅れが出ないとき', () => {
  it('遅れの見込みは、0(時刻表のとおり)', () => {
    const r = rearrange(data, { kind: 'delay', train: data.trains[0].no, at: 0, sec: 0 });
    expect(r.base.totalDelayMin).toBe(0);
    expect(r.proposals).toHaveLength(0);
  });
});

describe('列車の遅れ', () => {
  const slow = trainAt('各停', 'D', 8);
  const ev = { kind: 'delay' as const, train: slow.no, at: slow.nodes[0].st, sec: 20 * 60 };
  const r = rearrange(data, ev);
  it('遅れた列車の後ろの列車にも、遅れが伝わる', () => {
    expect(r.base.totalDelayMin).toBeGreaterThan(20);
  });
  it('整理案が出て、点数が下がる', () => {
    expect(r.proposals.length).toBeGreaterThan(0);
    const last = r.proposals[r.proposals.length - 1];
    expect(last.after.score).toBeLessThan(r.base.score);
    for (const p of r.proposals) expect(p.gain).toBeGreaterThanOrEqual(3);
  });
  it('ログに、変更と、遅れの見込みが入る', () => {
    const log = makeLog('TK', r, r.proposals.length, new Date('2026-11-23T00:00:00Z'));
    expect(log.line).toBe('TK');
    expect(log.changes.some((c) => c.kind === 'delay')).toBe(true);
    expect(log.after.score).toBeLessThanOrEqual(log.before.score);
  });
});

describe('区間運休', () => {
  const ev = { kind: 'suspend' as const, from: st('下妻'), to: st('宇都宮'), startSec: 9 * 3600, endSec: 11 * 3600 };
  const r = rearrange(data, ev);
  it('止まる区間に入る列車は、手前の駅で打ち切られる', () => {
    const trunc = r.baseChanges.filter((c) => c.kind === 'truncateEnd');
    expect(trunc.length).toBeGreaterThan(0);
  });
  it('打ち切られた編成は、その駅から折り返す(次の列車の始発が、切り直される)', () => {
    const starts = r.baseChanges.filter((c) => c.kind === 'truncateStart');
    expect(starts.length).toBeGreaterThan(0);
  });
  it('区間の中を走る列車は、残らない', () => {
    const w = applyChanges(data, [], ev);
    for (const t of w.trains) {
      for (let i = 0; i < t.nodes.length - 1; i++) {
        const a = t.nodes[i];
        const b = t.nodes[i + 1];
        const inside = Math.min(a.st, b.st) >= ev.from && Math.max(a.st, b.st) <= ev.to;
        if (inside) expect(a.sd < ev.startSec || a.sd >= ev.endSec).toBe(true);
      }
    }
  });
});

describe('直したあとのダイヤ(fixedDia)', () => {
  const slow = trainAt('各停', 'D', 8);
  const delayEv = { kind: 'delay' as const, train: slow.no, at: slow.nodes[0].st, sec: 20 * 60 };
  const susEv = { kind: 'suspend' as const, from: st('下妻'), to: st('宇都宮'), startSec: 9 * 3600, endSec: 11 * 3600 };

  it('同じ入力からは、何度でも、同じ答えが出る', () => {
    expect(JSON.stringify(fixedDia(data, delayEv))).toBe(JSON.stringify(fixedDia(data, delayEv)));
    expect(JSON.stringify(fixedDia(data, susEv))).toBe(JSON.stringify(fixedDia(data, susEv)));
  });
  it('遅れ0なら、元のダイヤと同じ(時刻も、行き先も、本数も)', () => {
    const f = fixedDia(data, { kind: 'delay', train: slow.no, at: slow.nodes[0].st, sec: 0 });
    expect(f.trains).toHaveLength(data.trains.length);
    expect(f.cancelled).toHaveLength(0);
    for (const t of f.trains) {
      const o = data.trains.find((x) => x.no === t.no)!;
      expect(t.dest).toBe(data.stations[o.nodes[o.nodes.length - 1].st].name);
      t.nodes.forEach((n, j) => {
        expect(n.arr).toBe(o.nodes[j].sa);
        expect(n.dep).toBe(o.nodes[j].sd);
      });
    }
  });
  it('遅れでは、遅れた列車の時刻が、時刻表より後ろになる', () => {
    const f = fixedDia(data, delayEv);
    const t = f.trains.find((x) => x.no === slow.no)!;
    expect(t.nodes[0].dep).toBeGreaterThanOrEqual(t.nodes[0].schedDep + 20 * 60);
  });
  it('区間運休では、打ち切りの行き先と、運休が反映される', () => {
    const f = fixedDia(data, susEv);
    expect(f.trains.some((t) => t.changedDest)).toBe(true);
    expect(f.trains.some((t) => t.changedOrigin)).toBe(true);
    expect(f.trains.length + f.cancelled.length).toBe(data.trains.length);
    for (const t of f.trains.filter((x) => x.changedDest)) {
      const last = t.nodes[t.nodes.length - 1];
      expect(data.stations[last.st].name).toBe(t.dest);
    }
  });
  it('折返しの案を採ると、行き先が変わる', () => {
    const f = fixedDia(data, delayEv);
    for (const a of f.actions) if (a.kind === 'turn') expect(f.trains.find((t) => t.no === a.train)?.changedDest).toBe(true);
    for (const a of f.actions) if (a.kind === 'cancel') expect(f.cancelled).toContain(a.train);
  });
});
