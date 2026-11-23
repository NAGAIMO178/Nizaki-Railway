// 運転整理で行き先が変わった列車の表示: もとの行き先に赤い取り消し線・新しい行き先を赤い太字。
// 行き先が変わっていない列車・始発だけが変わった列車・トグルOFF(結果なし)は、これまでどおり。
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { buildData, fixedDia, type RearrangeData } from '../src/utils/rearrange';
import type { LineDisruption } from '../src/utils/disruptionManager';
import { rearrangeView, setSavedRearrange } from '../src/utils/rearrangeOverlay';
import { buildRearrangeEvents, makeSavedRearrange } from '../src/utils/rearrangeAdmin';
import { computeBoard, computeLiveTrains, type BoardData, type LineData, type TrainRow } from '../src/utils/diaTimetable';
import { DestinationLabel } from '../src/components/DestinationLabel';

const read = (f: string) => JSON.parse(readFileSync(`public/data/dia-2/${f}`, 'utf8'));
const master = read('master-tk.json').TK;
const rows = read('TK_trains.json') as TrainRow[];
const data: RearrangeData = buildData(rows, master, read('配線.json')['高宮線'], 360);
const NOW = new Date(2026, 10, 23, 9, 30, 0).getTime();
const DAY0 = new Date(2026, 10, 23, 0, 0, 0).getTime();
const dis: LineDisruption = {
  lineId: 'takamiya', lineName: '高宮線', code: 'TK', statusType: 'suspended', targetDirection: 'both', maxDelayMinutes: 10, durationUntil: '',
  section: '下妻 〜 宇都宮 間', reason: '', customMessage: '', useCustomMessage: false, linkToSystem: true, updatedAt: '', expiresAtTimestamp: NOW + 2 * 3600 * 1000,
};
const events = buildRearrangeEvents(dis, data, NOW);
const saved = makeSavedRearrange(data, events)!;
const fx = fixedDia(data, events);
const origDestOf = (no: string) => {
  const r = rows.find((x) => x[0] === no)!;
  return r[7] ?? master.stations[r[5][r[5].length - 3]][0];
};

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => setSavedRearrange(null));

describe('もとの行き先を持つのは、行き先が変わった列車だけ', () => {
  const destChanged = fx.trains.filter((t) => t.changedDest);
  const originOnly = fx.trains.filter((t) => t.changedOrigin && !t.changedDest);
  const untouched = fx.trains.filter((t) => !t.changedDest && !t.changedOrigin);
  it('入力に、3種類の列車がある', () => {
    expect(destChanged.length).toBeGreaterThan(0);
    expect(originOnly.length).toBeGreaterThan(0);
    expect(untouched.length).toBeGreaterThan(0);
  });
  it('行き先が変わった列車: もとの行き先(元のダイヤの行き先)が取れる。始発だけ・変わらない列車・運休: 無い', () => {
    setSavedRearrange(saved);
    const v = rearrangeView('TK', master, rows)!;
    for (const t of destChanged) expect(v.origDest.get(t.no), t.no).toBe(origDestOf(t.no));
    for (const t of originOnly) expect(v.origDest.has(t.no), t.no).toBe(false);
    for (const t of untouched) expect(v.origDest.has(t.no), t.no).toBe(false);
    for (const no of fx.cancelled) expect(v.origDest.has(no), no).toBe(false);
    expect(v.origDest.size).toBe(destChanged.length);
  });
});

describe('発車案内(computeBoard)', () => {
  const board = (station: string, nowMs: number, limit = 40) => {
    const idx = data.stations.findIndex((s) => s.name === station);
    return computeBoard({ stationName: station, lines: [{ code: 'TK', master, trains: rows, file: read(`TK_st${idx}.json`), stationIdx: idx }] } as BoardData, 1, nowMs, limit);
  };
  it('行き先が変わった列車: 新しい行き先と、もとの行き先が出る。ほかは、もとの行き先なし', () => {
    setSavedRearrange(saved);
    const on = board('大宮', NOW, 12).departures;
    const changed = new Map(fx.trains.filter((t) => t.changedDest).map((t) => [t.no, t]));
    let withOrig = 0;
    for (const d of on) {
      const no = d.id.split('-')[2];
      const t = changed.get(no);
      if (t) {
        withOrig++;
        expect(d.destination, no).toBe(t.dest);
        expect(d.originalDestination, no).toBe(origDestOf(no));
      } else {
        expect(d.originalDestination, no).toBeUndefined();
      }
    }
    expect(withOrig).toBeGreaterThan(0);
  });
  it('始発だけが変わった列車(折り返す列車)には、もとの行き先が付かない', () => {
    setSavedRearrange(saved);
    const t = fx.trains.find((x) => x.changedOrigin && !x.changedDest)!;
    const first = data.stations[t.nodes[0].st].name;
    const d = board(first, DAY0 + (t.nodes[0].schedDep - 120) * 1000, 12).departures.find((x) => x.id.startsWith(`dia-TK-${t.no}-`));
    expect(d).toBeDefined();
    expect(d!.originalDestination).toBeUndefined();
  });
  it('結果なし(トグルOFF・取得失敗)のときは、どの列車にも付かない', () => {
    for (const d of board('大宮', NOW, 12).departures) expect(d.originalDestination).toBeUndefined();
  });
});

describe('列車位置(computeLiveTrains)', () => {
  const lineData: LineData = { code: 'TK', master, trains: rows };
  it('行き先が変わった列車だけに、もとの行き先が付く', () => {
    setSavedRearrange(saved);
    const changed = new Map(fx.trains.filter((t) => t.changedDest).map((t) => [t.no, t]));
    let n = 0;
    for (const dir of [1, 2] as const) {
      for (const t of computeLiveTrains(lineData, 'takamiya', dir, NOW)) {
        const c = changed.get(t.trainNo);
        if (c) {
          n++;
          expect(t.destination).toBe(c.dest);
          expect(t.originalDestination).toBe(origDestOf(t.trainNo));
        } else {
          expect(t.originalDestination, t.trainNo).toBeUndefined();
        }
      }
    }
    expect(n).toBeGreaterThan(0);
  });
  it('結果なしのときは、付かない', () => {
    for (const dir of [1, 2] as const) for (const t of computeLiveTrains(lineData, 'takamiya', dir, NOW)) expect(t.originalDestination).toBeUndefined();
  });
});

describe('表示の部品(DestinationLabel)', () => {
  const html = (p: Parameters<typeof DestinationLabel>[0]) => renderToStaticMarkup(React.createElement(DestinationLabel, p));
  it('変わっていない(もとの行き先なし・同じ): これまでと同じ「○○ 行き」。斜線・赤なし', () => {
    for (const out of [html({ destination: '宇都宮' }), html({ destination: '宇都宮', original: '宇都宮' })]) {
      expect(out).toBe('宇都宮 行き');
    }
  });
  it('変わった: もとの行き先に赤い取り消し線、新しい行き先は赤い太字(見合わせ・運休と同じ rose)', () => {
    const out = html({ destination: '古河', original: '宇都宮' });
    expect(out).toContain('line-through');
    expect(out).toContain('decoration-rose-600');
    expect(out).toMatch(/<span class="[^"]*line-through[^"]*">宇都宮<\/span>/);
    expect(out).toMatch(/<span class="[^"]*font-black text-rose-600">古河 行き<\/span>/);
  });
  it('新しい行き先は縮まない・折り返さない。もとの行き先が縮む(長い駅名でも、新しい行き先が切れない)', () => {
    const out = html({ destination: '栃木県総合運動公園', original: '栃木県総合運動公園前' });
    expect(out).toContain('shrink-0 whitespace-nowrap');
    expect(out).toContain('min-w-0 truncate');
  });
  it('発車目前の紫の背景では、明るい赤', () => {
    const out = html({ destination: '古河', original: '宇都宮', onDark: true });
    expect(out).toContain('text-rose-200');
    expect(out).toContain('decoration-rose-300');
  });
  it('使う場所は、発車案内・列車の詳細(新旧)の行き先の3か所', () => {
    for (const f of ['MyStationCard', 'TrainDetailV2', 'TrainLocationTab']) expect(readFileSync(`src/components/${f}.tsx`, 'utf8')).toContain('<DestinationLabel');
  });
});

describe('管理者の発令中一覧', () => {
  it('保存ずみの文から、「架空」の印を取り除いて出す', () => {
    const src = readFileSync('src/components/AdminConsoleModal.tsx', 'utf8');
    expect(src).toContain('{stripKakuuMarks(dis.customMessage || dis.reason)}');
  });
});
