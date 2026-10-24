// 公開記念イベントのごほうび: アプリ側の呼び出し(送るのは予約番号だけ。額は、サーバーが決める)
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { claimEventTare } from '../src/utils/cloudAccount';

const realFetch = globalThis.fetch;
let sent: Array<Record<string, unknown>>;

const reply = (body: unknown) => {
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as typeof fetch;
};

beforeEach(() => {
  sent = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('claimEventTare', () => {
  it('送るのは、ログイン証と予約番号だけ(額・時刻・駅は、送らない)', async () => {
    reply({ status: 'success', added: true, points: 350, balance: 1350 });
    await claimEventTare('tok', 'EQ-100');
    expect(sent).toEqual([{ action: 'claimEventTare', sessionToken: 'tok', orderId: 'EQ-100' }]);
  });

  it('受け取れたとき: 付いた額と残高を返す。2回目以降は、added: false', async () => {
    reply({ status: 'success', added: true, points: 350, balance: 1350 });
    expect(await claimEventTare('t', 'EQ-1')).toEqual({ ok: true, added: true, points: 350, balance: 1350 });
    reply({ status: 'success', added: false, points: 0, balance: 1350 });
    expect(await claimEventTare('t', 'EQ-1')).toEqual({ ok: true, added: false, points: 0, balance: 1350 });
  });

  it('断られたとき: 理由の種類だけを返す(まだ対象ではない・回数・混み合い・ログイン切れ・ほか)', async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ status: 'error', code: 'event_not_yet', message: 'まだ対象ではありません。' }, 'notYet'],
      [{ status: 'error', code: 'event_locked', message: 'しばらくしてからお試しください。' }, 'locked'],
      [{ status: 'error', code: 'event_busy', message: '混み合っています。' }, 'busy'],
      [{ status: 'error', code: 'session', message: 'ログインの有効期限が切れています。' }, 'session'],
      [{ status: 'error', message: '最初の同期が終わっていません。' }, 'error'],
    ];
    for (const [body, reason] of cases) {
      reply(body);
      const r = await claimEventTare('t', 'EQ-1');
      expect(r).toMatchObject({ ok: false, reason });
      if (r.ok === false) expect(r.message).toBeTruthy();
    }
  });

  it('通信できないときは、例外(画面が、あとでやり直させる)', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network');
    }) as typeof fetch;
    await expect(claimEventTare('t', 'EQ-1')).rejects.toThrow();
  });
});
