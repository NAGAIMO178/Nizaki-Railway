// マイページの履歴: 予約もポイントも、日時の新しい順
import { describe, expect, it } from 'vitest';
import { parseActivityTime, sortNewestFirst, UPCOMING_AT } from '../src/utils/activityOrder';

const t = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();

describe('日時を読む', () => {
  it('予約の日付(2026-10-13・2026/10/13)と、出発の時刻', () => {
    expect(parseActivityTime('2026-10-13')).toBe(t(2026, 10, 13));
    expect(parseActivityTime('2026/10/13')).toBe(t(2026, 10, 13));
    expect(parseActivityTime('2026-10-13', '08:06')).toBe(t(2026, 10, 13, 8, 6));
  });
  it('ポイントの日時(秒あり・秒なし・年なし)', () => {
    expect(parseActivityTime('2026/11/01 09:45:12')).toBe(t(2026, 11, 1, 9, 45, 12));
    expect(parseActivityTime('2026/11/01 09:45')).toBe(t(2026, 11, 1, 9, 45));
    expect(parseActivityTime('11/01 09:45')).toBe(t(new Date().getFullYear(), 11, 1, 9, 45));
  });
  it('日時に時刻が入っているときは、出発の時刻で上書きしない。読めないときは 0', () => {
    expect(parseActivityTime('2026/11/01 09:45', '23:05')).toBe(t(2026, 11, 1, 9, 45));
    expect(parseActivityTime('本日乗車予定')).toBe(0);
    expect(parseActivityTime(undefined)).toBe(0);
  });
});

describe('新しい順', () => {
  it('予約(10/13・10/12・10/03)のあとにあったポイント(11/01)が、いちばん上に来る', () => {
    const items = [
      { id: 'r1013', at: parseActivityTime('2026-10-13', '08:06') },
      { id: 'r1012', at: parseActivityTime('2026-10-12', '08:06') },
      { id: 'r1003', at: parseActivityTime('2026-10-03', '08:06') },
      { id: 'p1101a', at: parseActivityTime('2026/11/01 09:45:00') },
      { id: 'p1101b', at: parseActivityTime('2026/11/01 07:16:00') },
    ];
    expect(sortNewestFirst(items).map((x) => x.id)).toEqual(['p1101a', 'p1101b', 'r1013', 'r1012', 'r1003']);
  });
  it('これから乗る予約は、いちばん上。同じ時刻・読めないものは、もとの順のまま(読めないのは最後)', () => {
    const items = [
      { id: 'a', at: t(2026, 10, 1) },
      { id: 'unknown1', at: 0 },
      { id: 'upcoming', at: UPCOMING_AT },
      { id: 'b', at: t(2026, 10, 1) },
      { id: 'unknown2' },
    ];
    expect(sortNewestFirst(items).map((x) => x.id)).toEqual(['upcoming', 'a', 'b', 'unknown1', 'unknown2']);
  });
  it('もとの配列は変えない', () => {
    const items = [{ id: 'x', at: 1 }, { id: 'y', at: 2 }];
    sortNewestFirst(items);
    expect(items.map((i) => i.id)).toEqual(['x', 'y']);
  });
});
