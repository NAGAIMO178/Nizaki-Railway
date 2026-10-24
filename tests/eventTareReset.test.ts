// 公開記念イベントの「最初からやり直す」(端末の中だけ。サーバーは変えない)
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { markEventJoined, readEventProgress, setEventCleared, setEventJoinedAt, type EventStore } from '../src/utils/eventTare';
import { canResetEvent, joinEvent, resetEvent, syncJoinedFromServer } from '../src/utils/eventTareJoin';
import { clearSeenScenes, isSceneSeen, markSceneSeen, seenKeyOf, SCENE_KEYS } from '../src/utils/eventTareReveal';
import type { EventTareJoinResult } from '../src/utils/cloudAccount';

const win = (globalThis as unknown as { window: { location: { search: string } } }).window;
const memory = (): EventStore => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
};
const ok = (joinedAt: number): EventTareJoinResult => ({ ok: true, joinedAt, added: false });
const A = 'a@example.com';
const B = 'b@example.com';
const OLD = Date.now() - 7_200_000; // やり直す前の、サーバーの参加の時刻(2時間前)
const RESET = OLD + 3_600_000; // やり直した時刻(1時間前)

beforeEach(() => {
  win.location.search = '?preview=1';
  localStorage.clear();
});
afterEach(() => localStorage.clear());

const seenAll = (owner: string) => SCENE_KEYS.forEach((k) => markSceneSeen(seenKeyOf(owner, k)));

describe('やり直しで消えるもの', () => {
  it('参加の印・参加の時刻・見た場面の印が消える。別のメールの分は残る', () => {
    markEventJoined(A, undefined, OLD);
    markEventJoined(B, undefined, OLD + 5);
    seenAll(A);
    seenAll(B);
    expect(resetEvent(A, undefined, RESET)).toBe(true);
    expect(readEventProgress(A)).toEqual({ joined: false, cleared: false, joinedAt: 0, resetAt: RESET });
    SCENE_KEYS.forEach((k) => expect(isSceneSeen(seenKeyOf(A, k)), `A ${k}`).toBe(false));
    // 別のメールの分は触らない
    expect(readEventProgress(B)).toMatchObject({ joined: true, joinedAt: OLD + 5, resetAt: 0 });
    SCENE_KEYS.forEach((k) => expect(isSceneSeen(seenKeyOf(B, k)), `B ${k}`).toBe(true));
  });

  it('デモ会員は、画面を開いているあいだの store の中で消える(localStorage には、触らない)', () => {
    const store = memory();
    markEventJoined('demo@example.com', store, OLD);
    expect(resetEvent('demo@example.com', store, RESET)).toBe(true);
    expect(readEventProgress('demo@example.com', store)).toMatchObject({ joined: false, joinedAt: 0, resetAt: RESET });
    expect(localStorage.getItem('nizaki_event_tare-2026:demo@example.com')).toBeNull();
  });

  it('クリア済みは、やり直せない(何も変えない)。公開前は、何も起きない', () => {
    setEventCleared(A, true);
    expect(resetEvent(A, undefined, RESET)).toBe(false);
    expect(readEventProgress(A)).toMatchObject({ joined: true, cleared: true, resetAt: 0 });
    win.location.search = '';
    localStorage.clear();
    expect(resetEvent(B, undefined, RESET)).toBe(false);
  });

  it('場面の印の消し方は、会員ごと(ほかの印・ほかの会員を巻き込まない)', () => {
    seenAll(A);
    seenAll(B);
    clearSeenScenes(A, {
      getItem: (k) => localStorage.getItem(k),
      setItem: (k, v) => localStorage.setItem(k, v),
      removeItem: (k) => localStorage.removeItem(k),
    });
    expect(isSceneSeen(seenKeyOf(A, 'act1'))).toBe(false);
    expect(isSceneSeen(seenKeyOf(B, 'act1'))).toBe(true);
  });
});

describe('やり直したあとの、サーバーの参加の時刻', () => {
  beforeEach(() => {
    markEventJoined(A, undefined, OLD);
    resetEvent(A, undefined, RESET);
  });

  it('同期で、やり直す前のサーバーの時刻(resetAt 以前)は、採用しない。参加済みに戻らない', async () => {
    const changed = await syncJoinedFromServer(A, undefined, 'tok', OLD, async () => ok(0));
    expect(changed).toBe(false);
    expect(readEventProgress(A)).toMatchObject({ joined: false, joinedAt: 0 });
    // resetAt ちょうども、採用しない
    await syncJoinedFromServer(A, undefined, 'tok', RESET, async () => ok(0));
    expect(readEventProgress(A).joined).toBe(false);
  });

  it('やり直したあとに、別の端末で参加した時刻(resetAt より後)は、採用する', async () => {
    await syncJoinedFromServer(A, undefined, 'tok', RESET + 1000, async () => ok(0));
    expect(readEventProgress(A)).toMatchObject({ joined: true, joinedAt: RESET + 1000 });
  });

  it('参加し直したとき、サーバーが古い時刻を返しても、端末の時刻(今)を使う', async () => {
    const before = Date.now();
    const p = await joinEvent(A, undefined, 'tok', async () => ok(OLD));
    expect(p.joined).toBe(true);
    expect(p.joinedAt).toBeGreaterThanOrEqual(before);
    expect(p.joinedAt).toBeGreaterThan(RESET);
    expect(p.resetAt).toBe(RESET);
  });

  it('参加し直したとき、サーバーが新しい時刻を返したら、それを使う', async () => {
    const p = await joinEvent(A, undefined, 'tok', async () => ok(Date.now() + 5000));
    expect(p.joinedAt).toBeGreaterThan(RESET);
  });

  it('サーバーに記録が無く、端末も参加していなければ、同期は何もしない(送らない)', async () => {
    let called = 0;
    await syncJoinedFromServer(A, undefined, 'tok', null, async () => (called++, ok(OLD)));
    expect(called).toBe(0);
  });

  it('参加し直したあとの印は、resetAt を保つ(参加・時刻の書き換えで消えない)', () => {
    markEventJoined(A, undefined, RESET + 10);
    setEventJoinedAt(A, RESET + 5, undefined, true);
    expect(readEventProgress(A)).toMatchObject({ joined: true, joinedAt: RESET + 5, resetAt: RESET });
    setEventCleared(A, true);
    expect(readEventProgress(A)).toMatchObject({ cleared: true, resetAt: RESET });
  });
});

describe('「最初からやり直す」を出す条件', () => {
  it('参加ずみで、まだクリアしていないときだけ', () => {
    expect(canResetEvent({ joined: false, cleared: false })).toBe(false);
    expect(canResetEvent({ joined: true, cleared: false })).toBe(true);
    expect(canResetEvent({ joined: true, cleared: true })).toBe(false);
  });
});
