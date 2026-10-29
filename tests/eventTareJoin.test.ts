// 公開記念イベントの参加を、サーバーの時刻とつなぐ(端末の印・サーバーの時刻・早いほう・デモ会員)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readEventProgress, setEventJoinedAt, type EventStore } from '../src/utils/eventTare';
import { joinEvent, syncJoinedFromServer } from '../src/utils/eventTareJoin';
import type { EventTareJoinResult } from '../src/utils/cloudAccount';

const win = (globalThis as unknown as { window: { location: { search: string } } }).window;
const memory = (): EventStore => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
};
const ok = (joinedAt: number): EventTareJoinResult => ({ ok: true, joinedAt, added: true });
const refused: EventTareJoinResult = { ok: false, reason: 'notStarted', message: 'まだ受け付けていません' };
const T = 1_800_000_000_000; // サーバーの時刻(ミリ秒)

beforeEach(() => {
  win.location.search = '?preview=1';
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('参加を押したとき(joinEvent)', () => {
  it('すぐ端末の中で参加にして、サーバーが時刻を返したら、その時刻を端末の joinedAt にする', async () => {
    const store = memory();
    const seen: number[] = [];
    const p = await joinEvent('a@example.com', store, 'tok', async () => ok(T), (x) => seen.push(x.joinedAt));
    expect(seen).toHaveLength(1); // 先に、端末の時刻で参加(画面は、待たずに進める)
    expect(seen[0]).toBeGreaterThan(0);
    expect(seen[0]).not.toBe(T);
    expect(p).toMatchObject({ joined: true, joinedAt: T });
    expect(readEventProgress('a@example.com', store).joinedAt).toBe(T);
  });

  it('2回目以降は、サーバーが、最初の時刻を返す。その時刻が正(端末の時刻より前でも、後でも)', async () => {
    const store = memory();
    const p = await joinEvent('a@example.com', store, 'tok', async () => ok(1000));
    expect(p.joinedAt).toBe(1000);
  });

  it('サーバーが断った(まだ受け付けていない)・通信できない・例外のときは、端末の時刻のまま。エラーにしない', async () => {
    for (const call of [async () => refused, async () => ({ ok: false, reason: 'error', message: 'x' }) as EventTareJoinResult, async () => { throw new Error('offline'); }]) {
      localStorage.clear();
      const store = memory();
      const p = await joinEvent('a@example.com', store, 'tok', call);
      expect(p.joined).toBe(true);
      expect(p.joinedAt).toBeGreaterThan(0);
      expect(p.joinedAt).toBeLessThan(T);
    }
  });

  it('デモ会員(ログイン証なし)は、サーバーを呼ばない', async () => {
    let called = 0;
    const store = memory();
    const p = await joinEvent('demo@example.com', store, undefined, async () => (called++, ok(T)));
    expect(called).toBe(0);
    expect(p.joined).toBe(true);
    expect(p.joinedAt).toBeLessThan(T);
  });
});

describe('アカウントの同期(syncJoinedFromServer)', () => {
  it('サーバーに時刻があれば、別の端末も「参加済み」になり、joinedAt はその時刻', async () => {
    const store = memory();
    expect(readEventProgress('a@example.com', store).joined).toBe(false);
    const changed = await syncJoinedFromServer('a@example.com', store, 'tok', T, async () => ok(0));
    expect(changed).toBe(true);
    expect(readEventProgress('a@example.com', store)).toMatchObject({ joined: true, joinedAt: T });
  });

  it('端末とサーバーで時刻が違うときは、早いほう', async () => {
    const store = memory();
    setEventJoinedAt('a@example.com', T + 5000, store);
    await syncJoinedFromServer('a@example.com', store, 'tok', T, async () => ok(0));
    expect(readEventProgress('a@example.com', store).joinedAt).toBe(T);
    const store2 = memory();
    setEventJoinedAt('a@example.com', T - 5000, store2);
    const changed = await syncJoinedFromServer('a@example.com', store2, 'tok', T, async () => ok(0));
    expect(readEventProgress('a@example.com', store2).joinedAt).toBe(T - 5000);
    expect(changed).toBe(false);
  });

  it('時刻の無い古い印は、サーバーの時刻にする', async () => {
    const store = memory();
    store.set('nizaki_event_tare-2026:a@example.com', JSON.stringify({ joined: true, cleared: false }));
    await syncJoinedFromServer('a@example.com', store, 'tok', T, async () => ok(0));
    expect(readEventProgress('a@example.com', store).joinedAt).toBe(T);
  });

  it('サーバーが null で、端末に参加の印がなければ、何もしない(送らない)', async () => {
    const store = memory();
    let called = 0;
    const changed = await syncJoinedFromServer('a@example.com', store, 'tok', null, async () => (called++, ok(T)));
    expect(called).toBe(0);
    expect(changed).toBe(false);
    expect(readEventProgress('a@example.com', store).joined).toBe(false);
  });

  it('サーバーが null で、端末に参加の印があれば、サーバーへ送る(早いほうを使う。断られても、そのまま)', async () => {
    const store = memory();
    setEventJoinedAt('a@example.com', T - 9000, store);
    let called = 0;
    await syncJoinedFromServer('a@example.com', store, 'tok', null, async () => (called++, ok(T)));
    expect(called).toBe(1);
    expect(readEventProgress('a@example.com', store).joinedAt).toBe(T - 9000);
    const store2 = memory();
    setEventJoinedAt('b@example.com', T - 9000, store2);
    await syncJoinedFromServer('b@example.com', store2, 'tok', null, async () => refused);
    expect(readEventProgress('b@example.com', store2)).toMatchObject({ joined: true, joinedAt: T - 9000 });
    await syncJoinedFromServer('b@example.com', store2, 'tok', null, async () => { throw new Error('offline'); });
    expect(readEventProgress('b@example.com', store2).joined).toBe(true);
  });

  it('デモ会員(ログイン証なし)は、サーバーを呼ばず、何も変えない', async () => {
    const store = memory();
    setEventJoinedAt('d@example.com', T, store);
    let called = 0;
    const changed = await syncJoinedFromServer('d@example.com', store, undefined, null, async () => (called++, ok(0)));
    expect(called).toBe(0);
    expect(changed).toBe(false);
  });

  it('クリア済みの印は、そのまま。公開前は、何も起きない', async () => {
    const store = memory();
    store.set('nizaki_event_tare-2026:a@example.com', JSON.stringify({ joined: true, cleared: true, joinedAt: T - 1 }));
    await syncJoinedFromServer('a@example.com', store, 'tok', T, async () => ok(0));
    expect(readEventProgress('a@example.com', store)).toMatchObject({ cleared: true, joinedAt: T - 1 });
    // 公開の前に時計を合わせる(公開の日をすぎても、「公開前」の確認が崩れないように)
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-31T12:00:00+09:00'));
    win.location.search = '';
    localStorage.clear();
    const s2 = memory();
    await syncJoinedFromServer('c@example.com', s2, 'tok', T, async () => ok(0));
    expect(readEventProgress('c@example.com', s2).joined).toBe(false);
  });
});
