// 遅れの知らせの設定: すべて / 路線 / オフ。以前の「マイ駅だけ」は「すべて」に読み替える
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/tkLine', async (importOriginal) => {
  // 「見せない」状態に固定する(公開の日時や時計に、左右されないように)。高宮線を見せたときの動きは、tkPrep.test.ts などで確かめる
  const actual = await importOriginal<typeof import('../src/utils/tkLine')>();
  return { ...actual, isTkLaunched: () => false, visibleLineCodes: (c: string[]) => c.filter((x) => x !== actual.TK_CODE), withTk: <T,>(base: T[]) => base };
});

import {
  DELAY_NOTIFY_LINES,
  getDelayNotifyLines,
  getDelayNotifyMode,
  parseDelayNotifyLines,
  parseDelayNotifyMode,
  setDelayNotifyLines,
  setDelayNotifyMode,
} from '../src/utils/delayNotifySettings';
import { filterByLines } from '../src/utils/delayNotifyPlan';

beforeEach(() => {
  (globalThis as unknown as { window: Record<string, unknown> }).window.dispatchEvent = () => true;
  (globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class {
    constructor(public type: string, public init?: unknown) {}
  };
  localStorage.clear();
});

describe('保存された値の読み替え', () => {
  it('すべて・路線・オフは、そのまま。以前の「マイ駅だけ」・読めない・無い値は「すべて」', () => {
    expect(parseDelayNotifyMode('all')).toBe('all');
    expect(parseDelayNotifyMode('lines')).toBe('lines');
    expect(parseDelayNotifyMode('off')).toBe('off');
    expect(parseDelayNotifyMode('mystation')).toBe('all');
    expect(parseDelayNotifyMode('なにか')).toBe('all');
    expect(parseDelayNotifyMode(null)).toBe('all');
  });

  it('端末の保存値(以前のマイ駅だけ)を読んでも、壊れず「すべて」になる', () => {
    localStorage.setItem('nizaki_delay_notify_mode', 'mystation');
    expect(getDelayNotifyMode()).toBe('all');
    setDelayNotifyMode('lines');
    expect(getDelayNotifyMode()).toBe('lines');
    setDelayNotifyMode('off');
    expect(getDelayNotifyMode()).toBe('off');
  });

  it('選んだ路線: まだ選んでいない・壊れているときは4路線とも。いまある路線のIDだけ、もとの並びで', () => {
    const all = DELAY_NOTIFY_LINES.map((l) => l.id);
    expect(all).toEqual(['kanzaki', 'kanzaki_kosoku', 'saichi_loop', 'tsuchiura']);
    expect(parseDelayNotifyLines(null)).toEqual(all);
    expect(parseDelayNotifyLines('こわれた')).toEqual(all);
    expect(parseDelayNotifyLines(JSON.stringify(['tsuchiura', 'kanzaki', 'ない路線']))).toEqual(['kanzaki', 'tsuchiura']);
    expect(parseDelayNotifyLines('[]')).toEqual([]);
  });

  it('路線を選んで保存すると、次に読んでも同じ(全部外した状態も)', () => {
    expect(getDelayNotifyLines()).toEqual(['kanzaki', 'kanzaki_kosoku', 'saichi_loop', 'tsuchiura']);
    setDelayNotifyLines(['saichi_loop', 'kanzaki']);
    expect(getDelayNotifyLines()).toEqual(['kanzaki', 'saichi_loop']);
    setDelayNotifyLines([]);
    expect(getDelayNotifyLines()).toEqual([]);
  });
});

describe('路線だけの知らせ', () => {
  const trains = [
    { lineId: 'kanzaki', n: 1 },
    { lineId: 'tsuchiura', n: 2 },
    { lineId: 'saichi_loop', n: 3 },
    { lineId: 'kanzaki', n: 4 },
  ];
  it('選んだ路線の遅れだけが残る。選ばなければ、何も残らない', () => {
    expect(filterByLines(trains, ['kanzaki']).map((t) => t.n)).toEqual([1, 4]);
    expect(filterByLines(trains, ['tsuchiura', 'saichi_loop']).map((t) => t.n)).toEqual([2, 3]);
    expect(filterByLines(trains, [])).toEqual([]);
    expect(filterByLines(trains, ['kanzaki', 'kanzaki_kosoku', 'saichi_loop', 'tsuchiura'])).toHaveLength(4);
  });
});
